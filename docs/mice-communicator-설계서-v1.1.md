# MICE 커뮤니케이터 — 시스템 설계서 v1.1

| 항목 | 내용 |
|---|---|
| 문서 상태 | v1.1 확정 — jc-redteam Deep Audit 반영 개정 (2026-08-19, 감수 리포트 별첨) |
| 목적 | Claude Code가 본 문서만으로 추가 질문 없이 구현 착수 |
| 정본 관계 | 스키마·상태 머신·API 계약은 본 문서가 SoT. 구현 지침·작업 순서는 동봉 CLAUDE.md |
| 확정 결정 | 아키텍처=하이브리드(파일=Drive, 상태=Supabase) / 발주처=무로그인 토큰 링크 / 컨펌 발송=PM 단독 / 업로드=웹앱 경유 원칙+Drive 감지 인박스 / 등록 1차=CSV 임포트 / **구현 순서=프론트 우선·서버 후행 이식(DataProvider 어댑터 계층)** |

---

## 1. 시스템 개요

MICE 프로젝트 착수 시 역할별(디자인·운영·등록·발주처) 산출물을 **단일 저장소(Google Drive)** 에 업로드·관리하고, **발주처 컨펌까지 한 화면**에서 처리하는 협업 허브.

**핵심 설계 원칙**
1. 파일 실체는 전부 Google Drive에 산다. 앱이 사라져도 파일과 폴더 구조는 온전히 남는다.
2. 워크플로우 상태(컨펌·버전·RSVP·코멘트)는 Supabase(Postgres)가 갖는다.
3. 발주처는 로그인 없이 토큰 링크 하나로 컨펌과 현황 확인만 한다. 내부 초안·단가·정산은 구조적으로 노출 불가.
4. 디자인보다 기능·편의성 우선 — 화면은 최소, 클릭 수는 최소.
5. Drive 공유 권한은 앱이 절대 변경하지 않는다. 파일 접근은 항상 앱 프록시 경유.

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
- Mock 단계 산출: UI/UX 전체 검증 + 발주처 데모 라우트(`/c/demo`)
- 리스크 직렬화: 최대 리스크인 Drive 계층(OAuth·프록시)을 최후행에 배치

---

## 3. 모듈 구조 (6개)

| # | 모듈 | 하위 기능 | 데이터 성격 |
|---|---|---|---|
| 1 | 디자인 | 디자인의뢰서(양식+첨부) / 키비주얼 / 제작물(품목: 배너·명찰·백월·리플렛·사이니지 등) | deliverable + 버전 파일 |
| 2 | 운영 | 운영 시나리오 / 큐시트 / 프로그램 구성 | deliverable + 버전 파일 |
| 3 | 등록 | 모객 RSVP(리스트·발송상태·응답) / 참관객 등록 / 참관객 관리(체크인·통계) | 정형 데이터 테이블 |
| 4 | 발주처 | 컨펌 큐(전 영역 컨펌요청 집결) / 운영현황 대시보드 | 뷰 전용(자체 데이터 없음) |
| 5 | 일정 | D-day / 영역별 마감 / 컨펌 기한 | milestones + approvals.due_at |
| 6 | 공통 | 홈 미결 대시보드 / 기획 문서 / 회의록·의사결정 로그 / 예산·정산 문서함 / 알림 / 미등록 파일 인박스 | 혼합 |

- 회의록·예산 문서는 별도 모듈 UI 없이 deliverables의 area='common' 카테고리로 수용 (컨펌 루프 없이 보관·버전만).

---

## 4. 데이터 모델 (Postgres DDL 요약)

> 타입·제약은 아래가 정본. 마이그레이션 파일은 이 순서대로 작성.

