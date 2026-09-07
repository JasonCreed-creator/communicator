-- ─────────────────────────────────────────────────────────────────────
-- 1300 · 트리거 — updated_at · §5 전이표 가드 · 견적 잠금 · onboarded_at 불변 · 생성자=pm ·
--        정산 has_cost 가드 · 종료 행사 쓰기 가드 · version_no 자동 증가 · Auth 사용자 ↔ 프로필 연결
-- 트리거는 drop if exists → create 로 멱등.
-- ─────────────────────────────────────────────────────────────────────

-- updated_at 자동 갱신 (moddatetime 확장 대신 자체 함수 — 로컬·운영 동일 동작)
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_deliverables_updated_at on deliverables;
create trigger trg_deliverables_updated_at before update on deliverables
  for each row execute function app.set_updated_at();
drop trigger if exists trg_quotes_updated_at on quotes;
create trigger trg_quotes_updated_at before update on quotes
  for each row execute function app.set_updated_at();
drop trigger if exists trg_landing_pages_updated_at on landing_pages;
create trigger trg_landing_pages_updated_at before update on landing_pages
  for each row execute function app.set_updated_at();
drop trigger if exists trg_settlement_boards_updated_at on settlement_boards;
create trigger trg_settlement_boards_updated_at before update on settlement_boards
  for each row execute function app.set_updated_at();
drop trigger if exists trg_settlement_items_updated_at on settlement_items;
create trigger trg_settlement_items_updated_at before update on settlement_items
  for each row execute function app.set_updated_at();
drop trigger if exists trg_app_config_updated_at on app_config;
create trigger trg_app_config_updated_at before update on app_config
  for each row execute function app.set_updated_at();

-- §5 전이표 가드 — 상태쌍(from,to)이 전이표 밖이면 거부. 주체·경로(via)·코멘트 필수는 앱 계층
-- (src/lib/statusMachine.ts assertTransition)이 판정하고, DB는 상태쌍만 한 번 더 막는다(CLAUDE.md §6 "전이표 밖 전이는 409").
create or replace function app.guard_deliverable_status()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'requested'          and new.status in ('draft','pending_approval')) or   -- v1.2 첫 업로드 / v2.4 파트너 첫 제출
    (old.status = 'draft'              and new.status = 'internal_review') or
    (old.status = 'internal_review'    and new.status in ('draft','pending_approval')) or
    (old.status = 'pending_approval'   and new.status in ('approved','changes_requested')) or
    (old.status = 'approved'           and new.status = 'final') or
    (old.status = 'changes_requested'  and new.status in ('draft','pending_approval'))      -- 재업로드 / v2.4 주최형 재제출
  ) then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: % -> %', old.status, new.status
      using errcode = 'P0409', hint = '설계서 §5 전이표 밖 전이';
  end if;
  return new;
end $$;

drop trigger if exists trg_deliverables_status_guard on deliverables;
create trigger trg_deliverables_status_guard before update of status on deliverables
  for each row execute function app.guard_deliverable_status();

-- 견적 잠금 (Configurator lock_finalized_estimate 승계 — §4-18): 확정본의 input·breakdown·total_amount 변경 거부
create or replace function app.guard_quote_lock()
returns trigger language plpgsql as $$
begin
  if old.is_final
     and (new.input is distinct from old.input
          or new.breakdown is distinct from old.breakdown
          or new.total_amount is distinct from old.total_amount) then
    raise exception 'QUOTE_LOCKED: 확정 견적은 수정할 수 없습니다 — 새 버전으로 저장하세요'
      using errcode = 'P0409';
  end if;
  return new;
end $$;

drop trigger if exists trg_quotes_lock on quotes;
create trigger trg_quotes_lock before update on quotes
  for each row execute function app.guard_quote_lock();

-- projects: created_by 기본값 = 현재 프로필, onboarded_at은 기록 후 불변(v1.4.1)
create or replace function app.projects_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := app.current_profile_id();
    end if;
    return new;
  end if;
  if old.onboarded_at is not null and new.onboarded_at is distinct from old.onboarded_at then
    raise exception 'ONBOARDED_AT_IMMUTABLE: 온보딩 완료 시각은 되돌릴 수 없습니다' using errcode = 'P0409';
  end if;
  return new;
