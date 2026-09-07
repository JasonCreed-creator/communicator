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
