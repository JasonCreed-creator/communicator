# MICE 커뮤니케이터 — 시스템 설계서 v1.5

| 항목 | 내용 |
|---|---|
| 문서 상태 | v1.5 확정 — **다중 행사(프로젝트 셀렉터·행사 목록) + 행사 설정 메뉴(개요·담당자 입력) 확장** (2026-08-22, 시각안 3화면 승인). 직전 v1.4.1: v1.4(유형별 WBS·R&R, 2026-08-22 시각안 승인)에 **Phase 3.6·3.7 구현 해석 정본화** 패치: projects.onboarded_at 확정(사용자 승인 2026-08-22) · 임박/지연 배타 산식 · 일반형 28건 파생 규칙 · 재전개 보존 규칙 · 큐시트 스냅숏 mock 규약 (Code PROGRESS 열린 질문 ①~⑤ 종결) |
| 목적 | Claude Code가 본 문서만으로 추가 질문 없이 구현 착수 |
| 정본 관계 | 스키마·상태 머신·API 계약은 본 문서가 SoT. 구현 지침·작업 순서는 동봉 CLAUDE.md |
| 확정 결정 | 아키텍처=하이브리드(파일=Drive, 상태=Supabase) / 발주처=무로그인 토큰 링크 / 컨펌 발송=PM 단독 / 업로드=웹앱 경유 원칙+Drive 감지 인박스 / 등록 1차=CSV 임포트 / **구현 순서=프론트 우선·서버 후행 이식(DataProvider 어댑터 계층)** / **v1.2: 지시(requested)→제작→컨펌→운영계획서(S9) 조립 파이프라인 — 웹 문서 우선, PPTX·발주처 뷰는 2차** / **v1.3: S0 온보딩(개요→유형→담당자) → 유형(일반형·모객형) 모듈 토글 → 큐시트 정형 에디터(3채널 콘솔, 컨펌 스냅숏 자동)** / **v1.4: 유형별 WBS 템플릿 자동 전개(Configurator 37태스크 이식·호환 코드 체계) + 역할별 R&R 카드** / **v1.4.1: 온보딩 완료 상태는 projects.onboarded_at 컬럼이 정본(DataProvider v3.1 재동결)** / **v1.5: 다중 행사 — 사이드바 프로젝트 셀렉터+S-1 행사 목록, "행사 설정" 메뉴 상시 노출(①개요 ②담당자 ③유형·연동), S0 위저드=같은 폼의 단계형, 행사개요 단일 원천(S9 ①은 읽기 조립)** |

---

## 1. 시스템 개요

MICE 프로젝트 착수 시 역할별(디자인·운영·등록·발주처) 산출물을 **단일 저장소(Google Drive)** 에 업로드·관리하고, **발주처 컨펌까지 한 화면**에서 처리하는 협업 허브.

**핵심 설계 원칙**
1. 파일 실체는 전부 Google Drive에 산다. 앱이 사라져도 파일과 폴더 구조는 온전히 남는다.
2. 워크플로우 상태(컨펌·버전·RSVP·코멘트)는 Supabase(Postgres)가 갖는다.
3. 발주처는 로그인 없이 토큰 링크 하나로 컨펌과 현황 확인만 한다. 내부 초안·단가·정산은 구조적으로 노출 불가.
4. 디자인보다 기능·편의성 우선 — 화면은 최소, 클릭 수는 최소.
5. Drive 공유 권한은 앱이 절대 변경하지 않는다. 파일 접근은 항상 앱 프록시 경유.
6. (v1.2) 커뮤니케이터의 최종 산출물은 운영계획서다 — 지시서·업로드·컨펌·등록의 모든 입력이 문서 섹션으로 실시간 조립된다.

---

## 2. 아키텍처

```
┌─ 내부 팀 (로그인: Supabase Auth 이메일) ─┐   ┌─ 발주처 (무로그인: /c/{token}) ─┐
└──────────────┬─────────────────────────┘   └──────────────┬─────────────────┘
               ▼                                            ▼
        React + Vite + TypeScript SPA (Vercel 호스팅)
               │
               ▼
        Supabase ──────────────────────────────────────────────
        ├ Postgres (스키마 §4) + RLS (§6)
        ├ Auth (내부 멤버)
        └ Edge Functions (Deno) — API 계약 §8
               │
               ├──> Google Drive API v3  (파일 원본·폴더 트리·프록시 스트리밍)
               ├──> Slack Incoming Webhook (내부 알림)
               └──> 이메일 발송 (Resend 등 — 발주처 토큰 링크·리마인드)
```

**기술 스택**

| 계층 | 선택 | 비고 |
|---|---|---|
| 프론트 | React 18 + Vite + TypeScript + Tailwind | MiceConfigurator 검증 스택 재활용 |
| 백엔드 | Supabase Edge Functions (Deno) | 서버 별도 운영 없음 |
| DB | Supabase Postgres + RLS | Free tier로 MVP 충분 |
| 파일 | Google Drive API v3 | 스토리지 비용 0 |
| 배포 | Vercel(프론트) + Supabase(백엔드) | 저비용 |

**Drive 인증 (v1.1 개정 — 감수 M-1 반영, 웹검증 2026-08-19)**: **전용 운영 Google 계정**(개인 계정 아님)의 OAuth. 최초 1회 동의 → refresh token을 Supabase Vault/환경변수에 저장 → Edge Function이 모든 Drive 작업을 대행. 파일 소유권이 운영 계정으로 단일화되고, 토큰 유출 시에도 개인 Drive가 아닌 운영 계정만 노출된다.
- **OAuth 동의 화면은 반드시 Production 게시** — External+Testing 상태의 refresh token은 7일 만료로 매주 재인증 장애가 난다. Drive 전체 scope는 restricted scope이나, 100인 미만 개인용 앱은 '미확인 앱' 경고 통과로 사용 가능(정식 검증은 불요).
- OAuth scope: `https://www.googleapis.com/auth/drive` (전체). `drive.file` scope는 앱이 만든 파일만 보여 '직접 업로드 감지'가 불가하므로 전체 scope + **앱 로직에서 프로젝트 루트 폴더 하위로만 접근 제한**.

### 2.1 구현 전략 — 프론트 우선·서버 후행 (v1.1 확정)

프론트는 Supabase client를 **직접 호출하지 않는다**. 모든 데이터·파일 접근은 `DataProvider` 인터페이스 경유(도메인 타입은 §4 스키마와 1:1):

```
프론트(S1~S8) → DataProvider 인터페이스 (착수 시점에 동결 — freeze)
                 ├ 1단계  MockProvider    : 픽스처+메모리, 업로드=blob URL (서버 0)
                 ├ 2단계  SupabaseProvider: DB·Auth·RLS 이식 (파일은 여전히 mock)
                 └ 3단계  DriveFileStore  : Drive 업로드·프록시·스캔·스냅숏 이식
```

