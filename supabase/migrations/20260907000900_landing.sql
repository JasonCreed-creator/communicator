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
