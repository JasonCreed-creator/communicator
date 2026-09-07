-- ─────────────────────────────────────────────────────────────────────
-- 0400 · 산출물·버전·컨펌·코멘트·마일스톤·활동 로그·인박스 (설계서 §4-4 ~ §4-8, §4-11, §4-12, §21.1)
-- ─────────────────────────────────────────────────────────────────────

-- 4. 산출물 항목
create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  area deliverable_area not null,
  category text not null,                          -- '키비주얼'·'큐시트'·'시나리오'·'운영가이드' 등 자유+프리셋(정형 3종은 빌더)
  title text not null,
  status deliverable_status not null default 'draft',
  assignee_id uuid references profiles(id),
  due_date date,
  drive_folder_id text,
  requires_approval boolean not null default true,
  -- v1.2 지시서·스펙
  brief text,
  brief_refs jsonb,
  spec_size text,
  spec_qty int,
  spec_location text,
  spec_type text,
  content text,
  partner_id uuid,                                 -- v2.4 §21 inbound 제출물 소유 파트너 (FK는 1100에서)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deliverables_project on deliverables (project_id, area, status);
create index if not exists deliverables_assignee on deliverables (assignee_id);

-- 5. 버전
create table if not exists versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  version_no int not null,
  drive_file_id text not null,
  file_name text not null,
  note text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (deliverable_id, version_no)
);

-- 6. 컨펌 요청
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  version_id uuid references versions(id),
  requested_by uuid references profiles(id),       -- PM만 (앱+RLS)
  requested_at timestamptz not null default now(),
  due_at timestamptz,
  decided_at timestamptz,
  decision approval_decision,
  client_comment text,
  decided_via_token uuid references client_tokens(token) on delete set null
);
create index if not exists approvals_deliverable on approvals (deliverable_id, requested_at);
-- 행사 삭제(cascade)에서 client_tokens가 approvals·comments보다 먼저 지워질 수 있다(2026-09-07 dev 실측).
-- 토큰 참조는 감사 필드(회수는 revoked_at — 행 삭제가 아니다)라 삭제 시 null이 맞다. 기존 DB에도 같은 규칙을 적용한다.
alter table approvals drop constraint if exists approvals_decided_via_token_fkey;
alter table approvals add constraint approvals_decided_via_token_fkey
  foreign key (decided_via_token) references client_tokens(token) on delete set null;
-- comments.author_token은 아래 7. 표 생성 직후에 같은 방식으로 조정한다(작성자 없는 코멘트를 남길 수 없어 cascade)

-- 7. 코멘트 (v1.1 C-1: 내부/공유 가시성 분리)
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  author_user_id uuid references profiles(id),
  author_token uuid references client_tokens(token) on delete cascade,   -- 회수된 토큰 참조 유지 = 의도(회수는 삭제가 아니다). 토큰 행 삭제(행사 cascade)는 작성자 없는 코멘트를 남길 수 없어 cascade
  visibility comment_visibility not null default 'internal',
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_author_present check (author_user_id is not null or author_token is not null),
  constraint comments_client_shared check (author_token is null or visibility = 'shared')  -- 발주처 작성분은 shared 강제
);
create index if not exists comments_deliverable on comments (deliverable_id, created_at);
alter table comments drop constraint if exists comments_author_token_fkey;
alter table comments add constraint comments_author_token_fkey
  foreign key (author_token) references client_tokens(token) on delete cascade;

-- 8. 마일스톤
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  area deliverable_area,                           -- null = 전체
  due_date date not null,
  done boolean not null default false
);
create index if not exists milestones_project on milestones (project_id, due_date);

-- 11. 활동 로그 (알림 트리거 겸 감사)
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  actor text not null,                             -- 'user:{profile_id}' | 'client:{token}' | 'system'
  action text not null,
  target_type text,
  target_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_project on activity_log (project_id, created_at desc);

-- 12. 미등록 파일 인박스
create table if not exists unregistered_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  drive_file_id text not null unique,
  file_name text,
  detected_folder text,
  detected_at timestamptz not null default now(),
  linked_deliverable_id uuid references deliverables(id),
  dismissed boolean not null default false
);
