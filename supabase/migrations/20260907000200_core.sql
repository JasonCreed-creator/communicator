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