- **인터페이스 동결이 전제 조건** — 동결 없이는 이식 시 전 화면 재작업이 발생해 어댑터의 이점이 소멸한다 (감수 Steelman 조건부 판정)
- 동결 이력: v1(35메서드, Phase 1) → v2(41, v1.2 승인) → v3(53, v1.3·v1.4 승인) → v3.1(v1.4.1 — 필드 추가만) → **v4(v1.5 승인 — 다중 행사: `listProjects`·`createProject`·`closeProject`·`addMember`·`removeMember` 5메서드 추가, `Project`·`ProjectPatch` 개요 필드 확장, `ProjectSummary` 뷰 타입 신설. 기존 메서드 시그니처 불변 — projectId 인자는 이미 전 메서드에 존재)**. 매 해제는 사용자 승인+본 문서 개정 동반이 조건
- **현재 행사 컨텍스트(v1.5)**: 프론트는 `PROJECT_ID` 상수를 쓰지 않는다. `ProjectContext`(React)가 선택된 projectId를 보관(localStorage `communicator.currentProjectId`, 없으면 목록 첫 진행 중 행사)하고 모든 화면은 컨텍스트에서 읽는다. 라우트는 불변(`/`, `/board/...`) — URL prefix(`/p/:projectId/...`) 방식은 2차(북마크 공유 요구 발생 시)
- Mock 단계 산출: UI/UX 전체 검증 + 발주처 데모 라우트(`/c/demo`)
- 리스크 직렬화: 최대 리스크인 Drive 계층(OAuth·프록시)을 최후행에 배치

---

## 3. 모듈 구조 (6개)

| # | 모듈 | 하위 기능 | 데이터 성격 |
|---|---|---|---|
| 1 | 디자인 | 디자인의뢰서(양식+첨부) / 키비주얼 / 제작물(품목: 배너·명찰·백월·리플렛·사이니지 등) | deliverable + 버전 파일 |
| 2 | 운영 | 운영 시나리오 / 큐시트(v1.3: 파일이 아닌 정형 에디터) / 프로그램 구성 | deliverable + 버전 파일 / 큐시트=정형 |
| 3 | 등록 | 모객 RSVP(리스트·발송상태·응답) / 참관객 등록 / 참관객 관리(체크인·통계) | 정형 데이터 테이블 |
| 4 | 발주처 | 컨펌 큐(전 영역 컨펌요청 집결) / 운영현황 대시보드 | 뷰 전용(자체 데이터 없음) |
| 5 | 일정·WBS·R&R (v1.4 승격) | 유형별 WBS 템플릿 자동 전개(체크리스트·간트) / 담당별 R&R 카드 / D-day·컨펌 기한 | wbs_tasks·role_charters + approvals.due_at |
| 6 | 공통 | **행사 목록·프로젝트 셀렉터·행사 설정(v1.5)** / 홈 미결 대시보드 / 기획 문서 / 회의록·의사결정 로그 / 예산·정산 문서함 / 알림 / 미등록 파일 인박스 | 혼합 |
| 7 | 운영계획서 (v1.2) | S9 웹 문서 — 개요·프로그램·존운영·제작물 리스트·등록 통계·일정 섹션 자동 조립 + 진행률 + 인쇄 CSS | 뷰 + 정형 데이터 |

- 회의록·예산 문서는 별도 모듈 UI 없이 deliverables의 area='common' 카테고리로 수용 (컨펌 루프 없이 보관·버전만).
- (v1.3) 행사 유형 토글: event_type='general'(일반형)이면 등록 모듈이 경량 모드(참관객 명단·체크인만 — RSVP 파이프라인·모객 대시보드·리마인드 숨김), 'recruiting'(모객형)이면 전체 노출. 스키마는 동일하고 표시 계층 토글이라 유형 변경 시 데이터 손실 없음.

---

## 4. 데이터 모델 (Postgres DDL 요약)

> 타입·제약은 아래가 정본. 마이그레이션 파일은 이 순서대로 작성.

