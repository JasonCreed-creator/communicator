-- 32번째 — 담당자 중복 배정: 한 사람이 한 행사에서 여러 역할 (Phase 6.6 · 설계서 v2.19 §4-2 · §6.1 · §8)
-- 2026-09-27 실사용(온보딩 ② 담당자 배정) 사용자 요청 "여기서 담당자를 중복배치할 수 있게 해줘" · 버튼 승인 "지금 착수".
-- 키 = (행사·사람·역할). 권한은 역할 **합집합**(디자인+운영이면 두 영역 다). 대표 역할(pm > design > ops > reg)은 옛 단일 역할
-- 호출자용으로만 남긴다. 전역 admin = pm(31번째)은 그대로. 마지막 PM 삭제 거부(§4-2)도 그대로 — 역할 하나만 뺄 때도 적용.

-- 1. 기본키 (행사·사람) → (행사·사람·역할) — 멱등(이미 3열이면 건너뜀)
do $$
begin
  if exists (
    select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
    where t.relname = 'project_members' and c.contype = 'p' and array_length(c.conkey, 1) = 2
  ) then
    alter table project_members drop constraint project_members_pkey;
    alter table project_members add primary key (project_id, user_id, role);
  end if;
end $$;

-- 생성자 = pm 트리거의 on conflict 대상도 새 키로
create or replace function app.projects_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'pm')
    on conflict (project_id, user_id, role) do nothing;
  end if;
  return new;
end $$;

-- 2. 역할 집합 — 판정의 정본. admin은 어느 행사에서든 {pm}
create or replace function app.member_roles(p_project uuid)
returns member_role[]
language sql stable security definer
set search_path = public
as $$
  select case
    when app.is_admin() then array['pm']::member_role[]
    else coalesce((
      select array_agg(m.role order by case m.role when 'pm' then 0 when 'design' then 1 when 'ops' then 2 else 3 end)
      from project_members m
      join profiles pr on pr.id = m.user_id
      where m.project_id = p_project and pr.auth_user_id = auth.uid()
    ), '{}'::member_role[])
  end
$$;

-- 대표 역할(옛 단일 역할 호출자용) — 집합의 첫 값
create or replace function app.member_role(p_project uuid)
returns member_role
language sql stable security definer
set search_path = public
as $$
  select (app.member_roles(p_project))[1]
$$;

