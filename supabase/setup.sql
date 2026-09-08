-- ═══════════════════════════════════════════════════════════════════════
-- MICE 커뮤니케이터 · Supabase setup.sql (생성물 — 직접 편집 금지)
-- 원본: supabase/migrations/ 17개 파일을 파일명 순으로 이어 붙였다.
-- 재생성: node scripts/supabase-build-setup.mjs
--
-- 사용법(설계서 §18-3 · §20 T1): 새 Supabase 프로젝트 → SQL Editor → 이 파일 전문을 붙여 넣고 Run 1회.
-- 멱등: 2회 실행해도 무해하다(scripts/supabase-local-check.mjs가 로컬 Postgres에서 증명).
-- 데모 데이터는 별도 supabase/seed.sql(선택 — 운영 프로젝트에는 실행하지 않아도 된다).
--
-- 첫 admin 승격(§18-2, 본인 이메일로 1회):
--   select app.promote_admin('you@company.com');
-- 허용 이메일 도메인 제한(선택, 비우면 전 도메인 허용):
--   update app_config set allowed_email_domains = array['company.com'] where id = 1;
-- ═══════════════════════════════════════════════════════════════════════
set client_min_messages to warning;
-- >>> 20260907000100_extensions_types.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0100 · 확장·열거형·앱 스키마 (설계서 v2.6 §4 열거형 + §4-19·§21.1·§23.1·§24.2·§25.5)
-- 멱등 규약: 모든 문장은 2회 실행해도 무해하다 (setup.sql 통합 실행 — §18-3, §8 DoD 7).
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- 앱 전용 스키마 — RLS 도우미·트리거 함수. PostgREST에 노출하지 않는다(public만 노출).
create schema if not exists app;

-- 열거형: 이미 있으면 건너뛴다 (create type은 if not exists가 없다)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_role') then
    create type member_role as enum ('pm','design','ops','reg');
  end if;
  if not exists (select 1 from pg_type where typname = 'deliverable_area') then
    create type deliverable_area as enum ('design','ops','common');
  end if;
  if not exists (select 1 from pg_type where typname = 'deliverable_status') then
    -- v1.2: requested = PM 지시 발행 상태 (산출물 없음)
    create type deliverable_status as enum
      ('requested','draft','internal_review','pending_approval','changes_requested','approved','final');
  end if;
  if not exists (select 1 from pg_type where typname = 'approval_decision') then
    create type approval_decision as enum ('approved','changes_requested');
  end if;
  if not exists (select 1 from pg_type where typname = 'invite_status') then
    create type invite_status as enum ('none','sent','accepted','declined');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendee_channel') then
    create type attendee_channel as enum ('rsvp','onsite','import');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type event_type as enum ('general','recruiting');          -- v1.3 일반형·모객형
  end if;
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type project_status as enum ('active','closed');           -- v1.5
  end if;
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('admin','sales','staff');           -- v2.0 전역 역할
  end if;
  if not exists (select 1 from pg_type where typname = 'quote_status') then
    create type quote_status as enum ('draft','proposed','accepted','archived','superseded'); -- v2.0
  end if;
  if not exists (select 1 from pg_type where typname = 'compliance_kind') then
    create type compliance_kind as enum ('internal','client');        -- v2.0
  end if;
  if not exists (select 1 from pg_type where typname = 'comment_visibility') then
    create type comment_visibility as enum ('internal','shared');     -- v1.1 C-1
  end if;
  if not exists (select 1 from pg_type where typname = 'wbs_status') then
    create type wbs_status as enum ('todo','doing','done');           -- v1.4
  end if;
  if not exists (select 1 from pg_type where typname = 'landing_status') then
    create type landing_status as enum ('draft','published','closed'); -- v2.1 §4-19
  end if;
  if not exists (select 1 from pg_type where typname = 'landing_submit_target') then
    create type landing_submit_target as enum ('registration','external'); -- v2.1 §4-19
  end if;
  if not exists (select 1 from pg_type where typname = 'event_format') then
    create type event_format as enum ('conference','dms','exhibition'); -- v2.6 §25
  end if;
end
$$;

-- 앱 전역 설정 — 단일 행. 허용 이메일 도메인(§12 "허용 도메인 화이트리스트")의 서버측 정본.
-- 비어 있으면 전 도메인 허용. 값 변경은 SQL 에디터(service role)에서만 — RLS 정책을 두지 않아
-- authenticated·anon은 읽기·쓰기 모두 불가하다.
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  allowed_email_domains text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into app_config (id) values (1) on conflict (id) do nothing;
-- <<< 20260907000100_extensions_types.sql

-- >>> 20260907000200_core.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0200 · 프로필·프로젝트·멤버·초대·발주처 연락처·토큰 (설계서 §4-1·§4-1b·§4-2·§4-2b·§4-3)
--
-- ★ 정본 정합 메모(Phase 4 — 설계서 §4-1b 개정 대상):
--   §4 DDL 요약은 profiles.id가 auth.users를 참조했지만, §4-2b 담당자 마스터(v2.7)는
--   "사람은 행사와 무관하게 존재하고 배정으로 행사에 붙는다"고 확정했다 — 로그인한 적 없는
--   사람도 주소록에 있고 행사에 배정된다. 그래서 profiles가 앱의 '사람' 정본이고,
--   auth.users와의 연결은 auth_user_id(null 허용)로 둔다. 첫 로그인 시 이메일로 자동 연결(0800 트리거).
--   §4의 `references auth.users` FK는 전부 profiles(id)를 가리킨다.
-- ─────────────────────────────────────────────────────────────────────

-- 1b. 프로필 = 담당자 마스터(주소록). 이메일이 신원 키(대소문자 무시, 중복 409 — §4-2b)
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                        -- auth.users.id — 로그인 전이면 null (FK는 0800에서 auth 스키마 존재 시 부여)
  display_name text not null,
  email text not null,
  app_role app_role not null default 'staff',      -- 승격은 service role(SQL) 경로만 — 0900 컬럼 권한
  title text,                                      -- 3.18.1 담당자 노출 계약 — 직함
  phone text,                                      -- 3.18.1 — 담당자 전화(마스킹 대상 아님)
  org text,                                        -- Phase 4 사용자 승인(2026-09-07, 3.19③) — 소속
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists title text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists org text;
create unique index if not exists profiles_email_uniq on profiles (lower(email));

-- 1. 프로젝트
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,                       -- 행사 약칭 (파일명 규약, 전역 유일)
  kind text not null default 'agency' check (kind in ('agency','host')),   -- v2.4 §21 성격 축
  event_date date,
  event_end_date date,
  start_time time,
  end_time time,
  expected_headcount int,
  seating text,
  organizer text,
  target_audience text,
  status project_status not null default 'active',
  closed_at timestamptz,
  -- v2.0 모객형 전용
  guarantee_pax int,
  kpi_show_rate numeric,
  targeting jsonb,
  quote_id uuid,                                   -- FK는 quotes 생성 후(0700) alter
  drive_root_folder_id text,
  slack_webhook_url text,
  event_type event_type not null default 'general',
  -- v2.6 §25 행사 유형 4분류 (format의 권한은 3가지뿐 — 상시 게이트는 kind·event_type·psa_enabled)
  format event_format not null default 'conference',
  psa_enabled boolean not null default false,
  audience_model text check (audience_model is null or audience_model in ('invite','open')),
  theme text,
  venue text,
  mc_name text,
  overview_items jsonb,
  onboarded_at timestamptz,                        -- v1.4.1 — null=미완료. 기록 후 불변(0800 트리거)
  -- v2.4.1 §21.1 주최형 안내
  partner_guide_url text,
  partner_contact_email text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- 2. 멤버·역할 (행사 단위 역할 — 같은 사람이 행사마다 다른 역할 가능)
create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null,
  primary key (project_id, user_id)
);
create index if not exists project_members_user on project_members (user_id);

-- 2b. 초대 이력 — Phase 4: addMember는 프로필을 즉시 멤버로 올리고(§4-2b 배정), 이 표는 초대 감사 이력이다.
--     accepted_at은 그 이메일의 첫 로그인(auth 연결) 시 트리거가 채운다.
create table if not exists project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  email text not null,
  display_name text not null,
  role member_role not null,
  invited_by uuid references profiles(id),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid references profiles(id)
);
create unique index if not exists project_invites_email_uniq on project_invites (project_id, lower(email));

-- 3. 발주처 연락처·토큰
create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  org text,
  email text,
  phone text                                       -- Phase 4 사용자 승인(2026-09-07, 3.19③)
);
alter table client_contacts add column if not exists phone text;

create table if not exists client_tokens (
  token uuid primary key default gen_random_uuid(),   -- URL에 그대로 사용 (/c/{token})
  project_id uuid not null references projects(id) on delete cascade,
  contact_id uuid references client_contacts(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists client_tokens_project on client_tokens (project_id);
-- <<< 20260907000200_core.sql

-- >>> 20260907000300_app_helpers.sql
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
-- <<< 20260907000300_app_helpers.sql

-- >>> 20260907000400_deliverables.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0400 · 산출물·버전·컨펌·코멘트·마일스톤·활동 로그·인박스 (설계서 §4-4 ~ §4-8, §4-11, §4-12, §21.1)
-- ─────────────────────────────────────────────────────────────────────

-- 4. 산출물 항목
create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  area deliverable_area not null,
  category text not null,                          -- '키비주얼'·'큐시트'·'시나리오'·'운영가이드' 등 자유+프리셋(정형 3종은 빌더)
  title text not null,
  status deliverable_status not null default 'draft',
  assignee_id uuid references profiles(id),
  due_date date,
  drive_folder_id text,
  requires_approval boolean not null default true,
  -- v1.2 지시서·스펙
  brief text,
  brief_refs jsonb,
  spec_size text,
  spec_qty int,
  spec_location text,
  spec_type text,
  content text,
  partner_id uuid,                                 -- v2.4 §21 inbound 제출물 소유 파트너 (FK는 1100에서)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deliverables_project on deliverables (project_id, area, status);
create index if not exists deliverables_assignee on deliverables (assignee_id);

-- 5. 버전
create table if not exists versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  version_no int not null,
  drive_file_id text not null,
  file_name text not null,
  note text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (deliverable_id, version_no)
);

-- 6. 컨펌 요청
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  version_id uuid references versions(id),
  requested_by uuid references profiles(id),       -- PM만 (앱+RLS)
  requested_at timestamptz not null default now(),
  due_at timestamptz,
  decided_at timestamptz,
  decision approval_decision,
  client_comment text,
  decided_via_token uuid references client_tokens(token) on delete set null
);
create index if not exists approvals_deliverable on approvals (deliverable_id, requested_at);
-- 행사 삭제(cascade)에서 client_tokens가 approvals·comments보다 먼저 지워질 수 있다(2026-09-07 dev 실측).
-- 토큰 참조는 감사 필드(회수는 revoked_at — 행 삭제가 아니다)라 삭제 시 null이 맞다. 기존 DB에도 같은 규칙을 적용한다.
alter table approvals drop constraint if exists approvals_decided_via_token_fkey;
alter table approvals add constraint approvals_decided_via_token_fkey
  foreign key (decided_via_token) references client_tokens(token) on delete set null;
-- comments.author_token은 아래 7. 표 생성 직후에 같은 방식으로 조정한다(작성자 없는 코멘트를 남길 수 없어 cascade)

-- 7. 코멘트 (v1.1 C-1: 내부/공유 가시성 분리)
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  author_user_id uuid references profiles(id),
  author_token uuid references client_tokens(token) on delete cascade,   -- 회수된 토큰 참조 유지 = 의도(회수는 삭제가 아니다). 토큰 행 삭제(행사 cascade)는 작성자 없는 코멘트를 남길 수 없어 cascade
  visibility comment_visibility not null default 'internal',
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_author_present check (author_user_id is not null or author_token is not null),
  constraint comments_client_shared check (author_token is null or visibility = 'shared')  -- 발주처 작성분은 shared 강제
);
create index if not exists comments_deliverable on comments (deliverable_id, created_at);
alter table comments drop constraint if exists comments_author_token_fkey;
alter table comments add constraint comments_author_token_fkey
  foreign key (author_token) references client_tokens(token) on delete cascade;

-- 8. 마일스톤
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  area deliverable_area,                           -- null = 전체
  due_date date not null,
  done boolean not null default false
);
create index if not exists milestones_project on milestones (project_id, due_date);

-- 11. 활동 로그 (알림 트리거 겸 감사)
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  actor text not null,                             -- 'user:{profile_id}' | 'client:{token}' | 'system'
  action text not null,
  target_type text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_project on activity_log (project_id, created_at desc);

-- 12. 미등록 파일 인박스
create table if not exists unregistered_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  drive_file_id text not null unique,
  file_name text,
  detected_folder text,
  detected_at timestamptz not null default now(),
  linked_deliverable_id uuid references deliverables(id),
  dismissed boolean not null default false
);
-- <<< 20260907000400_deliverables.sql

-- >>> 20260907000500_registration.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0500 · 등록 — RSVP·참관객·구글 시트 연결 (설계서 §4-9·§4-10·§24.2)
-- ─────────────────────────────────────────────────────────────────────

