-- 28번째 — Phase 6.3 [B2] 운영/디자인 스레드 2개 + 댓글 태그 (설계서 v2.17.1 §9 · §26.2 — 운영 커뮤니케이션 프로토콜 v1.0 정합)
--   · projects.design_thread_url — 디자인 채널의 행사 스레드 링크(운영 스레드 slack_thread_url과 다른 스레드). 있으면 design 영역
--     항목의 알림(의뢰·시안·검토요청·피드백·확정·납품·마감 D-1)이 이 스레드로 가고, 운영 스레드에는 `[키비주얼]` 3줄(일정 합의·확정·납품)만 남는다.
--   · app.notify_actions() += 'drive.snapshot_copied' — 납품(확정본이 03_제작·키비주얼/납품에 놓인 때). 처음 적용할 때 지난 이틀의 사본
--     사건은 '알림 없음'으로 표시한다(배포 직후 첫 신호가 옛 사본을 한꺼번에 알리지 않게 — 20260926000100의 첫 설치 처리와 같은 이유).
--   · notify_claim_events / notify_claim_reminders / notify_claim_manual — 결과에 design_thread(그리고 리마인드 행에 area)를 더한다.
--   · notify_ack_card — ok일 때 행사 스레드 2개와 카드의 항목(제목·영역·마감)을 함께 돌려준다 → 서버가 운영 스레드에 `[키비주얼] 일정 합의`.
--   스키마 변경 = 열 1개. 다른 표·정책·권한 불변.
alter table projects add column if not exists design_thread_url text;
comment on column projects.design_thread_url is
  'Phase 6.3 [B2] — 디자인 채널의 행사 스레드 링크. design 영역 알림이 이 스레드로, 운영 스레드(slack_thread_url)엔 [키비주얼] 3줄(일정 합의·확정·납품)만';

create or replace function app.notify_actions()
returns text[] language sql immutable as $$
  select array['version.uploaded', 'approval.requested', 'approval.decided', 'partner.submitted', 'deliverable.requested',
               'status.transitioned', 'drive.snapshot_copied']
$$;

do $$
begin
  if not exists (select 1 from notification_log where key = 'setup:design-thread') then
    insert into notification_log (key, project_id, kind, status)
    select 'act:' || a.id, a.project_id, a.action, 'skipped'
    from activity_log a
    where a.action = 'drive.snapshot_copied' and a.created_at > now() - interval '2 days'
    on conflict (key) do nothing;
    insert into notification_log (key, project_id, kind, status) values ('setup:design-thread', null, 'setup', 'skipped')
    on conflict (key) do nothing;
  end if;
end $$;