end $$;

drop trigger if exists trg_projects_before_write on projects;
create trigger trg_projects_before_write before insert or update on projects
  for each row execute function app.projects_before_write();

-- projects: 생성자 = pm 자동 (§8 POST /projects). seed처럼 멤버가 함께 들어오는 경로는 on conflict로 무해
create or replace function app.projects_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'pm')
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_projects_after_insert on projects;
create trigger trg_projects_after_insert after insert on projects
  for each row execute function app.projects_after_insert();

-- versions.version_no 자동 증가 (§7.2) — 값을 주지 않으면 항목 내 max+1
create or replace function app.assign_version_no()
returns trigger language plpgsql as $$
begin
  if new.version_no is null then
    select coalesce(max(version_no), 0) + 1 into new.version_no
    from versions where deliverable_id = new.deliverable_id;
  end if;
  return new;
end $$;

alter table versions alter column version_no drop not null;
drop trigger if exists trg_versions_assign_no on versions;
create trigger trg_versions_assign_no before insert on versions
  for each row execute function app.assign_version_no();
-- 트리거가 채우므로 not null은 check로 보강(트리거 뒤에 평가된다)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'versions_version_no_present') then
    alter table versions add constraint versions_version_no_present check (version_no is not null);
  end if;
end $$;

-- 정산: has_cost=false 버킷(s5·rc·ld)에는 발주·실비를 넣을 수 없다 (§4-24 R-S4 — API 422의 DB 이중 차단)
create or replace function app.guard_settlement_item_cost()
returns trigger language plpgsql as $$
declare v_has_cost boolean;
begin
  select has_cost into v_has_cost from settlement_buckets where id = new.bucket_id;
  if v_has_cost is false and (new.ordered_amount is not null or new.actual_amount is not null) then
    raise exception 'SETTLEMENT_BUCKET_HAS_NO_COST: 원가 없는 버킷에는 발주·실비를 입력할 수 없습니다'
      using errcode = 'P0422';
  end if;
  return new;
end $$;

drop trigger if exists trg_settlement_items_cost_guard on settlement_items;
create trigger trg_settlement_items_cost_guard before insert or update on settlement_items
  for each row execute function app.guard_settlement_item_cost();

-- 종료 행사 쓰기 가드 (§4-24 R-S7 · §8 "closed면 쓰기 API 전부 409") — authenticated 경로만 막는다.
-- 서비스 경로(SQL 에디터·Edge Function secret)는 통과: seed가 종료 행사 데이터를 넣고, 관리 작업이 가능해야 한다.
-- tg_argv[0] = 행사 id를 찾는 방법: project | deliverable | board | partner | landing
create or replace function app.guard_project_writable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_project uuid;
  v_status project_status;
begin
  if app.is_service_path() then
    return coalesce(new, old);
  end if;
  v_row := to_jsonb(coalesce(new, old));
  case tg_argv[0]
    when 'project' then v_project := (v_row->>'project_id')::uuid;
    when 'deliverable' then select project_id into v_project from deliverables where id = (v_row->>'deliverable_id')::uuid;
    when 'board' then select project_id into v_project from settlement_boards where id = (v_row->>'board_id')::uuid;
    when 'partner' then select project_id into v_project from partners where id = (v_row->>'partner_id')::uuid;
    when 'landing' then select project_id into v_project from landing_pages where id = (v_row->>'landing_id')::uuid;
    else v_project := null;
  end case;
  if v_project is not null then
    select status into v_status from projects where id = v_project;
    if v_status = 'closed' then
      raise exception 'PROJECT_CLOSED: 종료된 행사는 수정할 수 없습니다' using errcode = 'P0409';
    end if;
  end if;
  return coalesce(new, old);
