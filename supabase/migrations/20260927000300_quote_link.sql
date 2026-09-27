-- ─────────────────────────────────────────────────────────────────────
-- 20260927000300 · 견적 ↔ 기존 행사 연결 (설계서 v2.18 §16.4 · §22.4 · Phase 6.4 PR-1, 2026-09-27 —
--   운영 실측: 견적서 가져오기 ③에서 '정산보드 기준 견적'을 켜면 프리필이 강제로 켜져 **새 행사를 하나 더** 만들었다.
--   앱 어디에도 견적을 이미 있는 행사에 붙이는 길이 없었다 — 이 RPC가 그 길이다.)
--
--   · link_quote_to_project(p_quote, p_project) — 견적을 기존 행사에 연결(상호 링크). 권한 = 영업·관리자(app_role) 또는 그 행사의 PM.
--     · 견적이 이미 그 행사에 연결돼 있으면 그대로 돌려준다(멱등) · 다른 행사에 연결돼 있으면 409 · 새 버전이 있는 옛 버전 409 · 종료 행사 409
--     · 확정 견적을 붙이면 finalize_quote와 같은 규칙 — 같은 행사의 다른 확정본은 archived, projects.quote_id = 이 견적
--     · 미확정 견적을 붙이면 projects.quote_id는 비어 있을 때만 채운다(프리필과 같은 규칙 — materializeProjectFromQuote)
--   · 스키마 변경 없음(열 추가·삭제 0) · 금액은 어디로도 옮기지 않는다(로그 meta에 버전·확정 여부만)

create or replace function public.link_quote_to_project(p_quote uuid, p_project uuid)
returns quotes language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_q quotes; v_p projects;
begin
  v_me := app.current_profile_id();
  if v_me is null then
    raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403';
  end if;
  select * into v_p from projects where id = p_project;
  if v_p.id is null then
    raise exception 'NOT_FOUND: 프로젝트를 찾을 수 없습니다.' using errcode = 'P0404';
  end if;
  -- app.is_pm()은 비멤버에게 null을 돌려준다(member_role null = 'pm') — coalesce 없이는 not(null)이 거짓으로 떨어져 검사가 새는다
  if not coalesce(app.is_quote_user(), false) and not coalesce(app.is_pm(p_project), false) then
    raise exception 'FORBIDDEN: 견적 연결은 영업·관리자 또는 그 행사의 PM만 할 수 있습니다.' using errcode = 'P0403';
  end if;
  if v_p.status = 'closed' then
    raise exception 'CONFLICT: 종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.' using errcode = 'P0409';
  end if;
  select * into v_q from quotes where id = p_quote;
  if v_q.id is null then
    raise exception 'NOT_FOUND: 견적을 찾을 수 없습니다.' using errcode = 'P0404';
  end if;
  if v_q.project_id = p_project then
    return v_q; -- 이미 이 행사의 견적 — 멱등
  end if;
  if v_q.project_id is not null then
    raise exception 'CONFLICT: 이미 다른 행사에 연결된 견적입니다.' using errcode = 'P0409';
  end if;
  if v_q.superseded_by is not null then
    raise exception 'CONFLICT: 새 버전이 있는 견적은 연결할 수 없습니다 — 최신 버전을 연결하세요.' using errcode = 'P0409';
  end if;
  if v_q.is_final then
    update quotes set is_final = false, status = 'archived' where project_id = p_project and id <> p_quote and is_final;
  end if;
  update quotes set project_id = p_project where id = p_quote returning * into v_q;
  if v_q.is_final or v_p.quote_id is null then
    update projects set quote_id = p_quote where id = p_project;
  end if;
  perform app.write_log(p_project, 'user:' || v_me, 'quote.linked', 'quote', p_quote,
                        jsonb_build_object('version', v_q.version, 'is_final', v_q.is_final, 'source', v_q.source));
  return v_q;
end $$;
revoke execute on function public.link_quote_to_project(uuid, uuid) from public, anon;
grant execute on function public.link_quote_to_project(uuid, uuid) to authenticated;

-- ── 보안 정정(2026-09-27 로컬 실측 — 이 마이그레이션의 검증 시나리오가 잡음) ──────────────────────────
-- 역할 판정 함수가 **비멤버에게 null**을 돌려줬다(app.member_role() null = 'pm' → null). RLS의 using은 null을 거부로 보지만
-- plpgsql의 `if not app.is_pm(...)`은 null이면 raise를 **건너뛴다** — app.require_pm → add_member 등 pm 전용 RPC가
-- 다른 행사의 비멤버(로그인만 한 staff)에게 열려 있었다(멤버가 아니면서 pm이 아닌 사람 = 비멤버 전부). require_roles도 같은 모양.
-- 본체 파일(app_helpers · rpc_core)은 손대지 않고 여기서 재정의한다 — setup.sql은 순서대로 실행되므로 최종 정의가 이것이다.
create or replace function app.is_pm(p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(app.member_role(p_project) = 'pm', false)
$$;

create or replace function app.has_role(p_project uuid, variadic p_roles member_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(app.member_role(p_project) = any (p_roles), false)
$$;

create or replace function app.require_roles(p_project uuid, p_message text, variadic p_roles member_role[])
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not coalesce(app.member_role(p_project) = any (p_roles), false) then raise exception 'FORBIDDEN: %', p_message using errcode = 'P0403'; end if;
  return v_me;
end $$;
