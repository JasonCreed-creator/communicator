# MICE 커뮤니케이터 — 시스템 설계서 v2.2

| 항목 | 내용 |
|---|---|
| 문서 상태 | v2.2 확정 — **정산보드(S-10) 신설** (2026-08-23, 내부정산 실물 13건 분석 기반·시각안 승인). 마진 식(항목 마크업 + PCO 기획료 + RSVP 운영비, 리드젠 제외)을 실물 2건에서 원 단위 검산하고 §19에 정본화한다. §4-23 테이블 4종 + §4-24 계약 R-S1~R-S10, DataProvider **v7 재동결(11메서드 · 86메서드)**. 직전 v2.1 — **랜딩보드(S-3) 정본화 + 랜딩 스코프 계약 + 가격 상수 v1.1 정의** (2026-08-23). 코드가 선행한 Phase 3.13 랜딩보드를 §4-19~§4-22·§8·§10에 정본으로 흡수하고, `listLandingPages`·`createLandingPage`가 현재 행사가 아닌 사용자 첫 멤버십으로 스코프되던 결함을 계약으로 못박는다(§4-21). LED 오퍼레이팅·중계 단가 분리(§17.4)와 골든 데이터셋 출처 규약(§17.3)을 확정. 직전 v2.0: **견적 Configurator(jsx-easy-shift) 단일 플랫폼 통합** (2026-08-22, 시각안 3화면 승인 · 읽기 분석 보고 기반): 견적 모듈 S-2 · 견적→행사 핸드오프 · 새 Supabase 프로젝트 · 인프라 전환 절차. 직전 v1.5: **다중 행사(프로젝트 셀렉터·행사 목록) + 행사 설정 메뉴(개요·담당자 입력) 확장** (2026-08-22, 시각안 3화면 승인). 직전 v1.4.1: v1.4(유형별 WBS·R&R, 2026-08-22 시각안 승인)에 **Phase 3.6·3.7 구현 해석 정본화** 패치: projects.onboarded_at 확정(사용자 승인 2026-08-22) · 임박/지연 배타 산식 · 일반형 28건 파생 규칙 · 재전개 보존 규칙 · 큐시트 스냅숏 mock 규약 (Code PROGRESS 열린 질문 ①~⑤ 종결) |
| 목적 | Claude Code가 본 문서만으로 추가 질문 없이 구현 착수 |
| 정본 관계 | 스키마·상태 머신·API 계약은 본 문서가 SoT. 구현 지침·작업 순서는 동봉 CLAUDE.md |
| 확정 결정 | 아키텍처=하이브리드(파일=Drive, 상태=Supabase) / 발주처=무로그인 토큰 링크 / 컨펌 발송=PM 단독 / 업로드=웹앱 경유 원칙+Drive 감지 인박스 / 등록 1차=CSV 임포트 / **구현 순서=프론트 우선·서버 후행 이식(DataProvider 어댑터 계층)** / **v1.2: 지시(requested)→제작→컨펌→운영계획서(S9) 조립 파이프라인 — 웹 문서 우선, PPTX·발주처 뷰는 2차** / **v1.3: S0 온보딩(개요→유형→담당자) → 유형(일반형·모객형) 모듈 토글 → 큐시트 정형 에디터(3채널 콘솔, 컨펌 스냅숏 자동)** / **v1.4: 유형별 WBS 템플릿 자동 전개(Configurator 37태스크 이식·호환 코드 체계) + 역할별 R&R 카드** / **v1.4.1: 온보딩 완료 상태는 projects.onboarded_at 컬럼이 정본(DataProvider v3.1 재동결)** / **v1.5: 다중 행사 — 사이드바 프로젝트 셀렉터+S-1 행사 목록, "행사 설정" 메뉴 상시 노출(①개요 ②담당자 ③유형·연동), S0 위저드=같은 폼의 단계형, 행사개요 단일 원천(S9 ①은 읽기 조립)** / **v2.0: 견적 모듈(S-2) 흡수 — 가격 엔진·베뉴 DB를 `src/modules/quote`로 이식, 견적 확정→행사 생성 프리필, 견적은 로그인 내부 전용(금액은 발주처·운영계획서에 구조적 비노출), 데이터는 새 Supabase 프로젝트(옛 Configurator DB는 1회 임포트 후 폐기), 도메인 rmb-mice.com 재연결·jsx-easy-shift 아카이브** |

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
7. (v2.0) 행사의 생애는 **견적 → 설정 → 운영 → 결과**로 한 앱 안에서 이어진다. 견적(단가·총액)은 내부 로그인 화면과 Excel에만 존재하며, 발주처 토큰 경로·운영계획서·활동 로그 어디에도 금액이 흐르지 않는다(#RULE-NO-PRICE-TO-CLIENT).

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
| 프론트 | React 18 + Vite + TypeScript + Tailwind 4 | v2.0: Configurator의 가격 엔진·베뉴 DB·Excel 내보내기(ExcelJS)를 모듈로 흡수. shadcn/Radix·Tailwind 3는 도입하지 않음(핵심 화면이 인라인 스타일이라 토큰 재스킨으로 충분) |
| 백엔드 | Supabase Edge Functions (Deno) | 서버 별도 운영 없음. v2.0: **새 Supabase 프로젝트**(ap-northeast-2) — 옛 Configurator 프로젝트는 RLS 개방·무인증·키 하드코딩으로 폐기(§18) |
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
- 동결 이력: v1(35메서드, Phase 1) → v2(41, v1.2 승인) → v3(53, v1.3·v1.4 승인) → v3.1(v1.4.1 — 필드 추가만) → v4(v1.5 승인 — 다중 행사 5메서드) → **v5(v2.0 승인 — 견적 모듈: `listQuotes`·`getQuote`·`createQuote`·`saveQuoteVersion`·`finalizeQuote`·`createProjectFromQuote`·`exportQuoteXlsx`·`listComplianceCards`·`updateComplianceCard` **9메서드** 추가, `Project`에 모객 필드(guarantee_pax·targeting·kpi_show_rate·quote_id), `WbsTask.target` 추가. 기존 시그니처 불변)** → **v6(v2.1 승인 — 랜딩보드 8메서드: `listLandingPages`·`getLandingPage`·`createLandingPage`·`updateLandingPage`·`publishLandingPage`·`deleteLandingPage`·`listLandingMetrics`·`submitLandingLead`)** → **v6.1(v2.1 정정 — 스코프 결함 해소: `listLandingPages(projectId)`·`createLandingPage(projectId, input)`로 시그니처 변경. 나머지 6메서드는 landingId로 프로젝트를 역참조하므로 불변)** → **v7(v2.2 승인 — 정산보드 11메서드: `getSettlementBoard`·`createSettlementBoard`·`rebaseSettlementBoard`·`createSettlementBucket`·`updateSettlementBucket`·`deleteSettlementBucket`·`createSettlementItem`·`updateSettlementItem`·`deleteSettlementItem`·`listVendors`·`upsertVendor` = **86메서드**. 기존 시그니처 불변. 업로드 파싱(`importVendorQuote`)은 서버 의존이라 v8 예약 슬롯으로 남긴다 — §19.5)**. v5부터는 MockProvider와 SupabaseProvider가 동시에 이 인터페이스를 구현한다(Phase 4). 매 해제는 사용자 승인+본 문서 개정 동반이 조건 — **v6은 이 조건을 어기고 코드가 선행했다(2026-08-22 Phase 3.13). v2.1이 사후 정본화하며, 재발 방지 규칙은 §4-21 말미에 둔다**
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
| 8 | 견적 (v2.0, S-2) | 5스텝 에디터(규모·유형 → 베뉴 → 옵션 → 확인·확정 → 행사 만들기) / 버전·확정 잠금 / 섹션별 산출(s1 베뉴·s2 시스템·s3 디자인·s4 운영·s5 PCO 기획료·옵션·모객·참관객) / Excel 내보내기 / 확정 견적 → 행사 생성 프리필 | quotes + 코드 상수(단가·베뉴 DB 20곳·옵션 12종) |

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
create type app_role as enum ('admin','sales','staff');      -- v2.0: 전역 역할 (견적 권한은 admin·sales)
create type quote_status as enum ('draft','proposed','accepted','archived','superseded'); -- v2.0 (Configurator estimates.status 승계)
create type compliance_kind as enum ('internal','client');   -- v2.0 컴플라이언스 카드 종류

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
  -- v2.0 모객형 전용 (Configurator events·special_notes 타겟팅 흡수) — 일반형이면 null·UI 숨김
  guarantee_pax int,                  -- 보장 인원 (events.guarantee_pax)
  kpi_show_rate numeric,              -- 쇼업 KPI % (events.kpi_show_rate)
  targeting jsonb,                    -- 타겟팅 5축 {company_size[],title[],industry[],job[],region[]} (leadTargeting.ts 상수 키)
  quote_id uuid,                      -- v2.0 확정 견적 링크 (quotes.id, 핸드오프 시 기록; FK는 quotes 생성 후 alter)
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

-- 1b. 프로필 (v2.0 — 전역 역할. 견적 메뉴 접근은 admin·sales)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  email text not null,
  app_role app_role not null default 'staff',
  created_at timestamptz default now()
);
-- 신규 가입은 auth 트리거로 profiles 자동 생성(app_role='staff'), 승격은 admin만

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