```sql
-- 열거형
create type member_role as enum ('pm','design','ops','reg');
create type deliverable_area as enum ('design','ops','common');
create type deliverable_status as enum
  ('requested','draft','internal_review','pending_approval','changes_requested','approved','final');
  -- v1.2: requested = PM 지시 발행 상태 (산출물 없음)
create type approval_decision as enum ('approved','changes_requested');
create type invite_status as enum ('none','sent','accepted','declined');
create type attendee_channel as enum ('rsvp','onsite','import');
create type event_type as enum ('general','recruiting');   -- v1.3: 일반형·모객형
create type project_status as enum ('active','closed');      -- v1.5

-- 1. 프로젝트
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,          -- 행사 약칭 (파일명 규약에 사용, 전역 유일)
  event_date date,                    -- 시작일 (WBS 전개·D-day 기준)
  event_end_date date,                -- v1.5 종료일 (null=당일 행사)
  start_time time, end_time time,     -- v1.5 운영 시간
  expected_headcount int,             -- v1.5 예상 인원
  seating text,                       -- v1.5 좌석 형태 (극장식·라운드·교실식·스탠딩·혼합 — 자유 텍스트, enum 아님)
  organizer text,                     -- v1.5 주최·주관
  target_audience text,               -- v1.5 참가 대상
  status project_status not null default 'active',  -- v1.5 active|closed (종료 행사는 읽기 전용·목록 접힘)
  closed_at timestamptz,
  drive_root_folder_id text,          -- 표준 트리 루트
  slack_webhook_url text,
  -- v1.2 행사개요 (운영계획서 §행사개요 소스)
  event_type event_type not null default 'general',  -- v1.3 S0 온보딩에서 선택
  theme text, venue text, mc_name text,
  overview_items jsonb,               -- 자유 키-값 개요 불릿 (대상·주차 안내 등)
  onboarded_at timestamptz,           -- v1.4.1 S0 온보딩 완료 시각. null=미완료(본체 라우트 차단 기준). pm이 완료 처리 시 now() 기록, 이후 불변
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- 2. 멤버·역할
create table project_members (
  project_id uuid references projects on delete cascade,
  user_id uuid references auth.users,
  role member_role not null,
  primary key (project_id, user_id)
);
-- v1.5 담당자 '입력': 행사 설정 ②에서 이름·이메일·역할을 직접 추가한다. Phase 4 전(mock)은 추가 즉시 멤버로 취급,
-- Phase 4부터는 초대 레코드 → 가입·수락 시 project_members로 승격. 같은 사람이 행사마다 다른 역할 가능(역할은 행사 단위).
create table project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  email text not null, display_name text not null,
  role member_role not null,
  invited_by uuid references auth.users, invited_at timestamptz default now(),
  accepted_at timestamptz, accepted_user_id uuid references auth.users,
  unique (project_id, lower(email))
);
-- 제약(앱 레벨): 행사당 role='pm' 멤버(또는 수락 대기 초대) 최소 1명. 마지막 PM 삭제 거부(409).

-- 3. 발주처 연락처·토큰
create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  name text not null, org text, email text
);
create table client_tokens (
  token uuid primary key default gen_random_uuid(),   -- URL에 그대로 사용
  project_id uuid references projects on delete cascade,
  contact_id uuid references client_contacts,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

-- 4. 산출물 항목
create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  area deliverable_area not null,
  category text not null,             -- '키비주얼','큐시트','명찰' 등 자유 + 프리셋
  title text not null,
  status deliverable_status not null default 'draft',
  assignee_id uuid references auth.users,
  due_date date,
  drive_folder_id text,               -- 항목 전용 하위 폴더
  requires_approval boolean default true,   -- common 문서는 false
  -- v1.2 지시서·스펙 (전부 선택적 — 지시 없이 만든 항목은 null)
  brief text,                         -- 지시 내용
  brief_refs jsonb,                   -- 참고자료 링크 배열 (첨부 테이블은 2차)
  spec_size text,                     -- 규격 표기 예: '23000×5000mm'
  spec_qty int,
  spec_location text,                 -- 제작·설치 위치
  spec_type text,                     -- 종류 (현수막·합지·PET·이미지 등)
  content text,                       -- 항목 본문 (운영사항 등, 마크다운) — 운영계획서 렌더 소스
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. 버전
create table versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  version_no int not null,
  drive_file_id text not null,
  file_name text not null,            -- 규약 적용된 최종 파일명
  note text,
  uploaded_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (deliverable_id, version_no)
);

-- 6. 컨펌 요청
create table approvals (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  version_id uuid references versions,
  requested_by uuid references auth.users,   -- PM만 (앱 레벨 강제)
  requested_at timestamptz default now(),
  due_at timestamptz,
  decided_at timestamptz,
  decision approval_decision,
  client_comment text,
  decided_via_token uuid references client_tokens(token)
);

-- 7. 코멘트 (v1.1: 내부/공유 가시성 분리 — 감수 C-1 반영)
create type comment_visibility as enum ('internal','shared');
create table comments (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  author_user_id uuid references auth.users,        -- 내부면 세팅
  author_token uuid references client_tokens(token),-- 발주처면 세팅 (회수된 토큰 참조 유지는 의도 — 작성자 이력 보존)
  visibility comment_visibility not null default 'internal',
  body text not null,
  created_at timestamptz default now(),
  check (author_user_id is not null or author_token is not null),
  check (author_token is null or visibility = 'shared')  -- 발주처 작성분은 shared 강제
);
-- 발주처 화면에는 shared만 노출. 내부 UI는 코멘트 작성 시 internal(기본)/shared 토글 제공.

-- 8. 마일스톤
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  title text not null,
  area deliverable_area,              -- null = 전체
  due_date date not null,
  done boolean default false
);

-- 9. 등록 — 모객(RSVP)
create table rsvp_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  name text not null, org text, title text, email text, phone text,
  group_tag text,                     -- VIP/미디어/일반 등
  invite_status invite_status default 'none',
  invited_at timestamptz, responded_at timestamptz,
  memo text
);

-- 10. 등록 — 참관객
create table attendees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  rsvp_contact_id uuid references rsvp_contacts,    -- RSVP 전환 시 연결
  name text not null, org text, email text, phone text,
  channel attendee_channel default 'import',
  registered_at timestamptz default now(),
  checked_in_at timestamptz,
  badge_no text
);

-- 11. 활동 로그 (알림 트리거 겸 감사)
create table activity_log (
  id bigint generated always as identity primary key,
  project_id uuid references projects on delete cascade,
  actor text not null,                -- 'user:{id}' | 'client:{token}' | 'system'
  action text not null,               -- 'version.uploaded','approval.requested' 등
  target_type text, target_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);

-- 12. 미등록 파일 인박스 (Drive 직접 업로드 감지)
create table unregistered_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  drive_file_id text not null unique,
  file_name text, detected_folder text,
  detected_at timestamptz default now(),
  linked_deliverable_id uuid references deliverables,  -- 연결 시 세팅 후 versions 생성
  dismissed boolean default false
);

-- 13. 프로그램 세션 (v1.2 — 운영계획서 §프로그램 섹션의 정형 소스)
create table program_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  section text,                       -- 블록 구분 (오전/오후/애프터파티 등)
  start_time time, end_time time,
  title text not null,
  speaker_name text, speaker_title text, speaker_org text,
  note text,                          -- 비고 태그 (기조·파트너 연사 등)
  sort_order int not null default 0
);

-- 14. 큐시트 큐 (v1.3 — category='큐시트'인 운영 항목에 귀속, 정형 에디터 소스)
create table cues (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  cue_no text,                        -- C01 등 표시 번호
  time_at time,
  segment text,                       -- 구분 (사전·오프닝·MC·세션·전환 등)
  body text,                          -- 내용·대본 (마크다운, 전문 포함)
  console_audio text, console_light text, console_screen text,   -- 콘솔 3채널
  sort_order int not null default 0
);
-- 큐시트 컨펌 발송 시: 앱이 표를 PDF 스냅숏으로 자동 생성해 버전 등록 → §5 발송 조건(미리보기 포맷) 충족

-- 15. WBS 태스크 (v1.4 — 유형별 템플릿을 온보딩 완료 시 행사일 기준으로 전개)
create type wbs_status as enum ('todo','doing','done');
create table wbs_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  phase_no int not null, phase_name text not null,   -- 1 사전착수 ~ 6 사후관리
  code text not null,                 -- '2.5' 등 — Configurator 코드 체계 호환
  title text not null,
  offset_start int not null, offset_end int not null, -- D 기준(음수=D-), 원본 보존
  start_date date, end_date date,     -- 전개 시 event_date로 계산 저장
  role member_role not null,          -- 커뮤니케이터 역할 매핑
  origin_role text,                   -- 원본 역할 태그(RS·RO·MC-PM·MC-AT·공동) — Configurator 연동 대비
  status wbs_status not null default 'todo',
  done_at timestamptz,
  linked_deliverable_id uuid references deliverables,  -- 연결 시 상태 뱃지 표시, final이면 자동 done
  note text, sort_order int not null default 0
);
-- 지연 = (미완료 and end_date < today)
-- 임박 = (미완료 and today <= end_date <= today+2) — 지연과 배타 (v1.4.1 정정: 원 산식 end_date<=today+2는 지연⊂임박이라 홈 집계가 중복됨)
-- 둘 다 저장하지 않고 계산. end_date가 null이면 지연·임박 모두 false. 정본 구현 = src/lib/wbs.ts(isDelayed·isImminent)
-- 재전개(wbs-expand 재호출) 규칙: code 매칭으로 기존 status·done_at·linked_deliverable_id·note 보존, 날짜만 재계산. 템플릿에서 사라진 code는 삭제하지 않고 유지(사용자 데이터 보호)

-- 16. 역할 헌장 R&R (v1.4 — 유형별 템플릿, 온보딩 담당자 지정 시 부여)
create table role_charters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  role member_role not null,
  origin_role text,
  title text not null,                -- '총괄 PM' 등
  items jsonb not null                -- 책임 불릿 배열
);

-- 무결성 보조 (v1.1 — 감수 M-3·Minor 반영)
create unique index uq_rsvp_email on rsvp_contacts (project_id, lower(email)) where email is not null;
create unique index uq_attendee_email on attendees (project_id, lower(email)) where email is not null;
-- deliverables.updated_at은 moddatetime 트리거로 자동 갱신
-- client_tokens.contact_id insert 시 contact의 project_id 일치를 앱 레벨에서 검증(교차 프로젝트 연결 차단)
```

