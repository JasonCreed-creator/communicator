-- ─────────────────────────────────────────────────────────────────────
-- 20260926000100 · Slack 봇 전환 + 의뢰 확인 버튼 (설계서 v2.12 §9 · Phase 6.1, 2026-09-26 — 사용자 결정)
--
-- 사용자 결정(2026-09-25~26): ① 웹훅 → 봇(같은 Slack 앱) ② **DM을 쓰지 않는다** — 행사마다 채널의 **스레드 하나**에 봇이 답글로
-- 남기고 할 일이 생긴 사람을 @멘션한다(멘션 = 그 사람 폰 푸시, 스레드 = 행사 기록) ③ 의뢰(제작 요청·검토 요청)에는
-- '확인했어요' 버튼 하나 — 확인은 상태가 아니라 표식(§5 전이표 무변경), **의뢰 한 건마다** 기록 ④ 시안 올림은 멘션 없이 기록만.
--
--   · projects.slack_thread_url   — 행사 스레드 링크(Slack '링크 복사'). 채널·스레드 ts는 서버가 링크에서 읽는다(src/lib/slackThread.ts)
--   · profiles.slack_user_id      — Slack 멤버 ID. 이메일로 찾은 값을 서버가 적어 두고(캐시), 다르면 담당자 화면에서 고친다
--   · request_acks                — 봇이 올린 의뢰 카드 1장 = card_id, 항목마다 1행. 버튼을 누르면 멘션된 사람만 확인으로 센다
--   · 알릴 사건 + 내부검토 요청(status.transitioned → internal_review) · 받는 사람(멘션 대상)을 사건 행에 싣는다
--   · 매일 리마인드 + 항목 마감 D-1(담당자) · 24시간 확인 없는 의뢰(한 번만)
-- 금액은 여전히 싣지 않는다(§19.7) — 새로 읽는 열: 가이드·규격·버전 메모·파일 이름·발주처 공유 코멘트(앞 150자), 사람 이름·이메일·Slack ID.
-- 이메일은 서버 함수 안에서 Slack 계정을 찾는 데만 쓰고 메시지 본문에는 싣지 않는다.

alter table projects add column if not exists slack_thread_url text;
alter table profiles add column if not exists slack_user_id text;
create index if not exists profiles_slack_user on profiles (slack_user_id) where slack_user_id is not null;

-- 담당자 화면(pm)이 Slack ID를 고칠 수 있게 — 1500의 열 권한 목록에 더한다(app_role·auth_user_id는 계속 막힘)
grant update (display_name, email, title, phone, org, slack_user_id) on profiles to authenticated;
grant insert (display_name, email, title, phone, org, slack_user_id) on profiles to authenticated;

create table if not exists request_acks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,                          -- 버튼 값 — 카드 한 장(여러 건 묶음이면 같은 card_id 여러 행)
  project_id uuid not null references projects(id) on delete cascade,
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  kind text not null check (kind in ('work', 'review')),   -- work = 제작 요청(담당자) · review = 검토 요청·파트너 제출(PM)
  notify_key text not null,                       -- notification_log 키(act:…)
  recipient_ids uuid[] not null default '{}',     -- 멘션된 사람(주소록 id) — 이 사람들의 확인만 센다
  channel_id text not null,
  message_ts text not null,
  thread_ts text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references profiles(id) on delete set null,
  reminded_at timestamptz
);
create index if not exists request_acks_card on request_acks (card_id);
create index if not exists request_acks_deliverable on request_acks (deliverable_id, created_at desc);
create index if not exists request_acks_open on request_acks (created_at) where acknowledged_at is null and reminded_at is null;
alter table request_acks enable row level security;
drop policy if exists request_acks_select on request_acks;
create policy request_acks_select on request_acks for select to authenticated using (app.is_member(project_id));
revoke all on request_acks from anon;
revoke insert, update, delete on request_acks from authenticated;
grant select on request_acks to authenticated;
grant all on request_acks to service_role;

-- 주소록 목록에 Slack ID(§4-2b + v2.12) — 나머지는 기존 정의 그대로
create or replace function public.list_people()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'email', p.email, 'title', p.title, 'phone', p.phone, 'org', p.org,
    'slack_user_id', p.slack_user_id,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('project_id', m.project_id, 'project_name', pr.name, 'role', m.role) order by pr.created_at)
      from project_members m join projects pr on pr.id = m.project_id where m.user_id = p.id), '[]'::jsonb)
  ) order by p.display_name), '[]'::jsonb)
  from profiles p
  where auth.uid() is not null
