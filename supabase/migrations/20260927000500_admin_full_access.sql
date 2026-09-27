-- 31번째 — 전역 admin = 모든 행사에서 pm 권한(멤버가 아니어도) (Phase 6.5 ④ · 설계서 v2.18.1 §6.1)
-- 2026-09-27 실사용: 관리자(app_role='admin')가 자기가 만든 행사에서 PM 칸에 다른 사람을 두자 "PM 전용 기능입니다."에 막혔다
-- → 사용자 지시 "PM이 아니어도 이진철은 전체 어드민 권한을 부여해야 함".
-- 판정 함수 한 곳(app.member_role)만 바꾼다 — is_member·is_pm·has_role·can_write_area·require_roles와 RLS 정책·RPC가
-- 전부 이 함수에서 파생되므로 admin은 어느 행사에서든 'pm'으로 판정된다. 행사 삭제(delete_project — admin 전용)는 그대로.
-- 알림 멘션(app.notify_role_people)은 project_members 행을 보므로 admin이 그 행사 PM으로 멘션되지는 않는다(배정된 사람만).

create or replace function app.member_role(p_project uuid)
returns member_role
language sql stable security definer
set search_path = public
as $$
  select case
    when app.is_admin() then 'pm'::member_role
    else (
      select m.role
      from project_members m
      join profiles pr on pr.id = m.user_id
      where m.project_id = p_project and pr.auth_user_id = auth.uid()
      limit 1
    )
  end
$$;

-- 주소록 등록·수정·삭제 권한(§4-2b "어느 행사에서든 pm") — admin 포함
create or replace function app.is_any_pm()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select app.is_admin() or exists (
    select 1 from project_members m
    join profiles pr on pr.id = m.user_id
    where pr.auth_user_id = auth.uid() and m.role = 'pm'
  )
$$;

comment on function app.member_role(uuid) is '현재 사용자의 행사 역할. 전역 admin(app_role)은 멤버가 아니어도 pm(2026-09-27 · 설계서 v2.18.1 §6.1)';
