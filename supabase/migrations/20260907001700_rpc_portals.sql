-- ─────────────────────────────────────────────────────────────────────
-- 1700 · 토큰 경로 RPC(발주처 /c · 파트너 /p) + 랜딩 리드 + 시트 연결·감지·반영
-- §6.2: 토큰 경로는 RLS를 통과하지 않는다 — security definer 함수가 토큰을 검증한 뒤 **화이트리스트 쿼리만**
-- 수행하고, anon에는 이 함수들의 execute만 있다(표 권한 0 — 1500). settlement_*·vendors·quotes·partners.contract_amount·
-- partner_tiers.price는 어느 함수도 읽지 않는다(§19.7·§21.2 R-H3).
-- 설계서는 이 자리를 Edge Function(service role)으로 적었으나, "키 교체+setup.sql 1회"(§18-0) 안에서 같은 계약을
-- 만족하는 SQL 함수로 구현한다 — 배포 단계가 늘지 않고 로컬 Postgres에서 증명된다(Phase 4 개정 대상).
-- ─────────────────────────────────────────────────────────────────────

-- 토큰 검증 (§6.3): 미존재 404 · 회수·만료 410 · 접근 시 last_seen_at
create or replace function app.resolve_client_token(p_token uuid)
returns client_tokens language plpgsql security definer set search_path = public as $$
declare v_t client_tokens;
begin
  select * into v_t from client_tokens where token = p_token;
  if v_t.token is null then raise exception 'NOT_FOUND: 유효하지 않은 링크입니다.' using errcode = 'P0404'; end if;
  if v_t.revoked_at is not null or (v_t.expires_at is not null and v_t.expires_at < now()) then
    raise exception 'GONE: 링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.' using errcode = 'P0410';
  end if;
  update client_tokens set last_seen_at = now() where token = p_token;
  return v_t;
end $$;

create or replace function app.resolve_partner_token(p_token uuid)
returns partner_tokens language plpgsql security definer set search_path = public as $$
declare v_t partner_tokens;
begin
  select * into v_t from partner_tokens where token = p_token;
  if v_t.id is null then raise exception 'NOT_FOUND: 유효하지 않은 링크입니다.' using errcode = 'P0404'; end if;
  if v_t.revoked_at is not null or (v_t.expires_at is not null and v_t.expires_at < now()) then
    raise exception 'GONE: 링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.' using errcode = 'P0410';
  end if;
  update partner_tokens set last_seen_at = now() where id = v_t.id;
  return v_t;
end $$;

create or replace function app.area_progress(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('area', a.area, 'total', coalesce(c.total, 0), 'done', coalesce(c.done, 0)) order by a.ord)
  from (values ('design', 1), ('ops', 2), ('common', 3)) as a(area, ord)
  left join (
    select area::text as area, count(*) as total, count(*) filter (where status = 'final') as done
    from deliverables where project_id = p_project group by area
  ) c on c.area = a.area
$$;

-- ── /c/{token}/queue — 컨펌 대기 + 이력 + shared 코멘트만 (§6.2 C-1) ─────────
create or replace function public.client_queue(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_project projects; v_queue jsonb; v_history jsonb; v_contact text;
begin
  v_t := app.resolve_client_token(p_token);
  select * into v_project from projects where id = v_t.project_id;
  select name into v_contact from client_contacts where id = v_t.contact_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'approval_id', a.id, 'deliverable_id', d.id, 'title', d.title, 'category', d.category, 'area', d.area,
      'requested_at', a.requested_at, 'due_at', a.due_at,
      'version', jsonb_build_object('id', v.id, 'version_no', v.version_no, 'file_name', v.file_name),
      'shared_comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from comments c where c.deliverable_id = d.id and c.visibility = 'shared'), '[]'::jsonb)
    ) order by coalesce(a.due_at, 'infinity'::timestamptz), a.requested_at), '[]'::jsonb)
  into v_queue
  from approvals a join deliverables d on d.id = a.deliverable_id join versions v on v.id = a.version_id
  where d.project_id = v_t.project_id and a.decided_at is null and d.status = 'pending_approval';
  select coalesce(jsonb_agg(jsonb_build_object(
      'approval_id', a.id, 'deliverable_id', d.id, 'title', d.title, 'decision', a.decision, 'decided_at', a.decided_at
    ) order by a.decided_at desc), '[]'::jsonb)
  into v_history
  from approvals a join deliverables d on d.id = a.deliverable_id
  where d.project_id = v_t.project_id and a.decided_at is not null and a.decision is not null;
  return jsonb_build_object('project_name', v_project.name, 'contact_name', v_contact, 'queue', v_queue, 'history', v_history);
