-- ─────────────────────────────────────────────────────────────────────
-- 1400 · RLS (설계서 §6.2 전체) — 정책은 drop if exists → create 로 멱등.
-- 원칙: authenticated는 멤버인 행사만 / anon은 정책 0건(토큰 경로는 Edge Function secret key 화이트리스트) /
--       service_role은 RLS 우회. 견적·정산·파트너 금액 표는 §19.7 대로 토큰 화이트리스트 밖.
-- ─────────────────────────────────────────────────────────────────────

-- 부모 표 경유 행사 판정 도우미 (security definer — 부모 표 RLS와 재귀하지 않는다)
create or replace function app.deliverable_project(p_deliverable uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from deliverables where id = p_deliverable
$$;
create or replace function app.deliverable_area(p_deliverable uuid)
returns deliverable_area language sql stable security definer set search_path = public as $$
  select area from deliverables where id = p_deliverable
$$;
create or replace function app.board_project(p_board uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from settlement_boards where id = p_board
$$;
create or replace function app.partner_project(p_partner uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from partners where id = p_partner
$$;
create or replace function app.landing_project(p_landing uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from landing_pages where id = p_landing
$$;

-- 모든 표 RLS 활성 (정책 없는 표 = 서비스 경로만)
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','profiles','projects','project_members','project_invites','client_contacts','client_tokens',
    'deliverables','versions','approvals','comments','milestones','activity_log','unregistered_files',
    'rsvp_contacts','attendees','sheet_connections','sheet_source_rows',
    'program_sessions','cues','scenario_blocks','guide_sections','wbs_tasks','role_charters','compliance_cards',
    'quotes','quote_imports','landing_pages','landing_daily_metrics',
    'vendors','settlement_boards','settlement_buckets','settlement_imports','settlement_items',
    'partner_tiers','partners','partner_tokens','psa_slots','psa_requests','psa_meetings'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── profiles = 주소록 (§4-2b: 목록 조회 멤버 전원 → 로그인 사용자 전원 / 등록·수정·삭제 pm) ──
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (app.is_any_pm());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (app.is_any_pm() or auth_user_id = auth.uid())
  with check (app.is_any_pm() or auth_user_id = auth.uid());
-- 삭제: 배정이 남아 있으면 409(§4-2b) — 배정 잔존 판정은 provider가 하고, DB는 FK(project_members.user_id on delete cascade)를
-- 믿지 않기 위해 여기서 한 번 더 막는다: 배정 있는 프로필은 삭제 불가
drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete to authenticated
  using (app.is_any_pm() and auth_user_id is distinct from auth.uid()
         and not exists (select 1 from project_members m where m.user_id = profiles.id));

-- ── projects ──
-- 생성자는 항상 자기 행사를 본다: insert … returning은 AFTER 트리거(생성자=pm 멤버십)보다 먼저 select 정책을
-- 평가하므로 멤버십만 보면 생성 직후 "row-level security" 오류가 난다(로컬 실증 2026-09-07)
drop policy if exists projects_select on projects;
create policy projects_select on projects for select to authenticated
  using (app.is_member(id) or created_by = app.current_profile_id());
drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert to authenticated
  with check (created_by is null or created_by = app.current_profile_id());
drop policy if exists projects_update on projects;
create policy projects_update on projects for update to authenticated
  using (app.is_pm(id)) with check (app.is_pm(id));

-- ── project_members (배정) — 조회는 로그인 전원(주소록 배정 현황·행사명은 RPC가 붙인다), 쓰기는 그 행사 pm ──
drop policy if exists project_members_select on project_members;
create policy project_members_select on project_members for select to authenticated using (true);
drop policy if exists project_members_insert on project_members;
create policy project_members_insert on project_members for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists project_members_update on project_members;
create policy project_members_update on project_members for update to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists project_members_delete on project_members;
create policy project_members_delete on project_members for delete to authenticated using (app.is_pm(project_id));

-- ── project_invites ──
drop policy if exists project_invites_all on project_invites;
create policy project_invites_all on project_invites for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));

-- ── client_contacts · client_tokens (열람 멤버 / 쓰기 pm) ──
drop policy if exists client_contacts_select on client_contacts;
create policy client_contacts_select on client_contacts for select to authenticated using (app.is_member(project_id));
drop policy if exists client_contacts_write on client_contacts;
create policy client_contacts_write on client_contacts for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists client_tokens_select on client_tokens;
create policy client_tokens_select on client_tokens for select to authenticated using (app.is_member(project_id));
drop policy if exists client_tokens_insert on client_tokens;
create policy client_tokens_insert on client_tokens for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists client_tokens_update on client_tokens;
create policy client_tokens_update on client_tokens for update to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));

