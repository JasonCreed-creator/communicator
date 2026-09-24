-- ─────────────────────────────────────────────────────────────────────
-- 20260924000100 · Drive 저장소 (설계서 v2.9 §7 · Phase 5, 사용자 지시 2026-09-24
-- "작업물 저장소는 이 폴더 — 파트별 폴더링 · 끌어놓기·폴더 업로드·Drive에 올린 뒤 링크로도 작업")
--
-- ① app_config.drive_enabled — 실서버 Drive가 살아 있다는 표식(서버가 폴더 트리·업로드·연결 성공 시 켠다).
--    §7.5 2단계 확정(approved → 06_발주처공유 복사 성공 → final)은 이 표식 + 행사 폴더가 있을 때만 — 시드·Drive 이전 행사는
--    기존처럼 승인 즉시 final(로컬 검증·dev 검증의 기대값 불변).
-- ② drive_connection — OAuth 연결 메타(계정·시각·마지막 오류). 갱신 토큰 자체는 Supabase Vault(§12 "Vault/환경변수").
--    RLS만 켜고 정책을 두지 않는다 = service 경로 전용.
-- ③ upload_version 5인자판(p_drive_file_id) — 판정은 app.assert_can_upload 한 곳. 같은 항목에 같은 Drive 파일 중복 등록은 409,
--    인박스에 있던 파일이면 연결 처리(인박스 중복 표시 방지).
-- ④ service 전용 RPC — 업로드 사전 판정(사용자 JWT로 부르는 것만 authenticated), 인박스 대조 목록, 발주처 파일 목록,
--    확정 복사 대상·마감, Vault 토큰 읽기·저장·해제·오류 기록.
-- 멱등: setup.sql 2회 실행 무해(create or replace · if not exists · drop … if exists).
-- ─────────────────────────────────────────────────────────────────────

-- ① 앱 전역 표식
alter table app_config add column if not exists drive_enabled boolean not null default false;

-- ② 연결 메타 (단일 행)
create table if not exists drive_connection (
  id int primary key default 1 check (id = 1),
  account_email text,
  connected_by uuid references profiles(id) on delete set null,
  connected_at timestamptz,
  vault_secret_id uuid,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table drive_connection enable row level security;
revoke all on drive_connection from anon, authenticated;
grant all on drive_connection to service_role;

-- ③ 업로드 판정 — upload_version과 drive_upload_check가 같은 규칙을 쓴다(§6.1 역할-영역 · 종료 409 · §5 업로드 가능 상태 · §5.1 파트너 첫 제출)
create or replace function app.assert_can_upload(p_deliverable uuid)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role;
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
  return v_d;
end $$;

-- 4인자판(Phase 4)을 걷어낸다 — 남겨 두면 이름 인자 호출이 5인자판(기본값)과 겹쳐 "function is not unique"가 난다
drop function if exists public.upload_version(uuid, text, text, text);

create or replace function public.upload_version(
  p_deliverable uuid,
  p_file_name text,
  p_note text default null,
  p_original_file_name text default null,
  p_drive_file_id text default null
)
returns versions language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_v versions; v_to deliverable_status; v_file text;
begin
  v_d := app.assert_can_upload(p_deliverable);
  v_me := app.current_profile_id();
  v_file := nullif(trim(coalesce(p_drive_file_id, '')), '');
  if v_file is not null and exists (select 1 from versions where deliverable_id = p_deliverable and drive_file_id = v_file) then
    raise exception 'CONFLICT: 이미 이 항목에 등록된 파일입니다.' using errcode = 'P0409';
  end if;
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, coalesce(v_file, 'pending:' || gen_random_uuid()), p_file_name, p_note, v_me)
  returning * into v_v;
  if v_file is not null then
    -- 직접 올린 파일이 인박스에 먼저 잡혀 있었다면 연결된 것으로 표시(같은 파일이 두 번 보이지 않게)
    update unregistered_files set linked_deliverable_id = p_deliverable
    where drive_file_id = v_file and project_id = v_d.project_id and linked_deliverable_id is null;
  end if;
  if v_d.status in ('requested','changes_requested') then
    v_to := case when v_d.partner_id is not null then 'pending_approval'::deliverable_status else 'draft'::deliverable_status end;
    update deliverables set status = v_to where id = p_deliverable;
  end if;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'version.uploaded', 'version', v_v.id,
    jsonb_build_object('deliverable_id', p_deliverable, 'version_no', v_v.version_no, 'drive', v_file is not null));
  return v_v;
end $$;
revoke execute on function public.upload_version(uuid, text, text, text, text) from public, anon;
grant execute on function public.upload_version(uuid, text, text, text, text) to authenticated;