---

## 5. 컨펌 워크플로우 — 상태 머신 (정본)

```
[PM 지시 발행] requested ──(첫 버전 업로드 시 자동)──> draft   ※ 담당자 셀프 생성은 draft에서 시작

draft ──(담당/PM)──> internal_review ──(PM만)──> pending_approval
  ▲                        │                          │
  │                 (PM 반려)│                  (발주처 토큰)
  │                        ▼                          ├──> approved ──(시스템)──> final
  └──(새 버전 업로드)── changes_requested <────────────┘        └ 06_발주처공유 스냅숏 완료 시
```

| 전이 | 주체 | 부수 효과 |
|---|---|---|
| (생성·지시 발행) → requested | **PM** | 지시서(brief·스펙·마감·담당) 작성, 담당자 알림 (v1.2) |
| requested → draft | 자동 — 첫 버전 업로드·인박스 연결 시 | assertTransition 경유 (v1.2) |
| draft → internal_review | 영역 담당 또는 PM | Slack 알림 |
| internal_review → draft | PM (반려) | 코멘트 필수 |
| internal_review → pending_approval | **PM 단독** | **발송 조건: 해당 버전이 미리보기 포맷(PDF·PNG·JPG)일 것** — approvals 생성, 발주처 이메일(토큰 링크), Slack |
| pending_approval → approved | 발주처 토큰 | approvals.decision 기록, Slack |
| approved → final | 시스템 자동 | `copy_file` → `06_발주처공유/` **성공 후에만 final 커밋** — 실패 시 approved 유지+재시도 큐 (v1.1, M-4) |
| pending_approval → changes_requested | 발주처 토큰 | client_comment 필수, Slack |
| changes_requested → draft | 새 버전 업로드 시 자동 | version_no+1 |

- (v1.3) 큐시트 항목은 컨펌 발송 시 표의 PDF 스냅숏이 자동으로 버전 등록되어 발송 조건을 충족한다.
- `requires_approval=false` 항목(회의록·예산 등 common)은 draft ↔ internal_review만 사용.
- 등록 모듈은 상태 머신 미사용 — 파이프라인: rsvp_contacts(none→sent→accepted/declined) → attendees(등록) → checked_in_at(체크인).

---

## 6. 권한 모델

### 6.1 역할 매트릭스 (앱 레벨 + RLS 이중 강제)

| 기능 | pm | design | ops | reg | 발주처(token) |
|---|---|---|---|---|---|
| 자기 영역 deliverable 생성·업로드 | ● | ●(design) | ●(ops) | — | — |
| 지시 발행(requested 생성) (v1.2) | ● | — | — | — | — |
| 행사개요·프로그램표 편집 (v1.2) | ● | — | ● | — | — |
| 전 영역 열람 | ● | ● | ● | ● | — |
| internal_review 전이 | ● | ● | ● | — | — |
| pending_approval 발송 | ● | — | — | — | — |
| 승인/수정요청 | — | — | — | — | ● |
| 코멘트 | ● | ● | ● | ● | ●(자기 큐 항목) |
| 등록 데이터 CRUD | ● | — | — | ● | — |
| 멤버·토큰·설정·Drive 연결 | ● | — | — | — | — |
| 행사 생성(S0 새 행사)·행사개요 편집·종료 (v1.5) | ● | — | — | — | — |
| 행사 목록 열람·셀렉터 전환 (v1.5) | ●(멤버인 행사만) | ● | ● | ● | — |

### 6.2 RLS 방향
- 모든 테이블: `project_id in (select project_id from project_members where user_id = auth.uid())`.
- 쓰기: deliverables/versions는 역할-영역 일치 또는 pm. approvals insert는 pm만.
- 발주처 토큰 경로는 **RLS를 통과하지 않고** Edge Function(service role)이 토큰 검증 후 화이트리스트 쿼리만 수행 — 토큰으로 접근 가능한 데이터: 자기 프로젝트의 pending_approval 항목 + 그 버전 파일 + final 항목 + 마일스톤 진행률 + **visibility='shared' 코멘트만**(internal 코멘트는 쿼리 자체에서 제외 — v1.1, C-1). 그 외 어떤 테이블도 조회 불가.

### 6.3 토큰 설계
- URL: `/c/{token}` (UUID v4). 발급 시 연락처 단위, 만료일 지정 가능, PM이 즉시 회수(revoked_at).
- 접근 시마다 last_seen_at 갱신. 만료·회수 토큰은 410 화면("담당자에게 새 링크를 요청하세요").
- **기본 만료 = 행사일+30일**(발급 시 조정 가능). 발주처 화면 전체에 `Referrer-Policy: no-referrer`, 서버 로그는 토큰 앞 8자만 기록(마스킹) — 이메일 포워딩·브라우저 히스토리·로그 경유 유출 완화 (v1.1, M-6).
- **권한 위생 강제**: 발주처가 볼 수 있는 파일 = 컨펌요청된 버전 + final 확정본뿐. 내부 초안·02_견적·정산 폴더는 API 경로 자체가 없다.

---

## 7. Google Drive 연동 설계

### 7.1 표준 폴더 트리 (jc-workspace-ops 표준 준용 — 새 트리 발명 금지)
프로젝트 생성 시 앱이 자동 생성:

```
[행사 루트]/
├ CLAUDE.md · PROGRESS.md      ← 세션 규약 2파일 (템플릿 복사)
├ 01_기획
├ 02_견적·정산                  ← 발주처 API 경로 없음 (내부 전용)
├ 03_회의록
├ 04_운영                       ← ops 영역 + 등록 CSV 내보내기 저장처
├ 05_산출물
│   └ 디자인                    ← design 영역 (항목별 하위 폴더 자동 생성)
├ 06_발주처공유                  ← final 스냅숏 전용 (앱만 기록)
└ 99_archive
```

영역→폴더 매핑: design → `05_산출물/디자인/{항목명}/` · ops → `04_운영/{항목명}/` · common(회의록) → `03_회의록` · common(예산) → `02_견적·정산` · common(기획) → `01_기획`.

### 7.2 업로드 플로우 (웹앱 경유 — 원칙)
1. 프론트: 파일 선택 + 버전 노트 → Edge Function `POST /versions/upload`
2. Edge Function: Drive resumable upload → 항목 폴더에 저장
3. 파일명 자동 규약화: `YYMMDD_{project.code}_{category}_{title}_v{n}.{ext}` — jc-workspace-ops 표준(`YYMMDD_약칭_문서종류_vN`)의 확장형(문서종류를 category+title 2필드로 세분)
4. versions insert (version_no 자동 증가) → 상태 changes_requested였으면 draft로 자동 전이 → Slack 알림

