-- ─────────────────────────────────────────────────────────────────────
-- 0300 · RLS 도우미 함수 (app 스키마) — 설계서 §6.2 "모든 테이블: project_id in (멤버인 행사)"
-- security definer + search_path 고정: profiles·project_members 자체의 RLS와 재귀하지 않는다.
-- auth.uid()는 Supabase Auth가 제공한다(로컬 검증은 supabase/test/local-shim.sql이 대체).
-- ─────────────────────────────────────────────────────────────────────

-- 현재 로그인 사용자의 프로필 id (auth.users.id ≠ profiles.id — 0200 정본 정합 메모)
create or replace function app.current_profile_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from profiles where auth_user_id = auth.uid()
$$;

create or replace function app.current_app_role()
returns app_role
language sql stable security definer
set search_path = public
as $$
  select coalesce((select app_role from profiles where auth_user_id = auth.uid()), 'staff'::app_role)
$$;

-- 견적 권한 = app_role admin·sales (§6.1 — 프로젝트 역할과 무관)
create or replace function app.is_quote_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select app.current_app_role() in ('admin','sales')
$$;

-- 행사 하드 삭제 권한 = app_role admin 단독(§4-1c · §6.1 — 프로젝트 역할 pm과 무관하다)
create or replace function app.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select app.current_app_role() = 'admin'
$$;

create or replace function app.member_role(p_project uuid)
returns member_role
language sql stable security definer
set search_path = public
as $$
  select m.role
  from project_members m
  join profiles pr on pr.id = m.user_id
  where m.project_id = p_project and pr.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function app.is_member(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select app.member_role(p_project) is not null
$$;

create or replace function app.is_pm(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select app.member_role(p_project) = 'pm'
$$;

-- 어느 행사에서든 pm인가 — 주소록 등록·수정·삭제 권한(§4-2b "권한: pm")
create or replace function app.is_any_pm()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members m
    join profiles pr on pr.id = m.user_id
    where pr.auth_user_id = auth.uid() and m.role = 'pm'
  )
$$;

-- 역할-영역 쓰기 규칙(§6.1): pm 전 영역 / design→design / ops→ops / common은 pm·design·ops
create or replace function app.can_write_area(p_project uuid, p_area deliverable_area)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case app.member_role(p_project)
    when 'pm' then true
    when 'design' then p_area in ('design','common')
    when 'ops' then p_area in ('ops','common')
    else false
  end
$$;

-- 역할 집합 판정 — 등록(pm·reg)·운영 문서(pm·ops)·체크인(pm·ops·reg) 같은 표의 셀을 그대로 옮긴다
create or replace function app.has_role(p_project uuid, variadic p_roles member_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select app.member_role(p_project) = any (p_roles)
$$;

-- 서비스 경로(SQL 에디터·Edge Function secret key) 판정 — 종료 행사 쓰기 가드가 이 경로는 통과시킨다.
-- current_user는 security definer 안에서 함수 소유자로 바뀌므로 쓰지 않는다. PostgREST가 세션에 심는
-- JWT role 클레임(request.jwt.claims->>'role' 또는 구형 request.jwt.claim.role)이 authenticated·anon이면 사용자 경로다.
create or replace function app.is_service_path()
returns boolean
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'service'
  ) not in ('authenticated', 'anon')
$$;
