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