### 7.3 직접 업로드 감지 (인박스)
- Edge Function cron(5분) + 화면의 수동 새로고침 버튼: **Drive Changes API(startPageToken 증분)** — modifiedTime 폴링 대비 이동·삭제 감지와 페이지 경계 유실에 강함 (v1.1, M-5)
- DB의 versions.drive_file_id에 없는 파일 → unregistered_files insert → 홈 인박스에 노출
- 인박스에서 원클릭: 기존 항목에 연결(새 버전으로 등록) / 새 항목 생성 / 무시(dismissed)
- **파일명 규약화 rename은 옵션(기본 off)** — 타인이 직접 올린 파일명을 앱이 임의 변경하면 협업 혼란·파일명 기반 외부 참조 파손 위험 (v1.1, M-5)

### 7.4 파일 접근 — 프록시 원칙
- 발주처는 항상 `GET /files/{version_id}` 프록시 경유 — Edge Function이 `files.get?alt=media`를 **ReadableStream 패스스루**로 중계(메모리 버퍼링 금지). **프록시 사이즈 캡 100MB** — Edge Functions 한도(메모리 150MB heap+150MB external, wall clock 400초, idle 150초 — 웹검증 2026-08-19)상 대용량 원본 중계는 부적합 (v1.1, M-2)
- 컨펌 대상은 §5 발송 조건(미리보기 포맷 버전)으로 대용량 문제를 원천 차단 — 원본(AI·PSD·영상)은 컨펌용이 아니라 보관용
- 내부 멤버는 Drive 직접 접근 병행 — 행사 루트 폴더를 팀 계정에 1회 공유(Drive UI에서 수행), 앱은 항목마다 webViewLink 버튼 제공
- 이미지·PDF는 브라우저 인라인 미리보기, 그 외 다운로드
- **Drive 공유 권한은 앱이 절대 수정하지 않는다** (anyone 링크 생성 금지)

### 7.5 final 스냅숏 (v1.1 원자성 보강 — M-4)
- approved 처리 직후: 해당 버전 파일 `files.copy` → `06_발주처공유/` (파일명 유지) → **copy 성공 확인 후에만** status=final 커밋
- copy 실패 시 approved 유지 + 재시도 큐(지수 백오프 3회) → 최종 실패 시 Slack 경보 + 홈 대시보드 노출

---

## 8. API 계약 (Edge Functions)

인증: 내부 = Supabase JWT / 발주처 = 경로 토큰. 응답은 JSON, 오류는 `{error: {code, message}}`.

| Method·Path | 권한 | 동작 |
|---|---|---|
| GET /projects | 로그인 | 멤버인 행사 목록 + 요약(ProjectSummary: D-day·유형·status·미결 컨펌·지연·확정 비율·온보딩 단계) — 셀렉터·S-1 공용 (v1.5) |
| POST /projects | 로그인(생성자=pm 자동) | 프로젝트 생성(v1.5: 개요 필드 일괄 수신 — S0 ① 저장 시 호출, onboarded_at은 null) + Drive 표준 트리 생성 + 세션 2파일 템플릿 복사 |
| POST /projects/{id}/close · reopen | pm | status=closed/active 토글 (v1.5). closed면 쓰기 API 전부 409 |
| POST /projects/{id}/members | pm | 담당자 추가(이름·이메일·역할 — v1.5 project_invites 생성, mock은 즉시 멤버) / DELETE /projects/{id}/members/{id} = 제거(마지막 pm이면 409) |
| POST /projects/{id}/client-tokens | pm | 토큰 발급 (연락처·만료) / DELETE = 회수 |
| GET /projects/{id}/dashboard | 멤버 | 홈 데이터(미결 컨펌·D-day·인박스 수·영역 진행률·최근 활동) |
| POST /deliverables | 역할-영역 일치 (지시 발행은 pm) | 항목 생성 + Drive 하위 폴더 생성. v1.2: brief·스펙 포함 시 status=requested |
| PATCH /deliverables/{id}/status | §5 전이 규칙 | 상태 전이 (검증 실패 시 409) |
| POST /deliverables/{id}/versions | 역할-영역 일치 | §7.2 업로드 |
| POST /deliverables/{id}/approvals | **pm** | 컨펌 발송 (due_at 지정) → 이메일+Slack |
| GET /files/{version_id} | 멤버 or 유효 토큰(스코프 검증) | 프록시 스트리밍 |
| GET /c/{token}/queue | 토큰 | 컨펌 대기 목록(+미리보기 메타) |
| POST /c/{token}/decisions | 토큰 | {approval_id, decision, comment} → §5 전이 |
| GET /c/{token}/status | 토큰 | 현황 대시보드 데이터(진행률·마일스톤·최근 확정본) |
| POST /registration/import | pm·reg | CSV 업로드 → rsvp_contacts/attendees 벌크 insert (중복=email 기준 upsert) |
| PATCH /attendees/{id}/checkin | pm·reg | 체크인 토글 |
| GET·POST·PATCH·DELETE /program-sessions | pm·ops | 프로그램표 CRUD (v1.2) |
| GET·POST·PATCH·DELETE /cues | pm·ops | 큐시트 큐 CRUD (v1.3) |
| POST /deliverables/{id}/cue-snapshot | pm | 큐시트 PDF 스냅숏 생성 → 버전 등록 (v1.3, 컨펌 발송 전처리). Mock 단계 규약(v1.4.1): 파일명은 `.pdf` 규약 그대로, 내용은 인쇄용 HTML blob — 실제 PDF 렌더는 Phase 5 Drive 이식과 함께 |
| PATCH /projects/{id} | pm | 행사 유형·기본정보 수정 (v1.3) — v1.5: 개요 전 필드(종료일·시간·장소·인원·좌석·주최·사회자·대상·overview_items). event_date 변경 시 응답에 `wbs_reexpand_required=true` → S5 배너 |
| GET /projects/{id}/onboarding | 멤버 | `{completed, onboarded_at}` — 라우트 가드가 참조 (v1.4.1, completed = onboarded_at is not null) |
| POST /projects/{id}/onboarding-complete | pm | 온보딩 완료 확정: `onboarded_at=now()` 기록 → wbs-expand·R&R 시드 순차 호출 (v1.4.1). 이미 완료면 409. 한 트랜잭션 |
| POST /projects/{id}/wbs-expand | pm | 유형별 WBS 템플릿을 event_date 기준 실제 날짜로 전개 (v1.4, 온보딩 완료 시 자동 호출). 재호출 시 §4-15 재전개 보존 규칙 적용 (v1.4.1) |
| GET·PATCH /wbs-tasks | 담당 역할+pm(체크)·pm(편집) | WBS 태스크 조회·상태 변경 (v1.4) |
| GET /role-charters | 멤버 | 역할별 R&R 카드 (v1.4) |
| PATCH /projects/{id}/overview | pm·ops | 행사개요 편집 (v1.2) |
| GET /projects/{id}/plan | 멤버 | 운영계획서 조립 데이터 — 전 섹션 + 섹션별 진행률 (v1.2) |
| POST /sync/drive-scan | 멤버(수동)·cron | §7.3 인박스 스캔 |
| cron /jobs/reminders | system | 컨펌 due D-1 미응답·마일스톤 D-1 알림 |

---

## 9. 알림 매트릭스