create or replace function app.is_pm(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce('pm' = any (app.member_roles(p_project)), false)
$$;

create or replace function app.has_role(p_project uuid, variadic p_roles member_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(app.member_roles(p_project) && p_roles, false)
$$;

-- 역할-영역 쓰기 규칙(§6.1) — 합집합: pm 전 영역 · design→design/common · ops→ops/common
create or replace function app.can_write_area(p_project uuid, p_area deliverable_area)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when 'pm' = any (r) then true
    when p_area = 'design' then 'design' = any (r)
    when p_area = 'ops' then 'ops' = any (r)
    when p_area = 'common' then r && array['design','ops']::member_role[]
    else false
  end
  from (select app.member_roles(p_project) as r) s
$$;

create or replace function app.require_roles(p_project uuid, p_message text, variadic p_roles member_role[])
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not coalesce(app.member_roles(p_project) && p_roles, false) then raise exception 'FORBIDDEN: %', p_message using errcode = 'P0403'; end if;
  return v_me;
end $$;

-- 3. 단일 역할(v_role)로 영역을 판정하던 RPC 4곳 → 집합 판정(app.can_write_area · app.is_pm). 본문은 그 밖에 그대로.
create or replace function app.assert_can_upload(p_deliverable uuid)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  if v_me is null or not app.is_member(v_d.project_id) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  if not (app.is_pm(v_d.project_id) or (v_d.area in ('design','ops') and app.has_role(v_d.project_id, v_d.area::text::member_role))) then
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

create or replace function public.transition_deliverable(p_deliverable uuid, p_to deliverable_status, p_comment text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_from deliverable_status;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  if v_me is null or not app.is_member(v_d.project_id) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  v_from := v_d.status;
  -- status_patch 경로의 두 전이만 허용한다(그 밖은 approval_request·client_decision·version_upload 경로)
  if v_from = 'draft' and p_to = 'internal_review' then
    if not (app.is_pm(v_d.project_id) or (v_d.area in ('design','ops') and app.has_role(v_d.project_id, v_d.area::text::member_role))) then
      raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
    end if;
  elsif v_from = 'internal_review' and p_to = 'draft' then
    if not app.is_pm(v_d.project_id) then raise exception 'FORBIDDEN: 이 전이를 수행할 권한이 없습니다.' using errcode = 'P0403'; end if;
    if nullif(trim(coalesce(p_comment, '')), '') is null then
      raise exception 'VALIDATION: 반려 사유 코멘트가 필요합니다.' using errcode = 'P0422';
    end if;
    insert into comments (deliverable_id, author_user_id, visibility, body) values (p_deliverable, v_me, 'internal', p_comment);
  else
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → % (status_patch)', v_from, p_to using errcode = 'P0409';
  end if;
  update deliverables set status = p_to where id = p_deliverable returning * into v_d;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'status.transitioned', 'deliverable', p_deliverable, jsonb_build_object('from', v_from, 'to', p_to));
  return v_d;
end $$;

create or replace function public.review_partner_submission(p_deliverable uuid, p_decision text, p_comment text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_d.partner_id is null then raise exception 'CONFLICT: 파트너 제출 항목이 아닙니다.' using errcode = 'P0409'; end if;
  v_me := app.current_profile_id();
  if v_me is null or not app.is_member(v_d.project_id) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  -- 역할-영역 일치(pm 전 영역 · design/ops 자기 영역 · reg 불가) — 합집합
  if not (app.is_pm(v_d.project_id) or (v_d.area in ('design','ops') and app.has_role(v_d.project_id, v_d.area::text::member_role))) then
    raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
  end if;
  if v_d.status <> 'pending_approval' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → % (partner_review)', v_d.status, p_decision using errcode = 'P0409';
  end if;
  if p_decision = 'approved' then
    update deliverables set status = 'approved' where id = p_deliverable;
    perform app.write_log(v_d.project_id, 'user:' || v_me, 'partner.reviewed', 'deliverable', p_deliverable, jsonb_build_object('decision', 'approved'));
    perform app.finalize_deliverable(p_deliverable);
  elsif p_decision = 'changes_requested' then
    if nullif(trim(coalesce(p_comment, '')), '') is null then
      raise exception 'VALIDATION: 수정요청 시 코멘트는 필수입니다.' using errcode = 'P0422';
    end if;
    update deliverables set status = 'changes_requested' where id = p_deliverable;
    insert into comments (deliverable_id, author_user_id, visibility, body) values (p_deliverable, v_me, 'shared', p_comment);
    perform app.write_log(v_d.project_id, 'user:' || v_me, 'partner.reviewed', 'deliverable', p_deliverable, jsonb_build_object('decision', 'changes_requested'));
  else
    raise exception 'VALIDATION: decision은 approved 또는 changes_requested여야 합니다.' using errcode = 'P0422';
  end if;
  select * into v_d from deliverables where id = p_deliverable;
  return v_d;
end $$;

-- 4. 배정 = 같은 역할만 409(다른 역할로 또 배정 가능) · 제거 = 역할 하나 또는 전부
create or replace function public.add_member(p_project uuid, p_display_name text, p_email text, p_role member_role, p_title text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_email text; v_name text; v_profile profiles; v_project projects;
begin
  v_me := app.require_pm(p_project);
  v_project := app.require_writable(p_project);
  v_name := trim(coalesce(p_display_name, '')); v_email := lower(trim(coalesce(p_email, '')));
  if v_name = '' or v_email = '' then raise exception 'VALIDATION: 이름과 이메일은 필수입니다.' using errcode = 'P0422'; end if;
  select * into v_profile from profiles where lower(email) = v_email;
  if v_profile.id is not null and exists (select 1 from project_members where project_id = p_project and user_id = v_profile.id and role = p_role) then
    raise exception 'CONFLICT: 이미 이 행사의 % 담당자입니다.', case p_role when 'pm' then 'PM' when 'design' then '디자인' when 'ops' then '운영' else '등록' end using errcode = 'P0409';
  end if;
  if v_profile.id is null then
    insert into profiles (display_name, email, title, phone)
    values (v_name, trim(p_email), nullif(trim(coalesce(p_title, '')), ''), nullif(trim(coalesce(p_phone, '')), ''))
    returning * into v_profile;
  else
    -- 다른 행사에서 확인한 값을 덮어쓰지 않는다 — 빈 칸만 채운다
    update profiles set title = coalesce(title, nullif(trim(coalesce(p_title, '')), '')),
                        phone = coalesce(phone, nullif(trim(coalesce(p_phone, '')), ''))
    where id = v_profile.id returning * into v_profile;
  end if;
  insert into project_members (project_id, user_id, role) values (p_project, v_profile.id, p_role);
  insert into project_invites (project_id, email, display_name, role, invited_by, accepted_at, accepted_user_id)
  values (p_project, v_profile.email, v_profile.display_name, p_role, v_me,
          case when v_profile.auth_user_id is not null then now() end,
          case when v_profile.auth_user_id is not null then v_profile.id end)
  on conflict (project_id, lower(email)) do nothing;
  perform app.write_log(p_project, 'user:' || v_me, 'member.added', 'project', p_project, jsonb_build_object('user_id', v_profile.id, 'role', p_role));
  return jsonb_build_object('project_id', p_project, 'user_id', v_profile.id, 'role', p_role,
    'profile', jsonb_build_object('id', v_profile.id, 'name', v_profile.display_name, 'email', v_profile.email, 'title', v_profile.title, 'phone', v_profile.phone));
end $$;

-- 2인자판을 걷어낸다 — 남기면 이름 인자 호출이 3인자판(기본값)과 겹쳐 "function is not unique"가 난다(upload_version 전례)
drop function if exists public.remove_member(uuid, uuid);
create or replace function public.remove_member(p_project uuid, p_member uuid, p_role member_role default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_count int;
begin
  v_me := app.require_pm(p_project);
  perform app.require_writable(p_project);
  select count(*) into v_count from project_members where project_id = p_project and user_id = p_member and (p_role is null or role = p_role);
  if v_count = 0 then raise exception 'NOT_FOUND: 담당자를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if exists (select 1 from project_members where project_id = p_project and user_id = p_member and role = 'pm' and (p_role is null or p_role = 'pm'))
     and (select count(*) from project_members where project_id = p_project and role = 'pm') <= 1 then
    raise exception 'CONFLICT: 마지막 PM은 삭제할 수 없습니다 — 먼저 다른 PM을 지정하세요.' using errcode = 'P0409';
  end if;
  delete from project_members where project_id = p_project and user_id = p_member and (p_role is null or role = p_role);
  perform app.write_log(p_project, 'user:' || v_me, 'member.removed', 'project', p_project,
    jsonb_build_object('user_id', p_member) || case when p_role is null then '{}'::jsonb else jsonb_build_object('role', p_role) end);
end $$;
revoke execute on function public.remove_member(uuid, uuid, member_role) from public, anon;
grant execute on function public.remove_member(uuid, uuid, member_role) to authenticated;

-- 5. 멘션 대상 — 한 사람이 여러 역할이어도 한 번만
create or replace function app.notify_role_people(p_project uuid, p_roles member_role[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email,
    'slack_user_id', p.slack_user_id) order by p.display_name, p.id), '[]'::jsonb)
  from profiles p
  where p.id in (select m.user_id from project_members m where m.project_id = p_project and m.role = any (p_roles))
$$;

comment on table project_members is '행사 담당자 배정 — 키 (행사·사람·역할). 한 사람이 한 행사에서 여러 역할 가능(v2.19 · Phase 6.6). 권한은 역할 합집합(app.member_roles)';
