-- ─────────────────────────────────────────────────────────────────────
-- 1600 · RPC(내부 로그인 경로) — 한 트랜잭션이어야 하는 다단계 쓰기를 SQL 함수로 묶는다.
-- 전부 security invoker(RLS 적용)다. 예외(list_people·remove_person)는 주소록이 행사 경계를 넘기 때문이며 본문에 사유를 적었다.
-- 오류 규약: raise exception 'CODE: 메시지' + errcode P04xx → 프론트 mapPgError가 ProviderError로 옮긴다.
-- PostgREST 기본은 함수 실행 권한이 PUBLIC이라, 여기서 만드는 함수는 전부 public에서 걷고 필요한 롤에만 준다.
-- ─────────────────────────────────────────────────────────────────────

-- 공용: 현재 사용자가 그 행사의 pm이 아니면 403
create or replace function app.require_pm(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not app.is_pm(p_project) then raise exception 'FORBIDDEN: PM 전용 기능입니다.' using errcode = 'P0403'; end if;
  return v_me;
end $$;

create or replace function app.require_roles(p_project uuid, p_message text, variadic p_roles member_role[])
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not (app.member_role(p_project) = any (p_roles)) then raise exception 'FORBIDDEN: %', p_message using errcode = 'P0403'; end if;
  return v_me;
end $$;

create or replace function app.require_writable(p_project uuid)
returns projects language plpgsql stable security definer set search_path = public as $$
declare v_project projects;
begin
  select * into v_project from projects where id = p_project;
  if v_project.id is null then raise exception 'NOT_FOUND: 프로젝트를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_project.status = 'closed' then
    raise exception 'CONFLICT: 종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.' using errcode = 'P0409';
  end if;
  return v_project;
end $$;

create or replace function app.write_log(p_project uuid, p_actor text, p_action text, p_target_type text, p_target_id uuid, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into activity_log (project_id, actor, action, target_type, target_id, meta)
  values (p_project, p_actor, p_action, p_target_type, p_target_id, p_meta)
$$;

-- approved → final + 연결 WBS 자동 done (§5 system 전이 · §4-15). 발주처 결정·파트너 검토 양쪽이 쓴다.
create or replace function app.finalize_deliverable(p_deliverable uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; t record;
begin
  update deliverables set status = 'final' where id = p_deliverable and status = 'approved' returning project_id into v_project;
  if v_project is null then
    raise exception 'CONFLICT: approved 상태의 항목만 확정할 수 있습니다.' using errcode = 'P0409';
  end if;
  perform app.write_log(v_project, 'system', 'deliverable.finalized', 'deliverable', p_deliverable);
  for t in update wbs_tasks set status = 'done', done_at = now()
           where linked_deliverable_id = p_deliverable and status <> 'done' returning id
  loop
    perform app.write_log(v_project, 'system', 'wbs.auto_done', 'wbs_task', t.id, jsonb_build_object('deliverable_id', p_deliverable));
  end loop;
end $$;

-- ── 주소록 (§4-2b) ─────────────────────────────────────────────────
-- 목록: 사람 + 배정 현황(행사명 포함). 행사명은 그 사람이 올라간 행사라 호출자가 멤버가 아닐 수 있어
-- security definer로 읽는다 — 노출되는 것은 행사명·역할뿐(금액·명단 아님).
create or replace function public.list_people()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'email', p.email, 'title', p.title, 'phone', p.phone, 'org', p.org,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('project_id', m.project_id, 'project_name', pr.name, 'role', m.role) order by pr.created_at)
      from project_members m join projects pr on pr.id = m.project_id where m.user_id = p.id), '[]'::jsonb)
  ) order by p.display_name), '[]'::jsonb)
  from profiles p
  where auth.uid() is not null
$$;
revoke execute on function public.list_people() from public, anon;
grant execute on function public.list_people() to authenticated;