| 이벤트 | 내부 Slack | 발주처 이메일 |
|---|---|---|
| 새 버전 업로드 | ● | — |
| 컨펌 발송 | ● | ● (토큰 링크 포함) |
| 승인 / 수정요청 | ● | — |
| 컨펌 기한 D-1 미응답 | ● | ● 리마인드 |
| 마일스톤 D-1 | ● | — |
| 미등록 파일 감지 | ●(일 1회 묶음) | — |

- Slack: 프로젝트별 Incoming Webhook 1개(설정 화면에서 등록). 메시지 포맷: `[행사코드] 이벤트 — 항목명 (링크)`.
- 이메일: Resend(무료 티어) 권장. 발신 도메인 미보유 시 MVP는 공용 발신 주소.

---

## 10. 화면 명세 (v1.5: S-1 추가, S0·S6 재정의)

**진입점 원칙(v1.5)**: 모든 화면은 사이드바 메뉴 또는 명시적 버튼으로 도달 가능해야 하며, 데모 픽스처는 그 진입 흐름을 실제로 보여줘야 한다(게이트 뒤에만 존재하는 화면 금지). 사이드바 순서: [프로젝트 셀렉터] → 행사 목록 → **행사 설정** → 홈 → 디자인 보드 → 운영 보드 → 등록 → 일정 → 운영계획서.

| # | 화면 | 구성 | 주요 액션 |
|---|---|---|---|
| 공통 | 프로젝트 셀렉터 (v1.5) | 사이드바 최상단 드롭다운: 진행 중/종료 그룹, 행사명·유형·D-day·미결 컨펌/지연 요약, "＋ 새 행사 만들기", "전체 목록 보기" | 전환(컨텍스트 변경·마지막 선택 기억), 새 행사 → S0 |
| S-1 | 행사 목록 (v1.5) | 카드 그리드(행사명·유형·일자·장소·D-day·PM·예상 인원·미결/지연/확정·전체 진행률). 세팅 미완료 행사는 "온보딩 n/3" 표시, 종료 행사는 접힘 | 카드 클릭=전환, 새 행사 만들기, 종료/재개(pm) |
| S0 | 새 행사 위저드 (v1.3→v1.5 재정의) | **행사 설정 ①②③과 동일한 폼 컴포넌트**를 3단계로 배치: ①행사개요(필수 4: 행사명·코드·시작일·장소) ②담당자(내부 담당자 입력 — 이름·이메일·역할, PM 1명 필수 / 발주처 담당자·토큰 선택) ③유형·확인(일반형/모객형, WBS 전개 예고) | 완료 = onboarded_at 기록 + WBS 전개 + R&R 시드. 미완료 행사는 목록에 남고 진입 시 행사 설정으로 유도(차단 아님) |
| S1 | 홈 대시보드 | 미결 컨펌(기한순) · D-day·마일스톤 · **지연/임박 WBS 태스크(v1.4)** · 미등록 인박스 · 영역별 진행률 바 · 최근 활동 | 인박스 연결/무시, 항목·태스크 바로가기 |
| S2 | 영역 보드 (design/ops 공용) | 카테고리 그룹 카드: 상태 뱃지(지시됨 포함)·최신 vN·담당·마감 | 항목 생성, (pm) 지시 발행 폼, 필터(상태·담당), 상태 전이 |
| S3 | 항목 상세 | 지시 카드(브리프·스펙 칩, v1.2)·버전 이력(최신 뱃지)·미리보기·코멘트 스레드·컨펌 이력·Drive 폴더 링크 — **큐시트 항목은 파일 대신 정형 에디터 렌더(v1.3: 행 편집·드래그 정렬·대본 전문)** | 버전 업로드, 전이, (pm) 컨펌 발송(큐시트=스냅숏 자동) |
| S4 | 등록 모듈 | 탭: RSVP 리스트 / 참관객 / 통계(응답률·등록수·체크인율) | CSV 임포트·내보내기, 상태 변경, 체크인 토글, RSVP→참관객 전환 |
| S5 | 일정·WBS·R&R (v1.4 승격) | 단계 필터(1~6)·체크리스트/간트 토글·태스크(코드·기간·담당·상태·산출물 연결 뱃지)·R&R 카드 그리드·컨펌 기한 오버레이 | 태스크 체크(담당+pm)·편집(pm), 템플릿 재전개(pm), 마일스톤 CRUD |
| S6 | 행사 설정 (v1.5 재정의 — 메뉴 2번째 상시 노출) | 탭 ①행사개요: 행사명·코드·유형·시작/종료일·시작/종료 시간·장소·예상 인원·좌석 형태·주제·주최/주관·사회자·참가 대상·기타 개요 항목(overview_items) — **행사개요의 단일 원천(S9 ①은 여기서 읽기 조립, 인라인 편집 제거)** / 탭 ②담당자: 내부 담당자 표(추가 행·삭제·역할 변경) + 발주처 담당자·토큰 통합 표(발급·회수·링크 복사) + R&R 미리보기 / 탭 ③유형·연동: 유형 토글 안내·Drive·Slack | pm 편집(타 역할 읽기). 상단에 "세팅 완료·일자" 또는 "세팅 미완료(필수 n개)" 뱃지 |
| S7 | 발주처 컨펌 큐 (`/c/{token}`) | 대기 항목 리스트 → 미리보기 → [승인] [수정요청+코멘트] · 처리 완료 이력 | 승인/수정요청 |
| S8 | 발주처 현황 (`/c/{token}/status`) | 영역별 진행률 · 마일스톤 · 최근 확정본 목록(다운로드) | 읽기 전용 |
| S9 | 운영계획서 (v1.2) | 섹션 자동 조립: ①행사개요(v1.5: 행사 설정 ①에서 읽기 조립 — 일자·시간·장소·인원·좌석·주최·대상 포함) ②프로그램 ③존별 운영(content+도면) ④제작물 리스트(스펙 표+최신 시안·상태 뱃지) ⑤등록 통계 ⑥일정 ⑦큐시트 표(v1.3, 프로그램 다음 배치) — 섹션별 진행률·인쇄 CSS(A4) | 프로그램 인라인 편집(pm·ops), 개요는 "행사 설정에서 편집" 링크, 인쇄(PDF) |

UI 공통: 한국어, 데스크톱 우선 + 반응형(발주처 화면은 모바일 대응 필수 — 임원이 폰으로 컨펌하는 시나리오), 장식 최소·표와 뱃지 중심.

---

## 11. 등록 모듈 상세 (MVP)

- **CSV 스키마(임포트)**: `name, org, title, email, phone, group_tag, memo` — 헤더 자동 매핑 UI(열 이름 상이 대응), email 기준 중복 upsert, 1,000행 이상 벌크 처리.
- RSVP 상태는 수기 변경(발송·응답 체크). 자체 초청 이메일 발송·응답 폼·QR 체크인은 **2차**.
- 내보내기: 현재 필터 상태 그대로 CSV 다운로드 + Drive `04_운영/`에 스냅숏 저장 옵션.

---

## 12. 보안·운영

