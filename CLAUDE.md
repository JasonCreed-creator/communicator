# CLAUDE.md — MICE 커뮤니케이터 구현 지침 v2.5 (Claude Code용)

> 레포 루트에 이 파일을 두고, `docs/mice-communicator-설계서-v2.5.md`를 함께 배치할 것(기존 설계서 파일은 버전 무관 전부 대체·삭제). `docs/mice-communicator-디자인지시서-v1.md`도 함께 배치(Phase 3.9 정본).
> **스키마·상태 머신·API 계약·권한 규칙·WBS 템플릿(§15)·핸드오프 계약(§16)·이식 인벤토리(§17)·인프라 전환(§18)·D-Day 런북(§20)·주최형 확장(§21)·견적서 임포트(§22)·운영보드 재구성(§23)의 정본은 설계서 v2.5이다(정산보드는 §19·§4-23·§4-24).** 디자인 토큰·레이아웃·컴포넌트 규격의 정본은 디자인지시서 v1이다. 본 파일은 작업 순서와 규약만 정의한다. 충돌 시 설계서 우선.
> v1.1 변경 핵심: **프론트 우선·서버 후행** — Phase 0~3은 서버 0, Supabase·Drive는 Phase 4~5 이식.
> v1.2 변경 핵심: **지시(requested)→제작→컨펌→운영계획서(S9) 조립 파이프라인** — Phase 3.5 프론트 증분.
> v1.3 변경 핵심: **S0 온보딩 → 유형 토글 → 큐시트 에디터** — Phase 3.6 프론트 증분.
> v1.4 변경 핵심: **유형별 WBS 템플릿 자동 전개 + 역할별 R&R** — Phase 3.7 프론트 증분(여전히 서버 0).
> v1.4.1 변경 핵심: **구현 해석 정본화(onboarded_at 등 5건) → Phase 3.8** + **디자인 스프린트(웜 페이퍼 룩 전환, 기능 무변경) → Phase 3.9**.
> v1.5 변경 핵심: **다중 행사(프로젝트 셀렉터·S-1 행사 목록) + 행사 설정 메뉴(개요·담당자 입력) + S0 동일 폼 → Phase 3.10**.
> v2.1 변경 핵심: **랜딩보드(S-3) 사후 정본화 + 랜딩 스코프 계약(§4-21) + 골든 데이터셋 출처 규약(§17.3-4)·가격 상수 v1.1(§17.4)** — Phase 3.13.1 핫픽스.
> v2.2 변경 핵심: **정산보드(S-10) 신설 — 확정 견적 버킷 스냅숏·견적/발주/실비 3단·마진 3분할(§19)** — Phase 3.14.
> v2.5 변경 핵심: **운영보드 재구성 — 문서 유형 우선 + 시나리오·운영가이드 빌더(Phase 3.16, mock·서버 0)**: 유형 카드 4종·빌더 인라인("카테고리가 빌더를 결정한다" 보드 레벨 확장), scenario_blocks·guide_sections 정형 테이블(§23 — cues 패턴, 컨펌·스냅숏 재사용), S9 ⑦비상 대응 신설. **DataProvider v9 재동결(8메서드 · 110메서드)**, importVendorQuote는 v10 예약 순연. 착수 조건 = Phase 3.15.1 머지·챗 검수 통과.
> v2.4 변경 핵심: **주최형(파트너) 확장 + 견적서 임포트 — Phase 3.15(mock 우선·서버 0)**: projects.kind 축(대행형/주최형), 파트너 등급·`/p/{token}` 제출 포털·검토 루프(§5.1 — 기존 상태머신 재사용), WBS 주최형 템플릿 12건(§15.3), 견적서 xlsx 임포트(§22 — 3형·확인 큐·분배 4종). **DataProvider v8 재동결(16메서드 · 102메서드)**, importVendorQuote는 v9 예약으로 순연. 서버 스프린트(Phase 4~6)는 사용자 지시 대기 — Phase 4 착수 시 §21·§22 스키마 포함.
> v2.3 변경 핵심: **서버 스프린트 — 키 최후 주입**: Phase 4(Supabase, dev 프로젝트 실검증) → 5(Drive, 코드 완성+스모크 준비) → 6(Slack 알림)을 D-Day(8/31) 전 일괄 구현. 운영 자격증명은 설계서 §20 런북으로 D-Day에 주입 — **"키 교체+setup.sql 1회"를 벗어나는 운영 전환 작업이 남으면 Phase 미완료다.** Phase 4.6의 사용자 게이트 단계는 §20으로 이동.
> v2.0 변경 핵심: **견적 Configurator(jsx-easy-shift) 흡수 — Phase 3.11 견적 모듈(mock, 프론트 우선) → Phase 4 새 Supabase 이식(Auth·RLS 포함) → Phase 4.6 인프라 전환(Vercel·도메인·1회 임포트·아카이브)**. 이후 Phase 5 Drive · 6 알림.