-- 15b. WBS 소통 대상 (v2.0 — Configurator event_tasks.target 승계)
alter table wbs_tasks add column target text;   -- 예: '고객사', '협력사', '내부' — 템플릿 시드에 포함

-- 16. 역할 헌장 R&R (v1.4 — 유형별 템플릿, 온보딩 담당자 지정 시 부여)
create table role_charters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  role member_role not null,
  origin_role text,
  title text not null,                -- '총괄 PM' 등
  items jsonb not null                -- 책임 불릿 배열
);

-- 17. 컴플라이언스 카드 (v2.0 — Configurator SocDashboard 정적 상수 INTERNAL_COMPLIANCE·CLIENT_COMPLIANCE_RULES 승계, 온보딩 시 시드)
create table compliance_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  kind compliance_kind not null,
  title text not null,
  items jsonb not null,               -- 체크 항목 배열 [{text, checked, checked_at}]
  sort_order int not null default 0
);

-- 18. 견적 (v2.0 — Configurator estimates 승계. 단가·베뉴·옵션 정의는 DB가 아니라 코드 상수(src/modules/quote) — 2차에 pricing_rules DB화)
create table quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete set null,  -- 견적만 있는 단계는 null, 핸드오프 시 연결
  title text not null,                -- 행사명(가칭)
  version int not null default 1,
  status quote_status not null default 'draft',
  is_final boolean not null default false,
  locked_at timestamptz,
  superseded_by uuid references quotes,
  input jsonb not null,               -- 입력 스냅샷: {event_name,event_date,start_time,end_time,event_type,include_leads,headcount,guarantee,venues[],selected_venue,options{},display_type,targeting{},client_company,contact{},manager,notes,adjustments[]} (Configurator config 스키마 승계 + targeting)
  breakdown jsonb not null,           -- 산출 스냅샷: {s1,s2,s3,s4,s5,options,recruit,attendee,subtotal,vat,total} — 엔진 재계산과 일치해야 함(테스트)
  total_amount bigint not null,       -- 원 단위 (VAT 별도)
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index uq_quote_final_per_project on quotes (project_id) where is_final and project_id is not null;
alter table projects add constraint fk_projects_quote foreign key (quote_id) references quotes(id);
-- 확정(is_final) 후 input·breakdown·total_amount 변경은 트리거로 거부(409) — Configurator lock_finalized_estimate 승계. 수정은 새 버전(superseded_by 체인)

-- 19. 랜딩 페이지 (v2.1 — Phase 3.13 사후 정본화. 섹션·폼·동의는 mock과 1:1로 jsonb 유지, 정규화는 2차)
create table landing_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,  -- **행사 종속. §4-21 스코프 계약**
  title text not null,
  slug text not null,                 -- 영소문자·숫자·하이픈. 내보낸 파일명·공개 주소에 사용
  status landing_status not null default 'draft',   -- draft | published | closed
  public_url text,                    -- 내보낸 HTML을 올린 위치(수동 입력). 앱이 서빙하지 않는다
  sticky_nav boolean not null default true,
  cta_label text not null default '참가 신청',
  submit_target landing_submit_target not null default 'registration',  -- registration | external
  external_submit_url text,           -- submit_target='external'일 때만
  analytics jsonb not null default '{}'::jsonb,  -- {ga_measurement_id, conversion_event}
  sections jsonb not null default '[]'::jsonb,        -- LandingSection[] (type·정렬·autofill 여부·본문)
  form_fields jsonb not null default '[]'::jsonb,     -- LandingFormField[]
  consents jsonb not null default '[]'::jsonb,        -- LandingConsent[] (필수 동의는 개인정보 항목)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz
);
create unique index uq_landing_slug on landing_pages (project_id, slug);   -- slug는 **행사 안에서만** 유일
create index ix_landing_project on landing_pages (project_id, updated_at desc);

-- 20. 랜딩 일자별 유입 지표 (v2.1 — mock=픽스처 / Phase 4=GA Data API 적재)
create table landing_daily_metrics (
  landing_id uuid not null references landing_pages on delete cascade,
  day date not null,
  pageviews int not null default 0,
  visitors int not null default 0,
  form_views int not null default 0,
  submits int not null default 0,
  primary key (landing_id, day)
);
-- 지표는 GA에서 당겨온 파생값이다. 앱이 직접 계측하지 않으며, 제출 수(submits)와 attendees 실제 행 수는
-- 일치하지 않을 수 있다(중복 제출·외부 제출 대상). 불일치는 화면에 그대로 노출하고 보정하지 않는다.

