-- Phase 6.16 — 행사 목록 전원 공유 + 역할별 권한 (설계서 v2.22 §6.1·§6.2 · CLAUDE.md v2.22)
--   2026-09-28 저녁 기획자님 지시 #3: "로그인한 담당자별로 행사가 뜨는 게 아니라 진행 중인 행사 목록은 모두에게
--   공유되고, 로그인한 담당자별로 권한이 있으면 된다" — 지금까지는 projects_select = 멤버·생성자만이라 사람마다
--   목록이 달랐다(운영 실측).
--
--   규칙 한 줄: **열람은 로그인한 내부 사용자 전원(app.can_view) · 쓰기는 지금처럼 역할(app.is_pm·has_role·can_write_area)**.
--   열람이 전원에게 열리는 표 = 행사·산출물·버전·컨펌·코멘트·마일스톤·활동 로그·인박스·프로그램표·큐시트·시나리오·
--   운영가이드·WBS·R&R·컴플라이언스·랜딩(+지표)·의뢰 확인 기록.
--   **그대로 담당자만(멤버)**: 참가자 명단·RSVP·시트 연결(개인정보) · 발주처 연락처·링크 토큰 · 정산 4표(금액) ·
--   파트너 3표(계약 금액·토큰) · PSA · 견적(app_role). 쓰기 정책·RPC·트리거는 손대지 않는다.
--   파괴적 문장 0 — 함수 create or replace · 정책 drop if exists + create(기존 RLS 마이그레이션과 같은 패턴).

create or replace function app.can_view(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  -- 멤버(admin 포함 — member_role이 pm) 또는 프로필이 있는 로그인 사용자(도메인 게이트를 지난 내부 사용자)
  select app.is_member(p_project) or app.current_profile_id() is not null
$$;

comment on function app.can_view(uuid) is
  'Phase 6.16 — 열람 판정: 멤버 또는 로그인한 내부 사용자 전원. 쓰기는 여전히 is_pm·has_role·can_write_area';

-- ── projects: 열람 전원(생성 직후 자기 행사 보장 조항은 그대로) ──
drop policy if exists projects_select on projects;
create policy projects_select on projects for select to authenticated
  using (app.can_view(id) or created_by = app.current_profile_id());

-- ── 산출물·버전·컨펌·코멘트 ──
drop policy if exists deliverables_select on deliverables;
create policy deliverables_select on deliverables for select to authenticated using (app.can_view(project_id));
drop policy if exists versions_select on versions;
create policy versions_select on versions for select to authenticated
  using (app.can_view(app.deliverable_project(deliverable_id)));
drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals for select to authenticated
  using (app.can_view(app.deliverable_project(deliverable_id)));
drop policy if exists comments_select on comments;
create policy comments_select on comments for select to authenticated
  using (app.can_view(app.deliverable_project(deliverable_id)));

-- ── 일정·활동·인박스 ──
drop policy if exists milestones_select on milestones;
create policy milestones_select on milestones for select to authenticated using (app.can_view(project_id));
drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log for select to authenticated using (app.can_view(project_id));
drop policy if exists unregistered_files_select on unregistered_files;
create policy unregistered_files_select on unregistered_files for select to authenticated using (app.can_view(project_id));

-- ── 프로그램표·큐시트·시나리오·운영가이드 ──
drop policy if exists program_sessions_select on program_sessions;
create policy program_sessions_select on program_sessions for select to authenticated using (app.can_view(project_id));
drop policy if exists cues_select on cues;
create policy cues_select on cues for select to authenticated using (app.can_view(app.deliverable_project(deliverable_id)));
drop policy if exists scenario_blocks_select on scenario_blocks;
create policy scenario_blocks_select on scenario_blocks for select to authenticated using (app.can_view(app.deliverable_project(deliverable_id)));
drop policy if exists guide_sections_select on guide_sections;
create policy guide_sections_select on guide_sections for select to authenticated using (app.can_view(app.deliverable_project(deliverable_id)));

-- ── WBS·R&R·컴플라이언스 ──
drop policy if exists wbs_tasks_select on wbs_tasks;
create policy wbs_tasks_select on wbs_tasks for select to authenticated using (app.can_view(project_id));
drop policy if exists role_charters_select on role_charters;
create policy role_charters_select on role_charters for select to authenticated using (app.can_view(project_id));
drop policy if exists compliance_cards_select on compliance_cards;
create policy compliance_cards_select on compliance_cards for select to authenticated using (app.can_view(project_id));

-- ── 랜딩(지표 포함) ──
drop policy if exists landing_pages_select on landing_pages;
create policy landing_pages_select on landing_pages for select to authenticated using (app.can_view(project_id));
drop policy if exists landing_daily_metrics_select on landing_daily_metrics;
create policy landing_daily_metrics_select on landing_daily_metrics for select to authenticated
  using (app.can_view(app.landing_project(landing_id)));

-- ── 의뢰 확인 기록(Slack 카드 '확인했어요' — v2.12) ──
drop policy if exists request_acks_select on request_acks;
create policy request_acks_select on request_acks for select to authenticated using (app.can_view(project_id));