end $$;
revoke execute on function public.client_queue(uuid) from public;
grant execute on function public.client_queue(uuid) to anon, authenticated;

-- ── /c/{token}/decisions — 승인/수정요청 (§5 client_decision · 수정요청은 코멘트 필수 · 코멘트는 shared 강제) ─────────
create or replace function public.client_decide(p_token uuid, p_approval uuid, p_decision approval_decision, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_a approvals; v_d deliverables;
begin
  v_t := app.resolve_client_token(p_token);
  select * into v_a from approvals where id = p_approval;
  if v_a.id is null then raise exception 'NOT_FOUND: 컨펌 요청을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_a.decided_at is not null then raise exception 'CONFLICT: 이미 처리된 컨펌 요청입니다.' using errcode = 'P0409'; end if;
  select * into v_d from deliverables where id = v_a.deliverable_id;
  if v_d.project_id <> v_t.project_id then raise exception 'FORBIDDEN: 이 링크로 처리할 수 없는 항목입니다.' using errcode = 'P0403'; end if;
  if v_d.status <> 'pending_approval' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → % (client_decision)', v_d.status, p_decision using errcode = 'P0409';
  end if;
  if p_decision = 'changes_requested' and nullif(trim(coalesce(p_comment, '')), '') is null then
    raise exception 'VALIDATION: 수정요청 시 코멘트는 필수입니다.' using errcode = 'P0422';
  end if;
  update approvals set decided_at = now(), decision = p_decision, decided_via_token = p_token,
    client_comment = case when p_decision = 'changes_requested' then p_comment else client_comment end
  where id = p_approval;
  perform app.write_log(v_d.project_id, 'client:' || p_token, 'approval.decided', 'approval', p_approval, jsonb_build_object('decision', p_decision));
  if p_decision = 'approved' then
    update deliverables set status = 'approved' where id = v_d.id;
    -- §5·§7.5: 06_발주처공유 스냅숏 성공 후 final — Phase 4는 Drive 없음(Phase 5에서 copy 성공 게이트 삽입)
    perform app.finalize_deliverable(v_d.id);
  else
    update deliverables set status = 'changes_requested' where id = v_d.id;
    insert into comments (deliverable_id, author_token, visibility, body) values (v_d.id, p_token, 'shared', p_comment);
  end if;
end $$;
revoke execute on function public.client_decide(uuid, uuid, approval_decision, text) from public;
grant execute on function public.client_decide(uuid, uuid, approval_decision, text) to anon, authenticated;

-- ── /c/{token}/status — 진행률·마일스톤·확정본·담당자(3.18.1 노출 계약: 마스킹 없음) ─────────
create or replace function public.client_status(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_project projects; v_staff jsonb; v_contact jsonb; v_finals jsonb; v_ms jsonb;
begin
  v_t := app.resolve_client_token(p_token);
  select * into v_project from projects where id = v_t.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name, 'role', m.role,
                                               'title', p.title, 'email', p.email, 'phone', p.phone)
           order by array_position(array['pm','design','ops','reg'], m.role::text)), '[]'::jsonb)
  into v_staff from project_members m join profiles p on p.id = m.user_id where m.project_id = v_t.project_id;
  select jsonb_build_object('name', c.name, 'org', c.org, 'email', c.email) into v_contact from client_contacts c where c.id = v_t.contact_id;
  select coalesce(jsonb_agg(to_jsonb(ms) order by ms.due_date), '[]'::jsonb) into v_ms from milestones ms where ms.project_id = v_t.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('version_id', v.id, 'deliverable_id', d.id, 'deliverable_title', d.title,
                                               'file_name', v.file_name, 'finalized_at', d.updated_at) order by d.updated_at desc), '[]'::jsonb)
  into v_finals
  from deliverables d
  join lateral (select * from versions x where x.deliverable_id = d.id order by x.version_no desc limit 1) v on true
  where d.project_id = v_t.project_id and d.status = 'final';
  return jsonb_build_object(
    'project_name', v_project.name, 'event_date', v_project.event_date,
    'area_progress', app.area_progress(v_t.project_id), 'milestones', v_ms, 'recent_finals', v_finals,
    'staff', v_staff, 'client_contact', v_contact);