-- 즉시 알림 — 20260926000100 정의에 design_thread를 더하고, 납품(drive.snapshot_copied)에도 최신 버전을 붙인다
create or replace function public.notify_claim_events(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb;
begin
  with cand as (
    select a.* from activity_log a
    where a.action = any (app.notify_actions())
      and (a.action <> 'status.transitioned' or a.meta->>'to' = 'internal_review')
      and a.created_at > now() - interval '2 days'
      and not exists (select 1 from notification_log n where n.key = 'act:' || a.id)
    order by a.id
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), ins as (
    insert into notification_log (key, project_id, kind)
    select 'act:' || c.id, c.project_id, c.action from cand c
    on conflict (key) do nothing
    returning key
  ), rows as (
    select c.*, p.id as p_id, p.code as p_code, p.name as p_name, p.slack_webhook_url as p_webhook, p.slack_thread_url as p_thread,
      p.design_thread_url as p_design_thread,
      d.id as d_id, d.title as d_title, d.area as d_area, d.assignee_id as d_assignee, d.due_date as d_due,
      d.brief as d_brief, d.brief_refs as d_refs, d.spec_size, d.spec_qty, d.spec_type, d.spec_location, d.category as d_category,
      coalesce(v.version_no, lv.version_no, case when (c.meta->>'version_no') ~ '^\d+$' then (c.meta->>'version_no')::int end) as version_no,
      coalesce(v.file_name, lv.file_name) as file_name, coalesce(v.note, lv.note) as version_note,
      ap.due_at, ap.client_comment,
      actor.display_name as actor_name,
      pt.name as partner_name
    from cand c
    join ins on ins.key = 'act:' || c.id
    join projects p on p.id = c.project_id
    left join versions v on c.target_type = 'version' and v.id = c.target_id
    left join approvals ap on c.target_type = 'approval' and ap.id = c.target_id
    left join deliverables d on d.id = coalesce(v.deliverable_id, ap.deliverable_id,
      case when c.target_type = 'deliverable' then c.target_id end)
    -- 내부검토 요청·납품은 사건에 버전이 없다 — 그 항목의 최신 버전을 붙인다
    left join lateral (select v2.version_no, v2.file_name, v2.note from versions v2
                       where c.action in ('status.transitioned', 'drive.snapshot_copied') and v2.deliverable_id = d.id
                       order by v2.version_no desc limit 1) lv on true
    left join profiles actor on actor.id = (case when c.actor ~ '^user:[0-9a-fA-F-]{36}$' then substring(c.actor from 6)::uuid end)
    left join partners pt on pt.id = coalesce(d.partner_id,
      case when (c.meta->>'partner_id') ~ '^[0-9a-fA-F-]{36}$' then (c.meta->>'partner_id')::uuid end)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', 'act:' || r.id,
      'action', r.action,
      'at', r.created_at,
      'project_id', r.p_id, 'project_code', r.p_code, 'project_name', r.p_name, 'webhook', r.p_webhook, 'thread', r.p_thread,
      'design_thread', r.p_design_thread,
      'deliverable_id', r.d_id, 'title', r.d_title, 'area', r.d_area, 'category', r.d_category,
      'version_no', r.version_no,
      'decision', r.meta->>'decision',
      'due_at', r.due_at,
      'due_date', r.d_due,
      'actor_name', r.actor_name,
      'assignee_name', (select display_name from profiles where id = r.d_assignee),
      'partner_name', r.partner_name,
      'brief', left(r.d_brief, 150), 'brief_ref_count', case when jsonb_typeof(r.d_refs) = 'array' then jsonb_array_length(r.d_refs) else 0 end,
      'spec_size', r.spec_size, 'spec_qty', r.spec_qty, 'spec_type', r.spec_type, 'spec_location', r.spec_location,
      'file_name', r.file_name, 'version_note', left(r.version_note, 150),
      'client_comment', case when r.decision_is_changes then left(r.client_comment, 150) end,
      'recipients', case
        when r.d_id is null then '[]'::jsonb
        when r.action = 'deliverable.requested' then app.notify_person(r.d_assignee)
        when r.action in ('status.transitioned', 'partner.submitted') then app.notify_role_people(r.p_id, array['pm']::member_role[])
        when r.action = 'approval.decided' then (
          select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
            select jsonb_array_elements(app.notify_person(r.d_assignee)) as x
            union all
            select jsonb_array_elements(app.notify_role_people(r.p_id, array['pm']::member_role[]))) s)
        else '[]'::jsonb end
    ) order by r.id), '[]'::jsonb)
  into v_rows
  from (select rows.*, (rows.meta->>'decision') = 'changes_requested' as decision_is_changes from rows) r;
  return v_rows;
end $$;
revoke execute on function public.notify_claim_events(int) from public, anon, authenticated;
grant execute on function public.notify_claim_events(int) to service_role;