-- 담당자 배정(§8 POST /projects/{id}/members) — 프로필을 이메일로 찾거나 만들고 멤버로 올린다. 초대 이력도 남긴다.
create or replace function public.add_member(p_project uuid, p_display_name text, p_email text, p_role member_role, p_title text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_email text; v_name text; v_profile profiles; v_project projects;
begin
  v_me := app.require_pm(p_project);
  v_project := app.require_writable(p_project);
  v_name := trim(coalesce(p_display_name, '')); v_email := lower(trim(coalesce(p_email, '')));
  if v_name = '' or v_email = '' then raise exception 'VALIDATION: 이름과 이메일은 필수입니다.' using errcode = 'P0422'; end if;
  select * into v_profile from profiles where lower(email) = v_email;
  if v_profile.id is not null and exists (select 1 from project_members where project_id = p_project and user_id = v_profile.id) then
    raise exception 'CONFLICT: 이미 이 행사의 담당자입니다.' using errcode = 'P0409';
  end if;
  if v_profile.id is null then
    insert into profiles (display_name, email, title, phone)
    values (v_name, trim(p_email), nullif(trim(coalesce(p_title, '')), ''), nullif(trim(coalesce(p_phone, '')), ''))
    returning * into v_profile;
  else
    -- 다른 행사에서 확인한 값을 덮어쓰지 않는다 — 빈 칸만 채운다
    update profiles set title = coalesce(title, nullif(trim(coalesce(p_title, '')), '')),
                        phone = coalesce(phone, nullif(trim(coalesce(p_phone, '')), ''))
    where id = v_profile.id returning * into v_profile;
  end if;
  insert into project_members (project_id, user_id, role) values (p_project, v_profile.id, p_role);
  insert into project_invites (project_id, email, display_name, role, invited_by, accepted_at, accepted_user_id)
  values (p_project, v_profile.email, v_profile.display_name, p_role, v_me,
          case when v_profile.auth_user_id is not null then now() end,
          case when v_profile.auth_user_id is not null then v_profile.id end)
  on conflict (project_id, lower(email)) do nothing;
  perform app.write_log(p_project, 'user:' || v_me, 'member.added', 'project', p_project, jsonb_build_object('user_id', v_profile.id, 'role', p_role));
  return jsonb_build_object('project_id', p_project, 'user_id', v_profile.id, 'role', p_role,
    'profile', jsonb_build_object('id', v_profile.id, 'name', v_profile.display_name, 'email', v_profile.email, 'title', v_profile.title, 'phone', v_profile.phone));
end $$;
revoke execute on function public.add_member(uuid, text, text, member_role, text, text) from public, anon;
grant execute on function public.add_member(uuid, text, text, member_role, text, text) to authenticated;

-- 담당자 제거 — 마지막 PM은 409(§4-2)
create or replace function public.remove_member(p_project uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_role member_role;
begin
  v_me := app.require_pm(p_project);
  perform app.require_writable(p_project);
  select role into v_role from project_members where project_id = p_project and user_id = p_member;
  if v_role is null then raise exception 'NOT_FOUND: 담당자를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_role = 'pm' and (select count(*) from project_members where project_id = p_project and role = 'pm') <= 1 then
    raise exception 'CONFLICT: 마지막 PM은 삭제할 수 없습니다 — 먼저 다른 PM을 지정하세요.' using errcode = 'P0409';
  end if;
  delete from project_members where project_id = p_project and user_id = p_member;
  perform app.write_log(p_project, 'user:' || v_me, 'member.removed', 'project', p_project, jsonb_build_object('user_id', p_member));
end $$;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- 주소록 삭제 — 배정이 하나라도 있으면 409(사유에 행사명), 본인 삭제 409(§4-2b)
create or replace function public.remove_person(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_names text;
begin
  v_me := app.current_profile_id();
  if v_me is null or not app.is_any_pm() then raise exception 'FORBIDDEN: PM 전용 기능입니다.' using errcode = 'P0403'; end if;
  if not exists (select 1 from profiles where id = p_id) then raise exception 'NOT_FOUND: 담당자를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  select string_agg(coalesce(pr.name, m.project_id::text), ' · ' order by pr.created_at) into v_names
  from project_members m left join projects pr on pr.id = m.project_id where m.user_id = p_id;
  if v_names is not null then
    raise exception 'CONFLICT: 배정된 행사가 있어 삭제할 수 없습니다 — %. 각 행사의 담당자에서 먼저 빼주세요.', v_names using errcode = 'P0409';
  end if;
  if p_id = v_me then raise exception 'CONFLICT: 지금 로그인한 본인은 삭제할 수 없습니다.' using errcode = 'P0409'; end if;
  delete from profiles where id = p_id;
end $$;
revoke execute on function public.remove_person(uuid) from public, anon;
grant execute on function public.remove_person(uuid) to authenticated;

-- ── WBS 전개·온보딩 (§4-15 재전개 보존 · §8 onboarding-complete "한 트랜잭션") ─────────
-- 클라이언트가 템플릿(src/fixtures/wbsTemplates.ts 정본)으로 전개한 전체 행을 넘기고, DB는 한 트랜잭션에서
-- ① 넘어오지 않은 기존 태스크 삭제 ② 행 upsert ③ 주최형 inbound 산출물 생성을 수행한다.
create or replace function app.replace_wbs_tasks_impl(p_project uuid, p_tasks jsonb, p_deliverables jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_deliverables is not null and jsonb_array_length(p_deliverables) > 0 then
    insert into deliverables (id, project_id, area, category, title, status, assignee_id, due_date, requires_approval, partner_id)
    select d.id, p_project, d.area, d.category, d.title, coalesce(d.status, 'requested'), d.assignee_id, d.due_date, coalesce(d.requires_approval, true), d.partner_id
    from jsonb_populate_recordset(null::deliverables, p_deliverables) d
    on conflict (id) do nothing;
  end if;
  delete from wbs_tasks where project_id = p_project
    and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_tasks) e);
  insert into wbs_tasks (id, project_id, phase_no, phase_name, code, title, offset_start, offset_end, start_date, end_date, role, origin_role,
                         status, done_at, linked_deliverable_id, target, direction, partner_id, note, sort_order)
  select t.id, p_project, t.phase_no, t.phase_name, t.code, t.title, t.offset_start, t.offset_end, t.start_date, t.end_date, t.role, t.origin_role,
         coalesce(t.status, 'todo'), t.done_at, t.linked_deliverable_id, t.target, coalesce(t.direction, 'internal'), t.partner_id, t.note, coalesce(t.sort_order, 0)
  from jsonb_populate_recordset(null::wbs_tasks, p_tasks) t
  on conflict (id) do update set
    phase_no = excluded.phase_no, phase_name = excluded.phase_name, code = excluded.code, title = excluded.title,
    offset_start = excluded.offset_start, offset_end = excluded.offset_end, start_date = excluded.start_date, end_date = excluded.end_date,
    role = excluded.role, origin_role = excluded.origin_role, status = excluded.status, done_at = excluded.done_at,
    linked_deliverable_id = excluded.linked_deliverable_id, target = excluded.target, direction = excluded.direction,
    partner_id = excluded.partner_id, note = excluded.note, sort_order = excluded.sort_order;
end $$;

create or replace function public.replace_wbs_tasks(p_project uuid, p_tasks jsonb, p_deliverables jsonb default '[]'::jsonb, p_action text default 'wbs.expanded', p_meta jsonb default null)
returns setof wbs_tasks language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.require_pm(p_project);
  perform app.require_writable(p_project);
  perform app.replace_wbs_tasks_impl(p_project, p_tasks, p_deliverables);
  perform app.write_log(p_project, 'user:' || v_me, p_action, 'project', p_project, p_meta);
  return query select * from wbs_tasks where project_id = p_project order by sort_order;
end $$;
revoke execute on function public.replace_wbs_tasks(uuid, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.replace_wbs_tasks(uuid, jsonb, jsonb, text, jsonb) to authenticated;

-- 온보딩 완료: onboarded_at 기록(이미 완료면 409) + WBS 전개 + R&R·컴플라이언스 시드 — 한 트랜잭션(§8)
-- p_charters·p_cards가 null이면 손대지 않는다(주최형 백필 규칙은 클라이언트가 판정해 넘긴다)
create or replace function public.complete_onboarding(p_project uuid, p_tasks jsonb, p_deliverables jsonb default '[]'::jsonb, p_charters jsonb default null, p_cards jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_project projects;
begin
  v_me := app.require_pm(p_project);
  v_project := app.require_writable(p_project);
  if v_project.onboarded_at is not null then
    raise exception 'CONFLICT: 이미 온보딩이 완료된 프로젝트입니다.' using errcode = 'P0409';
  end if;
  update projects set onboarded_at = now() where id = p_project;
  perform app.replace_wbs_tasks_impl(p_project, p_tasks, p_deliverables);
  if p_charters is not null then
    delete from role_charters where project_id = p_project;
    insert into role_charters (id, project_id, role, origin_role, title, items)
    select coalesce(c.id, gen_random_uuid()), p_project, c.role, c.origin_role, c.title, coalesce(c.items, '[]'::jsonb)
    from jsonb_populate_recordset(null::role_charters, p_charters) c;
  end if;
  if p_cards is not null then
    delete from compliance_cards where project_id = p_project;
    insert into compliance_cards (id, project_id, kind, title, items, sort_order)
    select coalesce(c.id, gen_random_uuid()), p_project, c.kind, c.title, coalesce(c.items, '[]'::jsonb), coalesce(c.sort_order, 0)
    from jsonb_populate_recordset(null::compliance_cards, p_cards) c;
  end if;
  perform app.write_log(p_project, 'user:' || v_me, 'wbs.expanded', 'project', p_project, jsonb_build_object('count', jsonb_array_length(p_tasks)));
  perform app.write_log(p_project, 'user:' || v_me, 'onboarding.completed', 'project', p_project);
end $$;
revoke execute on function public.complete_onboarding(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.complete_onboarding(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- R&R·컴플라이언스 세트 교체(주최형 재전개 백필 등) — 비어 있을 때만 시드하려면 p_only_if_empty=true
create or replace function public.seed_project_sets(p_project uuid, p_charters jsonb default null, p_cards jsonb default null, p_only_if_empty boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform app.require_pm(p_project);
  perform app.require_writable(p_project);
  if p_charters is not null and (not p_only_if_empty or not exists (select 1 from role_charters where project_id = p_project)) then
    delete from role_charters where project_id = p_project;
    insert into role_charters (id, project_id, role, origin_role, title, items)
    select coalesce(c.id, gen_random_uuid()), p_project, c.role, c.origin_role, c.title, coalesce(c.items, '[]'::jsonb)
    from jsonb_populate_recordset(null::role_charters, p_charters) c;
  end if;
  if p_cards is not null and (not p_only_if_empty or not exists (select 1 from compliance_cards where project_id = p_project)) then
    delete from compliance_cards where project_id = p_project;
    insert into compliance_cards (id, project_id, kind, title, items, sort_order)
    select coalesce(c.id, gen_random_uuid()), p_project, c.kind, c.title, coalesce(c.items, '[]'::jsonb), coalesce(c.sort_order, 0)
    from jsonb_populate_recordset(null::compliance_cards, p_cards) c;
  end if;
end $$;
revoke execute on function public.seed_project_sets(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.seed_project_sets(uuid, jsonb, jsonb, boolean) to authenticated;

-- ── 정형 문서 벌크 교체 (§8.2 PUT scenario-blocks · guide-sections) ─────────
create or replace function public.save_scenario_blocks(p_deliverable uuid, p_blocks jsonb)
returns setof scenario_blocks language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_roles(v_d.project_id, '이 편집은 PM·운영 담당만 가능합니다.', 'pm', 'ops');
  if v_d.category <> '시나리오' then raise exception 'CONFLICT: 시나리오 항목이 아닙니다.' using errcode = 'P0409'; end if;
  perform app.require_writable(v_d.project_id);
  delete from scenario_blocks where deliverable_id = p_deliverable;
  insert into scenario_blocks (deliverable_id, session_id, "time", kind, script, note, sort_order)
  select p_deliverable, (e->>'session_id')::uuid, e->>'time', e->>'kind', e->>'script', e->>'note', ord::int
  from jsonb_array_elements(p_blocks) with ordinality as x(e, ord);
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'scenario.saved', 'deliverable', p_deliverable, jsonb_build_object('count', jsonb_array_length(p_blocks)));
  return query select * from scenario_blocks where deliverable_id = p_deliverable order by sort_order;
end $$;
revoke execute on function public.save_scenario_blocks(uuid, jsonb) from public, anon;
grant execute on function public.save_scenario_blocks(uuid, jsonb) to authenticated;

create or replace function public.save_guide_sections(p_deliverable uuid, p_sections jsonb)
returns setof guide_sections language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_roles(v_d.project_id, '이 편집은 PM·운영 담당만 가능합니다.', 'pm', 'ops');
  if v_d.category <> '운영가이드' then raise exception 'CONFLICT: 운영가이드 항목이 아닙니다.' using errcode = 'P0409'; end if;
  perform app.require_writable(v_d.project_id);
  delete from guide_sections where deliverable_id = p_deliverable;
  insert into guide_sections (id, deliverable_id, kind, title, content, source_ref, source_stale, sort_order)
  select coalesce((e->>'id')::uuid, gen_random_uuid()), p_deliverable, e->>'kind', e->>'title', e->>'content', e->>'source_ref',
         coalesce((e->>'source_stale')::boolean, false), ord::int
  from jsonb_array_elements(p_sections) with ordinality as x(e, ord);
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'guide.saved', 'deliverable', p_deliverable, jsonb_build_object('count', jsonb_array_length(p_sections)));
  return query select * from guide_sections where deliverable_id = p_deliverable order by sort_order;
end $$;
revoke execute on function public.save_guide_sections(uuid, jsonb) from public, anon;
grant execute on function public.save_guide_sections(uuid, jsonb) to authenticated;

-- ── 견적 확정 (§8 POST /quotes/{id}/finalize) — 같은 행사 다른 final은 archived, 상호 링크 ─────────
create or replace function public.finalize_quote(p_quote uuid)
returns quotes language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_q quotes;
begin
  v_me := app.current_profile_id();
  if v_me is null or not app.is_quote_user() then
    raise exception 'FORBIDDEN: 견적 메뉴는 영업·관리자 권한이 필요합니다.' using errcode = 'P0403';
  end if;
  select * into v_q from quotes where id = p_quote;
  if v_q.id is null then raise exception 'NOT_FOUND: 견적을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_q.is_final then raise exception 'CONFLICT: 이미 확정된 견적입니다.' using errcode = 'P0409'; end if;
  if v_q.superseded_by is not null then
    raise exception 'CONFLICT: 새 버전이 있는 견적은 확정할 수 없습니다 — 최신 버전을 확정하세요.' using errcode = 'P0409';
  end if;
  if v_q.project_id is not null then
    update quotes set is_final = false, status = 'archived' where project_id = v_q.project_id and id <> p_quote and is_final;
  end if;
  update quotes set is_final = true, locked_at = now(), status = 'accepted' where id = p_quote returning * into v_q;
  if v_q.project_id is not null then
    update projects set quote_id = p_quote where id = v_q.project_id;
    perform app.write_log(v_q.project_id, 'user:' || v_me, 'quote.finalized', 'quote', p_quote);
  end if;
  return v_q;
end $$;
revoke execute on function public.finalize_quote(uuid) from public, anon;
grant execute on function public.finalize_quote(uuid) to authenticated;

-- ── 파트너 제출 검토 (§8.1 · §5.1) — approved면 final까지, changes_requested면 shared 코멘트 필수 ─────────
create or replace function public.review_partner_submission(p_deliverable uuid, p_decision text, p_comment text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_d.partner_id is null then raise exception 'CONFLICT: 파트너 제출 항목이 아닙니다.' using errcode = 'P0409'; end if;
  v_me := app.current_profile_id();
  v_role := app.member_role(v_d.project_id);
  if v_me is null or v_role is null then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  -- 역할-영역 일치(pm 전 영역 · design/ops 자기 영역 · reg 불가)
  if not (v_role = 'pm' or (v_role in ('design','ops') and v_d.area::text = v_role::text)) then
    raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
  end if;
  if v_d.status <> 'pending_approval' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → % (partner_review)', v_d.status, p_decision using errcode = 'P0409';
  end if;
  if p_decision = 'approved' then
    update deliverables set status = 'approved' where id = p_deliverable;
    perform app.write_log(v_d.project_id, 'user:' || v_me, 'partner.reviewed', 'deliverable', p_deliverable, jsonb_build_object('decision', 'approved'));
    perform app.finalize_deliverable(p_deliverable);
  elsif p_decision = 'changes_requested' then
    if nullif(trim(coalesce(p_comment, '')), '') is null then
      raise exception 'VALIDATION: 수정요청 시 코멘트는 필수입니다.' using errcode = 'P0422';
    end if;
    update deliverables set status = 'changes_requested' where id = p_deliverable;
    insert into comments (deliverable_id, author_user_id, visibility, body) values (p_deliverable, v_me, 'shared', p_comment);
    perform app.write_log(v_d.project_id, 'user:' || v_me, 'partner.reviewed', 'deliverable', p_deliverable, jsonb_build_object('decision', 'changes_requested'));
  else
    raise exception 'VALIDATION: decision은 approved 또는 changes_requested여야 합니다.' using errcode = 'P0422';
  end if;
  select * into v_d from deliverables where id = p_deliverable;
  return v_d;
end $$;
revoke execute on function public.review_partner_submission(uuid, text, text) from public, anon;
grant execute on function public.review_partner_submission(uuid, text, text) to authenticated;

-- ── 내부 상태 전이 + 코멘트(반려) — §5 status_patch 경로. 코멘트 필수 여부는 클라이언트(assertTransition)가 먼저 판정 ─────────
create or replace function public.transition_deliverable(p_deliverable uuid, p_to deliverable_status, p_comment text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role; v_from deliverable_status;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  v_role := app.member_role(v_d.project_id);
  if v_me is null or v_role is null then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  v_from := v_d.status;
  -- status_patch 경로의 두 전이만 허용한다(그 밖은 approval_request·client_decision·version_upload 경로)
  if v_from = 'draft' and p_to = 'internal_review' then
    if not (v_role = 'pm' or (v_role in ('design','ops') and v_d.area::text = v_role::text)) then
      raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
    end if;
  elsif v_from = 'internal_review' and p_to = 'draft' then
    if v_role <> 'pm' then raise exception 'FORBIDDEN: 이 전이를 수행할 권한이 없습니다.' using errcode = 'P0403'; end if;
    if nullif(trim(coalesce(p_comment, '')), '') is null then
      raise exception 'VALIDATION: 반려 사유 코멘트가 필요합니다.' using errcode = 'P0422';
    end if;
    insert into comments (deliverable_id, author_user_id, visibility, body) values (p_deliverable, v_me, 'internal', p_comment);
  else
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → % (status_patch)', v_from, p_to using errcode = 'P0409';
  end if;
  update deliverables set status = p_to where id = p_deliverable returning * into v_d;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'status.transitioned', 'deliverable', p_deliverable, jsonb_build_object('from', v_from, 'to', p_to));
  return v_d;
end $$;
revoke execute on function public.transition_deliverable(uuid, deliverable_status, text) from public, anon;
grant execute on function public.transition_deliverable(uuid, deliverable_status, text) to authenticated;

-- ── 버전 업로드 (§7.2 — Phase 4는 메타만: 파일 원본은 Phase 5 Drive) + §5 자동 전이 ─────────
create or replace function public.upload_version(p_deliverable uuid, p_file_name text, p_note text default null, p_original_file_name text default null)
returns versions language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role; v_v versions; v_to deliverable_status;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  v_role := app.member_role(v_d.project_id);
  if v_me is null or v_role is null then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  if not (v_role = 'pm' or (v_role in ('design','ops') and v_d.area::text = v_role::text)) then
    raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
  end if;
  if v_d.status not in ('requested','draft','internal_review','changes_requested') then
    raise exception 'CONFLICT: 현재 상태(%)에서는 업로드할 수 없습니다.', v_d.status using errcode = 'P0409';
  end if;
  if v_d.partner_id is not null and v_d.status = 'requested' then
    raise exception 'CONFLICT: 파트너 제출 항목은 파트너가 제출 링크로 첫 제출을 해야 합니다.' using errcode = 'P0409';
  end if;
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, 'pending:' || gen_random_uuid(), p_file_name, p_note, v_me)
  returning * into v_v;
  if v_d.status in ('requested','changes_requested') then
    v_to := case when v_d.partner_id is not null then 'pending_approval'::deliverable_status else 'draft'::deliverable_status end;
    update deliverables set status = v_to where id = p_deliverable;
  end if;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'version.uploaded', 'version', v_v.id,
    jsonb_build_object('deliverable_id', p_deliverable, 'version_no', v_v.version_no));
  return v_v;
end $$;
revoke execute on function public.upload_version(uuid, text, text, text) from public, anon;
grant execute on function public.upload_version(uuid, text, text, text) to authenticated;

-- ── 컨펌 발송 (§5 approval_request — pm 단독, 미리보기 포맷은 클라이언트가 먼저 검사·DB도 확인) ─────────
create or replace function public.request_approval(p_deliverable uuid, p_version uuid, p_due_at timestamptz default null)
returns approvals language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_v versions; v_a approvals;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_pm(v_d.project_id);
  perform app.require_writable(v_d.project_id);
  if not v_d.requires_approval then raise exception 'CONFLICT: 컨펌 루프를 사용하지 않는 항목입니다.' using errcode = 'P0409'; end if;
  if v_d.status <> 'internal_review' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → pending_approval (approval_request)', v_d.status using errcode = 'P0409';
  end if;
  select * into v_v from versions where id = p_version and deliverable_id = p_deliverable;
  if v_v.id is null then raise exception 'NOT_FOUND: 해당 항목의 버전이 아닙니다.' using errcode = 'P0404'; end if;
  if lower(v_v.file_name) !~ '\.(pdf|png|jpe?g)$' then
    raise exception 'VALIDATION: 컨펌 발송은 미리보기 포맷(PDF·PNG·JPG) 버전만 가능합니다.' using errcode = 'P0422';
  end if;
  insert into approvals (deliverable_id, version_id, requested_by, due_at) values (p_deliverable, p_version, v_me, p_due_at) returning * into v_a;
  update deliverables set status = 'pending_approval' where id = p_deliverable;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'approval.requested', 'approval', v_a.id, jsonb_build_object('deliverable_id', p_deliverable));
  return v_a;
end $$;
revoke execute on function public.request_approval(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.request_approval(uuid, uuid, timestamptz) to authenticated;

-- ── 인박스 연결 (§7.3 — 파일명 rename 기본 off) + §5 자동 draft 전이 ─────────
create or replace function public.link_inbox_file(p_inbox uuid, p_deliverable uuid)
returns versions language plpgsql security definer set search_path = public as $$
declare v_f unregistered_files; v_d deliverables; v_me uuid; v_role member_role; v_v versions;
begin
  select * into v_f from unregistered_files where id = p_inbox;
  if v_f.id is null then raise exception 'NOT_FOUND: 인박스 파일을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_f.dismissed or v_f.linked_deliverable_id is not null then
    raise exception 'CONFLICT: 이미 처리된 인박스 파일입니다.' using errcode = 'P0409';
  end if;
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  v_role := app.member_role(v_d.project_id);
  if v_me is null or v_role is null then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  if not (v_role = 'pm' or (v_role in ('design','ops') and v_d.area::text = v_role::text)) then
    raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
  end if;
  if v_d.status not in ('requested','draft','internal_review','changes_requested') then
    raise exception 'CONFLICT: 현재 상태(%)에서는 버전을 추가할 수 없습니다.', v_d.status using errcode = 'P0409';
  end if;
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, v_f.drive_file_id, coalesce(v_f.file_name, 'unnamed-' || v_f.drive_file_id), '인박스에서 연결됨', v_me)
  returning * into v_v;
  update unregistered_files set linked_deliverable_id = p_deliverable where id = p_inbox;
  if v_d.status in ('requested','changes_requested') then
    update deliverables set status = 'draft' where id = p_deliverable;
  end if;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'inbox.linked', 'version', v_v.id, jsonb_build_object('deliverable_id', p_deliverable));
  return v_v;
end $$;
revoke execute on function public.link_inbox_file(uuid, uuid) from public, anon;
grant execute on function public.link_inbox_file(uuid, uuid) to authenticated;
