-- ─────────────────────────────────────────────────────────────────────
-- 20260928000400 · 보관 분류(Drive 분류 폴더) — 설계서 v2.21.6 §7.1 · §4-1 · Phase 6.10 (2026-09-27 사용자 지시
--   "아카이빙 폴더를 MICE Biz로 — 이미 일반·자체·모객·비모객으로 나누어 놨음 · 각각 해당하는 프로젝트를 하위로" · 버튼 승인 3건 ·
--   Phase 6.11 뒤 재개 2026-09-28)
--
--   · projects.drive_category — 설정 ③에서 고른 보관 분류(선택). null = 자동(주최형 → own · 대행형 모객형 → solution_recruiting ·
--     대행형 일반형 → solution_general). 'custom'(일반행사)은 사람이 고를 때만
--   · Drive 판정 함수 4종이 kind · event_type · drive_category도 돌려준다 — 서버가 분류 폴더(저장소 루트 바로 아래)를 고를 때 쓴다
--   · 연도 폴더 층(v2.17)은 퇴역 — 스키마엔 흔적 없음
--   · 파괴적 문장 0(drop 없음 — 커넥터 확인 창 없이 적용되게): CHECK는 없을 때만 더한다 · 함수는 create or replace

alter table projects add column if not exists drive_category text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_drive_category_check' and conrelid = 'projects'::regclass) then
    alter table projects add constraint projects_drive_category_check
      check (drive_category is null or drive_category in ('solution_recruiting', 'solution_general', 'own', 'custom'));
  end if;
end $$;
comment on column projects.drive_category is '보관 분류(Drive 저장소 분류 폴더) — null = 자동(kind·event_type) · 설정 ③에서 고르면 그 값(v2.21.6 §7.1)';

create or replace function public.drive_upload_check(p_deliverable uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_p projects;
begin
  v_d := app.assert_can_upload(p_deliverable);
  select * into v_p from projects where id = v_d.project_id;
  return jsonb_build_object(
    'deliverable', jsonb_build_object('id', v_d.id, 'project_id', v_d.project_id, 'area', v_d.area, 'category', v_d.category,
                                      'title', v_d.title, 'status', v_d.status, 'drive_folder_id', v_d.drive_folder_id),
    'project', jsonb_build_object('id', v_p.id, 'code', v_p.code, 'name', v_p.name, 'organizer', v_p.organizer, 'event_date', v_p.event_date,
                                  'kind', v_p.kind, 'event_type', v_p.event_type, 'drive_category', v_p.drive_category,
                                  'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id));
end $$;
revoke execute on function public.drive_upload_check(uuid) from public, anon;
grant execute on function public.drive_upload_check(uuid) to authenticated;

create or replace function app.snapshot_target(p_deliverable uuid, p_version uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'deliverable_id', d.id, 'version_id', v.id, 'drive_file_id', v.drive_file_id, 'file_name', v.file_name,
    'project', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'organizer', p.organizer, 'event_date', p.event_date,
                                  'kind', p.kind, 'event_type', p.event_type, 'drive_category', p.drive_category,
                                  'status', p.status, 'drive_root_folder_id', p.drive_root_folder_id))
  from deliverables d join versions v on v.id = p_version and v.deliverable_id = d.id join projects p on p.id = d.project_id
  where d.id = p_deliverable
$$;

create or replace function public.drive_settlement_file_check(p_import uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp settlement_imports; v_p projects;
begin
  select * into v_imp from settlement_imports where id = p_import;
  if not found then raise exception 'NOT_FOUND: 견적서 가져오기를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  select p.* into v_p from projects p join settlement_boards b on b.project_id = p.id where b.id = v_imp.board_id;
  perform app.require_pm(v_p.id);
  perform app.require_writable(v_p.id);
  if v_imp.status <> 'parsed' then
    raise exception 'CONFLICT: 이미 확정했거나 버린 견적서입니다 — 다시 불러오세요.' using errcode = 'P0409';
  end if;
  return jsonb_build_object(
    'import_id', v_imp.id, 'file_name', v_imp.file_name,
    'project', jsonb_build_object('id', v_p.id, 'code', v_p.code, 'name', v_p.name, 'organizer', v_p.organizer, 'event_date', v_p.event_date,
                                  'kind', v_p.kind, 'event_type', v_p.event_type, 'drive_category', v_p.drive_category,
                                  'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id));
end $$;
revoke execute on function public.drive_settlement_file_check(uuid) from public, anon;
grant execute on function public.drive_settlement_file_check(uuid) to authenticated;

create or replace function public.drive_project_file_check(p_project uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p projects;
begin
  perform app.require_pm(p_project);
  v_p := app.require_writable(p_project);
  return jsonb_build_object('id', v_p.id, 'code', v_p.code, 'name', v_p.name, 'organizer', v_p.organizer, 'event_date', v_p.event_date,
                            'kind', v_p.kind, 'event_type', v_p.event_type, 'drive_category', v_p.drive_category,
                            'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id);
end $$;
revoke execute on function public.drive_project_file_check(uuid) from public, anon;
grant execute on function public.drive_project_file_check(uuid) to authenticated;