```sql
-- 열거형
create type member_role as enum ('pm','design','ops','reg');
create type deliverable_area as enum ('design','ops','common');
create type deliverable_status as enum
  ('draft','internal_review','pending_approval','changes_requested','approved','final');
create type approval_decision as enum ('approved','changes_requested');
create type invite_status as enum ('none','sent','accepted','declined');
create type attendee_channel as enum ('rsvp','onsite','import');

-- 1. 프로젝트
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,          -- 행사 약칭 (파일명 규약에 사용, 전역 유일)
  event_date date,
  drive_root_folder_id text,          -- 표준 트리 루트
  slack_webhook_url text,
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

-- 무결성 보조 (v1.1 — 감수 M-3·Minor 반영)
create unique index uq_rsvp_email on rsvp_contacts (project_id, lower(email)) where email is not null;
create unique index uq_attendee_email on attendees (project_id, lower(email)) where email is not null;
-- deliverables.updated_at은 moddatetime 트리거로 자동 갱신
-- client_tokens.contact_id insert 시 contact의 project_id 일치를 앱 레벨에서 검증(교차 프로젝트 연결 차단)
```

---

## 5. 컨펌 워크플로우 — 상태 머신 (정본)

```
draft ──(담당/PM)──> internal_review ──(PM만)──> pending_approval
  ▲                        │                          │
  │                 (PM 반려)│                  (발주처 토큰)
  │                        ▼                          ├──> approved ──(시스템)──> final
  └──(새 버전 업로드)── changes_requested <────────────┘        └ 06_발주처공유 스냅숏 완료 시
```

| 전이 | 주체 | 부수 효과 |
|---|---|---|
| draft → internal_review | 영역 담당 또는 PM | Slack 알림 |
| internal_review → draft | PM (반려) | 코멘트 필수 |
| internal_review → pending_approval | **PM 단독** | **발송 조건: 해당 버전이 미리보기 포맷(PDF·PNG·JPG)일 것** — approvals 생성, 발주처 이메일(토큰 링크), Slack |
| pending_approval → approved | 발주처 토큰 | approvals.decision 기록, Slack |
| approved → final | 시스템 자동 | `copy_file` → `06_발주처공유/` **성공 후에만 final 커밋** — 실패 시 approved 유지+재시도 큐 (v1.1, M-4) |
| pending_approval → changes_requested | 발주처 토큰 | client_comment 필수, Slack |
| changes_requested → draft | 새 버전 업로드 시 자동 | version_no+1 |

- `requires_approval=false` 항목(회의록·예산 등 common)은 draft ↔ internal_review만 사용.
- 등록 모듈은 상태 머신 미사용 — 파이프라인: rsvp_contacts(none→sent→accepted/declined) → attendees(등록) → checked_in_at(체크인).

---

## 6. 권한 모델

### 6.1 역할 매트릭스 (앱 레벨 + RLS 이중 강제)

| 기능 | pm | design | ops | reg | 발주처(token) |
|---|---|---|---|---|---|
| 자기 영역 deliverable 생성·업로드 | ● | ●(design) | ●(ops) | — | — |
| 전 영역 열람 | ● | ● | ● | ● | — |
| internal_review 전이 | ● | ● | ● | — | — |
| pending_approval 발송 | ● | — | — | — | — |
| 승인/수정요청 | — | — | — | — | ● |
| 코멘트 | ● | ● | ● | ● | ●(자기 큐 항목) |
| 등록 데이터 CRUD | ● | — | — | ● | — |
| 멤버·토큰·설정·Drive 연결 | ● | — | — | — | — |

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
| POST /projects | 로그인 | 프로젝트 생성 + Drive 표준 트리 생성 + 세션 2파일 템플릿 복사 |
| POST /projects/{id}/members | pm | 멤버 초대(역할 지정) |
| POST /projects/{id}/client-tokens | pm | 토큰 발급 (연락처·만료) / DELETE = 회수 |
| GET /projects/{id}/dashboard | 멤버 | 홈 데이터(미결 컨펌·D-day·인박스 수·영역 진행률·최근 활동) |
| POST /deliverables | 역할-영역 일치 | 항목 생성 + Drive 하위 폴더 생성 |
| PATCH /deliverables/{id}/status | §5 전이 규칙 | 상태 전이 (검증 실패 시 409) |
| POST /deliverables/{id}/versions | 역할-영역 일치 | §7.2 업로드 |
| POST /deliverables/{id}/approvals | **pm** | 컨펌 발송 (due_at 지정) → 이메일+Slack |
| GET /files/{version_id} | 멤버 or 유효 토큰(스코프 검증) | 프록시 스트리밍 |
| GET /c/{token}/queue | 토큰 | 컨펌 대기 목록(+미리보기 메타) |
| POST /c/{token}/decisions | 토큰 | {approval_id, decision, comment} → §5 전이 |
| GET /c/{token}/status | 토큰 | 현황 대시보드 데이터(진행률·마일스톤·최근 확정본) |
| POST /registration/import | pm·reg | CSV 업로드 → rsvp_contacts/attendees 벌크 insert (중복=email 기준 upsert) |
| PATCH /attendees/{id}/checkin | pm·reg | 체크인 토글 |
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

