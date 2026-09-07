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