end $$;
revoke execute on function public.client_status(uuid) from public;
grant execute on function public.client_status(uuid) to anon, authenticated;

-- ── /p/{token} — 파트너 포털 (R-H2 자기 partner_id 행만 · R-H3 금액 키 구조적 부재 · R-H6 shared 코멘트만) ─────────
create or replace function public.partner_portal(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t partner_tokens; v_p partners; v_project projects; v_tier text; v_items jsonb; v_notices jsonb;
begin
  v_t := app.resolve_partner_token(p_token);
  select * into v_p from partners where id = v_t.partner_id;
  select * into v_project from projects where id = v_p.project_id;
  select name into v_tier from partner_tiers where id = v_p.tier_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task_code', t.code, 'task_title', t.title, 'deadline', t.end_date, 'deliverable_id', d.id, 'status', d.status,
      'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from comments c where c.deliverable_id = d.id and c.visibility = 'shared'), '[]'::jsonb),
      'versions', coalesce((select jsonb_agg(to_jsonb(v) order by v.version_no desc) from versions v where v.deliverable_id = d.id), '[]'::jsonb)
    ) order by coalesce(t.end_date, 'infinity'::date), t.sort_order), '[]'::jsonb)
  into v_items
  from wbs_tasks t join deliverables d on d.id = t.linked_deliverable_id
  where t.project_id = v_p.project_id and t.partner_id = v_p.id and t.direction = 'partner_submit';
  select coalesce(jsonb_agg(jsonb_build_object('task_code', t.code, 'task_title', t.title, 'deadline', t.end_date, 'note', t.note)
           order by coalesce(t.end_date, 'infinity'::date), t.sort_order), '[]'::jsonb)
  into v_notices from wbs_tasks t where t.project_id = v_p.project_id and t.direction = 'host_notice';
  return jsonb_build_object(
    'project_name', v_project.name, 'event_date', v_project.event_date, 'venue', v_project.venue,
    'partner_name', v_p.name, 'tier_name', v_tier, 'submission_items', v_items, 'notices', v_notices,
    'guide_url', v_project.partner_guide_url, 'contact_email', v_project.partner_contact_email);
end $$;
revoke execute on function public.partner_portal(uuid) from public;
grant execute on function public.partner_portal(uuid) to anon, authenticated;

-- ── /p/{token}/submissions — 파일·텍스트 제출을 versions 이력으로 통일 (§5.1 · R-H4) ─────────
-- p_payload: {"file_name": "...", "note": "..."} 또는 {"text": "..."}
create or replace function public.partner_submit(p_token uuid, p_deliverable uuid, p_payload jsonb)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_t partner_tokens; v_d deliverables; v_project projects; v_is_text boolean; v_original text; v_v versions; v_yymmdd text;
begin
  v_t := app.resolve_partner_token(p_token);
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_d.partner_id is distinct from v_t.partner_id then
    raise exception 'FORBIDDEN: 이 파트너가 제출할 수 있는 항목이 아닙니다.' using errcode = 'P0403';
  end if;
  v_project := app.require_writable(v_d.project_id);
  if v_d.status not in ('requested','changes_requested') then
    raise exception 'CONFLICT: 현재 상태(%)에서는 제출할 수 없습니다.', v_d.status using errcode = 'P0409';
  end if;
  v_is_text := p_payload ? 'text';
  v_original := case when v_is_text then v_d.title || '_텍스트제출.txt' else coalesce(p_payload->>'file_name', 'submission') end;
  if v_is_text then update deliverables set content = p_payload->>'text' where id = p_deliverable; end if;
  -- 파일명 규약(§7.2): YYMMDD_{code}_{category}_{title}_v{n}.{ext} — version_no는 트리거가 채우므로 두 단계
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, 'pending:' || gen_random_uuid(), v_original,
          case when v_is_text then '파트너 텍스트 제출' else p_payload->>'note' end, null)
  returning * into v_v;
  v_yymmdd := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD');
  update versions set file_name = v_yymmdd || '_' || v_project.code || '_' || v_d.category || '_' || v_d.title || '_v' || v_v.version_no
      || case when v_original ~ '\.[A-Za-z0-9]+$' then '.' || lower(substring(v_original from '\.([A-Za-z0-9]+)$')) else '' end
  where id = v_v.id;
  update deliverables set status = 'pending_approval' where id = p_deliverable;
  perform app.write_log(v_d.project_id, 'partner:' || p_token, 'partner.submitted', 'deliverable', p_deliverable,
    jsonb_build_object('partner_id', v_t.partner_id, 'version_no', v_v.version_no));
  select * into v_d from deliverables where id = p_deliverable;
  return v_d;
