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