- 시크릿: Drive refresh token·Slack webhook·Resend key → Supabase Vault/환경변수. 프론트에 어떤 시크릿도 노출 금지.
- 감사: 모든 상태 전이·토큰 접근·파일 프록시 요청은 activity_log 기록.
- 회사명·실명 하드코딩 금지(#RULE-NO-COMPANY) — 발주처·행사명은 전부 데이터.
- 백업: DB는 Supabase 자동 백업, 파일은 Drive 자체가 원본.

---

## 13. MVP 범위 vs 2차 로드맵

| MVP (이번 구현) | 2차 |
|---|---|
| 프로젝트·멤버·역할 / Drive 트리 자동 생성 | 자체 RSVP 초청 이메일·응답 폼 |
| design·ops 항목 + 버전 + 컨펌 루프 전체 | QR 체크인·현장 등록 키오스크 |
| 발주처 토큰 뷰(큐·현황) + final 스냅숏 | 미리보기 위 주석(마크업) 코멘트 |
| 홈 대시보드·인박스·일정 | 다중 발주처 담당자 승인 체인 |
| (v1.2) 지시 발행 흐름·프로그램표·S9 운영계획서 웹 문서+인쇄 | (v1.2) 운영계획서 PPTX 내보내기·발주처용 운영계획서 뷰·지시 첨부 테이블 |
| (v1.3) S0 온보딩 위저드·유형 모듈 토글·큐시트 정형 에디터+S9 연동 | (v1.3) 큐시트 리허설 모드(실시간 진행 표시)·유형별 견적 연동 |
| (v1.4) WBS 템플릿 전개·체크리스트/간트·R&R 카드·산출물 연결 뱃지+final 자동 done | (v1.4) Configurator 실연동(양방향 동기화)·템플릿 편집기·태스크 코멘트 |
| (v1.5) 프로젝트 셀렉터·S-1 행사 목록·행사 설정 3탭·S0 동일 폼·담당자 입력·종료/재개 | (v1.5) URL prefix 라우팅(`/p/:id`)·이메일 초대 수락 흐름(Phase 4)·행사 복제·Configurator 견적 → 행사 생성 핸드오프(부록 §16) |
| — | 현장사진 갤러리·결과보고서 조립 |
| 등록 CSV 임포트·테이블·체크인 토글·통계 기초 | 통계 대시보드 고도화(mice-dashboard 연동) |
| Slack·이메일 알림 + D-1 리마인드 | 모바일 앱 수준 최적화, 다국어 |

---

## 14. 개정 이력

- **v1.0** (2026-08-19): 최초 확정 — 구조안 v0.9 승인 승격
- **v1.5** (2026-08-22): 다중 행사·행사 설정 확장 (시각안 3화면 승인) — 계기: "초기 세팅 메뉴가 없다"(S0가 게이트 뒤에만 존재·담당자 단계 읽기 전용·개요 필드 분산) + 동시 다수 행사 운영. projects 개요 필드 7종·status 추가, project_invites 신설, API(GET /projects·close/reopen·members DELETE·PATCH 확장), DataProvider v4(5메서드 추가), ProjectContext(PROJECT_ID 상수 폐지), S-1 행사 목록·프로젝트 셀렉터, S6를 "행사 설정" 3탭으로 재정의·메뉴 2번째 상시 노출, S0=동일 폼 단계형(미완료 행사는 차단이 아닌 유도), S9 ① 개요 읽기 조립로 단일화, 진입점 원칙 명문화, 부록 §16 Configurator 핸드오프 수신 계약(가정). 2차: URL prefix·초대 수락·행사 복제
- **v1.4.1** (2026-08-22): 패치 — Phase 3.6·3.7 구현 중 Code가 PROGRESS 열린 질문으로 올린 해석 5건을 정본화(기능 추가 없음). ① `projects.onboarded_at timestamptz` 신설(사용자 승인) — S0 완료 판정·API 2종(GET onboarding / POST onboarding-complete)·DataProvider v3.1 재동결(필드 추가만) ② §4-15 임박 산식을 지연과 배타로 정정(today ≤ end_date ≤ today+2) ③ §15 일반형 28건 제외 집합을 코드 단위로 명시(4.6 존치) — 가정 표기는 유지 ④ wbs-expand 재전개 보존 규칙(code 매칭·status·done_at·연결 보존) ⑤ cue-snapshot mock 규약(.pdf 파일명+HTML blob, PDF 렌더는 Phase 5). 스키마 변경은 ①뿐 — Phase 4 마이그레이션은 v1.4.1 기준
- **v1.4** (2026-08-22): 유형별 WBS·R&R 확장 (시각안 승인) — wbs_tasks·role_charters 테이블, Configurator 37태스크 코드 체계 이식(부록 §15, origin_role 태그로 연동 호환), 온보딩 완료 시 event_date 기준 자동 전개, S5를 일정·WBS·R&R 뷰로 승격(체크리스트/간트 토글), 홈에 지연·임박 집계, 산출물 연결 뱃지+final 자동 done. Configurator 실연동·템플릿 편집기는 2차
- **v1.3** (2026-08-22): 온보딩·유형·큐시트 확장 (시각안 승인) — S0 위저드(개요→유형→담당자, 완료 전 진입 차단), event_type(general/recruiting) 모듈 토글, cues 테이블·큐시트 정형 에디터(3채널 콘솔·대본)·S9 큐시트 섹션·컨펌 스냅숏 자동, API 3종 추가. 리허설 모드·유형별 견적 연동은 2차
- **v1.2** (2026-08-22): 지시→제작→컨펌→문서 조립 확장 (시각안 승인 기반) — status 'requested'+지시서·스펙 필드(brief·spec_*·content), program_sessions 신설, projects 행사개요 필드, S9 운영계획서 웹 문서(섹션 자동 조립·진행률·인쇄 CSS), API 4종 추가. 발주처용 운영계획서 뷰·PPTX 내보내기·지시 첨부는 2차
- **v1.1** (2026-08-19): jc-redteam Deep Audit 반영(판정: 조건부 보완 → 전량 수정) — 코멘트 visibility 분리(C-1) / DataProvider 어댑터 계층·프론트 우선-서버 후행 구현 전략 §2.1 신설(C-2) / 전용 운영 계정+OAuth Production 게시(M-1) / 프록시 스트리밍·100MB 캡·미리보기 포맷 발송 조건·내부 Drive 직접 접근(M-2) / 이메일 partial unique 인덱스(M-3) / final 스냅숏 원자성·재시도(M-4) / Changes API·rename 기본 off(M-5) / 토큰 기본 만료·no-referrer·로그 마스킹(M-6) / Minor 6건(code unique, 기획 카테고리, 규약 확장 명기 등)

---

## 15. 부록 — WBS 기본 템플릿 (모객형 37태스크, Configurator v0.2 이식)

역할 매핑 원칙: 계약·정산·컨펌 게이트=pm / 랜딩·제작물=design / 현장 운영·리허설·결과보고=ops / 리드젠·모객·RSVP·등록=reg. 원본 역할(RS 리멤버영업·RO 리멤버운영·MC-PM 엠앤씨총괄·MC-AT 엠앤씨RSVP·공동)은 origin_role로 보존.

| 코드 | 태스크 | 기간 | 역할(원본) |
|---|---|---|---|
| 1.1 | 계약 검토 및 최종 날인 | D-42~40 | pm (RS) |
| 1.2 | 킥오프 (영업+운영+협력) | D-38~35 | pm (공동) |
| 1.3 | 클라이언트 실행 계획 미팅 | D-35~33 | pm (RS) |
| 1.4 | 현장답사 (주차·이동경로·교통) | D-33~28 | ops (MC-PM) |
| 2.1 | 행사 기초 자료 요청 (Key Visual 등) | D-33~30 | pm (RS) |
| 2.2 | 기초 자료 수령 리마인더 | D-28~26 | pm (RS) |
| 2.3 | 기초 자료 수령 | D-26~23 | pm (RS) |
| 2.4 | 자료 수령 후 협력사 전달 | D-23~22 | pm (RS) |
| 2.5 | 랜딩페이지 디자인·개발 1차 | D-22~18 | design (MC-PM) |
| 2.6 | 랜딩페이지 1차 수정·내부 검토 | D-18~17 | design (MC-PM) |
| 2.7 | 랜딩페이지 최종 컨펌·URL 오픈 | D-17~16 | pm (MC-PM) |
| 2.8 | 제작물 (배너·렌탈장비·기념품·현수막) | D-13~5 | design (MC-PM) |
| 3.1 | 리드젠 서베이 문항 설계·시스템 구축 | D-25~22 | reg (RO) |
| 3.2 | 서베이 링크 전달·검수 | D-22~20 | reg (RO) |
| 3.3 | 서베이+랜딩 통합 테스트 | D-20~18 | reg (RO) |
| 3.4 | 대시보드 최초 세팅·전달 | D-18~17 | reg (RO) |
| 3.5 | 실시간 리드 관리 시트 세팅 | D-17~16 | reg (RO) |
| 4.1 | 리드 수집 시작 | D-16~5 | reg (RO) |
| 4.2 | 타겟 일치/불일치 실시간 협의 | D-16~3 | pm (RS) |
| 4.3 | 불일치 리드 적격 확정 후 전달 | D-16~3 | reg (RO) |
| 4.4 | 1차 참석 확인 (전화·알림톡·메일) | D-8~5 | reg (MC-AT) |
| 4.5 | 2차 참석 확정·노쇼 방지 | D-3~1 | reg (MC-AT) |
| 4.6 | 데일리 현황 공유 (내부) | D-5~1 | reg (MC-AT) |
| 4.7 | 데일리 현황 공유 (고객) | D-5~1 | reg (RO) |
| 5.1 | 행사 물류 배송·현장 셋팅 | D-3~2 | ops (MC-PM) |
| 5.2 | 현장 운영 자료 수집·테스트 | D-2~1 | ops (MC-PM) |
| 5.3 | 전체 리허설·테크니컬 체크 | D-1 | ops (MC-PM) |
| 5.4 | 현장 등록 데스크·출입 관리 | D-Day | reg (MC-AT) |
| 5.5 | VIP 케어·연사 관리·프로그램 운영 | D-Day | ops (MC-PM) |
| 6.1 | 최종 쇼업 리드 리스트 정리·전달 | D+1~2 | reg (MC-AT) |
| 6.2 | 쇼업 리드 raw data 납품 | D+2~3 | reg (RO) |
| 6.3 | 전체 행사 결과 보고서 작성·전달 | D+3~10 | ops (MC-PM) |
| 6.4 | 운영 견적서 확정·전달 | D+3~5 | pm (MC-PM) |
| 6.5 | 세금계산서 발행·고객 입금 확인 | D+5~15 | pm (RS) |
| 6.6 | 운영비 협력사 정산 (이윤 포함) | D+15~20 | pm (RS) |
| 6.7 | 고객사 회계 처리 마감 | D+20~30 | pm (RS) |
| 6.8 | 프로젝트 회고·개선 사항 정리 | D+10~20 | pm (공동) |

**일반형 템플릿 (가정 유지 — 확정 시 갱신)**: 위 37건에서 리드 마케팅·모객 **11건**을 제외하고 대체 2건을 추가해 총 **28건**. 제외 집합은 v1.4.1에서 코드 단위로 명시 — 3.1~3.5(5건) + 4.1·4.2·4.3·4.4·4.5·4.7(6건). **4.6 데일리 현황 공유(내부)는 존치**(내부 현황 공유는 리드 특화 업무가 아님). 추가 2건 — 3G.1 참석 대상 명단 확정(D-20~15, reg, origin_role null), 3G.2 초청장 발송·회신 관리(D-14~5, reg, origin_role null). 정본 구현 = src/fixtures/wbsTemplates.ts(GENERAL_EXCLUDED_CODES·GENERAL_EXTRA_TASKS). 기획자 확정 전까지 "가정" 표기를 유지하며, 확정 시 본 단락만 갱신한다.

---

## 16. 부록 — 견적 Configurator 핸드오프 수신 계약 (v1.5 가정 — jsx-easy-shift 분석 후 확정)

목적: 자사 Remember MICE Configurator(레포 jsx-easy-shift, Lovable/React/Vite/Supabase)에서 견적이 확정되면 "커뮤니케이터로 행사 생성"으로 S0 위저드를 프리필한다. 통합 수준 A(핸드오프)를 v1.5의 전제로 두고, B(같은 Supabase 동거)·C(단일 플랫폼)는 Phase 4 게이트에서 결정한다.

| 커뮤니케이터 projects | Configurator 견적 헤더 (가정 — 실필드명은 분석 보고로 교체) | 변환 |
|---|---|---|
| name | 행사명 | 그대로 |
| code | (없으면) 행사명 이니셜+연도 2자리 자동 제안 | S0 ①에서 확인 |
| event_date / event_end_date | 행사 일자(시작·종료) | date |
| start_time / end_time | 운영 시간 | time |
| venue | 베뉴 DB 선택값(명칭·홀) | text 결합 |
| expected_headcount | 예상 인원(Tier 산정 입력) | int |
| seating | 좌석 형태 옵션 | text |
| event_type | 리드젠 포함 여부 → recruiting / 미포함 → general | 매핑 |
| organizer / target_audience | 고객사명 / 대상 설명 | text |
| overview_items | 견적 요약(Tier·섹션·옵션·총액 제외) | 키-값 불릿 (금액은 수신하지 않음 — #RULE 발주처 노출 방지) |
| wbs_tasks 시드 | Configurator 37태스크 코드(origin_role) | 이미 §15로 이식 — 코드 일치 검증만 |

수신 방식(가정): ① 1차 = JSON 파일/URL 파라미터 수동 임포트(S0 ① 상단 "견적에서 가져오기") ② 2차 = 같은 Supabase면 `configurator_quotes` 뷰 직접 조회. 확정은 jsx-easy-shift 읽기 분석 보고(스키마·견적 출력 구조) 수령 후 v1.5.1로 개정한다.