end $$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('deliverables','project'), ('milestones','project'), ('rsvp_contacts','project'), ('attendees','project'),
      ('program_sessions','project'), ('wbs_tasks','project'), ('role_charters','project'), ('compliance_cards','project'),
      ('landing_pages','project'), ('settlement_boards','project'), ('partner_tiers','project'), ('partners','project'),
      ('sheet_connections','project'), ('client_contacts','project'), ('client_tokens','project'), ('unregistered_files','project'),
      ('versions','deliverable'), ('approvals','deliverable'), ('comments','deliverable'), ('cues','deliverable'),
      ('scenario_blocks','deliverable'), ('guide_sections','deliverable'),
      ('settlement_buckets','board'), ('settlement_items','board'), ('settlement_imports','board'),
      ('partner_tokens','partner'), ('landing_daily_metrics','landing')
    ) as v(tbl, mode)
  loop
    execute format('drop trigger if exists trg_%I_closed_guard on %I', t.tbl, t.tbl);
    execute format(
      'create trigger trg_%I_closed_guard before insert or update or delete on %I for each row execute function app.guard_project_writable(%L)',
      t.tbl, t.tbl, t.mode);
  end loop;
end $$;

-- ── Auth 연결 (Supabase Auth의 auth.users — 로컬 검증은 test/local-shim.sql이 같은 표를 만든다) ──
-- (1) BEFORE INSERT: 허용 도메인(app_config.allowed_email_domains) 밖이면 가입 거부 — §12 "허용 도메인 화이트리스트"의 서버측 강제.
--     비어 있으면 전 도메인 허용. 프론트 로그인 화면은 VITE_AUTH_ALLOWED_DOMAINS로 같은 규칙을 먼저 안내한다.
create or replace function app.handle_auth_user_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_allowed text[];
  v_domain text;
begin
  select allowed_email_domains into v_allowed from app_config where id = 1;
  if v_allowed is not null and cardinality(v_allowed) > 0 and new.email is not null then
    v_domain := lower(split_part(new.email, '@', 2));
    if not (v_domain = any (v_allowed)) then
      raise exception 'AUTH_DOMAIN_NOT_ALLOWED: %', v_domain using errcode = 'P0403';
    end if;
  end if;
  return new;
end $$;

-- (2) AFTER INSERT: 이메일이 같은 프로필이 있으면 연결(주소록에 먼저 등록된 사람), 없으면 staff 프로필 생성.
--     그 이메일의 대기 초대는 accepted 처리.
create or replace function app.handle_auth_user_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_profile uuid;
begin
  if v_email = '' then
    return new;
  end if;
  update profiles set auth_user_id = new.id
  where lower(email) = v_email and auth_user_id is null
  returning id into v_profile;
  if v_profile is null then
    insert into profiles (auth_user_id, display_name, email)
    values (new.id,
            coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
            new.email)
    on conflict (auth_user_id) do nothing
    returning id into v_profile;
  end if;
  if v_profile is not null then
    update project_invites set accepted_at = now(), accepted_user_id = v_profile
    where lower(email) = v_email and accepted_at is null;
  end if;
  return new;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth')
     and exists (select 1 from pg_tables where schemaname = 'auth' and tablename = 'users') then
    if not exists (select 1 from pg_constraint where conname = 'fk_profiles_auth_user') then
      alter table profiles add constraint fk_profiles_auth_user
        foreign key (auth_user_id) references auth.users(id) on delete set null;
    end if;
    drop trigger if exists trg_auth_user_before on auth.users;
    create trigger trg_auth_user_before before insert on auth.users
      for each row execute function app.handle_auth_user_before();
    drop trigger if exists trg_auth_user_created on auth.users;
    create trigger trg_auth_user_created after insert on auth.users
      for each row execute function app.handle_auth_user_created();
  end if;
end $$;

-- 첫 admin 승격 (§18-2 · §20 T1 "SQL 1줄") — 프로필이 없으면 만들어 두고, 첫 로그인 때 이메일로 연결된다.
--   사용법: select app.promote_admin('you@company.com');
create or replace function app.promote_admin(p_email text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update profiles set app_role = 'admin' where lower(email) = lower(p_email) returning id into v_id;
  if v_id is null then
    insert into profiles (display_name, email, app_role)
    values (coalesce(p_display_name, split_part(p_email, '@', 1)), p_email, 'admin')
    returning id into v_id;
  end if;
  return v_id;
end $$;
