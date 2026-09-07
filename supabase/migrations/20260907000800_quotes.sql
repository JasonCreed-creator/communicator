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