end $$;
revoke execute on function public.partner_submit(uuid, uuid, jsonb) from public;
grant execute on function public.partner_submit(uuid, uuid, jsonb) to anon, authenticated;

-- 폼 필드 라벨 부분 일치 → 값 (빈 값은 null)
create or replace function app.landing_pick(p_fields jsonb, p_values jsonb, p_needle text)
returns text language sql immutable as $$
  select nullif(trim(p_values->>('f_' || (f->>'id'))), '')
  from jsonb_array_elements(p_fields) f
  where (f->>'label') like '%' || p_needle || '%'
  limit 1
$$;

-- ── 랜딩 폼 제출 → 등록 유입 (§4-22, 공개 경로) ─────────
-- p_values: {"f_<fieldId>": "...", "c_<consentId>": "on"} — 라벨 부분 일치로 표준 항목을 찾는다(빌더가 라벨을 바꿔도 동작)
create or replace function public.submit_landing_lead(p_landing uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_l landing_pages; v_name text; v_org text; v_email text; v_phone text; v_att attendees; c jsonb; v_today date;
begin
  select * into v_l from landing_pages where id = p_landing;
  if v_l.id is null then raise exception 'NOT_FOUND: 랜딩을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  perform app.require_writable(v_l.project_id);
  if v_l.submit_target <> 'registration' then raise exception 'CONFLICT: 이 랜딩은 외부로 제출되도록 설정돼 있습니다.' using errcode = 'P0409'; end if;
  if v_l.status = 'closed' then raise exception 'CONFLICT: 신청이 마감된 랜딩입니다.' using errcode = 'P0409'; end if;
  v_name := coalesce(app.landing_pick(v_l.form_fields, p_values, '성함'), app.landing_pick(v_l.form_fields, p_values, '이름'));
  if v_name is null then raise exception 'VALIDATION: 성함은 필수입니다.' using errcode = 'P0422'; end if;
  for c in select * from jsonb_array_elements(v_l.consents) where (value->>'required')::boolean loop
    if coalesce(p_values->>('c_' || (c->>'id')), '') = '' then
      raise exception 'VALIDATION: 필수 동의가 누락됐습니다 — %', c->>'title' using errcode = 'P0422';
    end if;
  end loop;
  v_org := app.landing_pick(v_l.form_fields, p_values, '회사');
  v_email := app.landing_pick(v_l.form_fields, p_values, '이메일');
  v_phone := coalesce(app.landing_pick(v_l.form_fields, p_values, '휴대전화'), app.landing_pick(v_l.form_fields, p_values, '연락처'));
  insert into attendees (project_id, name, org, email, phone, channel)
  values (v_l.project_id, v_name, v_org, v_email, v_phone, 'rsvp')
  on conflict (project_id, lower(email)) where email is not null
  do update set name = excluded.name, org = coalesce(excluded.org, attendees.org), phone = coalesce(excluded.phone, attendees.phone)
  returning * into v_att;
  v_today := (now() at time zone 'Asia/Seoul')::date;
  insert into landing_daily_metrics (landing_id, date, views, unique_visitors, form_starts, submits)
  values (p_landing, v_today, 1, 1, 1, 1)
  on conflict (landing_id, date) do update set submits = landing_daily_metrics.submits + 1,
    form_starts = greatest(landing_daily_metrics.form_starts, landing_daily_metrics.submits + 1);
  perform app.write_log(v_l.project_id, 'landing', 'landing.lead', 'attendee', v_att.id, jsonb_build_object('landing_id', p_landing));
  return to_jsonb(v_att);
end $$;
revoke execute on function public.submit_landing_lead(uuid, jsonb) from public;
grant execute on function public.submit_landing_lead(uuid, jsonb) to anon, authenticated;

-- ── 시트 연동 (§24) — 연결·감지·반영. 원본 행(sheet_source_rows)은 서버 읽기 함수(api/sheets)가 적재한다 ─────────
-- 차이 규칙은 src/providers/mock/sheetSync.ts computeSheetDiffRows와 1:1: 유효 행만 · removed 이력 행 제외 ·
-- 매핑 필드 값 비교(registered_at은 'MM-DD HH24:MI') · 상태(sheet_status)는 항상 함께 따라간다.
create or replace function app.sheet_value(p_field text, p_row jsonb)
returns text language sql immutable as $$
  select case
    when p_row->>p_field is null or p_row->>p_field = '' then '—'
    when p_field = 'registered_at' then to_char((p_row->>p_field)::timestamptz at time zone 'UTC', 'MM-DD HH24:MI')
    else p_row->>p_field end
$$;

create or replace function app.sheet_diff(p_project uuid)
returns table (kind text, sheet_row_id text, attendee_id uuid) language plpgsql stable security definer set search_path = public as $$
declare v_conn sheet_connections; v_fields text[];
begin
  select * into v_conn from sheet_connections where project_id = p_project;
  if v_conn.id is null then return; end if;
  select coalesce(array_agg(distinct m->>'field'), '{}') into v_fields
  from jsonb_array_elements(v_conn.mapping) m where m->>'field' is not null and m->>'field' <> 'sheet_status';
  return query
    with valid as (select * from sheet_source_rows r where r.project_id = p_project and r.invalid_reason is null),
         linked as (select * from attendees a where a.project_id = p_project and a.sheet_row_id is not null and a.sheet_status is distinct from 'removed')
    select 'added', v.sheet_row_id, null::uuid from valid v left join linked a on a.sheet_row_id = v.sheet_row_id where a.id is null
    union all
    select 'changed', v.sheet_row_id, a.id from valid v join linked a on a.sheet_row_id = v.sheet_row_id
    where exists (select 1 from unnest(v_fields) f where app.sheet_value(f, to_jsonb(a)) <> app.sheet_value(f, to_jsonb(v)))
       or a.sheet_status is distinct from v.status
    union all
    select 'removed', a.sheet_row_id, a.id from linked a where not exists (select 1 from valid v where v.sheet_row_id = a.sheet_row_id);
end $$;

-- 감지만 한다 — 참관객 데이터는 건드리지 않는다(R-S2). 상태·확인 시각·미확인 건수만 갱신
create or replace function public.check_sheet_updates(p_project uuid)
returns sheet_connections language plpgsql security definer set search_path = public as $$
declare v_conn sheet_connections; v_added int; v_changed int; v_removed int;
begin
  if not app.is_member(p_project) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  select * into v_conn from sheet_connections where project_id = p_project;
  if v_conn.id is null then raise exception 'NOT_FOUND: 연결된 시트가 없습니다.' using errcode = 'P0404'; end if;
  if v_conn.state = 'revoked' then
    update sheet_connections set checked_at = now(),
      failure_times = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(failure_times || to_jsonb(now())) x order by x desc limit 5) s)
    where id = v_conn.id returning * into v_conn;
    return v_conn;
  end if;
  select count(*) filter (where kind = 'added'), count(*) filter (where kind = 'changed'), count(*) filter (where kind = 'removed')
    into v_added, v_changed, v_removed from app.sheet_diff(p_project);
  update sheet_connections set checked_at = now(), last_success_at = now(),
    pending_added = v_added, pending_changed = v_changed, pending_removed = v_removed,
    state = case when v_added + v_changed + v_removed > 0 then 'stale' else 'connected' end
  where id = v_conn.id returning * into v_conn;
  return v_conn;
