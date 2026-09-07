-- ─────────────────────────────────────────────────────────────────────
-- 1500 · 권한 — PostgREST 롤(anon·authenticated·service_role) 부여.
-- anon은 표 권한 자체를 걷어낸다: 발주처·파트너 토큰 경로는 Edge Function(secret key)만 쓴다(§6.2).
-- profiles.app_role·auth_user_id는 authenticated가 갱신할 수 없다(승격은 service role SQL — app.promote_admin).
-- ─────────────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to anon, authenticated, service_role;

grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- app_config는 서비스 경로만
revoke all on app_config from authenticated;

-- profiles 컬럼 권한: 로그인 사용자는 app_role·auth_user_id를 바꿀 수 없다
revoke update on profiles from authenticated;
grant update (display_name, email, title, phone, org) on profiles to authenticated;
-- insert도 같은 열만 (주소록 등록 — app_role 기본 'staff', auth_user_id는 로그인 시 트리거가 채운다)
revoke insert on profiles from authenticated;
grant insert (display_name, email, title, phone, org) on profiles to authenticated;

-- 이후 만들어지는 표·시퀀스도 같은 기본 권한 (Supabase 기본 default privileges와 정합)
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