-- 매일 리마인드 — 20260926000100 정의에 design_thread와 행의 영역(area)을 더한다(서버가 디자인 영역 행을 디자인 스레드로 보낸다)
create or replace function public.notify_claim_reminders(p_today date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Seoul')::date);
  v_tomorrow date := v_today + 1;
  v_rows jsonb;
begin
  delete from notification_log where claimed_at < now() - interval '30 days' and key not like 'setup:%';
  with cand as (
    -- ① 컨펌 기한 D-1 미응답 → PM(발주처를 챙기는 사람)
    select 'rem:approval:' || a.id || ':' || v_today as key, p.id as project_id, 'approval_due' as kind,
           jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'due_at', a.due_at, 'area', d.area,
             'recipients', app.notify_role_people(p.id, array['pm']::member_role[])) as data
    from approvals a
    join deliverables d on d.id = a.deliverable_id
    join projects p on p.id = d.project_id
    where a.decision is null and a.due_at is not null and (a.due_at at time zone 'Asia/Seoul')::date = v_tomorrow
      and d.status = 'pending_approval' and p.status = 'active'
    union all
    -- ② 마일스톤 D-1 → 그 영역 담당(전체면 PM)
    select 'rem:milestone:' || m.id || ':' || v_today, p.id, 'milestone_due',
           jsonb_build_object('title', m.title, 'due_date', m.due_date, 'area', m.area,
             'recipients', app.notify_role_people(p.id, app.area_roles(m.area)))
    from milestones m join projects p on p.id = m.project_id
    where not m.done and m.due_date = v_tomorrow and p.status = 'active'
    union all
    -- ③ 파트너 마감 D-1 미제출 → PM
    select 'rem:partner:' || t.id || ':' || v_today, p.id, 'partner_due',
           jsonb_build_object('title', t.title, 'partner_name', pt.name, 'deliverable_id', d.id, 'area', d.area,
             'recipients', app.notify_role_people(p.id, array['pm']::member_role[]))
    from wbs_tasks t
    join projects p on p.id = t.project_id
    left join partners pt on pt.id = t.partner_id
    left join deliverables d on d.id = t.linked_deliverable_id
    where t.direction = 'partner_submit' and t.end_date = v_tomorrow and t.status <> 'done'
      and (d.id is null or d.status = 'requested') and p.status = 'active'
    union all
    -- ④ (v2.12) 항목 마감 D-1 — 아직 우리 손에 있는 항목(지시됨·초안·수정요청) → 담당자(없으면 영역 담당). 파트너 항목은 ③이 맡는다
    select 'rem:due:' || d.id || ':' || v_today, p.id, 'deliverable_due',
           jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'due_date', d.due_date, 'area', d.area,
             'recipients', case when d.assignee_id is not null then app.notify_person(d.assignee_id)
                                else app.notify_role_people(p.id, app.area_roles(d.area)) end)
    from deliverables d join projects p on p.id = d.project_id
    where d.due_date = v_tomorrow and d.status in ('requested', 'draft', 'changes_requested') and d.partner_id is null
      and p.status = 'active'
    union all
    -- ⑤ 미등록 파일(일 1회 묶음) — 멘션 없음
    select 'rem:inbox:' || p.id || ':' || v_today, p.id, 'inbox_digest', jsonb_build_object('count', count(*))
    from unregistered_files u join projects p on p.id = u.project_id
    where not u.dismissed and u.linked_deliverable_id is null and p.status = 'active'
    group by p.id
    union all
    -- ⑥ (v2.12) 24시간 넘게 확인 없는 의뢰 — 카드마다 한 번만(키에 날짜 없음 + reminded_at). 원래 카드 링크와 받는 사람
    select 'rem:unacked:' || x.card_id, x.project_id, 'unacked',
           jsonb_build_object('deliverable_id', x.deliverable_id, 'title', x.title, 'count', x.n, 'request_kind', x.kind, 'area', x.area,
             'channel_id', x.channel_id, 'message_ts', x.message_ts, 'thread_ts', x.thread_ts,
             'recipients', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.display_name, 'email', pr.email,
               'slack_user_id', pr.slack_user_id) order by pr.display_name), '[]'::jsonb) from profiles pr where pr.id = any (x.recipient_ids)))
    from (select ra.card_id, ra.project_id, min(ra.kind) as kind, min(ra.channel_id) as channel_id, min(ra.message_ts) as message_ts,
                 min(ra.thread_ts) as thread_ts, (select r2.recipient_ids from request_acks r2 where r2.card_id = ra.card_id limit 1) as recipient_ids,
                 (array_agg(d.id order by d.due_date nulls last, d.title))[1] as deliverable_id,
                 (array_agg(d.title order by d.due_date nulls last, d.title))[1] as title,
                 (array_agg(d.area::text order by d.due_date nulls last, d.title))[1] as area, count(*) as n
          from request_acks ra join deliverables d on d.id = ra.deliverable_id join projects p on p.id = ra.project_id
          where ra.acknowledged_at is null and ra.reminded_at is null and ra.created_at < now() - interval '24 hours'
            and p.status = 'active'
          group by ra.card_id, ra.project_id) x
  ), ins as (
    insert into notification_log (key, project_id, kind)
    select key, project_id, kind from cand
    on conflict (key) do nothing
    returning key
  ), mark_reminded as (
    update request_acks set reminded_at = now()
    where card_id in (select substring(i.key from 13)::uuid from ins i where i.key like 'rem:unacked:%')
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', c.key, 'kind', c.kind,
      'project_id', p.id, 'project_code', p.code, 'project_name', p.name, 'webhook', p.slack_webhook_url, 'thread', p.slack_thread_url,
      'design_thread', p.design_thread_url
    ) || c.data order by p.code, c.kind, c.key), '[]'::jsonb)
  into v_rows
  from cand c
  join ins on ins.key = c.key
  join projects p on p.id = c.project_id;
  return v_rows;
end $$;
revoke execute on function public.notify_claim_reminders(date) from public, anon, authenticated;
grant execute on function public.notify_claim_reminders(date) to service_role;

