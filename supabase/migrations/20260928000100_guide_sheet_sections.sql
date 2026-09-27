-- ═══════════════════════════════════════════════════════════════════════════
-- 33. 마스터 시트 대체 — 운영가이드 섹션 3종 · 설계서 v2.21 §27.2 (Phase 6.11 PR-A, 2026-09-28)
--   · guide_sections.kind +3 — survey(답사 체크리스트) · floorplan(설치 도면) · messaging(참가자 안내). 셋 다 표 섹션(data 필수)
--   · 모양 검사 재정의 — 새 3종은 data 필수(type = kind). 열 추가 0 · save_guide_sections 무변경
--   · notify_claim_reminders — ⑦ 참가자 안내 발송일 D-1(발송 완료 아닌 단계 → PM·등록 담당 · 운영 스레드 · 원고·연락처 0)
-- 기존 행은 그대로 통과한다. 두 번 실행해도 같다.
-- ═══════════════════════════════════════════════════════════════════════════

alter table guide_sections drop constraint if exists guide_sections_kind_check;
alter table guide_sections add constraint guide_sections_kind_check check (kind in (
  'zone','role','emergency','contacts','custom',
  'setup','staffing','radio','raci','dayplan','checklists','registration','vip','safety',
  'survey','floorplan','messaging'
));

alter table guide_sections drop constraint if exists guide_sections_data_shape;
alter table guide_sections add constraint guide_sections_data_shape check (
  case
    when kind in ('setup','staffing','radio','raci','dayplan','checklists','registration','vip','safety','survey','floorplan','messaging')
      then data is not null and jsonb_typeof(data) = 'object' and data->>'type' = kind
    when kind = 'emergency'
      then data is null or (jsonb_typeof(data) = 'object' and data->>'type' = 'emergency')
    else data is null
  end
);

comment on column guide_sections.data is '표 섹션 데이터(type = kind) — v2.13 §23.5 9종 + v2.21 §27.2 survey·floorplan·messaging. content는 앱이 data에서 만든 글';

-- 매일 리마인드 — 20260927000200 정의에 ⑦ 참가자 안내 발송일 D-1을 더한다(나머지 ①~⑥·결과 모양 그대로)
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
    union all
    -- ⑦ (v2.21 §27.2 · Phase 6.11 PR-A) 참가자 안내 발송일 D-1 — 아직 발송 완료가 아닌 단계 → PM·등록 담당(운영 스레드).
    --    본문 재료는 단계·발송일·채널뿐 — 원고(subject·body)·대상·연락처는 싣지 않는다(R-M5)
    select 'rem:messaging:' || gs.id || ':' || (x.ord - 1) || ':' || v_tomorrow, p.id, 'messaging_due',
           jsonb_build_object('deliverable_id', d.id, 'title', d.title, 'section_id', gs.id, 'row_index', x.ord - 1,
             'stage', x.r->>'stage', 'send_on', x.r->>'send_on', 'send_at', x.r->>'send_at', 'channel', x.r->>'channel',
             'recipients', app.notify_role_people(p.id, array['pm', 'reg']::member_role[]))
    from guide_sections gs
    join deliverables d on d.id = gs.deliverable_id
    join projects p on p.id = d.project_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(gs.data->'rows') = 'array' then gs.data->'rows' else '[]'::jsonb end)
      with ordinality as x(r, ord)
    where gs.kind = 'messaging' and p.status = 'active'
      and x.r->>'send_on' = v_tomorrow::text
      and coalesce(x.r->>'status', 'draft') <> 'sent'
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