$$;
revoke execute on function public.list_people() from public, anon;
grant execute on function public.list_people() to authenticated;

-- 멘션 대상 — 사람 한 명 / 행사의 역할 담당자들. 반환 = [{id, name, email, slack_user_id}]
create or replace function app.notify_person(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_array(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email,
    'slack_user_id', p.slack_user_id)) from profiles p where p.id = p_profile), '[]'::jsonb)
$$;
create or replace function app.notify_role_people(p_project uuid, p_roles member_role[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email,
    'slack_user_id', p.slack_user_id) order by p.display_name, p.id), '[]'::jsonb)
  from project_members m join profiles p on p.id = m.user_id
  where m.project_id = p_project and m.role = any (p_roles)
$$;
-- 항목 영역 → 담당 역할(common은 pm)
create or replace function app.area_roles(p_area deliverable_area)
returns member_role[] language sql immutable as $$
  select case p_area when 'design' then array['design']::member_role[] when 'ops' then array['ops']::member_role[]
                     else array['pm']::member_role[] end
$$;
revoke execute on function app.notify_person(uuid) from public, anon, authenticated;
revoke execute on function app.notify_role_people(uuid, member_role[]) from public, anon, authenticated;

-- 알릴 사건 + 내부검토 요청. status.transitioned는 목적지가 internal_review일 때만 쓴다(아래 선점 조건)
create or replace function app.notify_actions()
returns text[] language sql immutable as $$
  select array['version.uploaded', 'approval.requested', 'approval.decided', 'partner.submitted', 'deliverable.requested',
               'status.transitioned']
$$;

-- 이 파일을 처음 적용할 때, 지난 이틀의 상태 전이 사건은 '알림 없음'으로 표시한다 — 배포 직후 첫 신호가 옛 내부검토 요청을
-- 한꺼번에 보내지 않게(20260925000200의 첫 설치 처리와 같은 이유). 두 번째 실행부터는 표식이 있어 아무 일도 하지 않는다.
do $$
begin
  if not exists (select 1 from notification_log where key = 'setup:slack-bot') then
    insert into notification_log (key, project_id, kind, status)
    select 'act:' || a.id, a.project_id, a.action, 'skipped'
    from activity_log a
    where a.action = 'status.transitioned' and a.created_at > now() - interval '2 days'
    on conflict (key) do nothing;
    insert into notification_log (key, project_id, kind, status) values ('setup:slack-bot', null, 'setup', 'skipped')
    on conflict (key) do nothing;
  end if;
end $$;

-- 즉시 알림 — 20260925000200 정의에 ① 내부검토 요청 ② 행사 스레드 ③ 받는 사람 ④ 카드용 필드를 더한다
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
    -- 내부검토 요청은 사건에 버전이 없다 — 그 항목의 최신 버전을 붙인다
    left join lateral (select v2.version_no, v2.file_name, v2.note from versions v2
                       where c.action = 'status.transitioned' and v2.deliverable_id = d.id
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

-- 매일 리마인드 — 20260925000200 정의에 ① 행사 스레드 ② 받는 사람 ③ 항목 마감 D-1 ④ 24시간 확인 없는 의뢰(한 번만)를 더한다
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
           jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'due_at', a.due_at,
             'recipients', app.notify_role_people(p.id, array['pm']::member_role[])) as data
    from approvals a
    join deliverables d on d.id = a.deliverable_id
    join projects p on p.id = d.project_id
    where a.decision is null and a.due_at is not null and (a.due_at at time zone 'Asia/Seoul')::date = v_tomorrow
      and d.status = 'pending_approval' and p.status = 'active'
    union all
    -- ② 마일스톤 D-1 → 그 영역 담당(전체면 PM)
    select 'rem:milestone:' || m.id || ':' || v_today, p.id, 'milestone_due',
           jsonb_build_object('title', m.title, 'due_date', m.due_date,
             'recipients', app.notify_role_people(p.id, app.area_roles(m.area)))
    from milestones m join projects p on p.id = m.project_id
    where not m.done and m.due_date = v_tomorrow and p.status = 'active'
    union all
    -- ③ 파트너 마감 D-1 미제출 → PM
    select 'rem:partner:' || t.id || ':' || v_today, p.id, 'partner_due',
           jsonb_build_object('title', t.title, 'partner_name', pt.name, 'deliverable_id', d.id,
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
           jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'due_date', d.due_date,
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
           jsonb_build_object('deliverable_id', x.deliverable_id, 'title', x.title, 'count', x.n, 'request_kind', x.kind,
             'channel_id', x.channel_id, 'message_ts', x.message_ts, 'thread_ts', x.thread_ts,
             'recipients', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.display_name, 'email', pr.email,
               'slack_user_id', pr.slack_user_id) order by pr.display_name), '[]'::jsonb) from profiles pr where pr.id = any (x.recipient_ids)))
    from (select ra.card_id, ra.project_id, min(ra.kind) as kind, min(ra.channel_id) as channel_id, min(ra.message_ts) as message_ts,
                 min(ra.thread_ts) as thread_ts, (select r2.recipient_ids from request_acks r2 where r2.card_id = ra.card_id limit 1) as recipient_ids,
                 (array_agg(d.id order by d.due_date nulls last, d.title))[1] as deliverable_id,
                 (array_agg(d.title order by d.due_date nulls last, d.title))[1] as title, count(*) as n
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
      'project_id', p.id, 'project_code', p.code, 'project_name', p.name, 'webhook', p.slack_webhook_url, 'thread', p.slack_thread_url
    ) || c.data order by p.code, c.kind, c.key), '[]'::jsonb)
  into v_rows
  from cand c
  join ins on ins.key = c.key
  join projects p on p.id = c.project_id;
  return v_rows;