-- 무결성 보조 (v1.1 — 감수 M-3·Minor 반영)
create unique index uq_rsvp_email on rsvp_contacts (project_id, lower(email)) where email is not null;
create unique index uq_attendee_email on attendees (project_id, lower(email)) where email is not null;
-- deliverables.updated_at은 moddatetime 트리거로 자동 갱신
-- client_tokens.contact_id insert 시 contact의 project_id 일치를 앱 레벨에서 검증(교차 프로젝트 연결 차단)
```

### §4-21 랜딩 스코프 계약 (v2.1 — 결함 정정)

랜딩은 **행사에 종속된 산출물**이다. "현재 행사"는 언제나 `ProjectContext`가 보관한 선택 행사이며, 사용자의 멤버십 행에서 유도하지 않는다.

| 규칙 | 내용 |
|---|---|
| R-L1 | 목록·생성 API는 **projectId를 인자로 받는다**. `listLandingPages(projectId)` · `createLandingPage(projectId, input)` |
| R-L2 | 조회·수정·발행·삭제·지표는 `landingId`로 대상을 찾고, 권한·쓰기 가드는 **그 랜딩의 `project_id`**로 판정한다(`landing.project_id`, 사용자 소속이 아님) |
| R-L3 | `status='closed'` 행사에서는 랜딩 **생성·수정·발행·삭제가 전부 409**. 판정 대상은 R-L1/R-L2가 정한 projectId다 |
| R-L4 | slug 유일성은 `(project_id, slug)` 복합 — 다른 행사가 같은 slug를 쓰는 것은 정상이다 |
| R-L5 | 폼 제출(`submitLandingLead`)은 랜딩의 `project_id`로 `attendees`(channel='rsvp')에 적재한다. 교차 행사 적재는 금지 |

> **왜 규칙으로 못박는가** — Phase 3.13 구현에서 `listLandingPages()`가 인자 없이 `currentUser().project_id`(멤버십 첫 행)로 필터해, 다른 행사를 보고 있어도 같은 목록이 뜨고 종료 행사에서도 생성이 통과했다. v1.5가 `PROJECT_ID` 상수를 없앴지만 **DoD grep이 리터럴 `PROJECT_ID`만 검사**해 `user.project_id` 경로가 통과했다.
>
> **재발 방지(정본)**: ① DoD grep 대상에 `user.project_id`·`currentUser().project_id`를 추가하고, 프로젝트 스코프가 필요한 provider 메서드는 **projectId 인자 없이는 구현 금지**. ② 새 모듈은 "행사 A를 보다가 B로 전환하면 목록이 바뀐다"를 테스트로 반드시 포함. ③ **DataProvider 동결 해제는 설계서 개정이 선행**한다 — v6은 이 순서를 어겼고 v2.1이 사후 정본화한 사례다.

### §4-22 랜딩 → 등록 유입 계약 (v2.1)

| 항목 | 내용 |
|---|---|
| 제출 대상 | `submit_target='registration'`이면 앱 내부 등록(S4)으로, `'external'`이면 `external_submit_url`로 넘긴다 |
| 적재 | 내부 제출은 `attendees`에 `channel='rsvp'`로 1행. 랜딩 폼 필드 ↔ 참관객 필드 매핑은 이름·소속·직함·이메일·연락처 고정 |
| 개인정보 | 필수 동의(consents) 미체크 제출은 거부. 동의 이력은 제출 행에 함께 남긴다 |
| 지표 | 화면의 페이지뷰·순 방문자·폼 열람·신청 완료는 **§4-20의 GA 파생값**이며 `attendees` 집계와 별개다. 두 값이 다를 수 있음을 화면 캡션에 명시한다 |
| 금액 | 랜딩은 발주처·외부 공개물이다. **§원칙 7(NO-PRICE-TO-CLIENT)이 그대로 적용** — 섹션 템플릿·autofill·내보낸 HTML 어디에도 견적 금액이 들어가지 않는다 |

---

### §4-23 정산 테이블 (v2.2 — S-10)

```sql
-- 협력사 마스터 (프로젝트 비종속 — 조직 단위)
create table vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- 실거래처명 (#RULE-NO-COMPANY 예외, 픽스처는 가상명)
  biz_no        text,                             -- 사업자번호 (선택)
  note          text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index vendors_name_uniq on vendors (name) where archived_at is null;

-- 정산 보드 (행사당 1개, 확정 견적 스냅숏 보유)
create table settlement_boards (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references projects(id) on delete cascade,
  quote_id          uuid references quotes(id),   -- 기준 견적 (스냅숏 출처)
  quote_version     int,                          -- 스냅숏 시점 버전
  baselined_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 버킷 (기본 9 + 행사별 추가) — §19.2
create table settlement_buckets (
  id              uuid primary key default gen_random_uuid(),
  board_id        uuid not null references settlement_boards(id) on delete cascade,
  code            text not null,                  -- s1·s2·s3·s4·ot·at·s5·rc·ld 또는 custom 슬러그
  label           text not null,
  quote_amount    bigint not null default 0,      -- 부가세 별도, 스냅숏 시점 고정
  has_cost        boolean not null default true,  -- false = 원가 없음(발주·실비 입력 금지)
  is_margin_base  boolean not null default true,  -- false = 마진 기준 계약액에서 제외(리드젠)
  source          text not null default 'quote'   -- 'quote' | 'custom'
                  check (source in ('quote','custom')),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create unique index settlement_buckets_code_uniq on settlement_buckets (board_id, code);

-- 항목 (발주 단위 = 견적 항목 단위) — §19.3
create table settlement_items (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references settlement_boards(id) on delete cascade,
  bucket_id          uuid not null references settlement_buckets(id) on delete cascade,
  title              text not null,
  spec               text,
  vendor_id          uuid references vendors(id),
  assignee_id        uuid references profiles(id),
  ordered_amount     bigint,                      -- 발주(약정) · 부가세 별도
  actual_amount      bigint,                      -- 실비(집행) · 부가세 별도
  input_amount_raw   bigint,                      -- 담당자가 실제로 받은 원본 금액(포함/별도 표기 그대로)
  vat_included_input boolean not null default false,
  status             text not null default 'planned'
                     check (status in ('planned','ordered','settled','cancelled')),
  evidence           text,                        -- 세금계산서·카드전표 등 근거 표기
  import_id          uuid references settlement_imports(id),  -- 업로드에서 생성된 경우
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index settlement_items_bucket on settlement_items (bucket_id);

-- 협력사 견적서 업로드 (Phase 4.7 — 스키마만 v2.2에서 확정) — §19.5
create table settlement_imports (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references settlement_boards(id) on delete cascade,
  file_name    text not null,
  drive_file_id text,                             -- 원본 보존 (Phase 5 이후)
  vendor_id    uuid references vendors(id),
  parsed       jsonb,                             -- 파싱 결과 원본
  questions    jsonb,                             -- 확인 큐 (미해결 항목)
  status       text not null default 'parsed'
               check (status in ('parsed','confirmed','discarded')),
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
```

> `settlement_items.import_id`는 `settlement_imports`를 참조하므로 마이그레이션 순서는 **vendors → settlement_boards → settlement_buckets → settlement_imports → settlement_items**다.

### §4-24 정산 계약 (v2.2 — 정본)

| 규칙 | 내용 |
|---|---|
| R-S1 | 정산은 **행사에 종속**된다. 목록·생성 API는 projectId를 인자로 받는다(§4-21 R-L1 승계). `currentUser().project_id`로 유도 금지 |
| R-S2 | 기준 견적은 **스냅숏**이다. 버킷의 `quote_amount`는 불러온 시점에 고정되며 `quotes`를 실시간 참조하지 않는다. 갱신은 `rebaseSettlementBoard`로만 — 이전 기준과의 차이를 보여주고 activity_log에 남긴다 |
| R-S3 | 모든 금액은 **부가세 별도**로 저장한다. `vat_included_input=true`로 들어온 값은 저장 직전 `round(v / 1.1)`로 분리하고 원본을 `input_amount_raw`에 남긴다(§19.4) |
| R-S4 | `has_cost=false` 버킷(`s5`·`rc`·`ld`)에는 **발주·실비를 넣을 수 없다** — API는 422, UI는 입력 칸 자체를 두지 않는다 |
| R-S5 | `is_margin_base=false` 버킷(`ld` 리드젠)은 마진 기준 계약액에서 제외한다. 화면에서 **숨기지 않고** 회색으로 남겨 제외 사유를 보인다 |
| R-S6 | 발주는 **항목 단위**다. 한 항목에 협력사 하나. 협력사가 여러 항목을 묶어 청구하면 항목별로 나눠 적는다(§19.3) |
| R-S7 | `projects.status='closed'`에서는 정산 **생성·수정·삭제가 전부 409**(`assertWritable` 승계) |
| R-S8 | 견적 초과는 **막지 않는다**. 버킷 헤더 경고 + 홈 카드로 알리되 저장은 통과시킨다 — 정산은 사후 기입이라 게이트는 이미 쓴 돈을 막는 셈이다 |
| R-S9 | 정산 데이터는 **발주처 토큰 경로·운영계획서 조립·랜딩·알림 본문 어디에도 나가지 않는다**. 금지 키·검사 범위는 §19.7 |
| R-S10 | 마진 식과 항등식은 §19.1이 정본이다. 화면은 `마진 기준 계약액 − Σ실집행 = 최종 마진`을 검산해 어긋나면 경고한다 |

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
| 견적 생성·버전·확정·Excel (v2.0) | ●(app_role admin·sales만 — 프로젝트 역할과 무관) | — | — | — | — |
| 연결 견적 요약 열람 (v2.0) | ●(해당 행사 pm) | — | — | — | — (토큰 경로는 quotes 테이블 자체를 조회 불가) |
| 컴플라이언스 카드 체크 (v2.0) | ● | ● | ● | ● | — |
| 정산보드 열람 (v2.2) | ● | ● | ● | ● | — (토큰 경로는 settlement_* 조회 불가) |
| 정산 버킷 추가·삭제·기준 견적 갱신 (v2.2) | ● | — | — | — | — |
| 발주 항목 생성 (v2.2) | ● | — | — | — | — |
| 발주액·실비 입력 (v2.2) | ● | ●(자기 담당 항목) | ●(자기 담당 항목) | ●(자기 담당 항목) | — |
| 협력사 마스터 등록·수정 (v2.2) | ● | ● | ● | ● | — |

### 6.2 RLS 방향
- 모든 테이블: `project_id in (select project_id from project_members where user_id = auth.uid())`.
- 쓰기: deliverables/versions는 역할-영역 일치 또는 pm. approvals insert는 pm만.
- (v2.2) settlement_boards·settlement_buckets·settlement_items·settlement_imports: `select` = 프로젝트 멤버 전원. `insert·update·delete` = 보드·버킷·기준 갱신은 pm만, 항목 금액은 pm 또는 `assignee_id = auth.uid()`. vendors는 조직 단위라 로그인 사용자 전원 `select`, `insert·update`도 전원(중복 등록 방지는 unique 인덱스). **토큰 경로 화이트리스트에 settlement_*·vendors를 추가하지 않는다**(§19.7).
- (v2.0) quotes: `select` = profiles.app_role in (admin,sales) OR (project_id가 null이 아니고 해당 프로젝트 pm 멤버) / `insert·update` = admin·sales만. compliance_cards·profiles: 멤버 범위.
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
| GET /projects/{id}/landings | 멤버 | 그 행사의 랜딩 목록(최신 수정순) — **projectId 필수, §4-21 R-L1** (v2.1) |
| POST /projects/{id}/landings | 멤버 | 랜딩 생성. 섹션·폼·동의는 기본 템플릿 시드, autofill 섹션은 행사 개요·세션·존에서 즉시 조립. closed 행사면 409 (v2.1) |
| PATCH /landings/{id} · POST /landings/{id}/publish · DELETE /landings/{id} | 멤버(삭제=pm) | 수정·발행(공개 주소 기록, null이면 draft 복귀)·삭제. 권한 판정은 `landing.project_id` 기준 (v2.1) |
| GET /landings/{id}/metrics | 멤버 | 일자별 유입 지표. mock=픽스처 / Phase 4=GA Data API (v2.1) |
| POST /landings/{id}/leads | 공개(폼) | 랜딩 폼 제출 → attendees(channel=rsvp) 적재. §4-22 계약 (v2.1) |
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
| GET /quotes · GET /quotes/{id} | admin·sales (+연결 행사 pm은 요약만) | 견적 목록(버전 체인·상태·총액)·상세 (v2.0) |
| POST /quotes · POST /quotes/{id}/versions | admin·sales | 새 견적 / 새 버전(이전 버전 superseded) — 서버가 엔진으로 breakdown·total 재계산해 저장(클라이언트 값 신뢰 안 함) (v2.0) |
| POST /quotes/{id}/finalize | admin·sales | is_final=true·locked_at 기록. 같은 프로젝트의 다른 final은 archived (v2.0) |
| POST /quotes/{id}/create-project | admin·sales | **핸드오프**: 확정 견적에서 projects 생성(§16 매핑으로 프리필, onboarded_at null) + quote.project_id·project.quote_id 상호 연결 → S0 진입 (v2.0) |
| GET /quotes/{id}/export.xlsx | admin·sales | ExcelJS 견적서 — 자동 외부 업로드 없음(Phase 5에서 Drive 저장은 명시 버튼) (v2.0) |
| GET·PATCH /compliance-cards | 멤버(체크)·pm(편집) | 컴플라이언스 카드 (v2.0) |

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

**진입점 원칙(v1.5)**: 모든 화면은 사이드바 메뉴 또는 명시적 버튼으로 도달 가능해야 하며, 데모 픽스처는 그 진입 흐름을 실제로 보여줘야 한다(게이트 뒤에만 존재하는 화면 금지). 사이드바 순서(v2.0): [프로젝트 셀렉터] → 행사 목록 → **준비** 그룹(견적 · 랜딩보드 · 행사 설정) → **운영** 그룹(홈 → 디자인 보드 → 운영 보드 → 등록 → 일정 → 운영계획서 → **정산보드(v2.2)**). 정산보드는 견적 메뉴와 달리 **프로젝트 멤버 전원에게 보인다**(내부 한정·발주처 비공개). 견적 메뉴는 app_role이 admin·sales가 아니면 숨김. 셀렉터에 "견적만 있음 · 행사 미생성" 상태 표시.

| # | 화면 | 구성 | 주요 액션 |
|---|---|---|---|
| 공통 | 프로젝트 셀렉터 (v1.5) | 사이드바 최상단 드롭다운: 진행 중/종료 그룹, 행사명·유형·D-day·미결 컨펌/지연 요약, "＋ 새 행사 만들기", "전체 목록 보기" | 전환(컨텍스트 변경·마지막 선택 기억), 새 행사 → S0 |
| S-2 | 견적 (v2.0, 메뉴 "준비" 그룹) | 좌: 견적 버전 표(버전·인원·베뉴·모객 포함·총액·상태) / 우: 선택 버전 요약(섹션별 금액·합계·VAT 별도) / 에디터 5스텝 ①규모·유형(행사명·일자·시간·유형·인원·보장·타겟팅) ②베뉴(20곳 필터·홀 적합도·후보 택1) ③옵션(12종+부스) ④확인·확정(Excel 미리보기) ⑤행사 만들기(확정 후 활성) | 새 버전·확정·Excel 내려받기·"이 견적으로 행사 만들기". 접근 = admin·sales. 금액은 이 화면과 Excel에만 |
| S-3 | 랜딩보드 (v2.1, 메뉴 "준비" 그룹) | 좌: 랜딩 표(제목·slug·상태·GA 측정 ID·수정일) / 우: 선택 랜딩 요약(공개 주소·제출 대상·GA·전환 이벤트) + 유입 지표 4카드(페이지뷰·순 방문자·폼 열람·신청 완료)와 일자별 막대. 빌더는 섹션 템플릿 13종·폼 필드·동의 편집 + HTML 내보내기(GA 주입) | 새 랜딩·편집·발행·내보내기. **현재 행사의 랜딩만 보인다(§4-21)**. 지표는 GA 파생값 — mock 단계에서는 픽스처임을 화면에 명시 |
| S-1 | 행사 목록 (v1.5) | 카드 그리드(행사명·유형·일자·장소·D-day·PM·예상 인원·미결/지연/확정·전체 진행률). 세팅 미완료 행사는 "온보딩 n/3" 표시, 종료 행사는 접힘 | 카드 클릭=전환, 새 행사 만들기, 종료/재개(pm) |
| S0 | 새 행사 위저드 (v1.3→v1.5 재정의) | **행사 설정 ①②③과 동일한 폼 컴포넌트**를 3단계로 배치: ①행사개요(필수 4: 행사명·코드·시작일·장소) ②담당자(내부 담당자 입력 — 이름·이메일·역할, PM 1명 필수 / 발주처 담당자·토큰 선택) ③유형·확인(일반형/모객형, WBS 전개 예고) | 완료 = onboarded_at 기록 + WBS 전개 + R&R 시드. 미완료 행사는 목록에 남고 진입 시 행사 설정으로 유도(차단 아님) |
| S1 | 홈 대시보드 | 미결 컨펌(기한순) · D-day·마일스톤 · **지연/임박 WBS 태스크(v1.4)** · 미등록 인박스 · 영역별 진행률 바 · 최근 활동 | 인박스 연결/무시, 항목·태스크 바로가기 |
| S2 | 영역 보드 (design/ops 공용) | 카테고리 그룹 카드: 상태 뱃지(지시됨 포함)·최신 vN·담당·마감 | 항목 생성, (pm) 지시 발행 폼, 필터(상태·담당), 상태 전이 |
| S3 | 항목 상세 | 지시 카드(브리프·스펙 칩, v1.2)·버전 이력(최신 뱃지)·미리보기·코멘트 스레드·컨펌 이력·Drive 폴더 링크 — **큐시트 항목은 파일 대신 정형 에디터 렌더(v1.3: 행 편집·드래그 정렬·대본 전문)** | 버전 업로드, 전이, (pm) 컨펌 발송(큐시트=스냅숏 자동) |
| S4 | 등록 모듈 | 탭: RSVP 리스트 / 참관객 / 통계(응답률·등록수·체크인율) | CSV 임포트·내보내기, 상태 변경, 체크인 토글, RSVP→참관객 전환 |
| S5 | 일정·WBS·R&R (v1.4 승격) | 단계 필터(1~6)·체크리스트/간트 토글·태스크(코드·기간·담당·**소통 대상(v2.0)**·상태·산출물 연결 뱃지)·R&R 카드 그리드·**컴플라이언스 카드 2종(내부·고객사 계약 규약, v2.0 — 체크 가능)**·컨펌 기한 오버레이 | 태스크 체크(담당+pm)·편집(pm), 템플릿 재전개(pm), 마일스톤 CRUD |
| S6 | 행사 설정 (v1.5 재정의 — 메뉴 2번째 상시 노출) | 탭 ①행사개요: 행사명·코드·유형·시작/종료일·시작/종료 시간·장소·예상 인원·좌석 형태·주제·주최/주관·사회자·참가 대상·기타 개요 항목(overview_items) + **(v2.0) 모객형 전용 그룹: 보장 인원·쇼업 KPI·타겟팅 5축 칩, 연결 견적 링크("견적 v3 확정 기준")** — **행사개요의 단일 원천(S9 ①은 여기서 읽기 조립, 인라인 편집 제거)** / 탭 ②담당자: 내부 담당자 표(추가 행·삭제·역할 변경) + 발주처 담당자·토큰 통합 표(발급·회수·링크 복사) + R&R 미리보기 / 탭 ③유형·연동: 유형 토글 안내·Drive·Slack | pm 편집(타 역할 읽기). 상단에 "세팅 완료·일자" 또는 "세팅 미완료(필수 n개)" 뱃지 |
| S7 | 발주처 컨펌 큐 (`/c/{token}`) | 대기 항목 리스트 → 미리보기 → [승인] [수정요청+코멘트] · 처리 완료 이력 | 승인/수정요청 |
| S8 | 발주처 현황 (`/c/{token}/status`) | 영역별 진행률 · 마일스톤 · 최근 확정본 목록(다운로드) | 읽기 전용 |
| S-10 | 정산보드 (v2.2, 메뉴 "운영" 그룹 마지막) | 상단 KPI 4(마진 기준 계약액·실집행·최종 마진·마진율) + **마진 구성 3분할 막대**(항목 마크업=변동 / PCO 기획료=고정 / RSVP 운영비=고정)와 검산 블록 / 버킷 표(견적·발주·실집행·마크업·마크업률, `has_cost=false`는 "원가 없음"·`ld`는 "마진 계산 밖") / 버킷 펼침 = 발주 항목 표(항목·협력사·담당·발주·실비·상태·증빙) / 협력사 견적서 업로드 패널(Phase 4.7 전에는 안내) | ＋발주 항목(pm)·발주액/실비 입력(담당)·버킷 추가(pm)·기준 견적 바꾸기(pm)·협력사 견적서 올리기. **발주처에게 절대 노출되지 않는다(§19.7)**. 견적 초과는 경고만 하고 막지 않는다 |
| S9 | 운영계획서 (v1.2) | 섹션 자동 조립: ①행사개요(v1.5: 행사 설정 ①에서 읽기 조립 — 일자·시간·장소·인원·좌석·주최·대상 포함) ②프로그램 ③존별 운영(content+도면) ④제작물 리스트(스펙 표+최신 시안·상태 뱃지) ⑤등록 통계 ⑥일정 ⑦큐시트 표(v1.3, 프로그램 다음 배치) — 섹션별 진행률·인쇄 CSS(A4) | 프로그램 인라인 편집(pm·ops), 개요는 "행사 설정에서 편집" 링크, 인쇄(PDF) |

**옛 Configurator 라우트 리다이렉트(v2.0, 도메인 재연결 후 301)**: `/quote`→`/quotes`(로그인 필요) · `/setup`→`/onboarding` · `/configurator`→`/quotes` · `/events`→`/projects` · `/events/:id`→`/projects`(셀렉터 안내) · `/events/:id/soc`→`/schedule` · `/events/:id/soc?client_view=1`→410 안내("발주처 링크는 담당자에게 새 링크를 요청"). 구버전 MiceConfigurator·PreSetup·SocDashboard 화면은 이식하지 않는다(기능은 행사 설정·일정·S-2가 흡수).

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
- (v2.0) 금액 비노출 4중 차단 — 분석 보고에서 확인된 Configurator의 노출 경로를 전부 닫는다: ① `/quote` 공개 렌더 → 로그인+app_role 게이트 ② estimates RLS 개방 → quotes RLS(§6.2) + 새 프로젝트 ③ Excel 다운로드 시 외부 Edge Function으로 자동 Drive 업로드 → 제거(Phase 5 Drive 모듈의 명시 버튼만) ④ `?client_view=1` URL 파라미터 공유 → 폐기(발주처는 `/c/{token}`만). 운영계획서·활동 로그·알림 본문에 금액 필드 포함 금지(테스트로 증명).
- (v2.2) 정산 비노출 — 금지 키에 `settlement`·`ordered_amount`·`actual_amount`·`markup`·`margin`을 추가하고, 검사 범위에 `pages/Landing*`·`lib/landing*`를 추가한다(랜딩은 토큰조차 없는 유일한 완전 공개 지면인데 v2.1까지 검사 밖이었다). 가드는 결함을 되돌려 넣어 **실제로 실패하는지 역검증**한 뒤 통과로 인정한다. 상세는 §19.7.
- (v2.0) 클라이언트 번들에 Supabase URL·anon key 하드코딩 금지 — env만. 베뉴 DB의 `reference_cases`(실고객사명·실거래액)는 이식하지 않는다(#RULE-NO-COMPANY).
- (v2.0) 내부 로그인 = Supabase Auth 이메일 매직링크, 허용 도메인 화이트리스트(env). profiles.app_role 승격은 admin만.

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
| (v1.5) 프로젝트 셀렉터·S-1 행사 목록·행사 설정 3탭·S0 동일 폼·담당자 입력·종료/재개 | (v1.5) URL prefix 라우팅(`/p/:id`)·이메일 초대 수락 흐름(Phase 4)·행사 복제 |
| (v2.0) 견적 모듈 S-2(엔진·베뉴 DB·옵션·버전·확정·Excel)·견적→행사 핸드오프·모객형 필드·컴플라이언스 카드·WBS 소통 대상·새 Supabase·로그인·인프라 전환 | (v2.0) 단가·베뉴·옵션 DB화(pricing_rules)와 관리 화면·견적 PDF·고객용 견적 공유 링크·견적 승인 워크플로우·Configurator 랜딩 아카이브 |
| (v2.2) 정산보드 S-10(마진 3분할·버킷 9+추가·항목 3단 추적·부가세 자동 분리·협력사 마스터) | (v2.2) 협력사 견적서 업로드 파싱(Phase 4.7)·발주서 발행·협력사 단가 누적 통계 → 견적 단가 DB화 연결 |
| — | 현장사진 갤러리·결과보고서 조립 |
| 등록 CSV 임포트·테이블·체크인 토글·통계 기초 | 통계 대시보드 고도화(mice-dashboard 연동) |
| Slack·이메일 알림 + D-1 리마인드 | 모바일 앱 수준 최적화, 다국어 |

---

## 14. 개정 이력

- **v2.2** (2026-08-23): **정산보드(S-10) 신설** — 내부정산 실물 13건 분석 기반, 시각안 승인. ① **§19 정산보드 정본** — 마진 식(항목 마크업 + PCO 기획료 + RSVP 운영비, 리드젠 제외)을 실물 2건에서 원 단위 검산 ② §4-23 테이블 4종(vendors·settlement_boards·settlement_buckets·settlement_items) + settlement_imports ③ **§4-24 정산 계약 R-S1~R-S10** — 견적 스냅숏 고정·부가세 별도 저장·원가 없음 버킷 입력 차단·리드젠 제외·항목 단위 발주·초과는 경고만 ④ 버킷 기본 9종(견적 `recruit`를 rc/ld로 분리하는 것이 유일한 비자명 매핑) + **행사별 버킷 추가**(실물 섹션 수 5~9 가변) ⑤ §6.1 권한 5행·§6.2 RLS·§10 S-10 화면·사이드바 순서 ⑥ **§19.7 비노출 가드 확장** — 금지 키 5종 추가 + 검사 범위에 랜딩 파일 포함 + 역검증 의무 ⑦ §19.5 협력사 견적서 업로드 파싱(Phase 4.7, 스키마만 선반영). **DataProvider v7 재동결(11메서드 · 86메서드)**

- **v2.1** (2026-08-23): **랜딩보드(S-3) 사후 정본화 + 스코프 결함 정정 + 가격 상수 v1.1 확정**. ① §4-19·§4-20 랜딩 테이블 신설 ② **§4-21 랜딩 스코프 계약** — `listLandingPages(projectId)`·`createLandingPage(projectId, input)`로 시그니처 정정, 쓰기 가드는 `landing.project_id` 기준, DoD grep에 `user.project_id` 추가(v1.5가 없앤 단일 프로젝트 전제가 랜딩 모듈에만 되살아난 결함) ③ §4-22 랜딩→등록 유입 계약(금액 비노출 재확인) ④ §8 랜딩 API 6종·§10 S-3 화면 명세·사이드바 순서 갱신 ⑤ **§17.3-4 골든 데이터셋 출처 규약** — 원본 생성기 산출물만 인정, `source.commit`은 실제 생성 커밋(어긋나면 검증 실패로 간주) ⑥ **§17.4 가격 상수** — LED 오퍼레이팅 250만원 = V-mix 스위칭 + 전담 엔지니어 일체(사용자 확정), 화면중계 200만·온라인중계 +150만 증분·전체 녹화 100만, `scaler4k`→`ledOperating` 승계 ⑦ §2.1 동결 이력 정정(v5는 9메서드) + v6·v6.1 기록. **DataProvider v6.1 재동결**

- **v1.0** (2026-08-19): 최초 확정 — 구조안 v0.9 승인 승격
- **v2.0** (2026-08-22): 견적 Configurator 단일 플랫폼 통합 (시각안 3화면 승인, jsx-easy-shift 읽기 분석 보고 기반) — 원칙 7(#RULE-NO-PRICE-TO-CLIENT) · 모듈 8 견적 · profiles(app_role)·quotes·compliance_cards 신설, projects 모객 필드 4종·wbs_tasks.target · API 7건 · S-2 견적 화면·사이드바 준비/운영 그룹·옛 라우트 리다이렉트 · RLS·보안 4중 차단 · DataProvider v5(8메서드) · 부록 §16 핸드오프 계약 확정(실필드 매핑 11/13+보정 2) · §17 이식 인벤토리·검증 기준(골든 벡터 0원 일치) · §18 인프라 전환 절차(새 Supabase·Vercel·도메인·1회 임포트·아카이브). 전제: Lovable 폐기, 홈 레포=communicator, 옛 DB 폐기
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

## 16. 부록 — 견적 → 행사 핸드오프 계약 (v2.0 확정 — jsx-easy-shift main 6047834 분석 기준)

`POST /quotes/{id}/create-project`가 수행하는 매핑. 좌측은 projects, 우측은 quotes.input(= Configurator events·estimates.config 승계 필드).

| projects | quotes.input | 변환 |
|---|---|---|
| name | event_name (없으면 title) | 그대로 |
| code | — | 행사명 이니셜+연도 2자리 자동 제안, S0 ①에서 확인(필수) |
| event_date / event_end_date | event_date / event_end_date(신규, null 허용) | date |
| start_time / end_time | start_time / end_time | time |
| venue | selected_venue.name + ' · ' + selected_venue.hall | 텍스트 결합 (베뉴 DB FK는 두지 않음) |
| expected_headcount | headcount | int |
| guarantee_pax | guarantee | int (모객형만) |
| seating | — (베뉴 홀 capacity 키 theater/banquet/classroom/reception 중 선택값이 있으면 라벨로) | 없으면 null |
| event_type | include_leads ? 'recruiting' : 'general' | 매핑. Configurator 행사 유형 7종(eventTypes.ts)은 overview_items에 "행사 성격"으로 보존 |
| organizer | client_company | 텍스트 (주최≒고객사, S0에서 수정 가능) |
| target_audience | targeting 요약 문장 + notes의 대상 문구 | 텍스트 |
| targeting / kpi_show_rate | targeting{} / 90(기본) | jsonb / numeric |
| overview_items | [{행사 성격}, {담당 매니저}, {고객 연락처 — 이름·이메일}] | 키-값 불릿. **금액·섹션 산출은 어떤 키로도 넘기지 않음** |
| quote_id ↔ quotes.project_id | 상호 링크 | 트랜잭션 |
| wbs_tasks 시드 | — | 온보딩 완료 시 §15 템플릿(target 열 포함)으로 전개 — Configurator event_tasks는 시드하지 않음 |

견적 없이 행사를 먼저 만드는 경로(S-1 → S0)는 그대로 유지. 행사 설정 ①에서 "견적 연결"로 사후 연결 가능(admin·sales).

---

## 17. 부록 — Configurator 이식 인벤토리·검증 기준 (v2.0)

### 17.1 이식 대상 (순수 로직 — 의존 0, 그대로 옮기고 TS 타입만 부여)

| 원본 (jsx-easy-shift) | 이식 위치 (communicator) | 비고 |
|---|---|---|
| src/lib/calcEstimate.js (179) | src/modules/quote/engine/calcEstimate.ts | 가격 엔진 단일 출처. 함수 시그니처·상수 값 불변 |
| src/lib/kpiRules.ts (26) | src/modules/quote/engine/kpiRules.ts | 모객 KPI 인정선 |
| src/lib/venueOptions.ts (31) · components/remember-quote/quoteMode.ts (44) | src/modules/quote/engine/ | 다중 베뉴 택1 · 모객 포함/제외 |
| src/lib/venuedb.js (2,542) | src/modules/quote/data/venuedb.ts | **reference_cases 필드 전부 제거**(실고객사명·실거래액). 20곳·holls·pricing·extraction_confidence 유지. "DO NOT EDIT" 헤더 유지 |
| src/lib/leadTargeting.ts (43) · eventTypes.ts (41) · dateFormat.ts (33) | src/modules/quote/data/ · lib/ | 타겟팅 5축·행사 성격 7종 |
| src/lib/exportEstimate.js (934) | src/modules/quote/export/exportEstimate.ts | ExcelJS·file-saver 유지. **driveUpload 호출·backup 파라미터 제거**. 로고 자산은 public/brand png 사용 |
| handover/cowork-port/remember-pricing-dataset_*.json | src/modules/quote/__tests__/fixtures/pricing-dataset.json | **v1.1.0 기준 골든 벡터 21 + 조정 벡터 1 + 인원 그리드 47행**(v2.1 — LED↔중계 분리 반영). `source.commit`은 **생성에 실제로 사용한 jsx-easy-shift 커밋**이어야 한다(§17.3-4) |
| src/lib/__tests__ (calcEstimate 14·exportEstimate 26·kpiRules 5·pricingExtensions 28·rememberQuote 11) | src/modules/quote/__tests__/ | 84케이스 중 엔진·Excel 관련 전부 이식, UI 의존 케이스는 RTL로 재작성 |

### 17.2 UI 이식
- components/remember-quote/RememberQuoteConfigurator.tsx(1,017, 인라인 스타일·자체 THEMES) → src/pages/QuotePage.tsx + components/quote/* 로 **분해 이식**: 로직·스텝 상태는 유지, 스타일은 tokens.css(웜 페이퍼)로 전면 교체, 한/영 토글은 유지, 다크 토글은 제거(앱 테마 단일).
- 이식하지 않음: MiceConfigurator.jsx(구버전), PreSetup.tsx, EventBriefForm.tsx, EventList.tsx, EventDetail.tsx, SocDashboard.tsx, shadcn/ui 50개, landingPages.js·public/landing-archives(고객 실명 — 아카이브만).

### 17.3 검증 기준 (DoD 21~23의 정본)
1. **엔진 등가**: pricing-dataset.json의 전 벡터(**21+1**, 인원 그리드 47행 포함)에 대해 이식 엔진 산출이 **0원 차이** — Configurator README_코웍이식 합격 기준 그대로. (v2.1: v1.1.0 데이터셋으로 교체)
2. **Excel 등가**: 동일 입력으로 생성한 .xlsx의 셀 값·수식(NUMBERSTRING 한글금액·O/X 재계산)이 원본과 일치(exportEstimate 테스트 26케이스 통과).
3. **비노출**: quotes·breakdown·total_amount가 `/c/*` 응답·운영계획서 조립 데이터·activity_log·알림 페이로드 어디에도 없음(테스트로 증명).
4. **데이터셋 출처(v2.1 신설)**: 골든 데이터셋은 **jsx-easy-shift의 생성기로 만든 산출물만** 인정한다. 커뮤니케이터의 이식 엔진으로 기대값을 만들면 자기 자신과의 비교가 되어 등가 검증이 무의미해진다.
   - `source.repo`·`source.commit`·`source.engine`은 **생성 시점에 실제로 사용한 커밋**을 적는다. 단가를 바꾼 PR 이후에 재생성했는데 `source.commit`이 그 이전 커밋이면 **그 자체로 검증 실패**로 본다.
   - 재생성 절차: ① jsx-easy-shift를 해당 커밋으로 체크아웃 → ② 생성기 실행 → ③ 산출 JSON을 그대로 커밋(수기 편집 금지) → ④ `version`·`generated_at`·`source.commit` 갱신 → ⑤ PR 본문에 원본 커밋 해시 명기.
   - **엔진 상수를 바꾸는 변경은 데이터셋 재생성과 같은 PR에서만** 머지한다(§9 리추얼).

### 17.4 가격 상수 개정 이력 (v2.1 — LED 운용·중계 분리)

2026-08-22 jsx-easy-shift #45 → communicator #19로 이식. **LED 오퍼레이팅과 중계는 완전히 별개 비용**이며, LED 단가에는 어떤 중계 비용도 포함되지 않는다. 중계는 LED를 전제로 하지만, LED가 중계를 강제하지는 않는다(일방 의존).

| 항목 | 정의 (v2.1 확정) | 단가 | 조건 |
|---|---|---|---|
| LED 오퍼레이팅 | **V-mix 스위칭 + 전담 엔지니어 일체** (구 '4K 스케일러/KVM' 슬롯 승계 — 단가 동결, 성격만 장비→운영으로 재정의. **사용자 확정 2026-08-23**) | 2,500,000 | 100명 이상 + LED 운용 시 시스템 기본 포함. 100명 미만은 옵션 |
| 화면중계 | 발표자·무대 실황을 행사장 화면에 실시간 송출 | 2,000,000 | 카메라 최소 2대. LED 선행 필수 |
| 온라인중계 | 외부 온라인 송출 + 중계녹화 | +1,500,000 (합계 3,500,000) | 카메라 3대. 화면중계 위에 얹히는 **증분** — 단독 선택 시 화면중계가 자동 포함되고, 둘 다 선택해도 이중 과금되지 않는다 |
| 전체 녹화·편집 | 전 세션 풀 녹화 + 세션별 편집본 | 1,000,000 | 중계 시스템(카메라·스위칭) 선행 필수 |

- 옵션 키: 구 `scaler4k` → 신 `ledOperating`. 엔진은 `normalizeOptions()`로 구 키를 승계하므로 **저장된 옛 견적은 그대로 복원**된다. UI·저장 경로는 신 키 단일로 수렴한다.
- `relayBreakdown`이 중계 과금의 단일 출처이며 Excel 내보내기도 이 값을 소비한다(게이트 재유도 금지).
- **PRD·CLAUDE.md의 `system_scaler4k_auto` 키 표기는 `system_led_operating_auto`로 정정**한다(v2.1).

---

## 18. 부록 — 인프라 전환 절차 (v2.0 → Phase 4·4.6 수행, 사용자 확인 게이트 표시 ■)

1. **새 Supabase 프로젝트** 생성(리전 ap-northeast-2, 이름 예: remember-mice-platform) ■ → URL·anon key·service role key 3종. service role은 Code 세션 env·Supabase Vault에만(챗·문서에 절대 기재 금지).
2. Auth: 이메일 매직링크 활성, 허용 도메인 env(`AUTH_ALLOWED_DOMAINS`), 첫 admin 계정 승격 SQL 1회 ■.
3. 마이그레이션: §4 전체를 순서대로(v2.0 DDL). seed = 샘플 행사 픽스처 4건과 동일 데이터(데모 유지).
4. **옛 Configurator DB 1회 임포트**(선택 ■ — 운영 중 견적 행이 있을 때만): events→projects(§16 매핑, onboarded_at=null·status active), estimates→quotes(config→input, total_amount, version·is_final·status 승계, breakdown은 엔진 재계산), event_tasks→wbs_tasks(code 매칭·checked→done·note·target). 스크립트 `scripts/import-configurator.ts`(service role, 1회, dry-run 출력 후 실행).
5. Vercel: communicator용 새 Vercel 프로젝트 생성 → env 3종(URL·anon·allowed domains) → 프리뷰 배포 확인 ■ → 도메인 `rmb-mice.com`을 옛 프로젝트에서 제거하고 새 프로젝트에 추가(DNS 변경 없음, Vercel 내부 이전) ■ → 옛 라우트 리다이렉트(§10 표) 동작 확인.
6. 옛 Vercel 프로젝트(jsx-easy-shift)는 도메인 제거 후 1주 유지 → 삭제 ■. GitHub jsx-easy-shift는 README 상단에 "아카이브 — communicator로 통합(2026-xx-xx)" 1줄 커밋 후 Archive ■. 옛 Supabase 프로젝트는 임포트 검증 후 Pause → 30일 뒤 삭제 ■.
7. 롤백: 5단계까지는 도메인을 옛 프로젝트로 되돌리면 즉시 복구. 6단계 이후는 아카이브 해제로 복구.

---

## 19. 부록 — 정산보드 정본 (v2.2, S-10)

> 근거: 내부정산 실물 13건(2026-08-23 사용자 제공) 분석. 마진 식은 실물 2건에서 원 단위 일치 검산을 마쳤다.
> 실고객사명·실거래액은 본 문서에 담지 않는다(#RULE-NO-COMPANY). 화면 예시 수치는 데모 확정 견적 `quo-003`의 엔진 산출값을 쓴다.

### 19.1 마진 모델 (정본)

사용자 정의: **최종 마진 = 항목별 마크업 합 + PCO 기획료 + RSVP 운영비. 리드젠(쇼업 보장)은 제외.**

```
항목 마크업(bucket) = bucket.quote_amount − Σ item.actual_amount      … has_cost=true 버킷만
최종 마진           = Σ 항목 마크업 + Σ bucket.quote_amount           … 뒤 항은 has_cost=false·is_margin_base=true 버킷
마진 기준 계약액     = Σ bucket.quote_amount                          … is_margin_base=true 버킷 전체
마진율              = 최종 마진 ÷ 마진 기준 계약액
```

**항등식(화면 검산에 쓴다)**: `마진 기준 계약액 − Σ 실집행 = 최종 마진`. 두 값이 어긋나면 화면 상단에 경고를 띄운다 — 어긋나는 경우는 버킷 플래그가 잘못 설정된 때뿐이다.

실물 검산(고객사명 제외):

| 계약 규모 | 항목 마크업 | ＋ PCO 기획료 | ＋ RSVP 운영비 | ＝ 계산값 | 파일의 마진 |
|---|---:|---:|---:|---:|---:|
| 84.0M | 13,899,909 | 10,043,500 | 4,000,000 | **27,943,409** | 27,943,409 |
| 16.6M | 6,825,136 | 1,830,000 | 760,000 | **9,415,136** | 9,415,136 |

- 실물 내부정산 시트의 실집행 합계 수식은 **PCO 기획료·모객 섹션을 아예 더하지 않는다**(예: `=G18+G31+G52+G62+G68`). 원가 없음을 실무가 이미 수식으로 표현하고 있었다.
- 리드젠(쇼업 보장)은 실물에서도 **별도 계약**이라 견적 총액에 포함되지 않는다. RSVP 운영비는 운영의 몫이므로 마진에 남고, PCO 기획료 base에도 포함된다.
- 실측 마진율 밴드 **27.5% ~ 69.0%**(7건). 규모가 클수록 낮아진다(100M대 31.8% ↔ 16M대 56.6%). 화면은 이 밴드를 참고선으로 표시하되 **판정하지 않는다**(표본 7건, 가정).

### 19.2 버킷 체계 — 기본 9 + 행사별 추가

기본 버킷은 확정 견적 breakdown에서 스냅숏된다. `recruit` 한 덩어리를 **rc와 ld로 쪼개는 것이 유일한 비자명 매핑**이다.

| code | 라벨 | 견적 breakdown 출처 | has_cost | is_margin_base |
|---|---|---|:---:|:---:|
| `s1` | 베뉴 사용료 | `s1` | ● | ● |
| `s2` | 시스템 구축 | `s2` | ● | ● |
| `s3` | 디자인·브랜딩 | `s3` | ● | ● |
| `s4` | 운영·등록·보험 | `s4` | ● | ● |
| `ot` | 추가옵션 | `options` | ● | ● |
| `at` | 참관객 관리 | `attendee` | ● | ● |
| `s5` | PCO 기획료 | `s5` | — | ● |
| `rc` | RSVP 운영비 | `recruit` 중 `rsvpPkg` | — | ● |
| `ld` | 리드젠(쇼업 보장) | `recruit` 중 `showup` | — | — |

- `has_cost=false` 버킷은 **발주·실비 입력을 UI와 API 양쪽에서 막는다**(입력 시 422). 견적액 전체가 마진이다.
- `is_margin_base=false`(현재 `ld`뿐)는 마진 기준 계약액에서 빠진다. 화면에는 회색으로 남겨 "왜 안 세는지"를 보이게 한다 — 숨기면 담당자가 누락으로 오해한다.
- **행사별 버킷 추가**: `source='custom'`, `quote_amount=0`, `has_cost=true`, `is_margin_base=true`가 기본값. 넣는 즉시 마크업이 음수로 잡히고 그것이 맞다.
  - 실물 근거 — 섹션 수가 행사마다 5~9개로 다르고, 다음이 실제로 추가되었다: F&B 추가비용 · 전시 및 이벤트 · 가구 임차 · 기념품 · 연사 사례비 · 행사장 조성비용 · 추가 발생 비용. 고정 8버킷으로는 담기지 않는다.

### 19.3 3단 추적과 항목 상태

한 항목은 **견적(버킷이 보유) → 발주(약정) → 실비(집행)** 세 값을 갖는다. 실물에는 발주/실비 구분이 없고 실집행 한 칸뿐이므로, 3단은 **새로 얹는 층**이다.

| 상태 | 뜻 | 쓰는 사람 | 금액 |
|---|---|---|---|
| `planned` | PM이 목록에 올림 | pm | 없어도 됨 |
| `ordered` | 담당자가 협력사·발주액 확정 | 담당자 | `ordered_amount` 필수 |
| `settled` | 실비·증빙 확정 | 담당자 | `actual_amount` 필수 |
| `cancelled` | 취소 — 집계에서 제외 | pm·담당자 | 보존 |

- **발주는 항목 단위다.** 실물에서 한 협력사의 11개 항목 중 10개가 0원이고 한 줄에 몰려 있는 사례가 있으나, 이는 구조가 아니라 **손입력 부담 때문의 관행**이다(협력사 견적서에는 상세 항목이 다 있다). 묶음 입력을 허용하면 관행이 그대로 옮겨 와 버킷별 ± 외에는 아무것도 얻지 못한다.
- 그 대가로 **§19.5 업로드 파싱이 필수 전제**가 된다. 파싱 없이 항목 단위를 강제하면 담당자는 첫 행사에서 이탈한다.
- 할인·조정은 **음수 금액 항목**으로 넣는다(실물에 `-4,550,000` 사례 존재). 별도 필드를 만들지 않는다.

### 19.4 부가세 규약 (실물 결함 대응)

실물 시트가 손계산 중이다 — `=23320000/1.1`, 심한 곳은 `=241000+(85800/1.1)`로 **한 셀에 포함분과 별도분이 섞여** 있다.

| 규칙 | 내용 |
|---|---|
| 저장 | 모든 금액은 **부가세 별도**로 저장한다. 견적 breakdown이 별도 기준이므로 비교축이 일치한다 |
| 입력 | 입력 칸마다 `vat_included` 토글. `true`면 저장 직전 `round(v / 1.1)`로 분리하고, 받은 원본값을 `input_amount_raw`에 함께 남긴다 |
| 표시 | 항목 상세에 "받은 금액 1,320,000(포함) → 저장 1,200,000(별도)"를 같이 보여준다. 사람이 계산하게 두지 않는다 |
| 파싱 | 업로드 문서에 부가세 표기가 없으면 **자동 판정하지 않고 반드시 묻는다**(§19.5 확인 큐) |
| 반올림 | 원 단위 반올림. 버킷 소계는 항목 저장값의 단순 합이며 재반올림하지 않는다 |

### 19.5 협력사 견적서 업로드 → 자동 배분 (Phase 4.7)

PDF·엑셀·사진에서 항목·단가·수량을 읽어 버킷에 배정하고, **확신이 서지 않는 것만 담당자에게 묻는다.**

```
업로드 → 파싱(서버) → 자동 배정(확신 높음) ┐
                     └ 확인 큐(확신 낮음) ┴→ 담당자 확인 → settlement_items 생성
                                              원본 파일은 근거로 보존
```

- 묻는 것은 대개 둘이다 — **어느 버킷인지**, **부가세가 포함인지**. 그 외는 자동으로 넣는다.
- **읽은 결과는 항상 담당자 확인을 거쳐 저장한다.** 파싱 결과를 직접 커밋하지 않는다(오독이 곧 정산 오류가 된다).
- 단계: 엑셀(구조가 가장 또렷) → PDF → 사진. 엑셀만으로도 항목 단위가 성립한다.
- 파싱은 서버가 필요하므로 **Phase 4.7**로 둔다. 스키마(`settlement_imports`)는 v2.2에서 미리 만들고, Mock 단계에서는 업로드 버튼이 "Phase 4.7에서 열립니다" 안내를 띄운다 — **게이트 뒤에 숨기지 않는다**(§10 진입점 원칙).
- 이 절이 §19.3의 항목 단위를 성립시키는 조건이다. 순서를 뒤집지 말 것.

### 19.6 협력사 마스터

같은 협력사가 행사 간에 반복 등장하고, 실물에는 같은 업체가 역할별로 갈려 적힌 사례가 있다. 행사마다 이름을 다시 치면 표기가 갈려 집계가 불가능해진다.

- `vendors`는 **프로젝트에 종속되지 않는 조직 단위 마스터**다(§4-23 DDL 참조). 항목은 `vendor_id`로 참조하고, 자유 입력은 신규 등록으로 승격시킨다.
- 누적되면 "이 협력사는 이 버킷에서 평균 얼마"가 나오고, 그것이 다음 견적의 근거가 된다 — 단가표를 코드에서 DB로 옮기는 2차 과제(§13)와 연결된다.
- `vendors.name`은 실제 거래처명이라 **#RULE-NO-COMPANY의 예외**다(픽스처에는 가상 명칭만 쓴다).

### 19.7 비공개 보증 — 규칙이 아니라 가드로

"발주처 절대 비공개"는 문장으로는 지켜지지 않는다. §12의 금액 비노출 검사를 확장한다.

| 조치 | 내용 |
|---|---|
| 금지 키 확장 | `quotes` · `breakdown` · `total_amount`에 **`settlement` · `ordered_amount` · `actual_amount` · `markup` · `margin`** 추가 |
| 검사 범위 확장 | 기존 `pages/Client*` · `components/plan` · `components/client`에 **`pages/Landing*` · `lib/landing*`** 추가 — 랜딩은 토큰조차 없는 유일한 완전 공개 지면인데 현재 검사 밖이다 |
| 런타임 검사 | `getClientQueue` · `getClientStatus` · `getPlan` · `listActivity` 응답 객체 트리에 위 키가 0건 |
| 역검증 | 결함을 일부러 되돌려 넣어 가드가 실제로 실패하는지 확인하고, 그 사실을 체크아웃 보고에 적는다 |
| 토큰 경로 | `settlement_*` · `vendors`는 §6.2 화이트리스트 쿼리에 **포함하지 않는다**. Edge Function이 조회 대상으로 삼는 테이블 목록에 추가 금지 |

### 19.8 열린 질문 (v2.2 시점)

- 실측 마진율 밴드는 표본 7건이다. 참고선으로만 쓰고, 20건 이상 쌓이면 규모 구간별 기준선으로 승격을 재검토한다 — **가정**.
- 협력사 견적서 파싱의 정확도 목표치는 정하지 않았다. Phase 4.7 착수 시 엑셀 10건으로 실측한 뒤 정한다 — **가정**.
- 발주서 발행(우리 → 협력사) 기능은 이번 범위 밖이다. 정산보드는 **기록**만 하며, 발주 문서 자체는 기존 방식을 유지한다.
