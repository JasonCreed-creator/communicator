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