-- 9. 모객(RSVP)
create table if not exists rsvp_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  org text,
  title text,
  email text,
  phone text,
  group_tag text,
  invite_status invite_status not null default 'none',
  invited_at timestamptz,
  responded_at timestamptz,
  memo text
);
create unique index if not exists uq_rsvp_email on rsvp_contacts (project_id, lower(email)) where email is not null;

-- 10. 참관객 (+ v2.6 §24 시트 연동 확장 — 전부 nullable, 시트 연결 행사에서만 채워진다)
create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  rsvp_contact_id uuid references rsvp_contacts(id),
  name text not null,
  org text,
  email text,
  phone text,
  channel attendee_channel not null default 'import',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  badge_no text,
  sheet_row_id text,                               -- 원본 시트 행 식별자 — 있으면 '시트 소유' 행
  title text,                                      -- 시트 소유
  group_tag text,                                  -- 시트 소유
  sheet_status text check (sheet_status is null or sheet_status in ('applied','confirmed','cancelled','removed')),
  note text                                        -- 앱 소유 — 시트를 덮어쓰지 않는다(§24.1-3)
);
alter table attendees add column if not exists sheet_row_id text;
alter table attendees add column if not exists title text;
alter table attendees add column if not exists group_tag text;
alter table attendees add column if not exists sheet_status text;
alter table attendees add column if not exists note text;
create unique index if not exists uq_attendee_email on attendees (project_id, lower(email)) where email is not null;
create unique index if not exists uq_attendee_sheet_row on attendees (project_id, sheet_row_id) where sheet_row_id is not null;

-- §24.2 시트 연결 — 행사당 1개. 시트 → 앱 단방향(앱은 시트에 쓰지 않는다 §24.6).
-- mapping[].field: name|org|title|email|phone|group_tag|registered_at|sheet_status|null
--   (sheet_status는 Phase 4 사용자 승인 2026-09-07, 3.17③ — 신청 상태 컬럼도 매핑 대상)
create table if not exists sheet_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  state text not null check (state in ('disconnected','connected','stale','revoked')),
  title text,
  url text,
  tab_name text,
  mapping jsonb not null default '[]'::jsonb,
  connected_at timestamptz,
  connected_by text,
  snapshot_at timestamptz,
  snapshot_version int not null default 1,         -- 낙관적 잠금 키(§24.3 R-S1)
  checked_at timestamptz,
  auto_check_minutes int not null default 15,      -- 0이면 수동만(결정 B안)
  source_modified_at timestamptz,
  pending_added int not null default 0,
  pending_changed int not null default 0,
  pending_removed int not null default 0,
  failure_times jsonb not null default '[]'::jsonb,
  last_success_at timestamptz,
  first_row_is_header boolean not null default true  -- 위저드 입력(SheetConnectInput) — 재읽기(rows) 때 같은 해석을 쓴다
);
alter table sheet_connections add column if not exists first_row_is_header boolean not null default true;

-- §24 원본 시트 행 스냅숏 — Phase 4에서 Sheets API 읽기 결과를 서버가 여기에 적재하고(Edge Function),
-- 차이 계산(sheetSync)은 이 행 집합 ↔ attendees 비교로 이뤄진다(mock의 SheetSourceRow와 동형).
-- 실 Sheets 읽기 자격증명(서비스 계정)은 D-Day 주입 — 없으면 이 표는 비어 있고 상태는 disconnected다.
create table if not exists sheet_source_rows (
  project_id uuid not null references projects(id) on delete cascade,
  sheet_row_id text not null,
  row_number int,
  name text not null,
  org text,
  title text,
  email text,
  phone text,
  group_tag text,
  registered_at timestamptz not null default now(),
  status text not null default 'applied' check (status in ('applied','confirmed','cancelled','removed')),
  invalid_reason text check (invalid_reason is null or invalid_reason in ('no_email','duplicate_email','missing_required')),
  previously_confirmed boolean not null default false,
  fetched_at timestamptz not null default now(),
  primary key (project_id, sheet_row_id)
);
-- <<< 20260907000500_registration.sql

-- >>> 20260907000600_program_ops.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0600 · 프로그램표·큐시트·시나리오·운영가이드 (설계서 §4-13·§4-14·§23.1·§25.5)
-- ─────────────────────────────────────────────────────────────────────

-- 13. 프로그램 세션
create table if not exists program_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  section text,
  start_time time,
  end_time time,
  title text not null,
  speaker_name text,
  speaker_title text,
  speaker_org text,
  note text,
  track text,                                      -- v2.6 §25.4
  sort_order int not null default 0
);
alter table program_sessions add column if not exists track text;
create index if not exists program_sessions_project on program_sessions (project_id, sort_order);

-- 14. 큐시트 큐 (category='큐시트' 항목 귀속)
create table if not exists cues (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  cue_no text,
  time_at time,
  segment text,
  body text,
  console_audio text,
  console_light text,
  console_screen text,
  sort_order int not null default 0
);
create index if not exists cues_deliverable on cues (deliverable_id, sort_order);

-- §23.1 시나리오 블록 (category='시나리오' 항목에만)
create table if not exists scenario_blocks (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  session_id uuid references program_sessions(id) on delete set null,
  "time" text,                                     -- 'HH:MM' 문자열 (TS ScenarioBlock.time과 1:1)
  kind text not null check (kind in ('mc','video','protocol','transition','custom')),
  script text,
  note text,
  sort_order int not null default 0
);
create index if not exists scenario_blocks_deliverable on scenario_blocks (deliverable_id, sort_order);

-- §23.1 운영가이드 섹션 (category='운영가이드' 항목에만)
create table if not exists guide_sections (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  kind text not null check (kind in ('zone','role','emergency','contacts','custom')),
  title text not null,
  content text,
  source_ref text check (source_ref is null or source_ref in ('zone_items','role_charters')),
  source_stale boolean not null default false,
  sort_order int not null default 0
);
create index if not exists guide_sections_deliverable on guide_sections (deliverable_id, sort_order);
-- <<< 20260907000600_program_ops.sql

-- >>> 20260907000700_wbs_compliance.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0700 · WBS·R&R·컴플라이언스 (설계서 §4-15·§4-15b·§4-16·§4-17·§21.1)
-- ─────────────────────────────────────────────────────────────────────

-- 15. WBS 태스크 (유형별 템플릿을 온보딩 완료 시 event_date 기준 전개)
create table if not exists wbs_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  phase_no int not null,
  phase_name text not null,
  code text not null,
  title text not null,
  offset_start int not null,
  offset_end int not null,
  start_date date,
  end_date date,
  role member_role not null,
  origin_role text,
  status wbs_status not null default 'todo',
  done_at timestamptz,
  linked_deliverable_id uuid references deliverables(id) on delete set null,
  target text,                                     -- v2.0 §4-15b 소통 대상
  direction text not null default 'internal' check (direction in ('partner_submit','host_notice','internal')),  -- v2.4 §21
  partner_id uuid,                                 -- v2.4 §21 partner_submit 인스턴스만 (FK는 1100)
  note text,
  sort_order int not null default 0
);
alter table wbs_tasks add column if not exists target text;
alter table wbs_tasks add column if not exists direction text not null default 'internal';
alter table wbs_tasks add column if not exists partner_id uuid;
create index if not exists wbs_tasks_project on wbs_tasks (project_id, sort_order);
-- 재전개 매칭 키: code (+ partner_id — partner_submit 인스턴스). 지연·임박은 저장하지 않고 계산(src/lib/wbs.ts 정본)
create unique index if not exists uq_wbs_code_per_project
  on wbs_tasks (project_id, code, coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 16. 역할 헌장 R&R
create table if not exists role_charters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  role member_role not null,
  origin_role text,
  title text not null,
  items jsonb not null default '[]'::jsonb
);
create index if not exists role_charters_project on role_charters (project_id);

-- 17. 컴플라이언스 카드 (온보딩 시 시드)
create table if not exists compliance_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind compliance_kind not null,
  title text not null,
  items jsonb not null default '[]'::jsonb,       -- [{text, checked, checked_at}]
  sort_order int not null default 0
);
create index if not exists compliance_cards_project on compliance_cards (project_id, sort_order);
-- <<< 20260907000700_wbs_compliance.sql

-- >>> 20260907000800_quotes.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0800 · 견적·견적서 임포트 (설계서 §4-18·§21.1·§22) — 금액은 이 표들과 정산(1000)에만 있다
-- ─────────────────────────────────────────────────────────────────────

-- 18. 견적 (단가·베뉴·옵션 정의는 코드 상수 src/modules/quote — 서버도 같은 엔진으로 재계산)
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  title text not null,
  version int not null default 1,
  status quote_status not null default 'draft',
  is_final boolean not null default false,
  locked_at timestamptz,
  superseded_by uuid references quotes(id),
  input jsonb not null,
  breakdown jsonb not null,
  total_amount bigint not null,
  source text not null default 'engine' check (source in ('engine','imported')),   -- v2.4 §22
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table quotes add column if not exists source text not null default 'engine';
create unique index if not exists uq_quote_final_per_project on quotes (project_id) where is_final and project_id is not null;
create index if not exists quotes_project on quotes (project_id, created_at);

-- projects.quote_id → quotes (상호 링크, §16 핸드오프)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_projects_quote') then
    alter table projects add constraint fk_projects_quote foreign key (quote_id) references quotes(id) on delete set null;
  end if;
end
$$;

