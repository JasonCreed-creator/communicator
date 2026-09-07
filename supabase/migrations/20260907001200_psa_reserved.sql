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
