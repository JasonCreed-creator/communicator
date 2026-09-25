-- ─────────────────────────────────────────────────────────────────────
-- 20260925000200 · Slack 알림 (설계서 v2.10.1 §9 · Phase 6, 2026-09-25 — 사용자 지시 "아직 구현 안 된 내용들 싹 진행" → 묶음 2)
--
-- 알림의 원천은 새로 만들지 않는다 — **activity_log가 이미 모든 사건을 적는다**(version.uploaded · approval.requested ·
-- approval.decided · partner.submitted · deliverable.requested). 서버 함수(api/notify)가 아직 알리지 않은 행을 "선점"하고
-- (notification_log에 키를 먼저 넣은 쪽만 보낸다 — 동시에 두 번 불려도 한 번만) Slack으로 보낸다.
--   · 즉시: 앱이 사건 직후 api/notify에 신호만 보낸다(fire-and-forget) → 서버가 밀린 사건을 모아 보낸다
--   · 매일(Vercel cron, KST 오전 9시대): 놓친 사건 + D-1 리마인드(컨펌 기한 · 마일스톤 · 파트너 마감) + 미등록 파일 묶음
-- 보낼 곳 = 행사별 `projects.slack_webhook_url`(행사 설정 ③) → 없으면 서버 env `SLACK_WEBHOOK_URL`(공용 채널) → 둘 다 없으면
-- 보내지 않는다(no-op — 선점 행은 'skipped'로 남겨, 나중에 채널을 연결해도 옛 사건이 한꺼번에 쏟아지지 않는다).
-- 금액은 싣지 않는다(§19.7) — 이 함수들은 금액 열을 읽지 않는다(행사 코드·이름, 항목 제목, 사람 이름, 날짜, 건수만).
-- 전부 service 전용(secret 키 = 서버 함수만). 표는 RLS on + 정책 없음(drive_connection과 같은 규약).

create table if not exists notification_log (
  key text primary key,                         -- 'act:{activity_id}' · 'rem:{kind}:{id}:{KST 날짜}' · 'man:{project}:{target}:{KST 시각}'
  project_id uuid references projects(id) on delete cascade,
  kind text not null,
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed', 'skipped')),
  error text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_log_claimed on notification_log (claimed_at);
alter table notification_log enable row level security;
revoke all on notification_log from anon, authenticated;
grant all on notification_log to service_role;

-- 알릴 사건(§9 매트릭스 + §5 지시 발행의 담당자 알림)
create or replace function app.notify_actions()
returns text[] language sql immutable as $$
  select array['version.uploaded', 'approval.requested', 'approval.decided', 'partner.submitted', 'deliverable.requested']
$$;

-- 첫 설치 때 최근 사건은 '알림 없음'으로 표시한다 — 배포 직후 첫 신호가 지난 이틀 치 사건을 한꺼번에 보내지 않게.
do $$
begin
  if not exists (select 1 from notification_log) then
    insert into notification_log (key, project_id, kind, status)
    select 'act:' || a.id, a.project_id, a.action, 'skipped'
    from activity_log a
    where a.action = any (app.notify_actions()) and a.created_at > now() - interval '2 days'
    on conflict (key) do nothing;
  end if;
end $$;

-- 즉시 알림 — 아직 선점되지 않은 최근(2일) 사건을 선점해 돌려준다. 선점 = notification_log에 키를 넣은 쪽(on conflict do nothing).
create or replace function public.notify_claim_events(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb;
begin
  with cand as (
    select a.* from activity_log a
    where a.action = any (app.notify_actions())
      and a.created_at > now() - interval '2 days'
      and not exists (select 1 from notification_log n where n.key = 'act:' || a.id)
    order by a.id
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), ins as (
    insert into notification_log (key, project_id, kind)
    select 'act:' || c.id, c.project_id, c.action from cand c
    on conflict (key) do nothing
    returning key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', 'act:' || c.id,
      'action', c.action,
      'at', c.created_at,
      'project_id', p.id, 'project_code', p.code, 'project_name', p.name, 'webhook', p.slack_webhook_url,
      'deliverable_id', d.id, 'title', d.title, 'area', d.area,
      'version_no', coalesce(v.version_no, case when (c.meta->>'version_no') ~ '^\d+$' then (c.meta->>'version_no')::int end),
      'decision', c.meta->>'decision',
      'due_at', ap.due_at,
      'actor_name', actor.display_name,
      'assignee_name', asg.display_name,
      'partner_name', pt.name
    ) order by c.id), '[]'::jsonb)
  into v_rows
  from cand c
  join ins on ins.key = 'act:' || c.id
  join projects p on p.id = c.project_id
  left join versions v on c.target_type = 'version' and v.id = c.target_id
  left join approvals ap on c.target_type = 'approval' and ap.id = c.target_id
  left join deliverables d on d.id = coalesce(v.deliverable_id, ap.deliverable_id,
    case when c.target_type = 'deliverable' then c.target_id end)
  left join profiles actor on actor.id = (case when c.actor ~ '^user:[0-9a-fA-F-]{36}$' then substring(c.actor from 6)::uuid end)
  left join profiles asg on c.action = 'deliverable.requested' and asg.id = d.assignee_id
  left join partners pt on pt.id = (case when (c.meta->>'partner_id') ~ '^[0-9a-fA-F-]{36}$' then (c.meta->>'partner_id')::uuid end);
  return v_rows;
