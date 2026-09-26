-- ─────────────────────────────────────────────────────────────────────
-- 20260926000500 · 행사 만들기 인테이크 + 견적서 첨부 (설계서 v2.15 §10 S0 · §8.7 · Phase 6.2, 2026-09-26 —
--   사용자 지시 "행사 기본정보를 슬랙 메시지를 통해 불러와 기록 · 견적서도 첨부(파일 혹은 링크) · 행사 코드는 행사명에 따라 자동")
--
--   · projects.intake            — Slack 메시지에서 기본 정보를 불러온 기록(링크·시각·보낸 사람 표시 이름·읽은 방식·채운 칸). 원문은 저장하지 않는다
--   · projects.quote_attachment  — 견적서 첨부(drive = 행사 폴더 02_견적·정산/견적서의 파일 · link = 주소만). 행사 하나에 하나
--   · ai_usage.feature           — 'project_intake' 추가(자유 문장에서 기본 정보 읽기 — Claude). 행사가 아직 없을 수 있어 p_project는 null 허용
--   · drive_project_file_check   — 서버 함수가 행사 폴더에 파일(견적서)을 올리기 전 판정(pm · 종료 안 된 행사) → 행사 정보
--   · drive_known_file_ids       — 견적서 첨부 파일을 아는 파일로(인박스 스캔이 다시 올리지 않게)
-- 두 열은 pm의 projects update(RLS projects_update)로 쓴다 — 앱이 값을 만들고 서버 함수는 파일만 올린다. 금액·연락처는 어느 열에도 없다.

alter table projects add column if not exists intake jsonb;
alter table projects add column if not exists quote_attachment jsonb;

-- AI 기능 목록 확장 — CHECK 재정의(기존 행은 vendor_quote만이라 무해)
alter table ai_usage drop constraint if exists ai_usage_feature_check;
alter table ai_usage add constraint ai_usage_feature_check check (feature in ('vendor_quote', 'project_intake'));

-- 선점 재정의 — vendor_quote = 그 행사 pm(종료 안 됨) · project_intake = 로그인한 내부 사용자(행사가 있으면 그 행사 멤버). 한도 규칙은 그대로
create or replace function public.ai_usage_claim(p_project uuid, p_feature text, p_limit int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 500));
  v_used int;
  v_id uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if p_feature = 'vendor_quote' then
    if p_project is null then raise exception 'VALIDATION: 행사가 필요합니다.' using errcode = 'P0422'; end if;
    perform app.require_pm(p_project);
    perform app.require_writable(p_project);
  elsif p_feature = 'project_intake' then
    if p_project is not null and not app.is_member(p_project) then
      raise exception 'FORBIDDEN: 이 행사의 담당자만 쓸 수 있습니다.' using errcode = 'P0403';
    end if;
  else
    raise exception 'VALIDATION: 알 수 없는 AI 기능입니다.' using errcode = 'P0422';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || v_me::text, 0));
  select count(*) into v_used from ai_usage
  where profile_id = v_me and created_at >= app.kst_day_start() and status <> 'failed';
  if v_used >= v_limit then
    raise exception 'LIMIT: 오늘 AI 읽기 %회를 모두 썼습니다 — 내일(한국 시각 0시) 다시 쓸 수 있습니다. 엑셀 견적서는 한도 없이 불러올 수 있습니다.', v_limit
      using errcode = 'P0429';
  end if;
  insert into ai_usage (profile_id, project_id, feature) values (v_me, p_project, p_feature) returning id into v_id;
  return jsonb_build_object('id', v_id, 'used', v_used + 1, 'limit', v_limit);
end $$;
revoke execute on function public.ai_usage_claim(uuid, text, int) from public, anon;
grant execute on function public.ai_usage_claim(uuid, text, int) to authenticated;

-- 행사 폴더에 파일을 올리기 전 판정(사용자 JWT) — pm · 종료 안 된 행사 → 행사 정보(서버가 폴더 트리를 찾는 데 쓴다)
create or replace function public.drive_project_file_check(p_project uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p projects;
begin
  perform app.require_pm(p_project);
  v_p := app.require_writable(p_project);
  return jsonb_build_object('id', v_p.id, 'code', v_p.code, 'name', v_p.name, 'event_date', v_p.event_date,
                            'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id);
end $$;
revoke execute on function public.drive_project_file_check(uuid) from public, anon;
grant execute on function public.drive_project_file_check(uuid) to authenticated;

-- 아는 파일 = 버전 + 인박스 + 정산 원본 + (v2.15) 견적서 첨부 파일
create or replace function public.drive_known_file_ids(p_project uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from (
    select v.drive_file_id as x from versions v join deliverables d on d.id = v.deliverable_id where d.project_id = p_project
    union
    select u.drive_file_id from unregistered_files u where u.project_id = p_project
    union
    select i.drive_file_id from settlement_imports i join settlement_boards b on b.id = i.board_id
    where b.project_id = p_project and i.drive_file_id is not null
    union
    select p.quote_attachment->>'drive_file_id' from projects p
    where p.id = p_project and p.quote_attachment->>'drive_file_id' is not null
  ) s
$$;
revoke execute on function public.drive_known_file_ids(uuid) from public, anon, authenticated;
grant execute on function public.drive_known_file_ids(uuid) to service_role;