-- §22 견적서 임포트 — confirm을 거쳐야만 quotes가 생긴다(R-Q1). parsed·mapping 분리 보존(R-Q2)
create table if not exists quote_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  file_name text not null,
  format text not null check (format in ('A','B','C')),
  parsed jsonb not null,
  mapping jsonb not null default '[]'::jsonb,
  status text not null default 'detected' check (status in ('detected','confirmed','distributed')),
  quote_id uuid references quotes(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
-- <<< 20260907000800_quotes.sql

-- >>> 20260907000900_landing.sql
-- ─────────────────────────────────────────────────────────────────────
-- 0900 · 랜딩보드 (설계서 §4-19·§4-20·§4-21·§4-22)
-- ─────────────────────────────────────────────────────────────────────

-- 19. 랜딩 페이지 — 행사 종속(§4-21 R-L1). 섹션·폼·동의는 jsonb(mock과 1:1, 정규화는 2차)
create table if not exists landing_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  slug text not null,
  status landing_status not null default 'draft',
  public_url text,
  sticky_nav boolean not null default true,
  cta_label text not null default '참가 신청',
  submit_target landing_submit_target not null default 'registration',
  external_submit_url text,
  analytics jsonb not null default '{}'::jsonb,   -- {ga_measurement_id, gtm_container_id, conversion_event}
  sections jsonb not null default '[]'::jsonb,
  form_fields jsonb not null default '[]'::jsonb,
  consents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index if not exists uq_landing_slug on landing_pages (project_id, slug);   -- slug는 행사 안에서만 유일(R-L4)
create index if not exists ix_landing_project on landing_pages (project_id, updated_at desc);

-- 20. 일자별 유입 지표 — GA에서 당겨온 파생값(앱이 직접 계측하지 않는다). Phase 4는 적재 경로만 두고
--     실 GA Data API 동기화는 자격증명 주입 이후. 열 이름은 TS LandingDailyMetric과 1:1
--     (설계서 §4-20 요약의 pageviews·visitors·form_views·day를 TS 정본 date·views·unique_visitors·form_starts로 정합 — 개정 대상)
create table if not exists landing_daily_metrics (
  landing_id uuid not null references landing_pages(id) on delete cascade,
  date date not null,
  views int not null default 0,
  unique_visitors int not null default 0,
  form_starts int not null default 0,
  submits int not null default 0,
  primary key (landing_id, date)
);
-- <<< 20260907000900_landing.sql

-- >>> 20260907001000_settlement.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1000 · 정산보드 (설계서 §4-23 · 계약 §4-24 · §19) — 내부 한정, 토큰 경로 화이트리스트 금지(§19.7)
-- 순서: vendors → settlement_boards → settlement_buckets → settlement_imports → settlement_items
-- ─────────────────────────────────────────────────────────────────────

-- 협력사 마스터 (프로젝트 비종속)
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  biz_no text,
  note text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists vendors_name_uniq on vendors (name) where archived_at is null;

-- 정산 보드 (행사당 1개, 확정 견적 스냅숏)
create table if not exists settlement_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,   -- 보드는 스냅숏(R-S2) — 기준 견적이 지워져도 버킷·quote_version은 남는다
  quote_version int,
  baselined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table settlement_boards drop constraint if exists settlement_boards_quote_id_fkey;
alter table settlement_boards add constraint settlement_boards_quote_id_fkey
  foreign key (quote_id) references quotes(id) on delete set null;

-- 버킷 (기본 9 + 행사별 추가 — §19.2)
create table if not exists settlement_buckets (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references settlement_boards(id) on delete cascade,
  code text not null,
  label text not null,
  quote_amount bigint not null default 0,
  has_cost boolean not null default true,
  is_margin_base boolean not null default true,
  source text not null default 'quote' check (source in ('quote','custom')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists settlement_buckets_code_uniq on settlement_buckets (board_id, code);

-- 협력사 견적서 업로드 (Phase 4.7 — 스키마만)
create table if not exists settlement_imports (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references settlement_boards(id) on delete cascade,
  file_name text not null,
  drive_file_id text,
  vendor_id uuid references vendors(id),
  parsed jsonb,
  questions jsonb,
  status text not null default 'parsed' check (status in ('parsed','confirmed','discarded')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- 항목 (발주 단위 = 견적 항목 단위 — §19.3). 금액은 전부 부가세 별도(R-S3)
create table if not exists settlement_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references settlement_boards(id) on delete cascade,
  bucket_id uuid not null references settlement_buckets(id) on delete cascade,
  title text not null,
  spec text,
  vendor_id uuid references vendors(id),
  assignee_id uuid references profiles(id),
  ordered_amount bigint,
  actual_amount bigint,
  input_amount_raw bigint,
  vat_included_input boolean not null default false,
  status text not null default 'planned' check (status in ('planned','ordered','settled','cancelled')),
  evidence text,
  import_id uuid references settlement_imports(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists settlement_items_bucket on settlement_items (bucket_id);
-- <<< 20260907001000_settlement.sql

-- >>> 20260907001100_partners.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1100 · 주최형(파트너) 확장 (설계서 §21.1 · §25.5 부스·판매 상품)
-- partner_tiers.price · partners.contract_amount는 내부 전용 금액 키 — 외부 경로(/c·/p·랜딩·S9·알림) 직렬화 금지(§19.7 확장)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists partner_tiers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  capacity int,
  sort int not null default 0,
  -- v2.6 §25.4 판매 상품 정의
  session_slots int not null default 0,
  booth_included boolean not null default false,
  staff_cap int,
  price bigint,                                    -- ★ 내부 전용
  unique (project_id, code)
);
alter table partner_tiers add column if not exists session_slots int not null default 0;
alter table partner_tiers add column if not exists booth_included boolean not null default false;
alter table partner_tiers add column if not exists staff_cap int;
alter table partner_tiers add column if not exists price bigint;

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  tier_id uuid references partner_tiers(id) on delete set null,
  status text not null default 'active' check (status in ('active','withdrawn')),
  contract_amount bigint,                          -- ★ 내부 전용
  note text,
  -- v2.6 §25.4 부스 필드 그룹
  booth_no text,
  booth_size text,
  booth_power text,
  booth_internet boolean,
  created_at timestamptz not null default now()
);
alter table partners add column if not exists booth_no text;
alter table partners add column if not exists booth_size text;
alter table partners add column if not exists booth_power text;
alter table partners add column if not exists booth_internet boolean;
create index if not exists partners_project on partners (project_id);

-- client_tokens와 동형(연락처 단위) — /p/{token}
create table if not exists partner_tokens (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  contact_name text not null,
  contact_email text not null,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- 선행 표의 partner_id FK (deliverables·wbs_tasks는 partners보다 먼저 만들어진다)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_deliverables_partner') then
    alter table deliverables add constraint fk_deliverables_partner foreign key (partner_id) references partners(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_wbs_tasks_partner') then
    alter table wbs_tasks add constraint fk_wbs_tasks_partner foreign key (partner_id) references partners(id) on delete cascade;
  end if;
end
$$;
-- <<< 20260907001100_partners.sql

-- >>> 20260907001200_psa_reserved.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1200 · PSA(비즈매칭) 3테이블 — 설계만(§25.5, 3.18c 미착수). DataProvider 메서드 0건.
-- 스키마 예약: 첫 실전 전 확정 게이트(§25.7)까지 UI·API가 이 표를 건드리지 않는다.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists psa_slots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  table_no text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

create table if not exists psa_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,   -- §4-10 실존 엔티티 FK(감수 M2)
  partner_id uuid not null references partners(id) on delete cascade,
  topic text,
  status text not null default 'requested' check (status in ('requested','matched','declined'))
);

create table if not exists psa_meetings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid references psa_slots(id) on delete cascade,
  request_id uuid references psa_requests(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','done','noshow')),
  note text
);
-- <<< 20260907001200_psa_reserved.sql

-- >>> 20260907001300_triggers.sql
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
-- <<< 20260907001300_triggers.sql

-- >>> 20260907001400_rls.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1400 · RLS (설계서 §6.2 전체) — 정책은 drop if exists → create 로 멱등.
-- 원칙: authenticated는 멤버인 행사만 / anon은 정책 0건(토큰 경로는 Edge Function secret key 화이트리스트) /
--       service_role은 RLS 우회. 견적·정산·파트너 금액 표는 §19.7 대로 토큰 화이트리스트 밖.
-- ─────────────────────────────────────────────────────────────────────

-- 부모 표 경유 행사 판정 도우미 (security definer — 부모 표 RLS와 재귀하지 않는다)
create or replace function app.deliverable_project(p_deliverable uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from deliverables where id = p_deliverable
$$;
create or replace function app.deliverable_area(p_deliverable uuid)
returns deliverable_area language sql stable security definer set search_path = public as $$
  select area from deliverables where id = p_deliverable
$$;
create or replace function app.board_project(p_board uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from settlement_boards where id = p_board
$$;
create or replace function app.partner_project(p_partner uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from partners where id = p_partner
$$;
create or replace function app.landing_project(p_landing uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from landing_pages where id = p_landing
$$;

-- 모든 표 RLS 활성 (정책 없는 표 = 서비스 경로만)
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','profiles','projects','project_members','project_invites','client_contacts','client_tokens',
    'deliverables','versions','approvals','comments','milestones','activity_log','unregistered_files',
    'rsvp_contacts','attendees','sheet_connections','sheet_source_rows',
    'program_sessions','cues','scenario_blocks','guide_sections','wbs_tasks','role_charters','compliance_cards',
    'quotes','quote_imports','landing_pages','landing_daily_metrics',
    'vendors','settlement_boards','settlement_buckets','settlement_imports','settlement_items',
    'partner_tiers','partners','partner_tokens','psa_slots','psa_requests','psa_meetings'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ── profiles = 주소록 (§4-2b: 목록 조회 멤버 전원 → 로그인 사용자 전원 / 등록·수정·삭제 pm) ──
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert to authenticated with check (app.is_any_pm());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (app.is_any_pm() or auth_user_id = auth.uid())
  with check (app.is_any_pm() or auth_user_id = auth.uid());
-- 삭제: 배정이 남아 있으면 409(§4-2b) — 배정 잔존 판정은 provider가 하고, DB는 FK(project_members.user_id on delete cascade)를
-- 믿지 않기 위해 여기서 한 번 더 막는다: 배정 있는 프로필은 삭제 불가
drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete to authenticated
  using (app.is_any_pm() and auth_user_id is distinct from auth.uid()
         and not exists (select 1 from project_members m where m.user_id = profiles.id));

-- ── projects ──
-- 생성자는 항상 자기 행사를 본다: insert … returning은 AFTER 트리거(생성자=pm 멤버십)보다 먼저 select 정책을
-- 평가하므로 멤버십만 보면 생성 직후 "row-level security" 오류가 난다(로컬 실증 2026-09-07)
drop policy if exists projects_select on projects;
create policy projects_select on projects for select to authenticated
  using (app.is_member(id) or created_by = app.current_profile_id());
drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert to authenticated
  with check (created_by is null or created_by = app.current_profile_id());
drop policy if exists projects_update on projects;
create policy projects_update on projects for update to authenticated
  using (app.is_pm(id)) with check (app.is_pm(id));

-- ── project_members (배정) — 조회는 로그인 전원(주소록 배정 현황·행사명은 RPC가 붙인다), 쓰기는 그 행사 pm ──
drop policy if exists project_members_select on project_members;
create policy project_members_select on project_members for select to authenticated using (true);
drop policy if exists project_members_insert on project_members;
create policy project_members_insert on project_members for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists project_members_update on project_members;
create policy project_members_update on project_members for update to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists project_members_delete on project_members;
create policy project_members_delete on project_members for delete to authenticated using (app.is_pm(project_id));

-- ── project_invites ──
drop policy if exists project_invites_all on project_invites;
create policy project_invites_all on project_invites for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));

-- ── client_contacts · client_tokens (열람 멤버 / 쓰기 pm) ──
drop policy if exists client_contacts_select on client_contacts;
create policy client_contacts_select on client_contacts for select to authenticated using (app.is_member(project_id));
drop policy if exists client_contacts_write on client_contacts;
create policy client_contacts_write on client_contacts for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists client_tokens_select on client_tokens;
create policy client_tokens_select on client_tokens for select to authenticated using (app.is_member(project_id));
drop policy if exists client_tokens_insert on client_tokens;
create policy client_tokens_insert on client_tokens for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists client_tokens_update on client_tokens;
create policy client_tokens_update on client_tokens for update to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));

-- ── deliverables (열람 멤버 / 생성·수정 역할-영역 일치 또는 pm / 삭제 pm) ──
drop policy if exists deliverables_select on deliverables;
create policy deliverables_select on deliverables for select to authenticated using (app.is_member(project_id));
drop policy if exists deliverables_insert on deliverables;
create policy deliverables_insert on deliverables for insert to authenticated with check (app.can_write_area(project_id, area));
drop policy if exists deliverables_update on deliverables;
create policy deliverables_update on deliverables for update to authenticated
  using (app.can_write_area(project_id, area)) with check (app.can_write_area(project_id, area));
drop policy if exists deliverables_delete on deliverables;
create policy deliverables_delete on deliverables for delete to authenticated using (app.is_pm(project_id));

-- ── versions ──
drop policy if exists versions_select on versions;
create policy versions_select on versions for select to authenticated
  using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists versions_insert on versions;
create policy versions_insert on versions for insert to authenticated
  with check (app.can_write_area(app.deliverable_project(deliverable_id), app.deliverable_area(deliverable_id)));

-- ── approvals (생성 pm — 컨펌 발송 / 결정 갱신 = 발주처 토큰 경로(서비스) 또는 내부 검토자(파트너 제출)) ──
drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals for select to authenticated
  using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals for insert to authenticated
  with check (app.is_pm(app.deliverable_project(deliverable_id)));
drop policy if exists approvals_update on approvals;
create policy approvals_update on approvals for update to authenticated
  using (app.can_write_area(app.deliverable_project(deliverable_id), app.deliverable_area(deliverable_id)))
  with check (app.can_write_area(app.deliverable_project(deliverable_id), app.deliverable_area(deliverable_id)));

-- ── comments (내부 작성 = 멤버, 작성자는 본인 / 발주처 작성은 토큰 경로) ──
drop policy if exists comments_select on comments;
create policy comments_select on comments for select to authenticated
  using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert to authenticated
  with check (app.is_member(app.deliverable_project(deliverable_id))
              and author_user_id = app.current_profile_id() and author_token is null);

-- ── milestones (열람 멤버 / 편집 pm·design·ops) ──
drop policy if exists milestones_select on milestones;
create policy milestones_select on milestones for select to authenticated using (app.is_member(project_id));
drop policy if exists milestones_write on milestones;
create policy milestones_write on milestones for all to authenticated
  using (app.has_role(project_id, 'pm','design','ops')) with check (app.has_role(project_id, 'pm','design','ops'));

-- ── activity_log (멤버 열람·기록. actor는 앱이 채운다) ──
drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log for select to authenticated using (app.is_member(project_id));
drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log for insert to authenticated with check (app.is_member(project_id));

-- ── unregistered_files (인박스 — 열람·연결·무시 멤버, 감지 insert는 서비스) ──
drop policy if exists unregistered_files_select on unregistered_files;
create policy unregistered_files_select on unregistered_files for select to authenticated using (app.is_member(project_id));
drop policy if exists unregistered_files_update on unregistered_files;
create policy unregistered_files_update on unregistered_files for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));

-- ── 등록: rsvp_contacts·attendees (열람 멤버 / CRUD pm·reg / 체크인 pm·ops·reg) ──
drop policy if exists rsvp_contacts_select on rsvp_contacts;
create policy rsvp_contacts_select on rsvp_contacts for select to authenticated using (app.is_member(project_id));
drop policy if exists rsvp_contacts_write on rsvp_contacts;
create policy rsvp_contacts_write on rsvp_contacts for all to authenticated
  using (app.has_role(project_id, 'pm','reg')) with check (app.has_role(project_id, 'pm','reg'));
drop policy if exists attendees_select on attendees;
create policy attendees_select on attendees for select to authenticated using (app.is_member(project_id));
drop policy if exists attendees_insert on attendees;
create policy attendees_insert on attendees for insert to authenticated with check (app.has_role(project_id, 'pm','reg'));
drop policy if exists attendees_update on attendees;
create policy attendees_update on attendees for update to authenticated
  using (app.has_role(project_id, 'pm','ops','reg')) with check (app.has_role(project_id, 'pm','ops','reg'));
drop policy if exists attendees_delete on attendees;
create policy attendees_delete on attendees for delete to authenticated using (app.has_role(project_id, 'pm','reg'));

-- ── sheet_connections (§24.4 connect·disconnect·reauthorize·apply = pm·reg / 열람 멤버) ──
drop policy if exists sheet_connections_select on sheet_connections;
create policy sheet_connections_select on sheet_connections for select to authenticated using (app.is_member(project_id));
drop policy if exists sheet_connections_write on sheet_connections;
create policy sheet_connections_write on sheet_connections for all to authenticated
  using (app.has_role(project_id, 'pm','reg')) with check (app.has_role(project_id, 'pm','reg'));
-- sheet_source_rows: 원본 행은 서버(Edge Function)가 적재한다 — 멤버는 열람만
drop policy if exists sheet_source_rows_select on sheet_source_rows;
create policy sheet_source_rows_select on sheet_source_rows for select to authenticated using (app.is_member(project_id));

-- ── 프로그램표·큐시트·시나리오·운영가이드 (열람 멤버 / 쓰기 pm·ops) ──
drop policy if exists program_sessions_select on program_sessions;
create policy program_sessions_select on program_sessions for select to authenticated using (app.is_member(project_id));
drop policy if exists program_sessions_write on program_sessions;
create policy program_sessions_write on program_sessions for all to authenticated
  using (app.has_role(project_id, 'pm','ops')) with check (app.has_role(project_id, 'pm','ops'));
drop policy if exists cues_select on cues;
create policy cues_select on cues for select to authenticated using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists cues_write on cues;
create policy cues_write on cues for all to authenticated
  using (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'))
  with check (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'));
drop policy if exists scenario_blocks_select on scenario_blocks;
create policy scenario_blocks_select on scenario_blocks for select to authenticated using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists scenario_blocks_write on scenario_blocks;
create policy scenario_blocks_write on scenario_blocks for all to authenticated
  using (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'))
  with check (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'));
drop policy if exists guide_sections_select on guide_sections;
create policy guide_sections_select on guide_sections for select to authenticated using (app.is_member(app.deliverable_project(deliverable_id)));
drop policy if exists guide_sections_write on guide_sections;
create policy guide_sections_write on guide_sections for all to authenticated
  using (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'))
  with check (app.has_role(app.deliverable_project(deliverable_id), 'pm','ops'));

-- ── WBS (열람 멤버 / status는 담당 역할+pm → 앱 계층, DB는 멤버 update 허용 / 전개·삭제 pm) ──
drop policy if exists wbs_tasks_select on wbs_tasks;
create policy wbs_tasks_select on wbs_tasks for select to authenticated using (app.is_member(project_id));
drop policy if exists wbs_tasks_insert on wbs_tasks;
create policy wbs_tasks_insert on wbs_tasks for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists wbs_tasks_update on wbs_tasks;
create policy wbs_tasks_update on wbs_tasks for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists wbs_tasks_delete on wbs_tasks;
create policy wbs_tasks_delete on wbs_tasks for delete to authenticated using (app.is_pm(project_id));

-- ── R&R · 컴플라이언스 (열람 멤버 / 시드 pm / 체크 멤버) ──
drop policy if exists role_charters_select on role_charters;
create policy role_charters_select on role_charters for select to authenticated using (app.is_member(project_id));
drop policy if exists role_charters_write on role_charters;
create policy role_charters_write on role_charters for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists compliance_cards_select on compliance_cards;
create policy compliance_cards_select on compliance_cards for select to authenticated using (app.is_member(project_id));
drop policy if exists compliance_cards_insert on compliance_cards;
create policy compliance_cards_insert on compliance_cards for insert to authenticated with check (app.is_pm(project_id));
drop policy if exists compliance_cards_update on compliance_cards;
create policy compliance_cards_update on compliance_cards for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));

-- ── quotes (§6.2 v2.0): select = admin·sales OR 연결 행사 pm / insert·update = admin·sales ──
drop policy if exists quotes_select on quotes;
create policy quotes_select on quotes for select to authenticated
  using (app.is_quote_user() or (project_id is not null and app.is_pm(project_id)));
drop policy if exists quotes_insert on quotes;
create policy quotes_insert on quotes for insert to authenticated with check (app.is_quote_user());
drop policy if exists quotes_update on quotes;
create policy quotes_update on quotes for update to authenticated
  using (app.is_quote_user()) with check (app.is_quote_user());
drop policy if exists quote_imports_all on quote_imports;
create policy quote_imports_all on quote_imports for all to authenticated
  using (app.is_quote_user()) with check (app.is_quote_user());

-- ── 랜딩 (열람·수정 멤버 / 삭제 pm / 지표는 서비스 적재·멤버 열람) ──
drop policy if exists landing_pages_select on landing_pages;
create policy landing_pages_select on landing_pages for select to authenticated using (app.is_member(project_id));
drop policy if exists landing_pages_insert on landing_pages;
create policy landing_pages_insert on landing_pages for insert to authenticated with check (app.is_member(project_id));
drop policy if exists landing_pages_update on landing_pages;
create policy landing_pages_update on landing_pages for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists landing_pages_delete on landing_pages;
create policy landing_pages_delete on landing_pages for delete to authenticated using (app.is_pm(project_id));
drop policy if exists landing_daily_metrics_select on landing_daily_metrics;
create policy landing_daily_metrics_select on landing_daily_metrics for select to authenticated
  using (app.is_member(app.landing_project(landing_id)));

-- ── 정산 (§6.2 v2.2): select 멤버 / 보드·버킷·기준 갱신 pm / 항목 금액 pm 또는 assignee ──
drop policy if exists vendors_select on vendors;
create policy vendors_select on vendors for select to authenticated using (true);
drop policy if exists vendors_insert on vendors;
create policy vendors_insert on vendors for insert to authenticated with check (true);
drop policy if exists vendors_update on vendors;
create policy vendors_update on vendors for update to authenticated using (true) with check (true);
drop policy if exists settlement_boards_select on settlement_boards;
create policy settlement_boards_select on settlement_boards for select to authenticated using (app.is_member(project_id));
drop policy if exists settlement_boards_write on settlement_boards;
create policy settlement_boards_write on settlement_boards for all to authenticated
  using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists settlement_buckets_select on settlement_buckets;
create policy settlement_buckets_select on settlement_buckets for select to authenticated using (app.is_member(app.board_project(board_id)));
drop policy if exists settlement_buckets_write on settlement_buckets;
create policy settlement_buckets_write on settlement_buckets for all to authenticated
  using (app.is_pm(app.board_project(board_id))) with check (app.is_pm(app.board_project(board_id)));
drop policy if exists settlement_imports_select on settlement_imports;
create policy settlement_imports_select on settlement_imports for select to authenticated using (app.is_member(app.board_project(board_id)));
drop policy if exists settlement_imports_write on settlement_imports;
create policy settlement_imports_write on settlement_imports for all to authenticated
  using (app.is_pm(app.board_project(board_id))) with check (app.is_pm(app.board_project(board_id)));
drop policy if exists settlement_items_select on settlement_items;
create policy settlement_items_select on settlement_items for select to authenticated using (app.is_member(app.board_project(board_id)));
drop policy if exists settlement_items_insert on settlement_items;
create policy settlement_items_insert on settlement_items for insert to authenticated with check (app.is_pm(app.board_project(board_id)));
drop policy if exists settlement_items_update on settlement_items;
create policy settlement_items_update on settlement_items for update to authenticated
  using (app.is_pm(app.board_project(board_id)) or assignee_id = app.current_profile_id())
  with check (app.is_pm(app.board_project(board_id)) or assignee_id = app.current_profile_id());
-- 삭제도 금액 입력과 같은 범위(pm 또는 담당 본인) — mock assertItemWritable과 1:1
drop policy if exists settlement_items_delete on settlement_items;
create policy settlement_items_delete on settlement_items for delete to authenticated
  using (app.is_pm(app.board_project(board_id)) or assignee_id = app.current_profile_id());

-- ── 파트너 (§6.2 v2.4): select·insert·update 멤버 / 삭제 pm / 토큰 발급·회수 pm ──
drop policy if exists partner_tiers_select on partner_tiers;
create policy partner_tiers_select on partner_tiers for select to authenticated using (app.is_member(project_id));
drop policy if exists partner_tiers_insert on partner_tiers;
create policy partner_tiers_insert on partner_tiers for insert to authenticated with check (app.is_member(project_id));
drop policy if exists partner_tiers_update on partner_tiers;
create policy partner_tiers_update on partner_tiers for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists partner_tiers_delete on partner_tiers;
create policy partner_tiers_delete on partner_tiers for delete to authenticated using (app.is_pm(project_id));
drop policy if exists partners_select on partners;
create policy partners_select on partners for select to authenticated using (app.is_member(project_id));
drop policy if exists partners_insert on partners;
create policy partners_insert on partners for insert to authenticated with check (app.is_member(project_id));
drop policy if exists partners_update on partners;
create policy partners_update on partners for update to authenticated
  using (app.is_member(project_id)) with check (app.is_member(project_id));
drop policy if exists partners_delete on partners;
create policy partners_delete on partners for delete to authenticated using (app.is_pm(project_id));
drop policy if exists partner_tokens_select on partner_tokens;
create policy partner_tokens_select on partner_tokens for select to authenticated using (app.is_member(app.partner_project(partner_id)));
drop policy if exists partner_tokens_insert on partner_tokens;
create policy partner_tokens_insert on partner_tokens for insert to authenticated with check (app.is_pm(app.partner_project(partner_id)));
drop policy if exists partner_tokens_update on partner_tokens;
create policy partner_tokens_update on partner_tokens for update to authenticated
  using (app.is_pm(app.partner_project(partner_id))) with check (app.is_pm(app.partner_project(partner_id)));

-- ── PSA 예약 (열람 멤버 / 쓰기 pm — 3.18c 착수 시 재검토) ──
drop policy if exists psa_slots_select on psa_slots;
create policy psa_slots_select on psa_slots for select to authenticated using (app.is_member(project_id));
drop policy if exists psa_slots_write on psa_slots;
create policy psa_slots_write on psa_slots for all to authenticated using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists psa_requests_select on psa_requests;
create policy psa_requests_select on psa_requests for select to authenticated using (app.is_member(project_id));
drop policy if exists psa_requests_write on psa_requests;
create policy psa_requests_write on psa_requests for all to authenticated using (app.is_pm(project_id)) with check (app.is_pm(project_id));
drop policy if exists psa_meetings_select on psa_meetings;
create policy psa_meetings_select on psa_meetings for select to authenticated
  using (exists (select 1 from psa_slots s where s.id = psa_meetings.slot_id and app.is_member(s.project_id)));
-- <<< 20260907001400_rls.sql

-- >>> 20260907001500_grants.sql
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
-- <<< 20260907001500_grants.sql

-- >>> 20260907001600_rpc_core.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1600 · RPC(내부 로그인 경로) — 한 트랜잭션이어야 하는 다단계 쓰기를 SQL 함수로 묶는다.
-- 전부 security invoker(RLS 적용)다. 예외(list_people·remove_person·delete_project)는 각각 주소록이 행사 경계를
-- 넘고, 행사 삭제가 행사 스코프 표 전부를 가로지르기 때문이며 사유는 각 본문에 적었다.
-- 오류 규약: raise exception 'CODE: 메시지' + errcode P04xx → 프론트 mapPgError가 ProviderError로 옮긴다.
-- PostgREST 기본은 함수 실행 권한이 PUBLIC이라, 여기서 만드는 함수는 전부 public에서 걷고 필요한 롤에만 준다.
-- ─────────────────────────────────────────────────────────────────────

-- 공용: 현재 사용자가 그 행사의 pm이 아니면 403
create or replace function app.require_pm(p_project uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not app.is_pm(p_project) then raise exception 'FORBIDDEN: PM 전용 기능입니다.' using errcode = 'P0403'; end if;
  return v_me;
end $$;

create or replace function app.require_roles(p_project uuid, p_message text, variadic p_roles member_role[])
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not (app.member_role(p_project) = any (p_roles)) then raise exception 'FORBIDDEN: %', p_message using errcode = 'P0403'; end if;
  return v_me;
end $$;

create or replace function app.require_writable(p_project uuid)
returns projects language plpgsql stable security definer set search_path = public as $$
declare v_project projects;
begin
  select * into v_project from projects where id = p_project;
  if v_project.id is null then raise exception 'NOT_FOUND: 프로젝트를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_project.status = 'closed' then
    raise exception 'CONFLICT: 종료된 행사입니다 — 재개(pm) 후 수정할 수 있습니다.' using errcode = 'P0409';
  end if;
  return v_project;
end $$;

create or replace function app.write_log(p_project uuid, p_actor text, p_action text, p_target_type text, p_target_id uuid, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into activity_log (project_id, actor, action, target_type, target_id, meta)
  values (p_project, p_actor, p_action, p_target_type, p_target_id, p_meta)
$$;

-- approved → final + 연결 WBS 자동 done (§5 system 전이 · §4-15). 발주처 결정·파트너 검토 양쪽이 쓴다.
create or replace function app.finalize_deliverable(p_deliverable uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; t record;
begin
  update deliverables set status = 'final' where id = p_deliverable and status = 'approved' returning project_id into v_project;
  if v_project is null then
    raise exception 'CONFLICT: approved 상태의 항목만 확정할 수 있습니다.' using errcode = 'P0409';
  end if;
  perform app.write_log(v_project, 'system', 'deliverable.finalized', 'deliverable', p_deliverable);
  for t in update wbs_tasks set status = 'done', done_at = now()
           where linked_deliverable_id = p_deliverable and status <> 'done' returning id
  loop
    perform app.write_log(v_project, 'system', 'wbs.auto_done', 'wbs_task', t.id, jsonb_build_object('deliverable_id', p_deliverable));
  end loop;
end $$;

-- ── 주소록 (§4-2b) ─────────────────────────────────────────────────
-- 목록: 사람 + 배정 현황(행사명 포함). 행사명은 그 사람이 올라간 행사라 호출자가 멤버가 아닐 수 있어
-- security definer로 읽는다 — 노출되는 것은 행사명·역할뿐(금액·명단 아님).
create or replace function public.list_people()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'email', p.email, 'title', p.title, 'phone', p.phone, 'org', p.org,
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('project_id', m.project_id, 'project_name', pr.name, 'role', m.role) order by pr.created_at)
      from project_members m join projects pr on pr.id = m.project_id where m.user_id = p.id), '[]'::jsonb)
  ) order by p.display_name), '[]'::jsonb)
  from profiles p
  where auth.uid() is not null
$$;
revoke execute on function public.list_people() from public, anon;
grant execute on function public.list_people() to authenticated;

-- 담당자 배정(§8 POST /projects/{id}/members) — 프로필을 이메일로 찾거나 만들고 멤버로 올린다. 초대 이력도 남긴다.
create or replace function public.add_member(p_project uuid, p_display_name text, p_email text, p_role member_role, p_title text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_email text; v_name text; v_profile profiles; v_project projects;
begin
  v_me := app.require_pm(p_project);
  v_project := app.require_writable(p_project);
  v_name := trim(coalesce(p_display_name, '')); v_email := lower(trim(coalesce(p_email, '')));
  if v_name = '' or v_email = '' then raise exception 'VALIDATION: 이름과 이메일은 필수입니다.' using errcode = 'P0422'; end if;
  select * into v_profile from profiles where lower(email) = v_email;
  if v_profile.id is not null and exists (select 1 from project_members where project_id = p_project and user_id = v_profile.id) then
    raise exception 'CONFLICT: 이미 이 행사의 담당자입니다.' using errcode = 'P0409';
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
revoke execute on function public.add_member(uuid, text, text, member_role, text, text) from public, anon;
grant execute on function public.add_member(uuid, text, text, member_role, text, text) to authenticated;

-- 담당자 제거 — 마지막 PM은 409(§4-2)
create or replace function public.remove_member(p_project uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_role member_role;
begin
  v_me := app.require_pm(p_project);
  perform app.require_writable(p_project);
  select role into v_role from project_members where project_id = p_project and user_id = p_member;
  if v_role is null then raise exception 'NOT_FOUND: 담당자를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_role = 'pm' and (select count(*) from project_members where project_id = p_project and role = 'pm') <= 1 then
    raise exception 'CONFLICT: 마지막 PM은 삭제할 수 없습니다 — 먼저 다른 PM을 지정하세요.' using errcode = 'P0409';
  end if;
  delete from project_members where project_id = p_project and user_id = p_member;
  perform app.write_log(p_project, 'user:' || v_me, 'member.removed', 'project', p_project, jsonb_build_object('user_id', p_member));
end $$;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- 주소록 삭제 — 배정이 하나라도 있으면 409(사유에 행사명), 본인 삭제 409(§4-2b)
create or replace function public.remove_person(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_names text;
begin
  v_me := app.current_profile_id();
  if v_me is null or not app.is_any_pm() then raise exception 'FORBIDDEN: PM 전용 기능입니다.' using errcode = 'P0403'; end if;
  if not exists (select 1 from profiles where id = p_id) then raise exception 'NOT_FOUND: 담당자를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  select string_agg(coalesce(pr.name, m.project_id::text), ' · ' order by pr.created_at) into v_names
  from project_members m left join projects pr on pr.id = m.project_id where m.user_id = p_id;
  if v_names is not null then
    raise exception 'CONFLICT: 배정된 행사가 있어 삭제할 수 없습니다 — %. 각 행사의 담당자에서 먼저 빼주세요.', v_names using errcode = 'P0409';
  end if;
  if p_id = v_me then raise exception 'CONFLICT: 지금 로그인한 본인은 삭제할 수 없습니다.' using errcode = 'P0409'; end if;
  delete from profiles where id = p_id;
end $$;
revoke execute on function public.remove_person(uuid) from public, anon;
grant execute on function public.remove_person(uuid) to authenticated;

-- ── 행사 하드 삭제 (§4-1c · §8 DELETE /projects/{id}) ───────────────
-- security definer인 이유(파일 머리말의 세 번째 예외): ① 삭제가 행사 스코프 표 전부(멤버·항목·버전·컨펌·
-- 코멘트·일정·등록·랜딩·정산·파트너·시나리오/가이드/큐·시트·활동 로그)를 캐스케이드로 가로지르므로 호출자의
-- 표별 RLS와 무관하게 한 트랜잭션에서 끝나야 하고, ② 권한 축이 행사 안의 역할(project_members)이 아니라
-- 전역 app_role이라 행 단위 정책으로는 판정할 수 없기 때문이다. projects에는 delete 정책을 두지 않았다 —
-- 이 RPC가 유일한 삭제 경로다(다중 방어).
-- 되돌릴 수 없는 조작이라 pm이 아니라 admin만 허용한다.
create or replace function public.delete_project(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then
    raise exception 'FORBIDDEN: 행사 삭제는 관리자(admin) 권한이 필요합니다.' using errcode = 'P0403';
  end if;
  if not exists (select 1 from projects where id = p_project) then
    raise exception 'NOT_FOUND: 프로젝트를 찾을 수 없습니다.' using errcode = 'P0404';
  end if;
  -- app.require_writable를 부르지 않는다 — 종료(closed) 행사도 삭제할 수 있어야 한다(§4-1c).
  -- app.write_log도 부르지 않는다 — activity_log는 project_id에 매여 있어 이 delete로 함께 지워진다.
  --   "로그가 빠졌다"고 뒤에 채워 넣지 말 것(설계서 §12 이탈로 문서화됨).
  -- quotes·quote_imports는 FK가 on delete set null이라 행이 남고 project_id만 풀린다 —
  --   여기서 따로 손대지 않는다. 주소록(profiles)·협력사(vendors)는 행사 비종속이라 무관하다.
  delete from projects where id = p_project;
end $$;
revoke execute on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;

-- ── WBS 전개·온보딩 (§4-15 재전개 보존 · §8 onboarding-complete "한 트랜잭션") ─────────
-- 클라이언트가 템플릿(src/fixtures/wbsTemplates.ts 정본)으로 전개한 전체 행을 넘기고, DB는 한 트랜잭션에서
-- ① 넘어오지 않은 기존 태스크 삭제 ② 행 upsert ③ 주최형 inbound 산출물 생성을 수행한다.
create or replace function app.replace_wbs_tasks_impl(p_project uuid, p_tasks jsonb, p_deliverables jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_deliverables is not null and jsonb_array_length(p_deliverables) > 0 then
    insert into deliverables (id, project_id, area, category, title, status, assignee_id, due_date, requires_approval, partner_id)
    select d.id, p_project, d.area, d.category, d.title, coalesce(d.status, 'requested'), d.assignee_id, d.due_date, coalesce(d.requires_approval, true), d.partner_id
    from jsonb_populate_recordset(null::deliverables, p_deliverables) d
    on conflict (id) do nothing;
  end if;
  delete from wbs_tasks where project_id = p_project
    and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_tasks) e);
  insert into wbs_tasks (id, project_id, phase_no, phase_name, code, title, offset_start, offset_end, start_date, end_date, role, origin_role,
                         status, done_at, linked_deliverable_id, target, direction, partner_id, note, sort_order)
  select t.id, p_project, t.phase_no, t.phase_name, t.code, t.title, t.offset_start, t.offset_end, t.start_date, t.end_date, t.role, t.origin_role,
         coalesce(t.status, 'todo'), t.done_at, t.linked_deliverable_id, t.target, coalesce(t.direction, 'internal'), t.partner_id, t.note, coalesce(t.sort_order, 0)
  from jsonb_populate_recordset(null::wbs_tasks, p_tasks) t
  on conflict (id) do update set
    phase_no = excluded.phase_no, phase_name = excluded.phase_name, code = excluded.code, title = excluded.title,
    offset_start = excluded.offset_start, offset_end = excluded.offset_end, start_date = excluded.start_date, end_date = excluded.end_date,
    role = excluded.role, origin_role = excluded.origin_role, status = excluded.status, done_at = excluded.done_at,
    linked_deliverable_id = excluded.linked_deliverable_id, target = excluded.target, direction = excluded.direction,
    partner_id = excluded.partner_id, note = excluded.note, sort_order = excluded.sort_order;
end $$;

create or replace function public.replace_wbs_tasks(p_project uuid, p_tasks jsonb, p_deliverables jsonb default '[]'::jsonb, p_action text default 'wbs.expanded', p_meta jsonb default null)
returns setof wbs_tasks language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := app.require_pm(p_project);
  perform app.require_writable(p_project);
  perform app.replace_wbs_tasks_impl(p_project, p_tasks, p_deliverables);
  perform app.write_log(p_project, 'user:' || v_me, p_action, 'project', p_project, p_meta);
  return query select * from wbs_tasks where project_id = p_project order by sort_order;
end $$;
revoke execute on function public.replace_wbs_tasks(uuid, jsonb, jsonb, text, jsonb) from public, anon;
grant execute on function public.replace_wbs_tasks(uuid, jsonb, jsonb, text, jsonb) to authenticated;

-- 온보딩 완료: onboarded_at 기록(이미 완료면 409) + WBS 전개 + R&R·컴플라이언스 시드 — 한 트랜잭션(§8)
-- p_charters·p_cards가 null이면 손대지 않는다(주최형 백필 규칙은 클라이언트가 판정해 넘긴다)
create or replace function public.complete_onboarding(p_project uuid, p_tasks jsonb, p_deliverables jsonb default '[]'::jsonb, p_charters jsonb default null, p_cards jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_project projects;
begin
  v_me := app.require_pm(p_project);
  v_project := app.require_writable(p_project);
  if v_project.onboarded_at is not null then
    raise exception 'CONFLICT: 이미 온보딩이 완료된 프로젝트입니다.' using errcode = 'P0409';
  end if;
  update projects set onboarded_at = now() where id = p_project;
  perform app.replace_wbs_tasks_impl(p_project, p_tasks, p_deliverables);
  if p_charters is not null then
    delete from role_charters where project_id = p_project;
    insert into role_charters (id, project_id, role, origin_role, title, items)
    select coalesce(c.id, gen_random_uuid()), p_project, c.role, c.origin_role, c.title, coalesce(c.items, '[]'::jsonb)
    from jsonb_populate_recordset(null::role_charters, p_charters) c;
  end if;
  if p_cards is not null then
    delete from compliance_cards where project_id = p_project;
    insert into compliance_cards (id, project_id, kind, title, items, sort_order)
    select coalesce(c.id, gen_random_uuid()), p_project, c.kind, c.title, coalesce(c.items, '[]'::jsonb), coalesce(c.sort_order, 0)
    from jsonb_populate_recordset(null::compliance_cards, p_cards) c;
  end if;
  perform app.write_log(p_project, 'user:' || v_me, 'wbs.expanded', 'project', p_project, jsonb_build_object('count', jsonb_array_length(p_tasks)));
  perform app.write_log(p_project, 'user:' || v_me, 'onboarding.completed', 'project', p_project);
end $$;
revoke execute on function public.complete_onboarding(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.complete_onboarding(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- R&R·컴플라이언스 세트 교체(주최형 재전개 백필 등) — 비어 있을 때만 시드하려면 p_only_if_empty=true
create or replace function public.seed_project_sets(p_project uuid, p_charters jsonb default null, p_cards jsonb default null, p_only_if_empty boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform app.require_pm(p_project);
  perform app.require_writable(p_project);
  if p_charters is not null and (not p_only_if_empty or not exists (select 1 from role_charters where project_id = p_project)) then
    delete from role_charters where project_id = p_project;
    insert into role_charters (id, project_id, role, origin_role, title, items)
    select coalesce(c.id, gen_random_uuid()), p_project, c.role, c.origin_role, c.title, coalesce(c.items, '[]'::jsonb)
    from jsonb_populate_recordset(null::role_charters, p_charters) c;
  end if;
  if p_cards is not null and (not p_only_if_empty or not exists (select 1 from compliance_cards where project_id = p_project)) then
    delete from compliance_cards where project_id = p_project;
    insert into compliance_cards (id, project_id, kind, title, items, sort_order)
    select coalesce(c.id, gen_random_uuid()), p_project, c.kind, c.title, coalesce(c.items, '[]'::jsonb), coalesce(c.sort_order, 0)
    from jsonb_populate_recordset(null::compliance_cards, p_cards) c;
  end if;
end $$;
revoke execute on function public.seed_project_sets(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.seed_project_sets(uuid, jsonb, jsonb, boolean) to authenticated;

-- ── 정형 문서 벌크 교체 (§8.2 PUT scenario-blocks · guide-sections) ─────────
create or replace function public.save_scenario_blocks(p_deliverable uuid, p_blocks jsonb)
returns setof scenario_blocks language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_roles(v_d.project_id, '이 편집은 PM·운영 담당만 가능합니다.', 'pm', 'ops');
  if v_d.category <> '시나리오' then raise exception 'CONFLICT: 시나리오 항목이 아닙니다.' using errcode = 'P0409'; end if;
  perform app.require_writable(v_d.project_id);
  delete from scenario_blocks where deliverable_id = p_deliverable;
  insert into scenario_blocks (deliverable_id, session_id, "time", kind, script, note, sort_order)
  select p_deliverable, (e->>'session_id')::uuid, e->>'time', e->>'kind', e->>'script', e->>'note', ord::int
  from jsonb_array_elements(p_blocks) with ordinality as x(e, ord);
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'scenario.saved', 'deliverable', p_deliverable, jsonb_build_object('count', jsonb_array_length(p_blocks)));
  return query select * from scenario_blocks where deliverable_id = p_deliverable order by sort_order;
end $$;
revoke execute on function public.save_scenario_blocks(uuid, jsonb) from public, anon;
grant execute on function public.save_scenario_blocks(uuid, jsonb) to authenticated;

create or replace function public.save_guide_sections(p_deliverable uuid, p_sections jsonb)
returns setof guide_sections language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_roles(v_d.project_id, '이 편집은 PM·운영 담당만 가능합니다.', 'pm', 'ops');
  if v_d.category <> '운영가이드' then raise exception 'CONFLICT: 운영가이드 항목이 아닙니다.' using errcode = 'P0409'; end if;
  perform app.require_writable(v_d.project_id);
  delete from guide_sections where deliverable_id = p_deliverable;
  insert into guide_sections (id, deliverable_id, kind, title, content, source_ref, source_stale, sort_order)
  select coalesce((e->>'id')::uuid, gen_random_uuid()), p_deliverable, e->>'kind', e->>'title', e->>'content', e->>'source_ref',
         coalesce((e->>'source_stale')::boolean, false), ord::int
  from jsonb_array_elements(p_sections) with ordinality as x(e, ord);
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'guide.saved', 'deliverable', p_deliverable, jsonb_build_object('count', jsonb_array_length(p_sections)));
  return query select * from guide_sections where deliverable_id = p_deliverable order by sort_order;
end $$;
revoke execute on function public.save_guide_sections(uuid, jsonb) from public, anon;
grant execute on function public.save_guide_sections(uuid, jsonb) to authenticated;

-- ── 견적 확정 (§8 POST /quotes/{id}/finalize) — 같은 행사 다른 final은 archived, 상호 링크 ─────────
create or replace function public.finalize_quote(p_quote uuid)
returns quotes language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_q quotes;
begin
  v_me := app.current_profile_id();
  if v_me is null or not app.is_quote_user() then
    raise exception 'FORBIDDEN: 견적 메뉴는 영업·관리자 권한이 필요합니다.' using errcode = 'P0403';
  end if;
  select * into v_q from quotes where id = p_quote;
  if v_q.id is null then raise exception 'NOT_FOUND: 견적을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_q.is_final then raise exception 'CONFLICT: 이미 확정된 견적입니다.' using errcode = 'P0409'; end if;
  if v_q.superseded_by is not null then
    raise exception 'CONFLICT: 새 버전이 있는 견적은 확정할 수 없습니다 — 최신 버전을 확정하세요.' using errcode = 'P0409';
  end if;
  if v_q.project_id is not null then
    update quotes set is_final = false, status = 'archived' where project_id = v_q.project_id and id <> p_quote and is_final;
  end if;
  update quotes set is_final = true, locked_at = now(), status = 'accepted' where id = p_quote returning * into v_q;
  if v_q.project_id is not null then
    update projects set quote_id = p_quote where id = v_q.project_id;
    perform app.write_log(v_q.project_id, 'user:' || v_me, 'quote.finalized', 'quote', p_quote);
  end if;
  return v_q;
end $$;
revoke execute on function public.finalize_quote(uuid) from public, anon;
grant execute on function public.finalize_quote(uuid) to authenticated;

-- ── 파트너 제출 검토 (§8.1 · §5.1) — approved면 final까지, changes_requested면 shared 코멘트 필수 ─────────
create or replace function public.review_partner_submission(p_deliverable uuid, p_decision text, p_comment text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_d.partner_id is null then raise exception 'CONFLICT: 파트너 제출 항목이 아닙니다.' using errcode = 'P0409'; end if;
  v_me := app.current_profile_id();
  v_role := app.member_role(v_d.project_id);
  if v_me is null or v_role is null then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  -- 역할-영역 일치(pm 전 영역 · design/ops 자기 영역 · reg 불가)
  if not (v_role = 'pm' or (v_role in ('design','ops') and v_d.area::text = v_role::text)) then
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
revoke execute on function public.review_partner_submission(uuid, text, text) from public, anon;
grant execute on function public.review_partner_submission(uuid, text, text) to authenticated;

-- ── 내부 상태 전이 + 코멘트(반려) — §5 status_patch 경로. 코멘트 필수 여부는 클라이언트(assertTransition)가 먼저 판정 ─────────
create or replace function public.transition_deliverable(p_deliverable uuid, p_to deliverable_status, p_comment text default null)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role; v_from deliverable_status;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  v_role := app.member_role(v_d.project_id);
  if v_me is null or v_role is null then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  perform app.require_writable(v_d.project_id);
  v_from := v_d.status;
  -- status_patch 경로의 두 전이만 허용한다(그 밖은 approval_request·client_decision·version_upload 경로)
  if v_from = 'draft' and p_to = 'internal_review' then
    if not (v_role = 'pm' or (v_role in ('design','ops') and v_d.area::text = v_role::text)) then
      raise exception 'FORBIDDEN: 해당 영역에 대한 쓰기 권한이 없습니다.' using errcode = 'P0403';
    end if;
  elsif v_from = 'internal_review' and p_to = 'draft' then
    if v_role <> 'pm' then raise exception 'FORBIDDEN: 이 전이를 수행할 권한이 없습니다.' using errcode = 'P0403'; end if;
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
revoke execute on function public.transition_deliverable(uuid, deliverable_status, text) from public, anon;
grant execute on function public.transition_deliverable(uuid, deliverable_status, text) to authenticated;

-- ── 버전 업로드 (§7.2 — Phase 4는 메타만: 파일 원본은 Phase 5 Drive) + §5 자동 전이 ─────────
create or replace function public.upload_version(p_deliverable uuid, p_file_name text, p_note text default null, p_original_file_name text default null)
returns versions language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_role member_role; v_v versions; v_to deliverable_status;
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
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, 'pending:' || gen_random_uuid(), p_file_name, p_note, v_me)
  returning * into v_v;
  if v_d.status in ('requested','changes_requested') then
    v_to := case when v_d.partner_id is not null then 'pending_approval'::deliverable_status else 'draft'::deliverable_status end;
    update deliverables set status = v_to where id = p_deliverable;
  end if;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'version.uploaded', 'version', v_v.id,
    jsonb_build_object('deliverable_id', p_deliverable, 'version_no', v_v.version_no));
  return v_v;
end $$;
revoke execute on function public.upload_version(uuid, text, text, text) from public, anon;
grant execute on function public.upload_version(uuid, text, text, text) to authenticated;

-- ── 컨펌 발송 (§5 approval_request — pm 단독, 미리보기 포맷은 클라이언트가 먼저 검사·DB도 확인) ─────────
create or replace function public.request_approval(p_deliverable uuid, p_version uuid, p_due_at timestamptz default null)
returns approvals language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid; v_v versions; v_a approvals;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_pm(v_d.project_id);
  perform app.require_writable(v_d.project_id);
  if not v_d.requires_approval then raise exception 'CONFLICT: 컨펌 루프를 사용하지 않는 항목입니다.' using errcode = 'P0409'; end if;
  if v_d.status <> 'internal_review' then
    raise exception 'STATUS_TRANSITION_NOT_ALLOWED: 허용되지 않는 상태 전이입니다: % → pending_approval (approval_request)', v_d.status using errcode = 'P0409';
  end if;
  select * into v_v from versions where id = p_version and deliverable_id = p_deliverable;
  if v_v.id is null then raise exception 'NOT_FOUND: 해당 항목의 버전이 아닙니다.' using errcode = 'P0404'; end if;
  if lower(v_v.file_name) !~ '\.(pdf|png|jpe?g)$' then
    raise exception 'VALIDATION: 컨펌 발송은 미리보기 포맷(PDF·PNG·JPG) 버전만 가능합니다.' using errcode = 'P0422';
  end if;
  insert into approvals (deliverable_id, version_id, requested_by, due_at) values (p_deliverable, p_version, v_me, p_due_at) returning * into v_a;
  update deliverables set status = 'pending_approval' where id = p_deliverable;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'approval.requested', 'approval', v_a.id, jsonb_build_object('deliverable_id', p_deliverable));
  return v_a;
end $$;
revoke execute on function public.request_approval(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.request_approval(uuid, uuid, timestamptz) to authenticated;

-- ── 인박스 연결 (§7.3 — 파일명 rename 기본 off) + §5 자동 draft 전이 ─────────
create or replace function public.link_inbox_file(p_inbox uuid, p_deliverable uuid)
returns versions language plpgsql security definer set search_path = public as $$
declare v_f unregistered_files; v_d deliverables; v_me uuid; v_role member_role; v_v versions;
begin
  select * into v_f from unregistered_files where id = p_inbox;
  if v_f.id is null then raise exception 'NOT_FOUND: 인박스 파일을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_f.dismissed or v_f.linked_deliverable_id is not null then
    raise exception 'CONFLICT: 이미 처리된 인박스 파일입니다.' using errcode = 'P0409';
  end if;
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
    raise exception 'CONFLICT: 현재 상태(%)에서는 버전을 추가할 수 없습니다.', v_d.status using errcode = 'P0409';
  end if;
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, v_f.drive_file_id, coalesce(v_f.file_name, 'unnamed-' || v_f.drive_file_id), '인박스에서 연결됨', v_me)
  returning * into v_v;
  update unregistered_files set linked_deliverable_id = p_deliverable where id = p_inbox;
  if v_d.status in ('requested','changes_requested') then
    update deliverables set status = 'draft' where id = p_deliverable;
  end if;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'inbox.linked', 'version', v_v.id, jsonb_build_object('deliverable_id', p_deliverable));
  return v_v;
end $$;
revoke execute on function public.link_inbox_file(uuid, uuid) from public, anon;
grant execute on function public.link_inbox_file(uuid, uuid) to authenticated;
-- <<< 20260907001600_rpc_core.sql

-- >>> 20260907001700_rpc_portals.sql
-- ─────────────────────────────────────────────────────────────────────
-- 1700 · 토큰 경로 RPC(발주처 /c · 파트너 /p) + 랜딩 리드 + 시트 연결·감지·반영
-- §6.2: 토큰 경로는 RLS를 통과하지 않는다 — security definer 함수가 토큰을 검증한 뒤 **화이트리스트 쿼리만**
-- 수행하고, anon에는 이 함수들의 execute만 있다(표 권한 0 — 1500). settlement_*·vendors·quotes·partners.contract_amount·
-- partner_tiers.price는 어느 함수도 읽지 않는다(§19.7·§21.2 R-H3).
-- 설계서는 이 자리를 Edge Function(service role)으로 적었으나, "키 교체+setup.sql 1회"(§18-0) 안에서 같은 계약을
-- 만족하는 SQL 함수로 구현한다 — 배포 단계가 늘지 않고 로컬 Postgres에서 증명된다(Phase 4 개정 대상).
-- ─────────────────────────────────────────────────────────────────────

-- 토큰 검증 (§6.3): 미존재 404 · 회수·만료 410 · 접근 시 last_seen_at
create or replace function app.resolve_client_token(p_token uuid)
returns client_tokens language plpgsql security definer set search_path = public as $$
declare v_t client_tokens;
begin
  select * into v_t from client_tokens where token = p_token;
  if v_t.token is null then raise exception 'NOT_FOUND: 유효하지 않은 링크입니다.' using errcode = 'P0404'; end if;
  if v_t.revoked_at is not null or (v_t.expires_at is not null and v_t.expires_at < now()) then
    raise exception 'GONE: 링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.' using errcode = 'P0410';
  end if;
  update client_tokens set last_seen_at = now() where token = p_token;
  return v_t;
end $$;

create or replace function app.resolve_partner_token(p_token uuid)
returns partner_tokens language plpgsql security definer set search_path = public as $$
declare v_t partner_tokens;
begin
  select * into v_t from partner_tokens where token = p_token;
  if v_t.id is null then raise exception 'NOT_FOUND: 유효하지 않은 링크입니다.' using errcode = 'P0404'; end if;
  if v_t.revoked_at is not null or (v_t.expires_at is not null and v_t.expires_at < now()) then
    raise exception 'GONE: 링크가 만료되었습니다. 담당자에게 새 링크를 요청하세요.' using errcode = 'P0410';
  end if;
  update partner_tokens set last_seen_at = now() where id = v_t.id;
  return v_t;
end $$;

create or replace function app.area_progress(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object('area', a.area, 'total', coalesce(c.total, 0), 'done', coalesce(c.done, 0)) order by a.ord)
  from (values ('design', 1), ('ops', 2), ('common', 3)) as a(area, ord)
  left join (
    select area::text as area, count(*) as total, count(*) filter (where status = 'final') as done
    from deliverables where project_id = p_project group by area
  ) c on c.area = a.area
$$;

-- ── /c/{token}/queue — 컨펌 대기 + 이력 + shared 코멘트만 (§6.2 C-1) ─────────
create or replace function public.client_queue(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_project projects; v_queue jsonb; v_history jsonb; v_contact text;
begin
  v_t := app.resolve_client_token(p_token);
  select * into v_project from projects where id = v_t.project_id;
  select name into v_contact from client_contacts where id = v_t.contact_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'approval_id', a.id, 'deliverable_id', d.id, 'title', d.title, 'category', d.category, 'area', d.area,
      'requested_at', a.requested_at, 'due_at', a.due_at,
      'version', jsonb_build_object('id', v.id, 'version_no', v.version_no, 'file_name', v.file_name),
      'shared_comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from comments c where c.deliverable_id = d.id and c.visibility = 'shared'), '[]'::jsonb)
    ) order by coalesce(a.due_at, 'infinity'::timestamptz), a.requested_at), '[]'::jsonb)
  into v_queue
  from approvals a join deliverables d on d.id = a.deliverable_id join versions v on v.id = a.version_id
  where d.project_id = v_t.project_id and a.decided_at is null and d.status = 'pending_approval';
  select coalesce(jsonb_agg(jsonb_build_object(
      'approval_id', a.id, 'deliverable_id', d.id, 'title', d.title, 'decision', a.decision, 'decided_at', a.decided_at
    ) order by a.decided_at desc), '[]'::jsonb)
  into v_history
  from approvals a join deliverables d on d.id = a.deliverable_id
  where d.project_id = v_t.project_id and a.decided_at is not null and a.decision is not null;
  return jsonb_build_object('project_name', v_project.name, 'contact_name', v_contact, 'queue', v_queue, 'history', v_history);
end $$;
revoke execute on function public.client_queue(uuid) from public;
grant execute on function public.client_queue(uuid) to anon, authenticated;

-- ── /c/{token}/decisions — 승인/수정요청 (§5 client_decision · 수정요청은 코멘트 필수 · 코멘트는 shared 강제) ─────────
create or replace function public.client_decide(p_token uuid, p_approval uuid, p_decision approval_decision, p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_a approvals; v_d deliverables;
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
    -- §5·§7.5: 06_발주처공유 스냅숏 성공 후 final — Phase 4는 Drive 없음(Phase 5에서 copy 성공 게이트 삽입)
    perform app.finalize_deliverable(v_d.id);
  else
    update deliverables set status = 'changes_requested' where id = v_d.id;
    insert into comments (deliverable_id, author_token, visibility, body) values (v_d.id, p_token, 'shared', p_comment);
  end if;
end $$;
revoke execute on function public.client_decide(uuid, uuid, approval_decision, text) from public;
grant execute on function public.client_decide(uuid, uuid, approval_decision, text) to anon, authenticated;

-- ── /c/{token}/status — 진행률·마일스톤·확정본·담당자(3.18.1 노출 계약: 마스킹 없음) ─────────
create or replace function public.client_status(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t client_tokens; v_project projects; v_staff jsonb; v_contact jsonb; v_finals jsonb; v_ms jsonb;
begin
  v_t := app.resolve_client_token(p_token);
  select * into v_project from projects where id = v_t.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'display_name', p.display_name, 'role', m.role,
                                               'title', p.title, 'email', p.email, 'phone', p.phone)
           order by array_position(array['pm','design','ops','reg'], m.role::text)), '[]'::jsonb)
  into v_staff from project_members m join profiles p on p.id = m.user_id where m.project_id = v_t.project_id;
  select jsonb_build_object('name', c.name, 'org', c.org, 'email', c.email) into v_contact from client_contacts c where c.id = v_t.contact_id;
  select coalesce(jsonb_agg(to_jsonb(ms) order by ms.due_date), '[]'::jsonb) into v_ms from milestones ms where ms.project_id = v_t.project_id;
  select coalesce(jsonb_agg(jsonb_build_object('version_id', v.id, 'deliverable_id', d.id, 'deliverable_title', d.title,
                                               'file_name', v.file_name, 'finalized_at', d.updated_at) order by d.updated_at desc), '[]'::jsonb)
  into v_finals
  from deliverables d
  join lateral (select * from versions x where x.deliverable_id = d.id order by x.version_no desc limit 1) v on true
  where d.project_id = v_t.project_id and d.status = 'final';
  return jsonb_build_object(
    'project_name', v_project.name, 'event_date', v_project.event_date,
    'area_progress', app.area_progress(v_t.project_id), 'milestones', v_ms, 'recent_finals', v_finals,
    'staff', v_staff, 'client_contact', v_contact);
end $$;
revoke execute on function public.client_status(uuid) from public;
grant execute on function public.client_status(uuid) to anon, authenticated;

-- ── /p/{token} — 파트너 포털 (R-H2 자기 partner_id 행만 · R-H3 금액 키 구조적 부재 · R-H6 shared 코멘트만) ─────────
create or replace function public.partner_portal(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t partner_tokens; v_p partners; v_project projects; v_tier text; v_items jsonb; v_notices jsonb;
begin
  v_t := app.resolve_partner_token(p_token);
  select * into v_p from partners where id = v_t.partner_id;
  select * into v_project from projects where id = v_p.project_id;
  select name into v_tier from partner_tiers where id = v_p.tier_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task_code', t.code, 'task_title', t.title, 'deadline', t.end_date, 'deliverable_id', d.id, 'status', d.status,
      'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from comments c where c.deliverable_id = d.id and c.visibility = 'shared'), '[]'::jsonb),
      'versions', coalesce((select jsonb_agg(to_jsonb(v) order by v.version_no desc) from versions v where v.deliverable_id = d.id), '[]'::jsonb)
    ) order by coalesce(t.end_date, 'infinity'::date), t.sort_order), '[]'::jsonb)
  into v_items
  from wbs_tasks t join deliverables d on d.id = t.linked_deliverable_id
  where t.project_id = v_p.project_id and t.partner_id = v_p.id and t.direction = 'partner_submit';
  select coalesce(jsonb_agg(jsonb_build_object('task_code', t.code, 'task_title', t.title, 'deadline', t.end_date, 'note', t.note)
           order by coalesce(t.end_date, 'infinity'::date), t.sort_order), '[]'::jsonb)
  into v_notices from wbs_tasks t where t.project_id = v_p.project_id and t.direction = 'host_notice';
  return jsonb_build_object(
    'project_name', v_project.name, 'event_date', v_project.event_date, 'venue', v_project.venue,
    'partner_name', v_p.name, 'tier_name', v_tier, 'submission_items', v_items, 'notices', v_notices,
    'guide_url', v_project.partner_guide_url, 'contact_email', v_project.partner_contact_email);
end $$;
revoke execute on function public.partner_portal(uuid) from public;
grant execute on function public.partner_portal(uuid) to anon, authenticated;

-- ── /p/{token}/submissions — 파일·텍스트 제출을 versions 이력으로 통일 (§5.1 · R-H4) ─────────
-- p_payload: {"file_name": "...", "note": "..."} 또는 {"text": "..."}
create or replace function public.partner_submit(p_token uuid, p_deliverable uuid, p_payload jsonb)
returns deliverables language plpgsql security definer set search_path = public as $$
declare v_t partner_tokens; v_d deliverables; v_project projects; v_is_text boolean; v_original text; v_v versions; v_yymmdd text;
begin
  v_t := app.resolve_partner_token(p_token);
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if v_d.partner_id is distinct from v_t.partner_id then
    raise exception 'FORBIDDEN: 이 파트너가 제출할 수 있는 항목이 아닙니다.' using errcode = 'P0403';
  end if;
  v_project := app.require_writable(v_d.project_id);
  if v_d.status not in ('requested','changes_requested') then
    raise exception 'CONFLICT: 현재 상태(%)에서는 제출할 수 없습니다.', v_d.status using errcode = 'P0409';
  end if;
  v_is_text := p_payload ? 'text';
  v_original := case when v_is_text then v_d.title || '_텍스트제출.txt' else coalesce(p_payload->>'file_name', 'submission') end;
  if v_is_text then update deliverables set content = p_payload->>'text' where id = p_deliverable; end if;
  -- 파일명 규약(§7.2): YYMMDD_{code}_{category}_{title}_v{n}.{ext} — version_no는 트리거가 채우므로 두 단계
  insert into versions (deliverable_id, drive_file_id, file_name, note, uploaded_by)
  values (p_deliverable, 'pending:' || gen_random_uuid(), v_original,
          case when v_is_text then '파트너 텍스트 제출' else p_payload->>'note' end, null)
  returning * into v_v;
  v_yymmdd := to_char(now() at time zone 'Asia/Seoul', 'YYMMDD');
  update versions set file_name = v_yymmdd || '_' || v_project.code || '_' || v_d.category || '_' || v_d.title || '_v' || v_v.version_no
      || case when v_original ~ '\.[A-Za-z0-9]+$' then '.' || lower(substring(v_original from '\.([A-Za-z0-9]+)$')) else '' end
  where id = v_v.id;
  update deliverables set status = 'pending_approval' where id = p_deliverable;
  perform app.write_log(v_d.project_id, 'partner:' || p_token, 'partner.submitted', 'deliverable', p_deliverable,
    jsonb_build_object('partner_id', v_t.partner_id, 'version_no', v_v.version_no));
  select * into v_d from deliverables where id = p_deliverable;
  return v_d;
end $$;
revoke execute on function public.partner_submit(uuid, uuid, jsonb) from public;
grant execute on function public.partner_submit(uuid, uuid, jsonb) to anon, authenticated;

-- 폼 필드 라벨 부분 일치 → 값 (빈 값은 null)
create or replace function app.landing_pick(p_fields jsonb, p_values jsonb, p_needle text)
returns text language sql immutable as $$
  select nullif(trim(p_values->>('f_' || (f->>'id'))), '')
  from jsonb_array_elements(p_fields) f
  where (f->>'label') like '%' || p_needle || '%'
  limit 1
$$;

-- ── 랜딩 폼 제출 → 등록 유입 (§4-22, 공개 경로) ─────────
-- p_values: {"f_<fieldId>": "...", "c_<consentId>": "on"} — 라벨 부분 일치로 표준 항목을 찾는다(빌더가 라벨을 바꿔도 동작)
create or replace function public.submit_landing_lead(p_landing uuid, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_l landing_pages; v_name text; v_org text; v_email text; v_phone text; v_att attendees; c jsonb; v_today date;
begin
  select * into v_l from landing_pages where id = p_landing;
  if v_l.id is null then raise exception 'NOT_FOUND: 랜딩을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  perform app.require_writable(v_l.project_id);
  if v_l.submit_target <> 'registration' then raise exception 'CONFLICT: 이 랜딩은 외부로 제출되도록 설정돼 있습니다.' using errcode = 'P0409'; end if;
  if v_l.status = 'closed' then raise exception 'CONFLICT: 신청이 마감된 랜딩입니다.' using errcode = 'P0409'; end if;
  v_name := coalesce(app.landing_pick(v_l.form_fields, p_values, '성함'), app.landing_pick(v_l.form_fields, p_values, '이름'));
  if v_name is null then raise exception 'VALIDATION: 성함은 필수입니다.' using errcode = 'P0422'; end if;
  for c in select * from jsonb_array_elements(v_l.consents) where (value->>'required')::boolean loop
    if coalesce(p_values->>('c_' || (c->>'id')), '') = '' then
      raise exception 'VALIDATION: 필수 동의가 누락됐습니다 — %', c->>'title' using errcode = 'P0422';
    end if;
  end loop;
  v_org := app.landing_pick(v_l.form_fields, p_values, '회사');
  v_email := app.landing_pick(v_l.form_fields, p_values, '이메일');
  v_phone := coalesce(app.landing_pick(v_l.form_fields, p_values, '휴대전화'), app.landing_pick(v_l.form_fields, p_values, '연락처'));
  insert into attendees (project_id, name, org, email, phone, channel)
  values (v_l.project_id, v_name, v_org, v_email, v_phone, 'rsvp')
  on conflict (project_id, lower(email)) where email is not null
  do update set name = excluded.name, org = coalesce(excluded.org, attendees.org), phone = coalesce(excluded.phone, attendees.phone)
  returning * into v_att;
  v_today := (now() at time zone 'Asia/Seoul')::date;
  insert into landing_daily_metrics (landing_id, date, views, unique_visitors, form_starts, submits)
  values (p_landing, v_today, 1, 1, 1, 1)
  on conflict (landing_id, date) do update set submits = landing_daily_metrics.submits + 1,
    form_starts = greatest(landing_daily_metrics.form_starts, landing_daily_metrics.submits + 1);
  perform app.write_log(v_l.project_id, 'landing', 'landing.lead', 'attendee', v_att.id, jsonb_build_object('landing_id', p_landing));
  return to_jsonb(v_att);
end $$;
revoke execute on function public.submit_landing_lead(uuid, jsonb) from public;
grant execute on function public.submit_landing_lead(uuid, jsonb) to anon, authenticated;

-- ── 시트 연동 (§24) — 연결·감지·반영. 원본 행(sheet_source_rows)은 서버 읽기 함수(api/sheets)가 적재한다 ─────────
-- 차이 규칙은 src/providers/mock/sheetSync.ts computeSheetDiffRows와 1:1: 유효 행만 · removed 이력 행 제외 ·
-- 매핑 필드 값 비교(registered_at은 'MM-DD HH24:MI') · 상태(sheet_status)는 항상 함께 따라간다.
create or replace function app.sheet_value(p_field text, p_row jsonb)
returns text language sql immutable as $$
  select case
    when p_row->>p_field is null or p_row->>p_field = '' then '—'
    when p_field = 'registered_at' then to_char((p_row->>p_field)::timestamptz at time zone 'UTC', 'MM-DD HH24:MI')
    else p_row->>p_field end
$$;

create or replace function app.sheet_diff(p_project uuid)
returns table (kind text, sheet_row_id text, attendee_id uuid) language plpgsql stable security definer set search_path = public as $$
declare v_conn sheet_connections; v_fields text[];
begin
  select * into v_conn from sheet_connections where project_id = p_project;
  if v_conn.id is null then return; end if;
  select coalesce(array_agg(distinct m->>'field'), '{}') into v_fields
  from jsonb_array_elements(v_conn.mapping) m where m->>'field' is not null and m->>'field' <> 'sheet_status';
  return query
    with valid as (select * from sheet_source_rows r where r.project_id = p_project and r.invalid_reason is null),
         linked as (select * from attendees a where a.project_id = p_project and a.sheet_row_id is not null and a.sheet_status is distinct from 'removed')
    select 'added', v.sheet_row_id, null::uuid from valid v left join linked a on a.sheet_row_id = v.sheet_row_id where a.id is null
    union all
    select 'changed', v.sheet_row_id, a.id from valid v join linked a on a.sheet_row_id = v.sheet_row_id
    where exists (select 1 from unnest(v_fields) f where app.sheet_value(f, to_jsonb(a)) <> app.sheet_value(f, to_jsonb(v)))
       or a.sheet_status is distinct from v.status
    union all
    select 'removed', a.sheet_row_id, a.id from linked a where not exists (select 1 from valid v where v.sheet_row_id = a.sheet_row_id);
end $$;

-- 감지만 한다 — 참관객 데이터는 건드리지 않는다(R-S2). 상태·확인 시각·미확인 건수만 갱신
create or replace function public.check_sheet_updates(p_project uuid)
returns sheet_connections language plpgsql security definer set search_path = public as $$
declare v_conn sheet_connections; v_added int; v_changed int; v_removed int;
begin
  if not app.is_member(p_project) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  select * into v_conn from sheet_connections where project_id = p_project;
  if v_conn.id is null then raise exception 'NOT_FOUND: 연결된 시트가 없습니다.' using errcode = 'P0404'; end if;
  if v_conn.state = 'revoked' then
    update sheet_connections set checked_at = now(),
      failure_times = (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select x from jsonb_array_elements(failure_times || to_jsonb(now())) x order by x desc limit 5) s)
    where id = v_conn.id returning * into v_conn;
    return v_conn;
  end if;
  select count(*) filter (where kind = 'added'), count(*) filter (where kind = 'changed'), count(*) filter (where kind = 'removed')
    into v_added, v_changed, v_removed from app.sheet_diff(p_project);
  update sheet_connections set checked_at = now(), last_success_at = now(),
    pending_added = v_added, pending_changed = v_changed, pending_removed = v_removed,
    state = case when v_added + v_changed + v_removed > 0 then 'stale' else 'connected' end
  where id = v_conn.id returning * into v_conn;
  return v_conn;
end $$;
revoke execute on function public.check_sheet_updates(uuid) from public, anon;
grant execute on function public.check_sheet_updates(uuid) to authenticated;

-- 사람이 차이를 확인한 뒤의 반영 (pm·reg). 낡은 snapshot_version은 409(R-S1). 체크인·비고는 절대 덮어쓰지 않는다
create or replace function public.apply_sheet_diff(p_project uuid, p_snapshot_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_conn sheet_connections; v_fields text[]; r record; v_added int := 0; v_changed int := 0; v_removed int := 0; v_src sheet_source_rows;
begin
  v_me := app.require_roles(p_project, '등록 데이터 권한이 없습니다.', 'pm', 'reg');
  perform app.require_writable(p_project);
  select * into v_conn from sheet_connections where project_id = p_project;
  if v_conn.id is null then raise exception 'NOT_FOUND: 연결된 시트가 없습니다.' using errcode = 'P0404'; end if;
  if v_conn.state = 'revoked' then
    raise exception 'FORBIDDEN: 시트 접근 권한이 끊겼습니다 — 재인증한 뒤 다시 반영해 주세요.' using errcode = 'P0403';
  end if;
  if p_snapshot_version <> v_conn.snapshot_version then
    raise exception 'CONFLICT: 다른 담당자가 이미 반영했습니다. 최신 차이를 다시 확인해 주세요.' using errcode = 'P0409';
  end if;
  select coalesce(array_agg(distinct m->>'field'), '{}') into v_fields
  from jsonb_array_elements(v_conn.mapping) m where m->>'field' is not null and m->>'field' <> 'sheet_status';
  for r in select * from app.sheet_diff(p_project) loop
    if r.kind = 'added' then
      select * into v_src from sheet_source_rows where project_id = p_project and sheet_row_id = r.sheet_row_id;
      insert into attendees (project_id, name, org, email, phone, channel, registered_at, sheet_row_id, title, group_tag, sheet_status)
      values (p_project, v_src.name, v_src.org, v_src.email, v_src.phone, 'import', v_src.registered_at, v_src.sheet_row_id, v_src.title, v_src.group_tag, v_src.status);
      v_added := v_added + 1;
    elsif r.kind = 'removed' then
      update attendees set sheet_status = 'removed' where id = r.attendee_id;
      v_removed := v_removed + 1;
    else
      select * into v_src from sheet_source_rows where project_id = p_project and sheet_row_id = r.sheet_row_id;
      update attendees set
        name = case when 'name' = any(v_fields) then v_src.name else name end,
        org = case when 'org' = any(v_fields) then v_src.org else org end,
        title = case when 'title' = any(v_fields) then v_src.title else title end,
        email = case when 'email' = any(v_fields) then v_src.email else email end,
        phone = case when 'phone' = any(v_fields) then v_src.phone else phone end,
        group_tag = case when 'group_tag' = any(v_fields) then v_src.group_tag else group_tag end,
        registered_at = case when 'registered_at' = any(v_fields) then v_src.registered_at else registered_at end,
        sheet_status = v_src.status
      where id = r.attendee_id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  if v_added + v_changed + v_removed = 0 then
    return jsonb_build_object('applied', 0, 'added', 0, 'changed', 0, 'removed', 0, 'connection', to_jsonb(v_conn));
  end if;
  update sheet_connections set snapshot_version = snapshot_version + 1, snapshot_at = coalesce(source_modified_at, now()),
    state = 'connected', pending_added = 0, pending_changed = 0, pending_removed = 0, checked_at = now(), last_success_at = now()
  where id = v_conn.id returning * into v_conn;
  perform app.write_log(p_project, 'user:' || v_me, 'sheet.applied', 'sheet_connection', v_conn.id,
    jsonb_build_object('added', v_added, 'changed', v_changed, 'removed', v_removed, 'snapshot_version', v_conn.snapshot_version));
  return jsonb_build_object('applied', v_added + v_changed + v_removed, 'added', v_added, 'changed', v_changed, 'removed', v_removed, 'connection', to_jsonb(v_conn));
end $$;
revoke execute on function public.apply_sheet_diff(uuid, int) from public, anon;
grant execute on function public.apply_sheet_diff(uuid, int) to authenticated;

-- 연결 확정 (pm·reg): 매핑 검증(필수 name+email) → 연결 행 → 원본 행 적재(p_rows: 서버 읽기 결과, 비우면 기존 행 유지) → 최초 적재는 **추가만**
create or replace function public.connect_sheet(p_project uuid, p_input jsonb, p_probe jsonb, p_rows jsonb default null)
returns sheet_connections language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_conn sheet_connections; v_fields text[]; v_missing text[]; v_name text; v_seeded int := 0; v_now timestamptz := now();
begin
  v_me := app.require_roles(p_project, '등록 데이터 권한이 없습니다.', 'pm', 'reg');
  perform app.require_writable(p_project);
  if exists (select 1 from sheet_connections where project_id = p_project) then
    raise exception 'CONFLICT: 이미 연결된 시트가 있습니다 — 연결을 해제한 뒤 다시 연결해 주세요.' using errcode = 'P0409';
  end if;
  select coalesce(array_agg(distinct m->>'field'), '{}') into v_fields from jsonb_array_elements(p_input->'mapping') m where m->>'field' is not null;
  select array_agg(x) into v_missing from unnest(array['name','email']) x where not (x = any(v_fields));
  if v_missing is not null then
    raise exception 'VALIDATION: 필수 매핑이 없습니다 — % 컬럼을 지정해 주세요.',
      array_to_string(array(select case x when 'name' then '이름' when 'email' then '이메일' else x end from unnest(v_missing) x), '·') using errcode = 'P0422';
  end if;
  if p_rows is not null then
    delete from sheet_source_rows where project_id = p_project;
    insert into sheet_source_rows (project_id, sheet_row_id, row_number, name, org, title, email, phone, group_tag, registered_at, status, invalid_reason, previously_confirmed)
    select p_project, r->>'sheet_row_id', ord::int, r->>'name', r->>'org', r->>'title', r->>'email', r->>'phone', r->>'group_tag',
           coalesce((r->>'registered_at')::timestamptz, v_now), coalesce(r->>'status', 'applied'), r->>'invalid_reason', coalesce((r->>'previously_confirmed')::boolean, false)
    from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  end if;
  select display_name into v_name from profiles where id = v_me;
  insert into sheet_connections (project_id, state, title, url, tab_name, mapping, connected_at, connected_by, snapshot_at, snapshot_version,
                                 checked_at, auto_check_minutes, source_modified_at, last_success_at, first_row_is_header)
  values (p_project, 'connected', p_probe->>'title', trim(p_input->>'url'), p_input->>'tab_name', coalesce(p_input->'mapping', '[]'::jsonb),
          v_now, v_name, v_now, 1, v_now, 15, (p_probe->>'source_modified_at')::timestamptz, v_now,
          coalesce((p_input->>'first_row_is_header')::boolean, true))
  returning * into v_conn;
  insert into attendees (project_id, name, org, email, phone, channel, registered_at, sheet_row_id, title, group_tag, sheet_status)
  select p_project, s.name, s.org, s.email, s.phone, 'import', s.registered_at, s.sheet_row_id, s.title, s.group_tag, s.status
  from sheet_source_rows s
  where s.project_id = p_project and s.invalid_reason is null
    and not exists (select 1 from attendees a where a.project_id = p_project and a.sheet_row_id = s.sheet_row_id)
    and not exists (select 1 from attendees a where a.project_id = p_project and s.email is not null and lower(a.email) = lower(s.email));
  get diagnostics v_seeded = row_count;
  perform app.write_log(p_project, 'user:' || v_me, 'sheet.connected', 'sheet_connection', v_conn.id,
    jsonb_build_object('tab_name', p_input->>'tab_name', 'seeded', v_seeded));
  return v_conn;
end $$;
revoke execute on function public.connect_sheet(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.connect_sheet(uuid, jsonb, jsonb, jsonb) to authenticated;

-- 원본 행 갱신(서버 읽기 함수가 호출 — 로그인 사용자 세션으로, 멤버만). 갱신 후 감지까지 한 번에.
create or replace function public.refresh_sheet_source(p_project uuid, p_rows jsonb, p_source_modified_at timestamptz default null)
returns sheet_connections language plpgsql security definer set search_path = public as $$
begin
  if not app.is_member(p_project) then raise exception 'FORBIDDEN: 프로젝트 멤버가 아닙니다.' using errcode = 'P0403'; end if;
  delete from sheet_source_rows where project_id = p_project;
  insert into sheet_source_rows (project_id, sheet_row_id, row_number, name, org, title, email, phone, group_tag, registered_at, status, invalid_reason, previously_confirmed)
  select p_project, r->>'sheet_row_id', ord::int, r->>'name', r->>'org', r->>'title', r->>'email', r->>'phone', r->>'group_tag',
         coalesce((r->>'registered_at')::timestamptz, now()), coalesce(r->>'status', 'applied'), r->>'invalid_reason', coalesce((r->>'previously_confirmed')::boolean, false)
  from jsonb_array_elements(p_rows) with ordinality as x(r, ord);
  update sheet_connections set source_modified_at = coalesce(p_source_modified_at, source_modified_at) where project_id = p_project;
  return public.check_sheet_updates(p_project);
end $$;
revoke execute on function public.refresh_sheet_source(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.refresh_sheet_source(uuid, jsonb, timestamptz) to authenticated;
-- <<< 20260907001700_rpc_portals.sql

-- ═══════════════════════════════════════════════════════════════════════
-- setup.sql 끝. 다음 두 줄은 필요할 때만 본인 값으로 바꿔 실행한다(§18-2 · §20 T1).
--   select app.promote_admin('you@company.com');                              -- 첫 admin 승격(프로필이 없으면 만들어 두고 첫 로그인 때 연결)
--   update app_config set allowed_email_domains = array['company.com'] where id = 1;  -- 허용 이메일 도메인 제한(선택)
-- ═══════════════════════════════════════════════════════════════════════