-- ── deliverables (열람 멤버 / 생성·수정 역할-영역 일치 또는 pm / 삭제 pm) ──
drop policy if exists deliverables_select on deliverables;
create policy deliverables_select on deliverables for select to authenticated using (app.is_member(project_id));
drop policy if exists deliverables_insert on deliverables;
create policy deliverables_insert on deliverables for insert to authenticated with check (app.can_write_area(project_id, area));
drop policy if exists deliverables_update on deliverables;
create policy deliverables_update on deliverables for update to authenticated
  using (app.can_write_area(project_id, area)) with check (app.can_write_area(project_id, area));
drop policy if exists deliverables_delete on deliverables;
create policy deliverables_delete on deliverables for delete to authenticated using (app.is_pm(project_id));

-- ── versions ──
drop policy if exists versions_select on versions;
create policy versions_select on versions for select to authenticated
  using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists versions_insert on versions;
create policy versions_insert on versions for insert to authenticated
  with check (app.can_write_area(app.deliverable_project(deliverable_id), app.deliverable_area(deliverable_id)));

-- ── approvals (생성 pm — 컨펌 발송 / 결정 갱신 = 발주처 토큰 경로(서비스) 또는 내부 검토자(파트너 제출)) ──
drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals for select to authenticated
  using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals for insert to authenticated
  with check (app.is_pm(app.deliverable_project(deliverable_id)));
drop policy if exists approvals_update on approvals;
create policy approvals_update on approvals for update to authenticated
  using (app.can_write_area(app.deliverable_project(deliverable_id), app.deliverable_area(deliverable_id)))
  with check (app.can_write_area(app.deliverable_project(deliverable_id), app.deliverable_area(deliverable_id)));

-- ── comments (내부 작성 = 멤버, 작성자는 본인 / 발주처 작성은 토큰 경로) ──
drop policy if exists comments_select on comments;
create policy comments_select on comments for select to authenticated
  using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert to authenticated
  with check (app.is_member(app.deliverable_project(deliverable_id))
              and author_user_id = app.current_profile_id() and author_token is null);

-- ── milestones (열람 멤버 / 편집 pm·design·ops) ──
drop policy if exists milestones_select on milestones;
create policy milestones_select on milestones for select to authenticated using (app.is_member(project_id));
drop policy if exists milestones_write on milestones;
create policy milestones_write on milestones for all to authenticated
  using (app.has_role(project_id, 'pm','design','ops')) with check (app.has_role(project_id, 'pm','design','ops'));

-- ── activity_log (멤버 열람·기록. actor는 앱이 채운다) ──
drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log for select to authenticated using (app.is_member(project_id));
drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log for insert to authenticated with check (app.is_member(project_id));

-- ── unregistered_files (인박스 — 열람·연결·무시 멤버, 감지 insert는 서비스) ──
drop policy if exists unregistered_files_select on unregistered_files;
create policy unregistered_files_select on unregistered_files for select to authenticated using (app.is_member(project_id));
drop policy if exists unregistered_files_update on unregistered_files;
create policy unregistered_files_update on unregistered_files for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));

-- ── 등록: rsvp_contacts·attendees (열람 멤버 / CRUD pm·reg / 체크인 pm·ops·reg) ──
drop policy if exists rsvp_contacts_select on rsvp_contacts;
create policy rsvp_contacts_select on rsvp_contacts for select to authenticated using (app.is_member(project_id));
drop policy if exists rsvp_contacts_write on rsvp_contacts;
create policy rsvp_contacts_write on rsvp_contacts for all to authenticated
  using (app.has_role(project_id, 'pm','reg')) with check (app.has_role(project_id, 'pm','reg'));
drop policy if exists attendees_select on attendees;
create policy attendees_select on attendees for select to authenticated using (app.is_member(project_id));
drop policy if exists attendees_insert on attendees;
create policy attendees_insert on attendees for insert to authenticated with check (app.has_role(project_id, 'pm','reg'));
drop policy if exists attendees_update on attendees;
create policy attendees_update on attendees for update to authenticated
  using (app.has_role(project_id, 'pm','ops','reg')) with check (app.has_role(project_id, 'pm','ops','reg'));
drop policy if exists attendees_delete on attendees;
create policy attendees_delete on attendees for delete to authenticated using (app.has_role(project_id, 'pm','reg'));

-- ── sheet_connections (§24.4 connect·disconnect·reauthorize·apply = pm·reg / 열람 멤버) ──
drop policy if exists sheet_connections_select on sheet_connections;
create policy sheet_connections_select on sheet_connections for select to authenticated using (app.is_member(project_id));
drop policy if exists sheet_connections_write on sheet_connections;
create policy sheet_connections_write on sheet_connections for all to authenticated
  using (app.has_role(project_id, 'pm','reg')) with check (app.has_role(project_id, 'pm','reg'));
