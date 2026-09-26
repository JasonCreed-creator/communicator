-- ─────────────────────────────────────────────────────────────────────
-- 20260926000400 · AI(Claude) 사용 기록·한도 (설계서 v2.14 §19.5b · Phase 4.8, 2026-09-26 —
--   사용자 결정: 협력사 견적서 PDF·사진 읽기만 먼저 · 로그인한 내부 사용자 · 1인 하루 30회 · 시험 = 개인 계정 키)
--
-- 서버 함수(api/ai)가 Claude를 부르기 **전에** 사용자 JWT로 ai_usage_claim을 불러 권한·한도를 판정하고 한 줄을 선점한다.
--   · 권한: 기능마다 — vendor_quote = 그 행사의 pm + 종료 안 된 행사(협력사 견적서 불러오기와 같은 권한 — §19.5a)
--   · 한도: 한 사람이 KST 하루에 p_limit번(서버 env AI_DAILY_LIMIT, 기본 30). 'failed'(Claude 쪽 오류)는 세지 않는다
--   · 동시에 두 번 눌러도 한도를 넘지 않게 사람마다 트랜잭션 잠금(pg_advisory_xact_lock)
-- 호출이 끝나면 서버가 service 전용 ai_usage_finish로 결과·토큰 수를 적는다.
-- 기록에는 **파일 이름·금액·견적 내용을 싣지 않는다**(기능·상태·모델·토큰 수·오류 문구만 — §19.7 준용).
-- 표는 RLS on + 정책 없음(notification_log와 같은 규약) — 앱은 표를 직접 읽지도 쓰지도 않는다.

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  feature text not null check (feature in ('vendor_quote')),
  status text not null default 'claimed' check (status in ('claimed', 'ok', 'unreadable', 'failed')),
  model text,
  input_tokens int,
  output_tokens int,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ai_usage_profile_day on ai_usage (profile_id, created_at);
alter table ai_usage enable row level security;
revoke all on ai_usage from anon, authenticated;
grant all on ai_usage to service_role;

-- KST 오늘 0시(timestamptz) — 한도는 한국 날짜로 끊는다
create or replace function app.kst_day_start()
returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul'
$$;

-- 선점(사용자 JWT) — 권한·한도를 보고 한 줄을 넣은 뒤 {id, used, limit}를 돌려준다. 한도를 넘으면 P0429
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
  if p_feature is distinct from 'vendor_quote' then
    raise exception 'VALIDATION: 알 수 없는 AI 기능입니다.' using errcode = 'P0422';
  end if;
  -- 협력사 견적서 불러오기와 같은 권한(pm · 종료 안 된 행사)
  perform app.require_pm(p_project);
  perform app.require_writable(p_project);

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

-- 결과 기록(service 전용 — 서버 함수가 Claude 호출 뒤). 'claimed'인 줄만 한 번 바꾼다
create or replace function public.ai_usage_finish(
  p_id uuid, p_status text, p_model text, p_input_tokens int, p_output_tokens int, p_error text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('ok', 'unreadable', 'failed') then
    raise exception 'VALIDATION: 알 수 없는 상태입니다.' using errcode = 'P0422';
  end if;
  update ai_usage
  set status = p_status,
      model = left(p_model, 80),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      error = left(p_error, 300),
      finished_at = now()
  where id = p_id and status = 'claimed';
end $$;
revoke execute on function public.ai_usage_finish(uuid, text, text, int, int, text) from public, anon, authenticated;
grant execute on function public.ai_usage_finish(uuid, text, text, int, int, text) to service_role;
