-- ─────────────────────────────────────────────────────────────────────
-- 20260927000400 · 견적서 PDF·사진 AI 읽기 (설계서 v2.18 §22.5 · Phase 6.4 PR-2, 2026-09-27 —
--   사용자 지시 "엑셀 말고 PDF도 인식할 수 있게" · 버튼 "AI로 읽기 — 키는 내가 Vercel에 넣을게")
--
--   · quote_imports.format — 'ai' 허용(AI가 읽은 견적서 — 서식 A·B·C 판정 없음)
--   · ai_usage.feature       — 'quote_import' 추가(견적서 PDF·사진 → 확인 큐 입력). 행사가 없는 단계라 p_project는 null
--   · ai_usage_claim 재정의 — quote_import = 영업·관리자(app_role admin·sales — 견적 메뉴와 같은 권한 §6.1). 한도 규칙은 그대로(1인 하루 · KST)
--   · 표·정책·권한 불변

alter table quote_imports drop constraint if exists quote_imports_format_check;
alter table quote_imports add constraint quote_imports_format_check check (format in ('A','B','C','ai'));

alter table ai_usage drop constraint if exists ai_usage_feature_check;
alter table ai_usage add constraint ai_usage_feature_check check (feature in ('vendor_quote', 'project_intake', 'quote_import'));

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
  elsif p_feature = 'quote_import' then
    -- 견적서 가져오기 = 견적 메뉴 권한(영업·관리자). 행사 연결 전이라 p_project는 null(있으면 무시하지 않고 그대로 기록)
    if not coalesce(app.is_quote_user(), false) then
      raise exception 'FORBIDDEN: 견적 메뉴는 영업·관리자 권한이 필요합니다.' using errcode = 'P0403';
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