end $$;
revoke execute on function public.check_sheet_updates(uuid) from public, anon;
grant execute on function public.check_sheet_updates(uuid) to authenticated;

-- 사람이 차이를 확인한 뒤의 반영 (pm·reg). 낡은 snapshot_version은 409(R-S1). 체크인·비고는 절대 덮어쓰지 않는다
create or replace function public.apply_sheet_diff(p_project uuid, p_snapshot_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_conn sheet_connections; v_fields text[]; r record; v_added int := 0; v_changed int := 0; v_removed int := 0; v_src sheet_source_rows;
begin
  v_me := app.require_roles(p_project, '등록 데이터 권한이 없습니다.', 'pm', 'reg');
  perform app.require_writable(p_project);
  select * into v_conn from sheet_connections where project_id = p_project;
  if v_conn.id is null then raise exception 'NOT_FOUND: 연결된 시트가 없습니다.' using errcode = 'P0404'; end if;
  if v_conn.state = 'revoked' then
    raise exception 'FORBIDDEN: 시트 접근 권한이 끊겼습니다 — 재인증한 뒤 다시 반영해 주세요.' using errcode = 'P0403';
  end if;
  if p_snapshot_version <> v_conn.snapshot_version then
    raise exception 'CONFLICT: 다른 담당자가 이미 반영했습니다. 최신 차이를 다시 확인해 주세요.' using errcode = 'P0409';
  end if;
  select coalesce(array_agg(distinct m->>'field'), '{}') into v_fields
  from jsonb_array_elements(v_conn.mapping) m where m->>'field' is not null and m->>'field' <> 'sheet_status';
  for r in select * from app.sheet_diff(p_project) loop
    if r.kind = 'added' then
      select * into v_src from sheet_source_rows where project_id = p_project and sheet_row_id = r.sheet_row_id;
      insert into attendees (project_id, name, org, email, phone, channel, registered_at, sheet_row_id, title, group_tag, sheet_status)
      values (p_project, v_src.name, v_src.org, v_src.email, v_src.phone, 'import', v_src.registered_at, v_src.sheet_row_id, v_src.title, v_src.group_tag, v_src.status);
      v_added := v_added + 1;
    elsif r.kind = 'removed' then
      update attendees set sheet_status = 'removed' where id = r.attendee_id;
      v_removed := v_removed + 1;
    else
      select * into v_src from sheet_source_rows where project_id = p_project and sheet_row_id = r.sheet_row_id;
      update attendees set
        name = case when 'name' = any(v_fields) then v_src.name else name end,
        org = case when 'org' = any(v_fields) then v_src.org else org end,
        title = case when 'title' = any(v_fields) then v_src.title else title end,
        email = case when 'email' = any(v_fields) then v_src.email else email end,
        phone = case when 'phone' = any(v_fields) then v_src.phone else phone end,
        group_tag = case when 'group_tag' = any(v_fields) then v_src.group_tag else group_tag end,
        registered_at = case when 'registered_at' = any(v_fields) then v_src.registered_at else registered_at end,
        sheet_status = v_src.status
      where id = r.attendee_id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  if v_added + v_changed + v_removed = 0 then
    return jsonb_build_object('applied', 0, 'added', 0, 'changed', 0, 'removed', 0, 'connection', to_jsonb(v_conn));
  end if;
  update sheet_connections set snapshot_version = snapshot_version + 1, snapshot_at = coalesce(source_modified_at, now()),
    state = 'connected', pending_added = 0, pending_changed = 0, pending_removed = 0, checked_at = now(), last_success_at = now()
  where id = v_conn.id returning * into v_conn;
  perform app.write_log(p_project, 'user:' || v_me, 'sheet.applied', 'sheet_connection', v_conn.id,
    jsonb_build_object('added', v_added, 'changed', v_changed, 'removed', v_removed, 'snapshot_version', v_conn.snapshot_version));
  return jsonb_build_object('applied', v_added + v_changed + v_removed, 'added', v_added, 'changed', v_changed, 'removed', v_removed, 'connection', to_jsonb(v_conn));
end $$;
revoke execute on function public.apply_sheet_diff(uuid, int) from public, anon;
grant execute on function public.apply_sheet_diff(uuid, int) to authenticated;

-- 연결 확정 (pm·reg): 매핑 검증(필수 name+email) → 연결 행 → 원본 행 적재(p_rows: 서버 읽기 결과, 비우면 기존 행 유지) → 최초 적재는 **추가만**
create or replace function public.connect_sheet(p_project uuid, p_input jsonb, p_probe jsonb, p_rows jsonb default null)
returns sheet_connections language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_conn sheet_connections; v_fields text[]; v_missing text[]; v_name text; v_seeded int := 0; v_now timestamptz := now();
begin
  v_me := app.require_roles(p_project, '등록 데이터 권한이 없습니다.', 'pm', 'reg');
  perform app.require_writable(p_project);
  if exists (select 1 from sheet_connections where project_id = p_project) then
    raise exception 'CONFLICT: 이미 연결된 시트가 있습니다 — 연결을 해제한 뒤 다시 연결해 주세요.' using errcode = 'P0409';
  end if;
  select coalesce(array_agg(distinct m->>'field'), '{}') into v_fields from jsonb_array_elements(p_input->'mapping') m where m->>'field' is not null;
  select array_agg(x) into v_missing from unnest(array['name','email']) x where not (x = any(v_fields));
  if v_missing is not null then
    raise exception 'VALIDATION: 필수 매핑이 없습니다 — % 컬럼을 지정해 주세요.',
      array_to_string(array(select case x when 'name' then '이름' when 'email' then '이메일' else x end from unnest(v_missing) x), '·') using errcode = 'P0422';
  end if;
  if p_rows is not null then
    delete from sheet_source_rows where project_id = p_project;
    insert into sheet_source_rows (project_id, sheet_row_id, row_number, name, org, title, email, phone, group_tag, registered_at, status, invalid_reason, previously_confirmed)
    select p_project, r->>'sheet_row_id', ord::int, r->>'name', r->>'org', r->>'title', r->>'email', r->>'phone', r->>'group_tag',
           coalesce((r->>'registered_at')::timestamptz, v_now), coalesce(r->>'status', 'applied'), r->>'invalid_reason', coalesce((r->>'previously_confirmed')::boolean, false)
    from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  end if;
  select display_name into v_name from profiles where id = v_me;
  insert into sheet_connections (project_id, state, title, url, tab_name, mapping, connected_at, connected_by, snapshot_at, snapshot_version,
                                 checked_at, auto_check_minutes, source_modified_at, last_success_at, first_row_is_header)
  values (p_project, 'connected', p_probe->>'title', trim(p_input->>'url'), p_input->>'tab_name', coalesce(p_input->'mapping', '[]'::jsonb),
          v_now, v_name, v_now, 1, v_now, 15, (p_probe->>'source_modified_at')::timestamptz, v_now,
          coalesce((p_input->>'first_row_is_header')::boolean, true))
  returning * into v_conn;
  insert into attendees (project_id, name, org, email, phone, channel, registered_at, sheet_row_id, title, group_tag, sheet_status)
  select p_project, s.name, s.org, s.email, s.phone, 'import', s.registered_at, s.sheet_row_id, s.title, s.group_tag, s.status
  from sheet_source_rows s
  where s.project_id = p_project and s.invalid_reason is null
    and not exists (select 1 from attendees a where a.project_id = p_project and a.sheet_row_id = s.sheet_row_id)
    and not exists (select 1 from attendees a where a.project_id = p_project and s.email is not null and lower(a.email) = lower(s.email));
  get diagnostics v_seeded = row_count;
  perform app.write_log(p_project, 'user:' || v_me, 'sheet.connected', 'sheet_connection', v_conn.id,
    jsonb_build_object('tab_name', p_input->>'tab_name', 'seeded', v_seeded));
  return v_conn;
end $$;
revoke execute on function public.connect_sheet(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.connect_sheet(uuid, jsonb, jsonb, jsonb) to authenticated;

-- 원본 행 갱신(서버 읽기 함수가 호출 — 로그인 사용자 세션으로, 멤버만). 갱신 후 감지까지 한 번에.
create or replace function public.refresh_sheet_source(p_project uuid, p_rows jsonb, p_source_modified_at timestamptz default null)
returns sheet_connections language plpgsql security definer set search_path = public as $$
begin
  if not app.is_member(p_project) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  delete from sheet_source_rows where project_id = p_project;
  insert into sheet_source_rows (project_id, sheet_row_id, row_number, name, org, title, email, phone, group_tag, registered_at, status, invalid_reason, previously_confirmed)
  select p_project, r->>'sheet_row_id', ord::int, r->>'name', r->>'org', r->>'title', r->>'email', r->>'phone', r->>'group_tag',
         coalesce((r->>'registered_at')::timestamptz, now()), coalesce(r->>'status', 'applied'), r->>'invalid_reason', coalesce((r->>'previously_confirmed')::boolean, false)
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  update sheet_connections set source_modified_at = coalesce(p_source_modified_at, source_modified_at) where project_id = p_project;
  return public.check_sheet_updates(p_project);
end $$;
revoke execute on function public.refresh_sheet_source(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.refresh_sheet_source(uuid, jsonb, timestamptz) to authenticated;