end $$;
revoke execute on function public.notify_claim_events(int) from public, anon, authenticated;
grant execute on function public.notify_claim_events(int) to service_role;

-- 매일 리마인드(KST 날짜 기준 내일이 기한인 것) + 미등록 파일 묶음. 같은 날 두 번 불려도(크론 중복 전달) 한 번만 — 키에 날짜.
-- 30일 지난 선점 기록은 여기서 정리한다(사건 선점은 2일 창, 리마인드는 당일 키라 그 뒤로는 쓰이지 않는다).
create or replace function public.notify_claim_reminders(p_today date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Seoul')::date);
  v_tomorrow date := v_today + 1;
  v_rows jsonb;
begin
  delete from notification_log where claimed_at < now() - interval '30 days';
  with cand as (
    -- ① 컨펌 기한 D-1 미응답(§9): 결정 전 컨펌 중 기한(KST 날짜)이 내일 — 항목이 아직 컨펌대기일 때만
    select 'rem:approval:' || a.id || ':' || v_today as key, p.id as project_id, 'approval_due' as kind,
           jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'due_at', a.due_at) as data
    from approvals a
    join deliverables d on d.id = a.deliverable_id
    join projects p on p.id = d.project_id
    where a.decision is null and a.due_at is not null and (a.due_at at time zone 'Asia/Seoul')::date = v_tomorrow
      and d.status = 'pending_approval' and p.status = 'active'
    union all
    -- ② 마일스톤 D-1
    select 'rem:milestone:' || m.id || ':' || v_today, p.id, 'milestone_due',
           jsonb_build_object('title', m.title, 'due_date', m.due_date)
    from milestones m join projects p on p.id = m.project_id
    where not m.done and m.due_date = v_tomorrow and p.status = 'active'
    union all
    -- ③ (v2.4) 파트너 마감 D-1 미제출: partner_submit 태스크가 내일 마감인데 끝나지 않았고, 연결 항목이 있으면 아직 '제출 요청됨'
    select 'rem:partner:' || t.id || ':' || v_today, p.id, 'partner_due',
           jsonb_build_object('title', t.title, 'partner_name', pt.name, 'deliverable_id', d.id)
    from wbs_tasks t
    join projects p on p.id = t.project_id
    left join partners pt on pt.id = t.partner_id
    left join deliverables d on d.id = t.linked_deliverable_id
    where t.direction = 'partner_submit' and t.end_date = v_tomorrow and t.status <> 'done'
      and (d.id is null or d.status = 'requested') and p.status = 'active'
    union all
    -- ④ 미등록 파일(일 1회 묶음)
    select 'rem:inbox:' || p.id || ':' || v_today, p.id, 'inbox_digest', jsonb_build_object('count', count(*))
    from unregistered_files u join projects p on p.id = u.project_id
    where not u.dismissed and u.linked_deliverable_id is null and p.status = 'active'
    group by p.id
  ), ins as (
    insert into notification_log (key, project_id, kind)
    select key, project_id, kind from cand
    on conflict (key) do nothing
    returning key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', c.key, 'kind', c.kind,
      'project_id', p.id, 'project_code', p.code, 'project_name', p.name, 'webhook', p.slack_webhook_url
    ) || c.data order by p.code, c.kind, c.key), '[]'::jsonb)
  into v_rows
  from cand c
  join ins on ins.key = c.key
  join projects p on p.id = c.project_id;
  return v_rows;
end $$;
revoke execute on function public.notify_claim_reminders(date) from public, anon, authenticated;
grant execute on function public.notify_claim_reminders(date) to service_role;

-- 수동 리마인드(홈 '리마인드' 버튼) — 지연 WBS 태스크 또는 컨펌 대기 목록. 같은 행사·같은 대상은 한 시간에 한 번(키에 KST 시각).
-- 선점하지 못하면(이미 보냈거나 보내는 중) null. 실패·빈 목록이었던 키는 다시 선점된다. 권한(그 행사 멤버)은 서버 함수가 사용자 JWT로 먼저 판정한다.
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
  -- 실패했거나(Slack 거부) 목록이 비어 보내지 않았던 키는 같은 시간에도 다시 선점할 수 있다 — 웹훅을 고친 뒤 바로 다시 누르게
  insert into notification_log (key, project_id, kind) values (v_key, p_project, 'manual_' || p_target)
  on conflict (key) do update set status = 'claimed', error = null, claimed_at = now(), sent_at = null
    where notification_log.status in ('failed', 'skipped');
  if not found then return null; end if;
  return jsonb_build_object('key', v_key, 'kind', 'manual_' || p_target, 'project_id', v_p.id, 'project_code', v_p.code,
    'project_name', v_p.name, 'webhook', v_p.slack_webhook_url, 'total', v_total, 'items', v_items);
end $$;
revoke execute on function public.notify_claim_manual(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_claim_manual(uuid, text) to service_role;

-- 결과 기록 — sent(보냄) · failed(Slack 거부·연결 실패 — 사유 500자) · skipped(보낼 곳 없음·지워진 항목)
create or replace function public.notify_mark(p_keys text[], p_status text, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'VALIDATION: 알 수 없는 결과입니다.' using errcode = 'P0422';
  end if;
  update notification_log
     set status = p_status,
         sent_at = case when p_status = 'sent' then now() end,
         error = left(p_error, 500)
   where key = any (p_keys);
end $$;
revoke execute on function public.notify_mark(text[], text, text) from public, anon, authenticated;
grant execute on function public.notify_mark(text[], text, text) to service_role;
