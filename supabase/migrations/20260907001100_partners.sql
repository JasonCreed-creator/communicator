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