-- 업로드 사전 판정(사용자 JWT) — 바이트를 보내기 전에 같은 404·403·409를 돌려주고 폴더 경로 계산에 필요한 값만 준다
create or replace function public.drive_upload_check(p_deliverable uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_p projects;
begin
  v_d := app.assert_can_upload(p_deliverable);
  select * into v_p from projects where id = v_d.project_id;
  return jsonb_build_object(
    'deliverable', jsonb_build_object('id', v_d.id, 'project_id', v_d.project_id, 'area', v_d.area, 'category', v_d.category,
                                      'title', v_d.title, 'status', v_d.status, 'drive_folder_id', v_d.drive_folder_id),
    'project', jsonb_build_object('id', v_p.id, 'code', v_p.code, 'name', v_p.name, 'event_date', v_p.event_date,
                                  'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id));
end $$;
revoke execute on function public.drive_upload_check(uuid) from public, anon;
grant execute on function public.drive_upload_check(uuid) to authenticated;

-- ④ service 전용 ─────────────────────────────────────────────────────

-- 인박스 대조: 이 행사가 이미 아는 Drive 파일 id(버전 + 인박스 — 처리·무시된 것 포함)
create or replace function public.drive_known_file_ids(p_project uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from (
    select v.drive_file_id as x from versions v join deliverables d on d.id = v.deliverable_id where d.project_id = p_project
    union
    select u.drive_file_id from unregistered_files u where u.project_id = p_project
  ) s
$$;
revoke execute on function public.drive_known_file_ids(uuid) from public, anon, authenticated;
grant execute on function public.drive_known_file_ids(uuid) to service_role;

-- 확정 복사 대상 한 건(항목·버전·행사 폴더 경로에 필요한 값)
create or replace function app.snapshot_target(p_deliverable uuid, p_version uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'deliverable_id', d.id, 'version_id', v.id, 'drive_file_id', v.drive_file_id, 'file_name', v.file_name,
    'project', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'event_date', p.event_date,
                                  'status', p.status, 'drive_root_folder_id', p.drive_root_folder_id))
  from deliverables d join versions v on v.id = p_version and v.deliverable_id = d.id join projects p on p.id = d.project_id
  where d.id = p_deliverable
$$;

-- 발주처(/c) 토큰이 볼 수 있는 파일 = 컨펌 대기 버전 + 확정 항목의 최신 버전(client_queue·client_status와 같은 범위)
create or replace function public.client_file_versions(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_out jsonb;
begin
  v_t := app.resolve_client_token(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('version_id', x.version_id, 'drive_file_id', x.drive_file_id, 'file_name', x.file_name)), '[]'::jsonb)
  into v_out from (
    select v.id as version_id, v.drive_file_id, v.file_name
    from approvals a join deliverables d on d.id = a.deliverable_id join versions v on v.id = a.version_id
    where d.project_id = v_t.project_id and a.decided_at is null and d.status = 'pending_approval'
    union
    select v.id, v.drive_file_id, v.file_name
    from deliverables d
    join lateral (select * from versions x where x.deliverable_id = d.id order by x.version_no desc limit 1) v on true
    where d.project_id = v_t.project_id and d.status = 'final'
  ) x;
  return v_out;
end $$;
revoke execute on function public.client_file_versions(uuid) from public, anon, authenticated;
grant execute on function public.client_file_versions(uuid) to service_role;

-- 발주처 승인 직후 복사 대상 — 토큰 검증(404·410) · 다른 행사 항목 403 · 아직 approved일 때만(아니면 null = 할 일 없음)
create or replace function public.client_snapshot_target(p_token uuid, p_approval uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_a approvals; v_d deliverables;
begin
  v_t := app.resolve_client_token(p_token);
  select * into v_a from approvals where id = p_approval;
  if v_a.id is null then raise exception 'NOT_FOUND: 컨펌 요청을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  select * into v_d from deliverables where id = v_a.deliverable_id;
  if v_d.project_id <> v_t.project_id then raise exception 'FORBIDDEN: 이 링크로 처리할 수 없는 항목입니다.' using errcode = 'P0403'; end if;
  if v_a.decision is distinct from 'approved' or v_d.status <> 'approved' then return null; end if;
  return app.snapshot_target(v_d.id, v_a.version_id);
end $$;
revoke execute on function public.client_snapshot_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.client_snapshot_target(uuid, uuid) to service_role;

-- 확정 복사 재시도 대상(스캔이 부른다) — approved에 머문 항목 + 가장 최근 승인 버전
create or replace function public.drive_pending_snapshots(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(app.snapshot_target(d.id, a.version_id)), '[]'::jsonb)
  from deliverables d
  join lateral (select * from approvals x where x.deliverable_id = d.id and x.decision = 'approved' order by x.decided_at desc limit 1) a on true
  where d.project_id = p_project and d.status = 'approved'
$$;
revoke execute on function public.drive_pending_snapshots(uuid) from public, anon, authenticated;
grant execute on function public.drive_pending_snapshots(uuid) to service_role;

-- 확정 마감 — 06 복사본 id를 로그에 남기고 final(+연결 WBS 자동 done). 이미 final이면 그대로(재시도 멱등)
create or replace function public.finalize_approved(p_deliverable uuid, p_snapshot_file_id text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_d.status <> 'approved' then return v_d; end if;
  perform app.finalize_deliverable(p_deliverable);
  perform app.write_log(v_d.project_id, 'system',
    case when p_snapshot_file_id is null then 'drive.snapshot_skipped' else 'drive.snapshot_copied' end,
    'deliverable', p_deliverable, jsonb_build_object('snapshot_file_id', p_snapshot_file_id));
  select * into v_d from deliverables where id = p_deliverable;
  return v_d;
end $$;
revoke execute on function public.finalize_approved(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_approved(uuid, text) to service_role;

-- Vault 토큰 — 이름 하나(communicator_drive_refresh_token). plpgsql이라 vault 스키마가 없어도 생성은 된다(호출 시 판정).
create or replace function public.drive_token_read()
returns text language plpgsql stable security definer set search_path = public as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'communicator_drive_refresh_token' limit 1;
  return v_secret;
end $$;
revoke execute on function public.drive_token_read() from public, anon, authenticated;
grant execute on function public.drive_token_read() to service_role;

create or replace function public.drive_connection_save(p_refresh_token text, p_account_email text, p_connected_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if nullif(trim(coalesce(p_refresh_token, '')), '') is null then
    raise exception 'VALIDATION: 갱신 토큰이 비어 있습니다.' using errcode = 'P0422';
  end if;
  select id into v_id from vault.secrets where name = 'communicator_drive_refresh_token' limit 1;
  if v_id is null then
    v_id := vault.create_secret(new_secret => p_refresh_token, new_name => 'communicator_drive_refresh_token',
                                new_description => 'MICE 커뮤니케이터 Drive OAuth 갱신 토큰 (api/drive)');
  else
    perform vault.update_secret(secret_id => v_id, new_secret => p_refresh_token);
  end if;
  insert into drive_connection (id, account_email, connected_by, connected_at, vault_secret_id, last_error, last_error_at, updated_at)
  values (1, p_account_email, p_connected_by, now(), v_id, null, null, now())
  on conflict (id) do update set account_email = excluded.account_email, connected_by = excluded.connected_by,
    connected_at = excluded.connected_at, vault_secret_id = excluded.vault_secret_id, last_error = null, last_error_at = null, updated_at = now();
end $$;
revoke execute on function public.drive_connection_save(text, text, uuid) from public, anon, authenticated;
grant execute on function public.drive_connection_save(text, text, uuid) to service_role;

create or replace function public.drive_connection_clear()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from vault.secrets where name = 'communicator_drive_refresh_token';
  delete from drive_connection where id = 1;
end $$;
revoke execute on function public.drive_connection_clear() from public, anon, authenticated;
grant execute on function public.drive_connection_clear() to service_role;

create or replace function public.drive_connection_error(p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into drive_connection (id, last_error, last_error_at, updated_at) values (1, p_message, now(), now())
  on conflict (id) do update set last_error = excluded.last_error, last_error_at = excluded.last_error_at, updated_at = now();
end $$;
revoke execute on function public.drive_connection_error(text) from public, anon, authenticated;
grant execute on function public.drive_connection_error(text) to service_role;

-- 행사 삭제 전 Drive 폴더 확인(관리자) — 삭제 뒤 그 폴더를 루트 99_archive로 옮기기 위해(v2.9 · Phase 4.1 이탈 2 해소).
-- delete_project의 반환형은 바꾸지 않는다(void → 다른 형으로 바꾸면 setup.sql 재실행이 1600의 create or replace에서 깨진다).
-- 관리자가 그 행사의 멤버가 아니어도 읽을 수 있어야 해서(RLS 밖) security definer로 폴더 id·이름만 준다.
create or replace function public.drive_project_folder(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then
    raise exception 'FORBIDDEN: 행사 삭제는 관리자(admin) 권한이 필요합니다.' using errcode = 'P0403';
  end if;
  return (select jsonb_build_object('drive_root_folder_id', drive_root_folder_id, 'name', name) from projects where id = p_project);
end $$;
revoke execute on function public.drive_project_folder(uuid) from public, anon;
grant execute on function public.drive_project_folder(uuid) to authenticated;

-- ⑤ 발주처 결정 — §7.5 2단계 확정. Drive가 살아 있고(app_config.drive_enabled) 행사 폴더가 있으면 approved에서 멈추고
--    서버(api/drive client-finalize · 스캔 재시도)가 06_발주처공유 복사 성공 후 finalize_approved로 final을 커밋한다.
--    그 밖(시드·Drive 이전 행사)은 1700 판과 같게 승인 즉시 final. 시그니처·반환형은 1700 판과 동일(create or replace).
create or replace function public.client_decide(p_token uuid, p_approval uuid, p_decision approval_decision, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_a approvals; v_d deliverables; v_two_phase boolean;
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
    select coalesce((select drive_enabled from app_config where id = 1), false)
       and (select drive_root_folder_id is not null from projects where id = v_d.project_id)
      into v_two_phase;
    if not coalesce(v_two_phase, false) then
      perform app.finalize_deliverable(v_d.id);
    end if;
  else
    update deliverables set status = 'changes_requested' where id = v_d.id;
    insert into comments (deliverable_id, author_token, visibility, body) values (v_d.id, p_token, 'shared', p_comment);
  end if;
end $$;
revoke execute on function public.client_decide(uuid, uuid, approval_decision, text) from public;
grant execute on function public.client_decide(uuid, uuid, approval_decision, text) to anon, authenticated;