end $$;
revoke execute on function public.notify_claim_reminders(date) from public, anon, authenticated;
grant execute on function public.notify_claim_reminders(date) to service_role;

-- 수동 리마인드 — 20260925000200 정의에 행사 스레드만 더한다(멘션 없음 — 목록 알림)
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
    'project_name', v_p.name, 'webhook', v_p.slack_webhook_url, 'thread', v_p.slack_thread_url, 'total', v_total, 'items', v_items);
end $$;
revoke execute on function public.notify_claim_manual(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_claim_manual(uuid, text) to service_role;

-- 봇이 카드를 올린 뒤 기록 — 항목마다 1행(같은 card_id). 행 = [{deliverable_id, kind, notify_key}]
create or replace function public.notify_record_card(p_card uuid, p_project uuid, p_rows jsonb, p_recipients uuid[],
  p_channel text, p_message_ts text, p_thread_ts text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into request_acks (card_id, project_id, deliverable_id, kind, notify_key, recipient_ids, channel_id, message_ts, thread_ts)
  select p_card, p_project, (r->>'deliverable_id')::uuid, r->>'kind', r->>'notify_key', coalesce(p_recipients, '{}'),
         p_channel, p_message_ts, p_thread_ts
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where exists (select 1 from deliverables d where d.id = (r->>'deliverable_id')::uuid and d.project_id = p_project);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.notify_record_card(uuid, uuid, jsonb, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.notify_record_card(uuid, uuid, jsonb, uuid[], text, text, text) to service_role;

-- '확인했어요' — 멘션된 사람(recipient_ids)의 확인만 센다. 반환 status:
--   ok(이번에 확인) · already(이미 누가 확인 — by·at) · not_recipient(멘션 대상 아님 — names) · not_found(카드 없음·항목 지워짐)
create or replace function public.notify_ack_card(p_card uuid, p_profile uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_recipients uuid[];
  v_done record;
  v_name text;
  v_n int;
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
  return jsonb_build_object('status', 'ok', 'by', v_name, 'at', now(), 'count', v_n);
end $$;
revoke execute on function public.notify_ack_card(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify_ack_card(uuid, uuid) to service_role;

-- 이메일로 찾은 Slack ID를 적어 둔다(캐시). 이미 다른 값이 있으면 덮지 않는다 — 담당자 화면에서 고친 값이 이긴다
create or replace function public.notify_set_slack_user(p_profile uuid, p_slack_user text)
returns void language sql security definer set search_path = public as $$
  update profiles set slack_user_id = p_slack_user where id = p_profile and slack_user_id is null and p_slack_user ~ '^[UW][A-Z0-9]{2,}$'
$$;
revoke execute on function public.notify_set_slack_user(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_set_slack_user(uuid, text) to service_role;
