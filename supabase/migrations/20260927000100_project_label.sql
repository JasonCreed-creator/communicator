-- ─────────────────────────────────────────────────────────────────────
-- 20260927000100 · 행사 ID 체계 (설계서 v2.16 §4-1d · §7.1 · §7.2 · Phase 6.3 [A], 2026-09-27 —
--   사용자 제공 운영 커뮤니케이션 프로토콜 v1.0 "행사 ID = YYMMDD_고객사_행사명 = 스레드 제목 = 드라이브 폴더 = 파일명 접두")
--
--   · projects.code — 화면·이름 규약에서 퇴역. 자리표시(EVT-…) 그대로 남는 내부 식별자(전역 유일 제약은 그대로)
--   · Drive 판정 함수 4종이 organizer(고객사)도 돌려준다 — 서버가 행사 폴더 이름(행사 ID)을 만들 때 쓴다
--   · 스키마 변경 없음(열 추가·삭제 0) — 행사 ID는 저장하지 않고 늘 파생한다

comment on column projects.code is '내부 자동 식별자(EVT-…) — v2.16부터 화면·폴더·파일 이름에 쓰지 않는다. 행사 ID는 YYMMDD_고객사_행사명으로 파생';

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
                                  'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id));
end $$;
revoke execute on function public.drive_upload_check(uuid) from public, anon;
grant execute on function public.drive_upload_check(uuid) to authenticated;

create or replace function app.snapshot_target(p_deliverable uuid, p_version uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'deliverable_id', d.id, 'version_id', v.id, 'drive_file_id', v.drive_file_id, 'file_name', v.file_name,
    'project', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'organizer', p.organizer, 'event_date', p.event_date,
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
                            'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id);
end $$;
revoke execute on function public.drive_project_file_check(uuid) from public, anon;
grant execute on function public.drive_project_file_check(uuid) to authenticated;