## 1. 프로젝트 정의
MICE 프로젝트 협업 허브 — 역할별(디자인·운영·등록) 산출물을 Google Drive 단일 저장소에 버전 관리하고, 발주처가 무로그인 토큰 링크로 컨펌하는 웹앱. 파일=Drive, 상태=Supabase의 하이브리드. v2.0부터 **견적(단일 플랫폼의 첫 단계)**을 포함한다 — 견적→설정→운영→결과. 금액은 내부 로그인 화면·Excel에만(#RULE-NO-PRICE-TO-CLIENT).

## 2. 스택 (고정 — 임의 변경 금지)
- React 18 + Vite + TypeScript + Tailwind (프론트, Vercel 배포)
- Supabase: Postgres + RLS + Auth(이메일 매직링크) + Edge Functions(Deno) — **지금(서버 스프린트). 검증 DB = dev 프로젝트 `communicator-dev`**(3키는 사용자가 세션 대화로 제공 — `.env.local`에만, 커밋 금지). 운영 프로젝트는 D-Day §20. 옛 Configurator 프로젝트 사용 금지. **API 키는 신형(sb_publishable/sb_secret)만** — 설계서 §12
- 견적 모듈 전용 허용 의존: exceljs · file-saver (src/modules/quote 밖에서 import 금지). shadcn/Radix·Tailwind 3 도입 금지
- Google Drive API v3 (전용 운영 계정 OAuth, Production 게시 — 설계서 §2) — **Phase 5(지금): 자격증명 없이 코드 완성, 실계정 검증은 D-Day 스모크(§20)**
- 알림: Slack Incoming Webhook — **Phase 6(지금): env 부재 시 no-op 폴백**. Resend(이메일)는 **Phase 6b — 이번 스프린트 범위 밖**(첫 발주처 토큰 발송 전 수행, 설계서 §9)

## 3. 레포 구조 (제안 — 조정 시 사유를 PROGRESS.md에 기록)
```
/                      # Vite 앱 (레포는 사용자가 GitHub에 생성)
├ CLAUDE.md            # 본 파일
├ PROGRESS.md          # 세션 상태 (체크아웃 시 갱신 — §9)
├ docs/                # 설계서 v2.4 + 감수 리포트 + 디자인지시서 v1
├ src/
│  ├ pages/            # S-1·S0~S9 (설계서 §10)
│  ├ context/          # ProjectContext — 현재 행사 (v1.5, PROJECT_ID 상수 대체) / AuthContext (Phase 4)
│  ├ modules/quote/    # ★ v2.0 견적 모듈 — engine/(calcEstimate·kpiRules·venueOptions·quoteMode) data/(venuedb·leadTargeting·eventTypes) export/(exportEstimate) __tests__/(골든 벡터)
│  ├ components/
│  ├ providers/        # ★ DataProvider 인터페이스 + mock/ + supabase/(후행)
│  ├ fixtures/         # Mock 픽스처 (샘플 행사 1건: 항목·버전·RSVP·마일스톤·코멘트)
│  ├ lib/              # api client, utils, wbs 산식 정본
│  ├ styles/           # tokens.css — 디자인 토큰 단일 정의처 (Phase 3.9)
│  └ types/            # 도메인 타입 — 설계서 §4 스키마와 1:1
├ scripts/             # import-configurator.ts (Phase 4.6, 1회 실행·dry-run)
└ supabase/            # Phase 4에서 생성 (migrations/, functions/)
```

## 4. 구현 순서 (Phase) — v1.1 재배열

### 서버 없는 구간 (지금 진행)
- **Phase 0 — 스캐폴딩**: Vite+TS+Tailwind, 라우팅 골격, .env.example
- **Phase 1 — 타입·어댑터·픽스처**: 설계서 §4와 1:1 도메인 타입 → `DataProvider` 인터페이스 정의 → **인터페이스 동결 선언(PROGRESS.md에 기록)** → MockProvider(픽스처+메모리, 업로드는 blob URL·새로고침 시 소실 허용)
- **Phase 2 — 내부 UI**: S1 홈 → S2 보드 → S3 상세 → S4 등록 → S5 일정 → S6 설정 (전부 Mock 구동)
- **Phase 3 — 발주처 뷰**: S7 컨펌 큐 → S8 현황, 데모 라우트 `/c/demo` (모바일 대응 필수)
  - 코멘트 visibility 분리(internal/shared)를 프론트에서부터 구현 — 발주처 화면은 shared만 렌더

- **Phase 3.5 — v1.2 증분 (서버 0, 설계서 v1.2 §개정 이력 참조)**
  - 3.5a 타입 개정+재동결: status 'requested', Deliverable 지시·스펙·content 필드, ProgramSession, Project 행사개요 → MockProvider·픽스처 확장. **동결 해제 근거 = 사용자 v1.2 승인(2026-08-22, 시각안 기반)** — PROGRESS.md 결정 로그에 기록 후 재동결 선언
  - 3.5b 지시 흐름 UI: S2 (pm) 지시 발행 폼·'지시됨' 뱃지, S3 지시 카드(브리프+스펙 칩), 홈 '받은 지시' 노출. 첫 버전 업로드 시 requested→draft 자동 전이(assertTransition 경유)
  - 3.5c S9 운영계획서: 섹션 자동 조립(개요·프로그램·존운영·제작물 리스트·등록 통계·일정)+섹션별 진행률+개요·프로그램 인라인 편집(pm·ops)+인쇄 CSS(A4)

- **Phase 3.6 — v1.3 증분 (서버 0, UI 폴리시 스프린트 머지 후 착수)**
  - 3.6a 타입 개정+재동결: EventType('general'|'recruiting')·Project.event_type·Cue(큐번호·시간·구분·대본·콘솔 3채널·정렬) → MockProvider·픽스처 확장. **동결 해제 근거 = 사용자 v1.3 승인(2026-08-22, 시각안 기반)** — PROGRESS.md 결정 로그 기록 후 재동결
  - 3.6b S0 온보딩 위저드: 3단계(개요→유형 카드 선택→담당자·토큰), 완료 전 본체 라우트 차단, S6에서 재수정 가능. 유형 토글 = 표시 계층(일반형이면 RSVP 파이프라인·모객 대시보드·리마인드 숨김, 데이터 보존)
  - 3.6c 큐시트 에디터: category='큐시트' 운영 항목을 열면 파일 대신 정형 표(행 편집·드래그 정렬·대본 전문 패널). S9에 큐시트 섹션(프로그램 다음)·인쇄 포함. 컨펌 발송 시 스냅숏 자동 버전 등록 — **mock 단계에선 인쇄용 HTML blob로 갈음, PDF 생성은 Phase 5**

- **Phase 3.7 — v1.4 증분 (서버 0, Phase 3.6 머지 후 착수)**
  - 3.7a 타입 개정+재동결: WbsTask·RoleCharter·WbsStatus 추가. **동결 해제 근거 = 사용자 v1.4 승인(2026-08-22)** — 결정 로그 기록 후 재동결
  - 3.7b 템플릿 시드: 설계서 부록 §15의 37태스크를 그대로 픽스처화(모객형) + 일반형 28건 파생. 온보딩 완료 시 event_date 기준 자동 전개(wbs-expand), R&R 카드 유형별 시드
  - 3.7c S5 승격: 단계 필터·체크리스트/간트 토글(간트=CSS 바, D-42~D+30 축)·지연/임박 계산·R&R 카드 그리드·산출물 연결 뱃지(final이면 자동 done)·홈 대시보드 지연/임박 집계

- **Phase 3.8 — v1.4.1 정본 정합 (서버 0, 소규모)**
  - 3.8a 타입 개정+재동결 v3.1: `Project.onboarded_at: IsoDateTime | null` 추가, `OnboardingStatus`를 `{completed, onboarded_at}`로 확장(completed = onboarded_at !== null). MockProvider의 앱 상태 플래그(`state.onboarding_completed`)를 제거하고 프로젝트 필드에서 파생 — `completeOnboarding`은 onboarded_at=now 기록(이미 완료면 409 CONFLICT), `resetOnboarding`(mock 전용)은 null로 되돌림. 픽스처 샘플 행사는 onboarded_at 세팅(기존 테스트 흐름 유지). **동결 해제 근거 = 사용자 v1.4.1 승인(2026-08-22)** — 결정 로그 기록 후 재동결. 메서드 수 53 불변
  - 3.8b 열린 질문 종결: PROGRESS.md 열린 질문 ①~⑤를 "설계서 v1.4.1 §4-1·§4-15·§8·§15 반영으로 종결"로 갱신. `src/lib/wbs.ts`·`src/fixtures/wbsTemplates.ts` 상단 주석의 근거를 "PROGRESS 결정 로그"에서 "설계서 v1.4.1"로 교체(로직 무변경)

- **Phase 3.9 — 디자인 스프린트 (서버 0, 스타일·레이아웃만 — 데이터·로직·테스트 의미 무변경)**
  - 정본 = `docs/mice-communicator-디자인지시서-v1.md` 전문. 순서: 토큰 파일(`src/styles/tokens.css`) 1곳 정의 → 로고 자산 `public/brand/` 배치(ZIP 구조 그대로, BrandLogo는 png 2종 사용·텍스트 폴백은 로드 실패 시만) → 레이아웃 전환(내부=좌측 다크 사이드바 232px, 발주처=슬림 다크 상단 바) → 컴포넌트 규격 치환 → 화면별 depth(S0~S9·발주처) → 완료 기준 검증
  - 작업 분할: 3.9a 토큰·로고·레이아웃 셸(사이드바·상단 바·페이지 헤더 패턴) → 3.9b 내부 화면 S0~S6·S9 → 3.9c 발주처 S7·S8(375px) — 3.9b·3.9c는 3.9a 머지 후 병렬
  - 금지: gray-*/slate-* 잔존, #000, 임의 그라디언트, 기능 코드 수정(테스트 파일은 클래스 계약 가드 갱신만 허용 — 예: max-w-2xl·h-11 같은 구조 계약은 새 규격으로 치환하되 의미 유지)

- **Phase 3.10 — v1.5 증분: 다중 행사·행사 설정 (서버 0, Phase 3.9.1 폴리시 머지 후 착수)**
  - 3.10a 타입 개정+재동결 v4 (에이전트 T): `Project` 개요 필드 7종·`status`·`closed_at`, `ProjectPatch` 확장, `ProjectSummary`(D-day·유형·status·미결 컨펌·지연·확정 비율·온보딩 단계 1~3), `ProjectInvite`, DataProvider에 `listProjects()`·`createProject(input)`·`closeProject(id, closed)`·`addMember(projectId, {display_name,email,role})`·`removeMember(projectId, memberId)` 5메서드 추가(기존 시그니처 불변). **동결 해제 근거 = 사용자 v1.5 승인(2026-08-22, 시각안 3화면)** — 결정 로그 기록 후 재동결. 픽스처: 행사 4건 — ①기존 샘플(모객형·온보딩 완료) ②일반형 진행 중(지연 2·미결 3) ③세팅 미완료(onboarded_at null, 개요만 입력) ④종료(closed). 모든 기존 테스트는 ①을 기본 선택으로 통과해야 함
  - 3.10b 컨텍스트·셀렉터·S-1 (에이전트 U): `src/context/ProjectContext.tsx`(localStorage `communicator.currentProjectId`, 없으면 첫 active) → **`PROJECT_ID` import 전수 제거(grep 0건, 픽스처 내부 정의만 허용)** → 사이드바 최상단 셀렉터(드롭다운: 진행 중/종료 그룹·요약·새 행사·전체 목록) → `/projects` S-1 카드 그리드(종료 접힘·세팅 미완료 표시·종료/재개 pm). 사이드바 메뉴 순서 = 설계서 §10 진입점 원칙
  - 3.10c 행사 설정·S0 재구성 (에이전트 V): 공용 폼 컴포넌트 `ProjectOverviewForm`·`MembersEditor`·`ClientContactsEditor` 작성 → `/settings`를 **행사 설정 3탭**(①개요 ②담당자 ③유형·연동)으로 재구성(메뉴 2번째, 상단 세팅 완료/미완료 뱃지, 필수 4 검증) → S0 위저드는 같은 컴포넌트를 3단계로 배치(①개요→②담당자→③유형·확인), `OnboardingGuard`는 **차단 대신 유도**(세팅 미완료 행사 진입 시 /settings로 리다이렉트 + 배너, /c/* 제외) → S9 ① 개요 섹션을 읽기 조립로 전환(인라인 편집 제거, "행사 설정에서 편집" 링크) → event_date 변경 시 S5에 "WBS 재전개 필요" 배너
  - 금지: 라우트 prefix 변경

- **Phase 3.11 — v2.0 견적 모듈 (서버 0 — 프론트 우선 원칙 유지, Phase 3.10.1 머지 후 착수)**
  - 3.11a 엔진·데이터 이식+재동결 v5 (에이전트 W): jsx-easy-shift(main 6047834)에서 설계서 §17.1 표의 파일을 `src/modules/quote/`로 이식(TS 타입 부여, 로직·상수 불변, **venuedb.reference_cases 제거**, exportEstimate의 driveUpload·backup 제거). 골든 벡터 픽스처 이식 → **전 벡터 0원 일치 테스트**(DoD 21) + Excel 등가 테스트(DoD 22). 타입: `Quote`·`QuoteInput`·`QuoteBreakdown`·`ComplianceCard`·`Profile(app_role)`, `Project` 모객 필드 4종, `WbsTask.target`. DataProvider v5(8메서드 추가, 기존 불변) — **동결 해제 근거 = 사용자 v2.0 승인(2026-08-22, 시각안 3화면)**. Mock: 견적 픽스처 3버전(샘플 행사 연결 v3 확정), 현재 사용자 app_role='sales'(mock 토글로 staff 전환 가능)
  - 3.11b S-2 견적 UI (에이전트 X): 사이드바 준비/운영 그룹 + 견적 메뉴(app_role 게이트·셀렉터 '견적만 있음' 상태) → `/quotes` 목록(버전 표+요약) → 에디터 5스텝(RememberQuoteConfigurator 로직 분해 이식, 스타일은 tokens.css 전면 교체, 한/영 유지·다크 토글 제거) → 확정 잠금 → Excel 내려받기
  - 3.11c 핸드오프·흡수 기능 (에이전트 Y): ⑤'이 견적으로 행사 만들기' → `createProjectFromQuote`(§16 매핑) → S0 ① 프리필(주황 틴트·수정 가능) → 상호 링크 · 행사 설정 ① 모객형 그룹(보장 인원·쇼업 KPI·타겟팅 5축 칩·연결 견적 링크, 일반형 숨김) · S5 컴플라이언스 카드 2종(온보딩 시드·체크) · WBS target 열(템플릿 시드 포함) · §10 옛 라우트 리다이렉트 · 비노출 테스트(DoD 23)
  - 금지: 단가·베뉴·옵션 값 변경(엔진 등가 깨짐), 금액 필드를 Project·PlanDoc·ActivityLog·발주처 뷰 타입에 추가, shadcn 도입

- **Phase 3.13 — v2.1 랜딩보드 (서버 0, Phase 3.12 머지 후)**
  - S-3 랜딩보드: 행사 랜딩페이지를 13종 섹션 블록으로 조립하는 빌더 + GA 측정 삽입 + 유입 지표 대시보드.
    실측 B2B 행사 랜딩(히어로·연사·타임테이블·티켓·혜택·존·오시는 길·FAQ·신청 폼·푸터)의 구성을 정규화했다.
  - **행사 데이터 자동 연동(autofill)** — hero←Project 개요, speakers·agenda←ProgramSession, zones←ops 존 항목,
    venue←Project 장소. 끄면 저장값으로 직접 편집(입력 보존). 범용 빌더와 갈라지는 지점.
  - **발행 = 단일 HTML 내보내기** — 자가완결 .html 1개를 기존 호스팅에 올리고 공개 주소만 기록한다.
    앱 내 서빙은 Phase 4.6 이후. GA4/GTM 스니펫은 형식 검증(G-/GTM- 정규식)을 통과한 ID만 <head>에 주입.
  - **리드 → 등록(S4) 유입** — 폼 제출이 Attendee(channel='rsvp')로 적재되고 당일 지표에 반영된다.
  - 지표는 mock 픽스처(30일) → Phase 4에서 GA Data API로 교체. DataProvider v6(8메서드 추가, 75메서드).
  - 금지: 랜딩에 견적 금액(total_amount·breakdown) 노출, 측정 ID 형식 검증 우회

- **Phase 3.14 — v2.2 정산보드 (서버 0, Phase 3.13.4 머지 후)**
  - S-10 정산보드: 확정 견적 breakdown을 **버킷 스냅숏**으로 불러와, 버킷마다 견적·발주·실비 3단을 추적하고
    마진을 실시간으로 보여준다. 내부 한정 — 발주처에게는 어떤 경로로도 나가지 않는다.
  - **마진 식은 설계서 §19.1이 정본**: `최종 마진 = Σ항목 마크업 + PCO 기획료 + RSVP 운영비`, 리드젠(쇼업 보장) 제외.
    화면은 `마진 기준 계약액 − Σ실집행 = 최종 마진` 항등식을 검산해 어긋나면 경고한다. **식을 임의로 바꾸지 말 것** —
    실물 내부정산 2건에서 원 단위 일치를 확인한 값이다.
  - **버킷 9종 + 행사별 추가**(§19.2). 견적 `recruit`를 `rc`(RSVP)와 `ld`(리드젠)로 **쪼개는 것이 유일한 비자명 매핑**이다.
    `has_cost=false`(s5·rc·ld)는 발주·실비 입력을 API 422 + UI 부재로 이중 차단.
  - **발주는 항목 단위**(§19.3). 협력사 단위 묶음 입력을 만들지 말 것 — 실물의 묶음 기재는 구조가 아니라 손입력 관행이다.
  - **부가세는 별도로 저장**(§19.4). `vat_included` 토글로 받은 값은 저장 직전 `round(v/1.1)` 분리 + 원본을 `input_amount_raw`에 보존.
  - 업로드 파싱(§19.5)은 Phase 4.7. **이번 단계에서는 스키마(`settlement_imports`)와 업로드 버튼만 두고,
    버튼은 "Phase 4.7에서 열립니다" 안내를 띄운다** — 게이트 뒤에 숨기지 않는다(§10 진입점 원칙).
  - 협력사 마스터 `vendors`(프로젝트 비종속). 픽스처는 가상 명칭만.
  - DataProvider **v7 재동결**(11메서드 추가, 86메서드). `importVendorQuote`는 v8 예약 — 지금 만들지 말 것.
  - 금지: 정산 금액을 Project·PlanDoc·ActivityLog·발주처 뷰·랜딩 타입에 추가, 견적 초과를 저장 단계에서 차단,
    `has_cost=false` 버킷에 금액 입력 칸 노출, 마진 식 변형

- **Phase 3.15 — v2.4 주최형 확장 + 견적서 임포트 (서버 0, 시각안 4화면 승인 2026-08-27)**
  - 3.15a 타입·재동결 v8 (에이전트 AA): `Project.kind`·`PartnerTier`·`Partner`·`PartnerToken`·`Deliverable.partner_id`·`WbsTask.direction/partner_id`·`Quote.source`·`QuoteImport` 타입(§21.1과 1:1) + 전이표에 §5.1 신규 전이 1건(requested→pending_approval via partner_submit, kind='host'의 version_upload 목적지 분기). **DataProvider v8 = 16메서드 추가·102메서드**: listPartnerTiers·upsertPartnerTier·deletePartnerTier·listPartners·createPartner·updatePartner·removePartner·issuePartnerToken·revokePartnerToken·getPartnerPortal·submitPartnerItem·reviewPartnerSubmission·expandHostWbs·importQuoteFile·confirmQuoteImport·distributeQuoteImport. **동결 해제 근거 = 사용자 v2.4 승인(2026-08-27, 시각안 4화면)** — 결정 로그 기록 후 재동결. importVendorQuote는 v9 예약(만들지 말 것). 픽스처: §21.3 주최형 데모 행사 1건 추가(기존 4행사 불변)
  - 3.15b 성격 축·파트너 보드 (에이전트 AB): 행사 설정 ③ 성격 카드·등급 편집(§10.1) → S-11 파트너 보드(KPI·마감 타임라인·파트너 표·상세 검토 패널 = S3 컴포넌트 재사용) → 홈 미결 위젯에 검토 대기 집계 → 대행형/주최형 표시 규칙(메뉴 단위 — 게이트 뒤 숨김 금지)
  - 3.15c `/p/{token}` 제출 포털 (에이전트 AC): §10.1 화면 C 명세 그대로 — 마감 체크리스트·제출(파일/텍스트)·수정요청 코멘트·재제출·host_notice 읽기 전용·격리 고지. 데모 라우트 `/p/demo-partner`. 라벨은 labels.ts 주최형 세트(§5.1 표)
  - 3.15d 견적서 임포트 (에이전트 AD): 파서는 `src/modules/quote/import/`에 구현(**exceljs 재사용 — quote 모듈 전용 허용 의존 규칙 내**). §22.2 인식 규칙·§22.3 원칙·§22.4 분배. 위저드 3단계 UI(§10.1). **골든 테스트는 실서식 구조를 본뜬 가상 픽스처 3종(A·B·C형)** — 실고객 파일 커밋 금지(R-Q4), 실파일 3종은 세션 첨부분으로 로컬 검증만 하고 수치 결과만 보고
  - 순서: AA → AB·AC·AD 병렬. PR 1개(Phase 3.15), 체크아웃 보고 후 챗 검수

- **Phase 3.16 — v2.5 운영보드 재구성 (서버 0, 3.15.1 머지·챗 검수 후 착수. 시각안 3화면 승인 2026-08-28)**
  - 3.16a 타입·재동결 v9 (에이전트 AE): `ScenarioBlock`·`GuideSection` 타입(§23.1과 1:1), category 정형 3종 상수화. **DataProvider v9 = 8메서드 추가·110메서드**: listScenarioBlocks·saveScenarioBlocks·seedScenarioFromProgram·exportScenarioToCues·listGuideSections·saveGuideSections·seedGuideFromSources·createDocSnapshot(기존 cue-snapshot은 위임 유지). **동결 해제 근거 = 사용자 v2.5 승인(2026-08-28, 시각안 3화면)** — 결정 로그 기록 후 재동결. importVendorQuote는 v10 예약(만들지 말 것). 픽스처 §23.4
  - 3.16b 유형 우선 보드 홈 (에이전트 AF): 유형 카드 4종·문서 목록·**인라인 빌더 펼침**(별도 화면 이동 없음)·기존 항목 자동 분류 이관(R-O1 무손실)·"+ 항목 추가" 카테고리→빌더 직결(3.15.1 P7 완성형). 디자인 보드는 무변경
  - 3.16c 시나리오 빌더 (에이전트 AG): §10.2 명세 — 세션 그룹(프로그램표 연동)·진행 블록 행·시드(빈 문서만, R-O3)·큐시트로 내보내기(R-O5·§23.3 변환 규칙)·인쇄·컨펌 스냅숏(doc-snapshot)
  - 3.16d 운영가이드 빌더 + S9 확장 (에이전트 AH): §10.2 명세 — 섹션 4종 시드·존운영/R&R 초기 로드·stale 표시 후 확인 반영(R-O4)·개인 연락처 제외(R-O6)·인쇄. S9 = ⑦비상 대응 신설·②시나리오 펼침·③존운영 확장·진행률 반영
  - 순서: AE → AF·AG·AH 병렬. PR 1개(Phase 3.16), 체크아웃 보고 후 챗 검수

### 서버 스프린트 (v2.3 설계 완료 — **착수 대기: 사용자가 지시할 때 개시**(2026-08-27 우선순위 변경). dev 3키는 착수 시 사용자에게 대화로 요청)
- **Phase 4 — Supabase 이식** (설계서 v2.3 §4 DDL 전체 기준, 검증 DB = dev 프로젝트)
  - 4a 마이그레이션+RLS+seed (에이전트 D): §4 순서대로 + **v2.4 스키마(§21.1 — kind·partner_tiers·partners·partner_tokens·quote_imports·확장 컬럼) 포함**, RLS는 §6.2 전체(quotes·profiles·compliance_cards·settlement_*·vendors·landing·partner_* 포함). **산출 규약: `supabase/migrations/*.sql` + 통합 `supabase/setup.sql`(신규 프로젝트 SQL 에디터 1회 실행으로 전체 구축 — 멱등, 2회 실행 무해를 테스트로 증명, 말미에 첫 admin 승격 SQL 1줄 주석 동봉) + `supabase/seed.sql`(데모 픽스처 4행사, 선택 실행)**
  - 4b SupabaseProvider v7 (에이전트 D): 인터페이스 무수정으로 86메서드 전부 구현, `VITE_DATA_PROVIDER=supabase|mock` 스위치(기본 mock 유지 — 데모·기존 테스트 불파손). 견적 저장은 서버가 엔진으로 재계산(클라이언트 값 불신). 발주처 토큰 경로는 Edge Function(secret key) 화이트리스트 쿼리만(§6.2)
  - 4c 로그인·프로필 (에이전트 D2): 이메일 매직링크 로그인 화면(웜 페이퍼 토큰), AuthContext, profiles 자동 생성 트리거, 허용 도메인 env, app_role 게이트(견적 메뉴·API), `/c/*`는 비로그인 유지
  - 4d 교체 검증: dev DB에서 DoD 26 전부. **매직링크 왕복의 CI 대체 허용** — 자동 테스트는 admin generateLink(또는 테스트 전용 password 로그인)로 세션 확보하고, 실제 매직링크 수신 왕복은 §20 D-Day 스모크로 이월(사유를 체크아웃 보고에 기재)
  - 4e 운영 전환 준비물: `.env.production.example`(전 변수·주석) · `vercel.json`(SPA rewrites+보안 헤더) · §20 런북 대조표(런북의 파일명·명령·경로가 레포 실물과 일치함을 표로 증명)
- **Phase 5 — Drive 이식: 코드 완성·자격증명 최후** (에이전트 E): OAuth(운영 계정·Production)·표준 트리(§7.1)·업로드+파일명 규약(§7.2)·프록시 ReadableStream 패스스루+100MB 캡(§7.4)·Changes API 인박스(§7.3)·final 스냅숏 원자성(§7.5) — `supabase/functions/_shared/drive.ts` 모듈화. **실계정 없이 검증**: Drive HTTP 호출 계층을 인터페이스로 분리해 모의 서버 계약 테스트로 커버(업로드·copy 실패 재시도·토큰 만료 재발급·100MB 캡 시나리오 포함). 산출 2종: **`scripts/drive-auth.ts`**(최초 1회 동의→refresh token 발급 안내, 한국어) · **`scripts/drive-smoke.ts`**(D-Day 5분 검증: refresh 교환→트리 생성→업로드→copy→스트리밍, 실패 시 어느 단계·무엇을 확인할지 한국어 출력)
- **Phase 6 — 알림·cron** (에이전트 F): Slack 웹훅 유틸 + §9 매트릭스의 내부 Slack 이벤트 훅 전부 + reminders cron. `SLACK_WEBHOOK_URL` 미설정 = 콘솔 no-op(발송은 fire-and-forget+실패 로그 — 본 동작을 절대 막지 않음). 페이로드 계약 테스트(§19.7 금액 금지 키 5종 부재 포함). **Resend 이메일 = Phase 6b, 이번 범위 밖** — 컨펌 발송 UI에 "이메일 발송은 준비 중 — 링크 복사 전달" 안내 명시(게이트 뒤에 숨기지 않음)
- **Phase 4.6 — 인프라 전환**: 사용자 게이트 단계(운영 Supabase·Vercel·도메인·임포트·아카이브)는 **§20 D-Day 런북으로 이동 — Code가 수행하지 않는다.** 옛 Configurator DB 1회 임포트 스크립트(`scripts/import-configurator.ts`, dry-run)는 기존 계획대로 Phase 4에서 동봉만
- **Phase 4.7 — 협력사 견적서 파싱**: 변경 없음(추후 — 사용자 승인+설계서 개정 동반, DataProvider v8)

## 5. 서브에이전트 병렬 분담 (v1.1)
| 에이전트 | 담당 | Phase | 권장 모델 |
|---|---|---|---|
| A: types-mock | 타입·DataProvider·MockProvider·픽스처 | 1 | Sonnet |
| B: internal-ui | S1~S6 | 2 | Sonnet |
| C: client-view | S7·S8·/c/demo | 3 | Sonnet |
| D: supabase-port | 4a 마이그레이션·RLS·seed / 4b SupabaseProvider v5 | 4 | Fable 5 엑스트라 (RLS·서버 재계산) |
| E: drive-core | Drive 서비스 모듈 전체 | 5 | Opus 계열 (인증·스트리밍 난도) |
| F: notify | 알림·cron | 6 | Haiku |
| G: types-v12 | 3.5a 타입 개정·재동결·픽스처 | 3.5 | Sonnet |
| H: brief-ui | 3.5b 지시 흐름 UI | 3.5 | Sonnet |
| I: plan-doc | 3.5c S9 운영계획서 | 3.5 | Sonnet |
| J: types-v13 | 3.6a 타입 개정·재동결·픽스처 | 3.6 | Sonnet |
| K: onboarding | 3.6b S0 위저드·유형 토글 | 3.6 | Sonnet |
| L: cuesheet | 3.6c 큐시트 에디터·S9 연동 | 3.6 | Sonnet |
| M: types-v14 | 3.7a 타입 개정·재동결 | 3.7 | Sonnet |
| N: wbs-seed | 3.7b 템플릿 시드·전개 로직 | 3.7 | Sonnet |
| O: wbs-ui | 3.7c S5 승격·간트·R&R | 3.7 | Sonnet |
| P: types-v141 | 3.8a 타입 개정·재동결 v3.1 + 3.8b 주석·PROGRESS 정합 | 3.8 | Sonnet |
| Q: design-shell | 3.9a 토큰·로고·레이아웃 셸 | 3.9 | Opus 계열 (전 화면 일관성 판단) |
| R: design-internal | 3.9b 내부 화면 S0~S6·S9 | 3.9 | Sonnet |
| S: design-client | 3.9c 발주처 S7·S8 모바일 | 3.9 | Sonnet |
| T: types-v15 | 3.10a 타입 v4·픽스처 4행사·재동결 | 3.10 | Sonnet |
| U: multi-project | 3.10b ProjectContext·셀렉터·S-1 | 3.10 | Sonnet |
| V: project-setup | 3.10c 행사 설정 3탭·S0 동일 폼·S9 ① 조립 | 3.10 | Sonnet |
| W: quote-engine | 3.11a 엔진·데이터 이식·골든 벡터·타입 v5 재동결 | 3.11 | Sonnet |
| X: quote-ui | 3.11b S-2 견적 UI·사이드바 그룹 | 3.11 | Sonnet |
| Y: handoff | 3.11c 핸드오프·모객형 필드·컴플라이언스·리다이렉트 | 3.11 | Sonnet |
| AA: types-v24 | 3.15a 타입·DataProvider v8 재동결·주최형 픽스처 | 3.15 | Sonnet |
| AB: partner-board | 3.15b 성격 축·S-11 파트너 보드 | 3.15 | Sonnet |
| AC: partner-portal | 3.15c /p 제출 포털·격리 | 3.15 | Sonnet |
| AD: quote-import | 3.15d 견적서 파서·위저드·골든 픽스처 | 3.15 | Opus 계열 (서식 추론 난도) |
| AE: types-v25 | 3.16a 타입·DataProvider v9 재동결·픽스처 | 3.16 | Sonnet |
| AF: ops-board-home | 3.16b 유형 우선 보드·인라인 빌더 셸·이관 | 3.16 | Sonnet |
| AG: scenario-builder | 3.16c 시나리오 빌더·큐 내보내기 | 3.16 | Sonnet |
| AH: guide-builder | 3.16d 운영가이드 빌더·S9 확장 | 3.16 | Sonnet |
| D2: auth | 4c 로그인·프로필·app_role 게이트 | 4 | Fable 5 (보안) |
| Z: infra | 4.6 Vercel·도메인·임포트·아카이브 | 4.6 | Opus 계열 (사용자 게이트 대화) |

실행 순서: Phase 0(메인 단독) → A → **B·C 병렬** → **G → H·I 병렬** → **J → K·L 병렬** → **M → N·O 병렬**(각 타입 에이전트의 재동결 인터페이스 의존) → **P → Q → R·S 병렬** → (3.9.1 폴리시) → **T → U·V 병렬** → (3.10.1) → **W → X·Y 병렬** → **AA → AB·AC·AD 병렬**(Phase 3.15, PR 1개) → 챗 검수 → (3.15.1 폴리시) → **AE → AF·AG·AH 병렬**(Phase 3.16, PR 1개) → 챗 검수 → [사용자 지시 대기] → **D(4a→4b) → D2 → 4d → 4e** → **E** → **F** → [D-Day: §20 런북은 사용자가 수행 — Z 에이전트 불요]. 서버 스프린트 **PR은 Phase 4 / 5 / 6 각각 분리**, 각 PR마다 체크아웃 보고 후 챗 실측 검수를 거쳐 다음 Phase 착수.
Phase 4·5·6은 각각 별도 PR. Phase 4~6이 main에 머지돼도 `VITE_DATA_PROVIDER=mock`이 기본이라 데모가 깨지지 않는다 — 실DB 전환은 D-Day에 배포 env로만(§20).
Phase 3.8과 3.9는 **별도 커밋·별도 PR**로 분리한다(3.8 = 타입·로직, 3.9 = 스타일만 — 리뷰 diff 분리 목적). 3.9 착수 전 3.8 머지 시점의 테스트 수를 PROGRESS.md에 기준치로 기록한다.
각 에이전트는 담당 디렉터리 밖 파일 수정 금지. 공유 타입은 A 산출물만 참조. 통합·검수는 메인이 수행.

## 6. 코딩 규약
- UI 텍스트·사용자 노출 문구 = 한국어 / 식별자·커밋 메시지 = 영어
- 회사명·실명·행사명 하드코딩 금지 — 전부 데이터·env (#RULE-NO-COMPANY). 픽스처도 가상 명칭 사용
- 프론트는 DataProvider 인터페이스만 호출 — supabase client 직접 import 금지(providers/supabase/ 내부 제외)
- 시크릿은 env만. 프론트 번들에 service role key·Drive token 절대 미포함
- Drive 공유 권한 변경 코드 작성 금지(anyone 링크 생성 금지) — 발주처 파일 접근은 프록시 경유만
- 상태 전이는 단일 함수(`transitionStatus`) 경유 — 설계서 §5 전이표 밖 전이는 409. 컨펌 발송은 미리보기 포맷 검사 포함
- 코멘트 기본 visibility='internal', 발주처 작성분은 shared 강제
- 에러 응답 포맷 통일: `{error:{code,message}}`

## 7. 프론트 완료 기준 (Phase 0~3 DoD — Mock 기준)
1. Mock E2E: 항목 생성 → 파일 업로드(blob) → 내부확정 → PM 발송(미리보기 포맷 검사 동작) → `/c/demo`에서 승인 → final 표시
2. 수정요청 루프: `/c/demo` 수정요청+코멘트 → 새 버전 업로드 시 draft 자동 복귀
3. 코멘트 visibility: internal 코멘트가 `/c/demo`에 절대 렌더되지 않음(테스트로 증명)
4. 등록: CSV 임포트(헤더 매핑 UI) → 테이블 → 체크인 토글 → 통계 3종(응답률·등록수·체크인율)
5. 홈 대시보드: 미결 컨펌·D-day·인박스(mock)·영역 진행률 렌더
6. 발주처 화면 모바일(375px) 정상 동작
7. (v1.2) 지시 발행 → 담당자 화면 '지시됨' 뱃지 → 첫 업로드 시 draft 자동 전환 (테스트로 증명)
8. (v1.2) S9: mock 데이터로 6개 섹션 전부 렌더 + 섹션 진행률 + 제작물 리스트 표가 지시 스펙에서 자동 생성
9. (v1.2) S9 인쇄 미리보기(A4)에서 섹션 레이아웃 정상
10. (v1.3) 온보딩 미완료 시 본체 라우트 접근이 위저드로 리다이렉트, 완료 후 진입·S6 재수정 동작
11. (v1.3) 유형 토글: 일반형 전환 시 RSVP UI 숨김+데이터 보존, 모객형 복귀 시 그대로 복원 (테스트로 증명)
12. (v1.3) 큐시트: 행 추가·편집·정렬이 S9 큐시트 섹션에 즉시 반영, 컨펌 발송 시 스냅숏 버전 자동 등록
13. (v1.4) 온보딩 완료 시 유형별 WBS가 event_date 기준 실제 날짜로 전개(모객형 37·일반형 28건), origin_role 태그 보존
14. (v1.4) 지연·임박 계산이 정확(경계값 테스트)하고 홈 대시보드에 집계, 체크리스트/간트 토글 동작
15. (v1.4) 태스크-산출물 연결 시 상태 뱃지 표시, 연결 산출물 final 전환 시 태스크 자동 done (테스트로 증명)
16. (v1.4.1) 온보딩 완료 판정이 `Project.onboarded_at`에서만 파생: 완료 시 타임스탬프 기록, 재완료 시도 409, null이면 가드 리다이렉트 (테스트로 증명) + `grep -rn "onboarding_completed" src` 0건
17. (v1.4.1 디자인) 디자인지시서 §8 전부: `grep -rn "gray-\|slate-" src` 0건 / 3.8 기준 테스트 수 전부 통과 + tsc 클린 / 스크린샷 11장(S0·S1·S2·S3 일반·S3 큐시트·S4·S5 체크리스트·S5 간트·S9·발주처 큐 375px·발주처 현황 375px) / 데모 아티팩트 재발행 — 체크아웃 보고에 11장 첨부
18. (v1.5) 셀렉터·S-1에서 행사 전환 시 홈·보드·일정·설정이 해당 행사 데이터로 바뀌고 새로고침 후 유지(localStorage), `grep -rn "PROJECT_ID" src --include=*.tsx` 0건 (테스트로 증명)
19. (v1.5) 행사 설정 ①에서 필수 4 미입력 저장 거부·세팅 미완료 뱃지, ②에서 담당자 추가/삭제·마지막 PM 삭제 409, 저장 값이 S9 ① 개요에 반영 (테스트로 증명)
20. (v1.5) 새 행사 만들기 → S0 3단계 → 완료 시 onboarded_at 기록·WBS 전개·R&R 시드·목록에 등장; 세팅 미완료 행사 진입 시 차단이 아닌 /settings 유도 (테스트로 증명). 기존 dod10 가드 테스트는 '유도' 의미로 갱신
21. (v2.0) 엔진 등가: pricing-dataset 전 벡터(21+1) 산출이 원본과 0원 차이 (테스트로 증명). 데이터셋 v1.1.0 = LED 오퍼레이팅↔중계 분리 반영본
22. (v2.0) Excel 등가: 동일 입력의 .xlsx 셀 값·수식이 원본 테스트 26케이스 통과, 외부 업로드 호출 0건
23. (v2.0) 비노출: quotes·breakdown·total_amount 키가 `/c/*` 응답·운영계획서 조립 데이터·activity_log·알림 페이로드 타입과 런타임 객체 어디에도 없음 (테스트로 증명) + `grep -rn "total_amount\|breakdown" src/pages/Client* src/components/plan src/components/client` 0건
24. (v2.0) 핸드오프: 확정 견적 → 행사 만들기 → S0 ① 프리필(§16 매핑 전 필드) → 완료 시 quote.project_id·project.quote_id 상호 링크; 견적 없는 S-1 → S0 경로 그대로 동작; 미확정 견적은 버튼 비활성 (테스트로 증명)
25. (v2.0) 권한: app_role staff는 견적 메뉴 미표시·/quotes 접근 시 403 화면, sales·admin은 접근; 행사 설정 ① 모객형 그룹은 일반형에서 숨김·데이터 보존; 컴플라이언스 카드 체크 왕복 (테스트로 증명)
26. (Phase 4) `VITE_DATA_PROVIDER=supabase`에서 DoD 1~25 전부 재현 + RLS 거부 3종(staff→quotes, 비멤버→project, 토큰 경로→quotes) + 로그인 매직링크 왕복 + 서버 재계산(클라이언트가 보낸 total과 다르면 서버 값 저장) (테스트로 증명)
27. (v2.1) 랜딩보드: 기본 13섹션 시드 · autofill이 세션/개요/존에서 조립(끄면 입력 보존) · 유효한 GA4/GTM ID일 때만 스니펫 주입(형식 불일치는 미주입) · 측정 ID 없으면 내보낸 HTML의 외부 요청 0건 · 사용자 입력 이스케이프 · 폼 제출이 등록(S4) Attendee로 유입되고 당일 지표 반영 (테스트로 증명)
28. (v2.1 §4-21) **행사 스코프**: 랜딩 목록·생성이 현재 행사(`ProjectContext`)로 스코프되고 — 행사 A→B 전환 시 목록이 바뀌고, 종료 행사 생성은 409, 같은 slug를 다른 행사에 만들 수 있음 (테스트로 증명)

29. (v2.2 §19.1) **정산 마진**: 확정 견적을 불러오면 버킷 9종이 스냅숏되고(`recruit`가 rc/ld로 분리됨), `마진 기준 계약액 − Σ실집행 = 최종 마진` 항등식이 성립하며, `has_cost=false` 버킷에 발주·실비를 넣으면 422; 리드젠 버킷은 마진 기준 계약액에서 빠지되 화면에는 남는다 (테스트로 증명)
30. (v2.2 §19.4·§19.7) **정산 부가세·비노출**: `vat_included=true` 입력이 `round(v/1.1)`로 저장되고 원본이 보존됨; `settlement`·`ordered_amount`·`actual_amount`·`markup`·`margin` 키가 `/c/*` 응답·운영계획서 조립 데이터·랜딩 내보내기 HTML·activity_log 어디에도 0건 + 소스 grep 범위에 `pages/Landing*`·`lib/landing*` 포함 (테스트로 증명, **역검증 결과를 체크아웃 보고에 기재**)

31. (v2.4 §21) **성격 축**: kind='host' 전환 시 파트너 보드·/p 발급 UI 활성 + 발주처 발송 UI 숨김, 재전환 시 데이터 무손실(R-H1); 주최형 데모 행사에서 HT 템플릿이 파트너 5×partner_submit 인스턴스로 전개 (테스트로 증명)
32. (v2.4 §21) **파트너 격리**: /p/demo-partner에 자기 파트너 항목만 렌더 — 타 파트너 항목·contract_amount·견적/정산 금액 키가 응답과 화면에 0건(대조군 방식, R-H2·R-H3) (테스트로 증명)
33. (v2.4 §5.1) **검토 루프**: 제출(requested→pending_approval)→승인(final)|수정요청(코멘트 없으면 422)→재제출(pending_approval 복귀)이 전부 assertTransition 경유, 주최형 라벨 세트 적용 (테스트로 증명)
34. (v2.4 §22) **임포트**: 가상 픽스처 3종(A·B·C형)이 섹션·항목·헤더·검산 일치로 파싱되고, confirm 없이 quotes가 생성되는 경로 없음(R-Q1); 분배 4종 각 동작(보드 시드는 금액 키 미포함); 임포트 견적 '임포트' 배지 (테스트로 증명)

35. (v2.5 §23) **유형 우선 보드**: 카드 4종 렌더·건수 정확, 기존 운영 항목 자동 분류 이관 무손실(R-O1), 정형 카테고리 선택·생성 시 빌더가 인라인으로 열림 (테스트로 증명)
36. (v2.5 §23.3) **시나리오**: 프로그램표에서 뼈대 생성(빈 문서만 — 재시드 409), 블록 CRUD·정렬, 큐시트로 내보내기가 기존 큐 보존+후미 삽입(R-O5)·변환 규칙 준수, 컨펌 발송 시 doc-snapshot 버전 등록 (테스트로 증명)
37. (v2.5 §23) **운영가이드**: 섹션 4종 시드·존운영/R&R 초기 로드, 원본 변경 시 stale 표시·자동 덮어쓰기 없음(R-O4), 개인 연락처가 화면·S9 조립 데이터에 0건(R-O6), 인쇄 구조 계약 (테스트로 증명)
38. (v2.5) **S9 확장**: ⑦비상 대응 섹션 렌더·인쇄 포함·진행률 집계 반영, ② 세션별 시나리오 펼침(있을 때만), 기존 6섹션 회귀 없음 (테스트로 증명)

### 상시 grep 가드 (매 세션 종료 시 0건 확인 — 위 DoD와 별개로 항상 검사)
| 가드 | 명령 | 근거 |
|---|---|---|
| 디자인 토큰 | `grep -rn "gray-\|slate-" src` | DoD 17 |
| 행사 ID 상수 | `grep -rn "PROJECT_ID" src --include=*.tsx` | DoD 18 |
| **행사 스코프 유도** | `grep -rn "user\.project_id\|currentUser()\.project_id" src --include=*.ts --include=*.tsx` | **v2.1 §4-21 — 랜딩 결함 재발 방지. 예외는 `scope-exempt:` 주석 + 테스트의 화이트리스트 둘 다 필요(무설명 예외 금지)** |
| 금액 비노출 | `grep -rn "total_amount\|breakdown\|ordered_amount\|actual_amount\|markup\|margin\|settlement\|contract_amount" src/pages/Client* src/pages/Landing* src/pages/Partner* src/lib/landing* src/components/plan src/components/client src/components/partner` | **DoD 23·30·32 (v2.4 — contract_amount 키·Partner 경로 확대)** |
| 온보딩 플래그 | `grep -rn "onboarding_completed" src` | DoD 16 |

앞의 3종은 `src/test/dod-project-scope-guard.test.ts`·기존 DoD 테스트가 상시 자동 검증한다 — 셸 grep은 이중 확인용이다.

## 8. 서버 이식 완료 기준 (Phase 4~6 DoD)
0. (v2.3) Phase 4 = §7 DoD 26(매직링크 실수신만 §20 이월 가능) / 인프라 게이트(§18 1~6)는 §20 D-Day 런북 항목 — Code 범위 아님
1. Provider 교체 후 프론트 무수정으로 §7의 1~6 전부 실DB에서 재현
2. 토큰: 만료·회수 시 410 / pending·final·shared 코멘트 외 데이터 접근 불가(테스트로 증명)
3. RLS: reg 역할의 design 항목 쓰기 거부 / 비멤버 프로젝트 조회 거부
4. Drive: 표준 트리 자동 생성 / 06 스냅숏 원자성(강제 실패 시 approved 유지+재시도) / 인박스가 직접 업로드 감지
5. OAuth 동의 화면 Production 게시 확인은 §20 D-Day 항목 — 코드 게이트는 토큰 응답에서 Testing 징후(7일 만료) 감지 시 경고 로그
7. (v2.3) `setup.sql` 멱등: 신규 dev 프로젝트에서 2회 연속 실행 무해 + setup.sql→(seed.sql)→앱 접속이 §20 절차 문구 그대로 재현됨 (테스트+체크아웃 보고로 증명)
8. (v2.3) 알림 no-op 폴백: `SLACK_WEBHOOK_URL` 미설정에서 전이·업로드·컨펌 전부 정상 + 페이로드에 금액 금지 키 5종 0건 (테스트로 증명)
9. (v2.3) 시크릿 커밋 가드: `grep -rn "sb_secret" src supabase scripts --include=*.ts --include=*.sql` 0건(변수명 참조 제외 — 실키 값 패턴 검사) + `.env.local`이 .gitignore에 있음
6. 알림: 컨펌 발송 시 Slack+이메일, D-1 리마인드 cron 동작

## 9. 세션 리추얼 (jc-workspace-ops 세션 규약 준용)
- 체크인: CLAUDE.md+PROGRESS.md 로드 → 3줄 복명(현재 상태/이번 세션 목표/열린 질문) → 사용자 승인 후 개시
- 체크아웃: PROGRESS.md 갱신(상태 요약·완료·미결·다음 스텝·결정 로그·세션 로그·잠금 해제)
- 설계서와 다르게 구현해야 할 사정이 생기면 임의 진행 금지 — PROGRESS.md '열린 질문'에 기록하고 사용자 확인
- **DataProvider 인터페이스 동결 후 변경이 필요하면 반드시 사용자 승인 + 설계서 개정을 동반**
- 디자인 변경(Phase 3.9 이후 포함)은 디자인지시서 개정 없이 토큰 값·레이아웃 구조를 임의로 바꾸지 않는다. 신규 화면도 tokens.css 변수만 사용
- (v2.3) dev 3키(URL·publishable·secret)는 사용자가 세션 대화로 제공한다 — `.env.local`(gitignore 확인)에만 기록하고 어떤 산출물(코드·PROGRESS·PR·보고)에도 값을 재인쇄하지 않는다. secret 키를 `VITE_*` env에 넣지 않는다
- (v2.0) Supabase secret(구 service role)·publishable key·URL은 env·Vault에만. 코드·PROGRESS.md·PR 본문·체크아웃 보고에 값 기재 금지. 옛 Configurator 레포의 하드코딩 키는 이식 대상에서 제외
- (v2.0) 견적 엔진 상수·산식은 "원본과 0원 일치"가 깨지면 어떤 사유로도 머지 금지 — 변경은 설계서 개정+사용자 승인 후 골든 벡터 갱신과 함께