-- sheet_source_rows: 원본 행은 서버(Edge Function)가 적재한다 — 멤버는 열람만
drop policy if exists sheet_source_rows_select on sheet_source_rows;
create policy sheet_source_rows_select on sheet_source_rows for select to authenticated using (app.is_member(project_id));

-- ── 프로그램표·큐시트·시나리오·운영가이드 (열람 멤버 / 쓰기 pm·ops) ──
drop policy if exists program_sessions_select on program_sessions;
create policy program_sessions_select on program_sessions for select to authenticated using (app.is_member(project_id));
drop policy if exists program_sessions_write on program_sessions;
create policy program_sessions_write on program_sessions for all to authenticated
  using (app.has_role(project_id, 'pm','ops')) with check (app.has_role(project_id, 'pm','ops'));
drop policy if exists cues_select on cues;
create policy cues_select on cues for select to authenticated using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists cues_write on cues;
create policy cues_write on cues for all to authenticated
  using (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'))
  with check (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'));
drop policy if exists scenario_blocks_select on scenario_blocks;
create policy scenario_blocks_select on scenario_blocks for select to authenticated using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists scenario_blocks_write on scenario_blocks;
create policy scenario_blocks_write on scenario_blocks for all to authenticated
  using (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'))
  with check (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'));
drop policy if exists guide_sections_select on guide_sections;
create policy guide_sections_select on guide_sections for select to authenticated using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists guide_sections_write on guide_sections;
create policy guide_sections_write on guide_sections for all to authenticated
  using (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'))
  with check (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'));

-- ── WBS (열람 멤버 / status는 담당 역할+pm → 앱 계층, DB는 멤버 update 허용 / 전개·삭제 pm) ──
drop policy if exists wbs_tasks_select on wbs_tasks;
create policy wbs_tasks_select on wbs_tasks for select to authenticated using (app.is_member(project_id));
drop policy if exists wbs_tasks_insert on wbs_tasks;
create policy wbs_tasks_insert on wbs_tasks for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists wbs_tasks_update on wbs_tasks;
create policy wbs_tasks_update on wbs_tasks for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists wbs_tasks_delete on wbs_tasks;
create policy wbs_tasks_delete on wbs_tasks for delete to authenticated using (app.is_pm(project_id));

-- ── R&R · 컴플라이언스 (열람 멤버 / 시드 pm / 체크 멤버) ──
drop policy if exists role_charters_select on role_charters;
create policy role_charters_select on role_charters for select to authenticated using (app.is_member(project_id));
drop policy if exists role_charters_write on role_charters;
create policy role_charters_write on role_charters for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists compliance_cards_select on compliance_cards;
create policy compliance_cards_select on compliance_cards for select to authenticated using (app.is_member(project_id));
drop policy if exists compliance_cards_insert on compliance_cards;
create policy compliance_cards_insert on compliance_cards for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists compliance_cards_update on compliance_cards;
create policy compliance_cards_update on compliance_cards for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));

-- ── quotes (§6.2 v2.0): select = admin·sales OR 연결 행사 pm / insert·update = admin·sales ──
drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select to authenticated
  using (app.is_quote_user() or (project_id is not null and app.is_pm(project_id)));
drop policy if exists quotes_insert on quotes;
create policy quotes_insert on quotes for insert to authenticated with check (app.is_quote_user());
drop policy if exists quotes_update on quotes;
create policy quotes_update on quotes for update to authenticated
  using (app.is_quote_user()) with check (app.is_quote_user());
drop policy if exists quote_imports_all on quote_imports;
create policy quote_imports_all on quote_imports for all to authenticated
  using (app.is_quote_user()) with check (app.is_quote_user());

-- ── 랜딩 (열람·수정 멤버 / 삭제 pm / 지표는 서비스 적재·멤버 열람) ──
drop policy if exists landing_pages_select on landing_pages;
create policy landing_pages_select on landing_pages for select to authenticated using (app.is_member(project_id));
drop policy if exists landing_pages_insert on landing_pages;
create policy landing_pages_insert on landing_pages for insert to authenticated with check (app.is_member(project_id));
drop policy if exists landing_pages_update on landing_pages;
create policy landing_pages_update on landing_pages for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists landing_pages_delete on landing_pages;
create policy landing_pages_delete on landing_pages for delete to authenticated using (app.is_pm(project_id));
drop policy if exists landing_daily_metrics_select on landing_daily_metrics;
create policy landing_daily_metrics_select on landing_daily_metrics for select to authenticated
  using (app.is_member(app.landing_project(landing_id)));

-- ── 정산 (§6.2 v2.2): select 멤버 / 보드·버킷·기준 갱신 pm / 항목 금액 pm 또는 assignee ──
drop policy if exists vendors_select on vendors;
create policy vendors_select on vendors for select to authenticated using (true);
drop policy if exists vendors_insert on vendors;
create policy vendors_insert on vendors for insert to authenticated with check (true);
drop policy if exists vendors_update on vendors;
create policy vendors_update on vendors for update to authenticated using (true) with check (true);
drop policy if exists settlement_boards_select on settlement_boards;
create policy settlement_boards_select on settlement_boards for select to authenticated using (app.is_member(project_id));
drop policy if exists settlement_boards_write on settlement_boards;
create policy settlement_boards_write on settlement_boards for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists settlement_buckets_select on settlement_buckets;
create policy settlement_buckets_select on settlement_buckets for select to authenticated using (app.is_member(app.board_project(board_id)));
drop policy if exists settlement_buckets_write on settlement_buckets;
create policy settlement_buckets_write on settlement_buckets for all to authenticated
  using (app.is_pm(app.board_project(board_id))) with check (app.is_pm(app.board_project(board_id)));
drop policy if exists settlement_imports_select on settlement_imports;
create policy settlement_imports_select on settlement_imports for select to authenticated using (app.is_member(app.board_project(board_id)));
drop policy if exists settlement_imports_write on settlement_imports;
create policy settlement_imports_write on settlement_imports for all to authenticated
  using (app.is_pm(app.board_project(board_id))) with check (app.is_pm(app.board_project(board_id)));
drop policy if exists settlement_items_select on settlement_items;
create policy settlement_items_select on settlement_items for select to authenticated using (app.is_member(app.board_project(board_id)));
drop policy if exists settlement_items_insert on settlement_items;
create policy settlement_items_insert on settlement_items for insert to authenticated with check (app.is_pm(app.board_project(board_id)));
drop policy if exists settlement_items_update on settlement_items;
create policy settlement_items_update on settlement_items for update to authenticated
  using (app.is_pm(app.board_project(board_id)) or assignee_id = app.current_profile_id())
  with check (app.is_pm(app.board_project(board_id)) or assignee_id = app.current_profile_id());
-- 삭제도 금액 입력과 같은 범위(pm 또는 담당 본인) — mock assertItemWritable과 1:1
drop policy if exists settlement_items_delete on settlement_items;
create policy settlement_items_delete on settlement_items for delete to authenticated
  using (app.is_pm(app.board_project(board_id)) or assignee_id = app.current_profile_id());

-- ── 파트너 (§6.2 v2.4): select·insert·update 멤버 / 삭제 pm / 토큰 발급·회수 pm ──
drop policy if exists partner_tiers_select on partner_tiers;
create policy partner_tiers_select on partner_tiers for select to authenticated using (app.is_member(project_id));
drop policy if exists partner_tiers_insert on partner_tiers;
create policy partner_tiers_insert on partner_tiers for insert to authenticated with check (app.is_member(project_id));
drop policy if exists partner_tiers_update on partner_tiers;
create policy partner_tiers_update on partner_tiers for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists partner_tiers_delete on partner_tiers;
create policy partner_tiers_delete on partner_tiers for delete to authenticated using (app.is_pm(project_id));
drop policy if exists partners_select on partners;
create policy partners_select on partners for select to authenticated using (app.is_member(project_id));
drop policy if exists partners_insert on partners;
create policy partners_insert on partners for insert to authenticated with check (app.is_member(project_id));
drop policy if exists partners_update on partners;
create policy partners_update on partners for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists partners_delete on partners;
create policy partners_delete on partners for delete to authenticated using (app.is_pm(project_id));
drop policy if exists partner_tokens_select on partner_tokens;
create policy partner_tokens_select on partner_tokens for select to authenticated using (app.is_member(app.partner_project(partner_id)));
drop policy if exists partner_tokens_insert on partner_tokens;
create policy partner_tokens_insert on partner_tokens for insert to authenticated with check (app.is_pm(app.partner_project(partner_id)));
drop policy if exists partner_tokens_update on partner_tokens;
create policy partner_tokens_update on partner_tokens for update to authenticated
  using (app.is_pm(app.partner_project(partner_id))) with check (app.is_pm(app.partner_project(partner_id)));

-- ── PSA 예약 (열람 멤버 / 쓰기 pm — 3.18c 착수 시 재검토) ──
drop policy if exists psa_slots_select on psa_slots;
create policy psa_slots_select on psa_slots for select to authenticated using (app.is_member(project_id));
drop policy if exists psa_slots_write on psa_slots;
create policy psa_slots_write on psa_slots for all to authenticated using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists psa_requests_select on psa_requests;
create policy psa_requests_select on psa_requests for select to authenticated using (app.is_member(project_id));
drop policy if exists psa_requests_write on psa_requests;
create policy psa_requests_write on psa_requests for all to authenticated using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists psa_meetings_select on psa_meetings;
create policy psa_meetings_select on psa_meetings for select to authenticated
  using (exists (select 1 from psa_slots s where s.id = psa_meetings.slot_id and app.is_member(s.project_id)));