## 10. 화면 명세 (8개)

| # | 화면 | 구성 | 주요 액션 |
|---|---|---|---|
| S1 | 홈 대시보드 | 미결 컨펌(기한순) · D-day·마일스톤 · 미등록 인박스 · 영역별 진행률 바 · 최근 활동 | 인박스 연결/무시, 항목 바로가기 |
| S2 | 영역 보드 (design/ops 공용) | 카테고리 그룹 카드: 상태 뱃지·최신 vN·담당·마감 | 항목 생성, 필터(상태·담당), 상태 전이 |
| S3 | 항목 상세 | 버전 이력(최신 뱃지)·미리보기·코멘트 스레드·컨펌 이력·Drive 폴더 링크 | 버전 업로드, 전이, (pm) 컨펌 발송 |
| S4 | 등록 모듈 | 탭: RSVP 리스트 / 참관객 / 통계(응답률·등록수·체크인율) | CSV 임포트·내보내기, 상태 변경, 체크인 토글, RSVP→참관객 전환 |
| S5 | 일정·마일스톤 | 타임라인(D-day 기준) + 영역 필터, 컨펌 기한 오버레이 | 마일스톤 CRUD |
| S6 | 프로젝트 설정 | 멤버·역할 / 발주처 연락처·토큰(발급·회수·최근 접속) / Drive 연결 상태 / Slack Webhook | pm 전용 |
| S7 | 발주처 컨펌 큐 (`/c/{token}`) | 대기 항목 리스트 → 미리보기 → [승인] [수정요청+코멘트] · 처리 완료 이력 | 승인/수정요청 |
| S8 | 발주처 현황 (`/c/{token}/status`) | 영역별 진행률 · 마일스톤 · 최근 확정본 목록(다운로드) | 읽기 전용 |

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
| 등록 CSV 임포트·테이블·체크인 토글·통계 기초 | 통계 대시보드 고도화(mice-dashboard 연동) |
| Slack·이메일 알림 + D-1 리마인드 | 모바일 앱 수준 최적화, 다국어 |

---

## 14. 개정 이력

- **v1.0** (2026-08-19): 최초 확정 — 구조안 v0.9 승인 승격
- **v1.1** (2026-08-19): jc-redteam Deep Audit 반영(판정: 조건부 보완 → 전량 수정) — 코멘트 visibility 분리(C-1) / DataProvider 어댑터 계층·프론트 우선-서버 후행 구현 전략 §2.1 신설(C-2) / 전용 운영 계정+OAuth Production 게시(M-1) / 프록시 스트리밍·100MB 캡·미리보기 포맷 발송 조건·내부 Drive 직접 접근(M-2) / 이메일 partial unique 인덱스(M-3) / final 스냅숏 원자성·재시도(M-4) / Changes API·rename 기본 off(M-5) / 토큰 기본 만료·no-referrer·로그 마스킹(M-6) / Minor 6건(code unique, 기획 카테고리, 규약 확장 명기 등)