-- 수동 리마인드 — design_thread만 더한다(목록 알림은 운영 스레드로 — 서버가 고른다)
create or replace function public.notify_claim_manual(p_project uuid, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_key text := 'man:' || p_project || ':' || p_target || ':' || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24');
  v_p projects;
  v_items jsonb;
  v_total int;
begin
  if p_target not in ('delayed', 'approval') then
    raise exception 'VALIDATION: 리마인드 대상은 delayed 또는 approval이어야 합니다.' using errcode = 'P0422';
  end if;
  select * into v_p from projects where id = p_project;
  if not found then raise exception 'NOT_FOUND: 프로젝트를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if p_target = 'delayed' then
    select count(*), coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'date', x.end_date, 'role', x.role) order by x.end_date, x.sort_order)
             filter (where x.rn <= 10), '[]'::jsonb)
    into v_total, v_items
    from (select t.*, row_number() over (order by t.end_date, t.sort_order) as rn
          from wbs_tasks t where t.project_id = p_project and t.status <> 'done' and t.end_date < v_today) x;
  else
    select count(*), coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'date', x.due_at, 'deliverable_id', x.deliverable_id)
             order by x.due_at nulls last) filter (where x.rn <= 10), '[]'::jsonb)
    into v_total, v_items
    from (select d.title, a.due_at, d.id as deliverable_id, row_number() over (order by a.due_at nulls last) as rn
          from approvals a join deliverables d on d.id = a.deliverable_id
          where d.project_id = p_project and a.decision is null and d.status = 'pending_approval') x;
  end if;
  insert into notification_log (key, project_id, kind) values (v_key, p_project, 'manual_' || p_target)
  on conflict (key) do update set status = 'claimed', error = null, claimed_at = now(), sent_at = null
    where notification_log.status in ('failed', 'skipped');
  if not found then return null; end if;
  return jsonb_build_object('key', v_key, 'kind', 'manual_' || p_target, 'project_id', v_p.id, 'project_code', v_p.code,
    'project_name', v_p.name, 'webhook', v_p.slack_webhook_url, 'thread', v_p.slack_thread_url, 'design_thread', v_p.design_thread_url,
    'total', v_total, 'items', v_items);
end $$;
revoke execute on function public.notify_claim_manual(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_claim_manual(uuid, text) to service_role;

-- '확인했어요' — 20260926000100 정의에, ok일 때 행사 스레드 2개(운영·디자인)와 카드의 항목(제목·영역·마감)을 더한다.
-- 서버는 이것으로 운영 스레드에 `[키비주얼] 일정 합의` 한 줄을 남긴다(디자인 스레드가 따로 있고, 제작 요청 카드에 design 항목이 있을 때만).
create or replace function public.notify_ack_card(p_card uuid, p_profile uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_recipients uuid[];
  v_done record;
  v_name text;
  v_n int;
  v_project projects;
  v_kind text;
  v_items jsonb;
begin
  select recipient_ids into v_recipients from request_acks where card_id = p_card limit 1;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select ra.acknowledged_at, pr.display_name into v_done
  from request_acks ra left join profiles pr on pr.id = ra.acknowledged_by
  where ra.card_id = p_card and ra.acknowledged_at is not null order by ra.acknowledged_at limit 1;
  if found then return jsonb_build_object('status', 'already', 'by', v_done.display_name, 'at', v_done.acknowledged_at); end if;
  if p_profile is null or not (p_profile = any (v_recipients)) then
    return jsonb_build_object('status', 'not_recipient', 'names',
      (select coalesce(jsonb_agg(display_name order by display_name), '[]'::jsonb) from profiles where id = any (v_recipients)));
  end if;
  update request_acks set acknowledged_at = now(), acknowledged_by = p_profile where card_id = p_card and acknowledged_at is null;
  get diagnostics v_n = row_count;
  select display_name into v_name from profiles where id = p_profile;
  select p.* into v_project from request_acks ra join projects p on p.id = ra.project_id where ra.card_id = p_card limit 1;
  select min(ra.kind) into v_kind from request_acks ra where ra.card_id = p_card;
  select coalesce(jsonb_agg(jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'area', d.area, 'due_date', d.due_date)
           order by d.due_date nulls last, d.title), '[]'::jsonb)
  into v_items
  from request_acks ra join deliverables d on d.id = ra.deliverable_id where ra.card_id = p_card;
  return jsonb_build_object('status', 'ok', 'by', v_name, 'at', now(), 'count', v_n,
    'project_id', v_project.id, 'project_name', v_project.name, 'thread', v_project.slack_thread_url,
    'design_thread', v_project.design_thread_url, 'kind', v_kind, 'items', v_items);
end $$;
revoke execute on function public.notify_ack_card(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_ack_card(uuid, uuid) to service_role;
