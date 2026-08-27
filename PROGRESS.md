# PROGRESS.md — MICE 커뮤니케이터

> 가변 상태 파일. 매 세션 체크아웃 시 에이전트가 갱신한다 (CLAUDE.md §9 리추얼).

## 1. 상태 요약
- **진행 중: Phase 3.15.1 — 챗 감수(2026-08-27, ⚠️ 조건부 보완) 후속 폴리시 P1~P9** (브랜치
  `claude/phase-3-15-1-polish`, base=main `b719cf6`, **드래프트 PR #26 — 머지는 챗 검수 후**).
  정본 문서를 **설계서 v2.5**로 선채택(v2.4 대체·삭제 — v2.4.1 내용은 v2.5가 승계, 사용자 승인).
  P1 데모 charset 백지 결함(§13b — 수정 전 재현→선두 0바이트 보장→no-charset 3라우트 검증) ·
  P2 파트너 가이드·문의 창구(**DataProvider v8.1 재동결 — 필드 2종 추가만, 102메서드 불변**,
  설정 ③ 입력 + 포털 버튼/문의) · P3 주최형 홈 검토 대기 위젯+KPI 4구성·파트너 보드 딥링크
  (?partner=)·affordance · P4 주최형 R&R 4카드·규약 카드 C-H1~C-H3 시드(+expandHostWbs 멱등
  백필) · P5 등록 검색/필터/50행 페이지네이션·S5 HT 파트너 인스턴스 접기(제출 n/5)·보드 제목
  검색 · P6 Minor 6건(target 파트너명·방향 기호 ▲▼■·포털 접힘 요약 '제출:'·안내 완료/예정·
  폼 접힘·'컨펌 대상 제작물' 라벨) · P7 통합 "항목 추가" 카드(pm 가이드 토글·큐시트 카테고리
  → **인라인 에디터** 채택) · P8 InfoTip+helpTexts 사전(보드 헤더·상태 범례·토글·파트너 KPI·
  정산 KPI/검산·임포트 단계) · P9 등록 xlsx 임포트(동기 리더 재사용·CSV 등가 증명)+구글시트
  자리. 결과: vitest **612개**(3.15 머지 기준 548 + 64) **연속 3회 무실패** · tsc · build ·
  demo 4단(**no-charset 케이스 포함**) · 가드 5종 0건 · 스크린샷 8장
- **완료: Phase 3.15 — v2.4 주최형(파트너) 확장 + 견적서 임포트** (브랜치
  `claude/phase-3-15-host-import` → **PR #25 머지, main `22e247f`** — 사용자 지시 2026-08-27.
  머지본 main 재검증: vitest 548 · tsc · demo 4단. **데모 아티팩트 기존 URL 재발행 완료**).
  정본 문서를 **설계서 v2.4**로 교체(v2.2 대체·삭제 — v2.3은 레포에 커밋된 적 없음, 내용은 v2.4가
  승계), CLAUDE.md v2.4 채택. ① `projects.kind` 성격 축(대행형/주최형 — event_type과 직교,
  표시 계층 전환·데이터 무손실 R-H1) ② 파트너 등급·명부·토큰 + S-11 파트너 보드 + `/p/{token}`
  무로그인 제출 포털(파트너 간 완전 격리 R-H2·계약액 비노출 R-H3) ③ §5.1 검토 루프 — 기존
  전이표 재사용, 신규 상태쌍은 requested→pending_approval(partner_submit) 1건 ④ 주최형 WBS
  템플릿 HT-1~12(partner_submit은 파트너별 인스턴스 전개) ⑤ 견적서 xlsx 임포트 — §22.2 인식
  규칙 파서(A·B·C형)·확인 큐 위저드·분배 4종·'임포트' 배지. **DataProvider v8 재동결
  (16메서드 추가 · 102메서드)**, importVendorQuote는 v9 예약 유지.
  결과: vitest **548개**(기준 444 + 3.15a 40 + 3.15b 8 + 3.15c 12 + 3.15d 25 + DoD31~34 19)
  **연속 3회 무실패** · tsc 클린 · vite build · `npm run demo` 4단 · 상시 grep 가드 0건
  (금액 가드는 contract_amount·Partner 경로로 확대, **역검증 1건 — 고의 결함 주입 시 가드가
  파일을 지목하며 실패함을 확인 후 제거**) · 스크린샷 5장 · 실견적서 3종 로컬 검산 전부 기대값
  일치(§22 — 수치는 세션 로그·체크아웃 보고 참조, 실파일은 레포에 없음 R-Q4)
- **진행 중: Phase 3.14 — v2.2 정산보드(S-10)** (브랜치 `claude/phase-3-13-1-hotfix-y5hwpx`,
  base=main `881e556`). 정본 문서를 **설계서 v2.2**로 교체(v2.1 대체·삭제), CLAUDE.md v2.2 채택.
  확정 견적 breakdown을 **버킷 9종으로 스냅숏**해 견적·발주·실비 3단을 추적하고 마진을 실시간으로 본다.
  `recruit` → `rc`(RSVP 운영비) + `ld`(리드젠)가 유일한 비자명 매핑이며 값은 **엔진 산출값 그대로**.
  마진 식은 §19.1 정본(실물 내부정산 2건에서 원 단위 일치 검산) — 임의 변형 금지.
  **DataProvider v7 재동결(86메서드)**, `importVendorQuote`는 v8 예약(업로드 버튼은 두되
  "Phase 4.7에서 열립니다"로 시점을 밝힘 — 게이트 뒤에 숨기지 않음).
  결과: vitest **433개**(기준 406 + dod29 10 + dod30 9 + 화면 8, settlement-math 12는 기준에 포함)
  **연속 3회 무실패** · tsc 클린 · vite build 성공 · `npm run demo` 4단 전부 통과 ·
  grep 가드 5종 프로덕션 소스 0건 · 스크린샷 5장 · **가드 역검증 5건 전부 발화 확인**
- **Phase 3.14.1 — 챗 실측 검수 후속 3건** (같은 브랜치·PR #24 위 후속 커밋):
  **F1(Critical) `has_cost` 끄기로 마진이 소리 없이 부풀던 구멍**을 입력 경로에서 409로 막음 ·
  F2 `settlement.ts` 항등식 주석의 조건 오기 정정 · F3 금지 키에 `quote_amount` 추가.
  결과: vitest **438**(433 + DoD-29 ⑥ 5건) 연속 3회 · tsc · build · demo 4단 · 가드 0건
- **Phase 3.14.2 — 같은 실패 모드의 남은 문 2개** (같은 브랜치·PR #24):
  **F4(Critical) 금액이 든 항목을 원가 없는 버킷으로 *옮기는* 경로**(+21,000,000) ·
  **F5(Critical, 전수 훑기에서 자체 발견) 기준 갱신이 has_cost를 되돌리는 경로**(+9,000,000).
  둘 다 F1과 같은 뿌리 — 항등식은 상쇄돼 조용히 통과한다. 마진 식은 손대지 않고 입력 경로에서 막았다.
  결과: vitest **444**(438 + DoD-29 ⑦⑧ 6건) 연속 3회 · tsc · build · demo 4단 · 가드 0건

- **진행 중: Phase 3.13.1 — 핫픽스 5건** (브랜치 `claude/phase-3-13-1-hotfix-y5hwpx`, base=main `4f5a4e4`).
  챗 실측 검수(2026-08-23)에서 나온 결함 정정만 — 신기능 0. 정본 문서를 **설계서 v2.1**로 교체.
  H1 랜딩 스코프(§4-21·**DataProvider v6.1 재동결**) · H2 DoD grep 확대 · H3 dod10/dod20 flake 제거 ·
  H4 골든 데이터셋 출처 정직화 · H5 jsx-easy-shift 엔진 동결(문서 3건).
  결과: vitest **376개**(기준 369 + 스코프 4 + 스코프 가드 3) **연속 3회 무실패** · tsc 클린 ·
  vite build 성공 · `npm run demo` **4단 전부 통과**(정적 · 라우팅 4 · 브라우저 15항목) ·
  grep 가드 5종 0건(gray/slate · PROJECT_ID · **user.project_id** · 금액 키 · onboarding_completed) ·
  스크린샷 4장 → **PR #21 머지(main `df947a0`)** · jsx-easy-shift PR #46 스쿼시 머지(main `1154614`)
- **Phase 3.13.2 — 머지 후속 2건** (2026-08-23, 사용자 지시): ① 견적 옵션 영문 라벨 단가 오기 수정
  (`전체 녹화·편집` KRW 3,500,000 → 1,000,000) + 카탈로그 정합 가드 신설 ② **데모 아티팩트 재발행**
  (랜딩 스코프 정정 반영본). vitest **380개** · tsc · build · demo 4단 전부 통과
- 직전: Phase 3.12 — 데모 픽스처 리빌드화** (브랜치 `claude/gg-5jaapu`, base=main `bfccb26`).
  9/1 합류 팀원이 자기가 운영한 실제 행사(RE:BUILD 26)를 데모에서 그대로 보게 하는 증분.
  스키마·타입·DataProvider 무변경. **사용자 보정 3건 반영(2026-08-22)** — RE:BUILD 27 행사일
  2026-09-10, 견적 인원 480/400(엔진 상한 내), 종료 행사 보드의 생성·지시 폼 숨김(데이터 전용
  원칙의 승인된 예외 1건). 결과: vitest **323개**(기준 312 + DoD-26 11) · tsc(앱·데모) 클린 ·
  vite build 성공 · `npm run demo` 4단 전부 통과(정적 · 라우팅 4 · 브라우저 15항목) ·
  금지 문자열 가드 0건 · 스크린샷 8장
- 현재 Phase: **Phase 0~3.11 완료** — main=`78c8aa9`(PR #14 머지, 챗 실측 검수 통과·사용자 머지 승인
  2026-08-22). 견적(S-2)→행사 설정→운영→결과의 단일 플랫폼 흐름이 mock 기준으로 전부 동작한다.
  다음 = **Phase 4(새 Supabase 이식)** — ★착수 전 사용자 승인 + 새 프로젝트 3키 수령 필요
- 정본 문서: **`docs/mice-communicator-설계서-v2.1.md`** (스키마·상태 머신·API·랜딩 §4-19~§4-22·
  WBS §15·핸드오프 §16·이식 인벤토리 §17·인프라 전환 §18 SoT — v2.0 대체·삭제) +
  `docs/mice-communicator-디자인지시서-v1.md`(디자인 토큰·레이아웃 정본) +
  루트 `CLAUDE.md` v2.1(작업 순서·규약·상시 grep 가드)
- 브랜치: `main` = 정본. 3.11은 하네스 지정 브랜치 `claude/progress-9jxt7x`(base=main)로 개발·PR #14 —
  브리프의 `claude/phase-3.11-quote-module` 명명 대신 세션 하네스 지정을 따름(§5 결정 로그).
  머지 후 같은 브랜치는 main에서 재분기해 후속 문서 작업에 재사용
- **Phase 3.11 결과(머지본 main 재검증 포함): vitest 312개(32파일) = 기준치 124 + 견적 모듈 159
  (골든 벡터 15/15 0원·그리드 47행·이식 84케이스) + dod23(5)·dod24(7)·dod25(10)·리다이렉트(7)
  전부 통과(브랜치 2회 + 머지 후 main 1회 = 3회 실행 검증) +
  tsc 클린 + vite build 성공 + grep 가드 4종 0건(gray/slate·PROJECT_ID(*.tsx)·발주처/plan 금액 키·
  onboarding_completed) + 스크린샷 7장(지시분 6장+S5 컴플라이언스 추가컷)**
- Phase 3.10.1 결과(기준치): vitest 124개·tsc·build·grep 2종 0건 + 1280 큐시트 무스크롤 실측
- **데모 아티팩트: 실기(實機) 단일 HTML 재발행 완료** — `npm run build:demo`(HashRouter 진입점 +
  전 청크 인라인) 산출을 기존 URL에 재배포. 하위 경로 서빙 실측 검증(5개 라우트 렌더·외부 요청 0건)

## 2. 완료
- **Phase 3.15 — v2.4 주최형 확장 + 견적서 임포트** (2026-08-27, 이 세션 — AA 직렬 후 AB·AC·AD 병렬,
  메인이 라우트 셸 선배선·통합·DoD 코드화)
  - 3.15a(AA): 타입 §21.1 1:1·전이표 §5.1 확장(via partner_submit·partner_review, host_inbound 분기
    표시)·HOST_STATUS_LABELS·HT-1~12 템플릿·expandHostWbs(파트너별 인스턴스+inbound 자동 생성·재전개
    code+partner_id 보존)·DataProvider v8(102메서드)·MockProvider 16메서드·주최형 데모 픽스처
    "가상 서밋 2026"(등급 3·파트너 5·상태 분포·데모 토큰 4종)
  - 3.15b(AB): 행사 설정 ③ 성격 카드+등급 편집, ② 주최형이면 파트너 명부(발급·회수·복사),
    S-11 파트너 보드(KPI 4·마감 타임라인 ▲▼■·파트너 표·검토 패널), 홈 검토 대기 타일,
    사이드바 주최형 전용 메뉴·발송 UI 숨김
  - 3.15c(AC): `/p/{token}` 포털 — 슬림 다크 상단 바+등급 배지·이번 마감 고정·상태 카드(수정요청
    코멘트·파일/텍스트 제출·재제출)·host_notice 읽기 전용·격리 고지·410·375px, `/p/demo-partner`
  - 3.15d(AD): §22.2 파서(동기 xlsx 리더 자체 구현 — provider 동기 호출 계약 준수, exceljs는 픽스처
    생성용으로만)·가상 골든 픽스처 3종(코드 생성 — 바이너리 커밋 0)·위저드 3단계·분배 4종·'임포트' 배지
  - 통합(메인): uploadVersion의 §5.1 목적지 분기 보강(inbound 수정요청 내부 업로드→pending_approval
    복귀·제출 전 내부 업로드 409), DoD 31~34 테스트 4파일, dod23 가드 확대(+contract_amount·Partner
    경로)+역검증, 수정요청 파트너 데모 토큰(`demo-partner-cr`) 추가
- **Phase 3.14 — v2.2 정산보드 S-10** (2026-08-23, 이 세션)
  - 3.14a 타입·집계·provider·픽스처: `Vendor`·`SettlementBoard`·`SettlementBucket`·`SettlementItem`·
    `SettlementImport` 타입, `src/lib/settlement.ts`(순수 집계 + `quoteBucketSpec` 매핑 정본),
    MockProvider 11메서드, 가상 협력사 8곳·버킷 9·항목 12 픽스처(s2 한 버킷만 의도적 견적 초과)
  - 3.14b S-10 화면: `/settlement`, 사이드바 운영 그룹 **마지막**(app_role 게이트 없음 = 멤버 전원),
    빈 상태(확정 견적 선택) · KPI 4 · 마진 구성 3분할 막대 · 검산 블록 · 버킷 표(원가 없음·마진 밖은
    회색으로 남김) · 초과 버킷 붉은 표시 + 홈(S1) "견적 초과 버킷 n건" 카드
  - 3.14c 입력: 항목 생성(pm) · 금액 입력(pm 또는 담당 본인) · **부가세 토글 미리보기**
    ("받은 금액 1,320,000(포함) → 저장 1,200,000(별도)") · custom 버킷 추가 · 기준 견적 갱신은
    **차이 표를 먼저 보여주고 확인**(항목은 보존) · 협력사 자유 입력 → 마스터 승격
  - 3.14d DoD 29·30 코드화 + DoD 23 grep 범위를 랜딩(`pages/Landing*`·`lib/landing*`)까지 확대

- 설계서 v1.1 확정 + CLAUDE.md v1.1 (2026-08-19)
- **Phase 0 — 스캐폴딩** (PR #1 머지): Vite 6 + React 18 + TS + Tailwind 4, S1~S8 라우팅 골격
- **Phase 1 — 타입·어댑터·픽스처** (PR #2 머지): §4와 1:1 타입, §5 전이표 정본(statusMachine),
  **DataProvider v1 동결(35메서드)**, MockProvider, 가상 행사 픽스처, vitest 33개
- **Phase 2 — 내부 UI S1~S6** (2026-08-22, 에이전트 B): 홈 대시보드(미결 컨펌·D-day·인박스 연결/무시·
  진행률·최근 활동) / 보드(카테고리 그룹·필터·항목 생성·전이) / 상세(버전 이력·미리보기·코멘트
  internal/shared·컨펌 발송+포맷 검사·업로드) / 등록(CSV 헤더 매핑 임포트·체크인·통계 3종·내보내기) /
  일정(마일스톤 CRUD+컨펌 기한 오버레이) / 설정(멤버·연락처·토큰 발급/회수, PM 게이팅)
- **Phase 3 — 발주처 뷰 S7·S8** (2026-08-22, 에이전트 C): `/c/:token` 모바일 375px — 컨펌 큐(승인
  인라인 확인·수정요청 코멘트 필수·이력), 현황(진행률·마일스톤·확정본 링크), 410/404 분기
- **§7 프론트 DoD 1~6 전부 충족 확인** (2026-08-22, 메인 통합 검수):
  1. Mock E2E 컨펌 루프 — 생성→업로드→내부확정→PM 발송(.ai 거부/.png 통과)→`/c/demo` 승인→final→보드 '확정' 반영 (브라우저 검증)
  2. 수정요청 루프 — 수정요청+코멘트→새 버전 업로드 시 draft 복귀
  3. internal 코멘트 발주처 미노출 — provider 테스트 + 브라우저 본문 검사 이중 증명
  4. 등록 CSV 임포트(헤더 매핑 UI)·체크인 토글·통계 3종
  5. 홈 대시보드 전 위젯 렌더
  6. 발주처 화면 375px 정상 (21개 어서션)
  - 통합 후 vitest 33개·빌드 통과, favicon 404 수정(인라인 SVG)
- **DoD 검증의 테스트 코드화** (2026-08-22): 브라우저 E2E 의존을 제거하고 vitest + React Testing
  Library 컴포넌트 테스트로 DoD 1~6을 상시 검증 — `src/test/dod1~6*.test.tsx` 17개(총 50개 통과).
  특히 DoD-3은 "internal 코멘트가 /c/demo·/c/demo/status에 절대 미렌더 + 내부 화면엔 렌더(대조군)"를
  테스트 코드로 증명. DoD-6은 jsdom 한계로 구조 계약(max-w-2xl·h-11 터치 타깃) 가드 — 시각 검증은
  2026-08-22 375px 스크린샷으로 확보
- **리멤버 브랜드 로고 상시 노출** (2026-08-22): 내부·발주처 헤더에 `BrandLogo` — `public/brand/
  remember-logo.svg` 자산이 있으면 이미지, 없으면 텍스트 워드마크 폴백
- **설계서 v1.2 + CLAUDE.md v1.2 채택** (2026-08-22): v1.1 대체 — 지시 파이프라인·program_sessions·
  행사개요·S9 운영계획서·Phase 3.5·DoD 7~9 추가
- **Phase 3.5a — 타입 개정·재동결** (2026-08-22, 메인이 G 역할 수행): status 'requested'+전이표 8규칙
  (requested→draft via version_upload — 업로드·인박스 연결 공통), Deliverable 지시/스펙/content 필드,
  ProgramSession, Project 행사개요 필드 → **DataProvider v2(41메서드) 재동결**, MockProvider·픽스처 확장
  (지시 픽스처 dlv-007, 존운영 content, 프로그램 세션 5건, 행사개요)
- **Phase 3.5b — 지시 흐름 UI** (2026-08-22, 에이전트 H): S2 pm 전용 지시 발행 폼(브리프·참고 링크·
  스펙 4필드)·'지시됨' 뱃지 / S3 지시 카드(BriefCard: 브리프+스펙 칩)+requested 액션 바 /
  S1 '받은 지시' 위젯(my_requested)
- **Phase 3.5c — S9 운영계획서** (2026-08-22, 에이전트 I): `/plan` 6섹션 자동 조립(①개요 ②프로그램
  ③존운영 ④제작물 리스트 ⑤등록 통계 ⑥일정)+섹션·문서 진행률+개요·프로그램 인라인 편집(pm·ops 게이팅)
  +A4 인쇄 CSS(@page·print-hidden·break-inside 보호)+인쇄 버튼. content 마크다운은 React 노드 직접 생성
  초경량 렌더러(innerHTML 미사용)
- **§7 프론트 DoD 7~9 충족 + 전체 테스트 코드화** (2026-08-22, 메인 통합 검수): DoD-7(지시 발행→지시됨
  뱃지→담당자 홈→첫 업로드 draft 전환·비pm 미노출), DoD-8(6섹션 렌더·진행률 수치·지시 스펙 기반 제작물
  표·편집 게이팅·개요 왕복 편집), DoD-9(A4 인쇄 구조 계약 가드). **vitest 72개(11파일) 전부 통과 +
  tsc 클린 + vite build 성공**

- **설계서 v1.4 + CLAUDE.md v1.4 채택** (2026-08-22): v1.2 대체 — v1.3(S0 온보딩·유형 토글·큐시트)+
  v1.4(WBS 템플릿·R&R) 통합, Phase 3.6/3.7·DoD 10~15 추가. **Phase 3.6이 레포에 없어 로드맵 순서대로
  본 세션에서 3.6→3.7 순차 수행**
- **Phase 3.6a·3.7a·3.7b — 타입 v3·WBS 코어** (2026-08-22, 메인이 J+M+N 수행): EventType·Cue·WbsTask·
  RoleCharter·WbsStatus → **DataProvider v3(53메서드) 재동결**, §15 모객형 37태스크 원문 이식+일반형
  28건 파생, event_date 전개·재전개(상태 보존)·R&R 시드, 지연/임박 정본 산식(lib/wbs)+경계값 테스트,
  큐시트 발송 자동 스냅숏, final→연결 태스크 자동 done
- **Phase 3.6b — S0 온보딩·유형 토글** (2026-08-22, 에이전트 K): 3단계 위저드+OnboardingGuard(완료 전
  본체 차단, /c/* 제외)+완료 시 WBS 전개·R&R 부여 / S6 행사 기본정보 카드 / S4 일반형 RSVP 숨김
  (데이터 보존)
- **Phase 3.6c — 큐시트 에디터·S9 연동** (2026-08-22, 에이전트 L): S3 큐시트 항목 정형 표 에디터
  (행 CRUD·↑↓ 정렬·대본 전문 패널·pm/ops 게이팅), 발송 시 스냅숏 안내('auto' 센티널), S9 ③큐시트
  섹션(7섹션 체제·번호 재배열)
- **Phase 3.7c — S5 승격·홈 집계** (2026-08-22, 에이전트 O): 단계 필터·체크리스트/간트 토글(CSS 바
  D-42~D+30·오늘선)·지연/임박 하이라이트·상태 순환 토글(403 표면화)·pm 편집/재전개·산출물 연결 뱃지·
  R&R 카드 그리드·홈 지연/임박 위젯(0건 시 숨김)
- **§7 프론트 DoD 1~15 전부 테스트 코드화·통과 확인** (2026-08-22, 메인 통합 검수): dod10~15 신규 +
  dod8/9 7섹션 갱신 + dod1은 큐시트 자동 스냅숏 도입으로 dlv-005 기반 재작성. 통합 후 섹션 번호
  하드코딩 4건을 PLAN_SECTION_META 파생으로 교정. **vitest 114개(18파일)·tsc·vite build 전부 통과**

- **설계서 v1.4.1 + CLAUDE.md v1.4.1 + 디자인지시서 v1 + 브랜드 자산 채택** (2026-08-22): v1.4 대체.
  v1.4.1 = Phase 3.6·3.7 구현 해석 5건 정본화(onboarded_at 사용자 승인 포함, 기능 추가 없음).
  로고 png 2종(`public/brand/remember-logo-offwhite.png`·`remember-logo-black.png`) 수령·배치
- **Phase 3.8a — onboarded_at 정합·DataProvider v3.1 재동결** (2026-08-22, 메인이 P 역할 수행):
  `Project.onboarded_at: IsoDateTime | null` + `OnboardingStatus {completed, onboarded_at}`(completed=파생값),
  MockProvider 앱 상태 플래그 제거 → 프로젝트 필드 파생, completeOnboarding=onboarded_at 기록(재완료 409
  CONFLICT), resetOnboarding=null 복원, 픽스처 onboarded_at 세팅. 메서드 수 53 불변
- **Phase 3.8b — 열린 질문 종결·주석 정합** (2026-08-22): 열린 질문 ①~⑤를 설계서 v1.4.1
  §4-1·§4-15·§8·§15 반영으로 종결, `src/lib/wbs.ts`·`src/fixtures/wbsTemplates.ts` 상단 주석 근거를
  설계서 v1.4.1로 교체(로직 무변경)
- **DoD-16 테스트 코드화** (2026-08-22): `src/test/dod16-onboarded-at.test.tsx` 3건 — 완료 시 타임스탬프
  기록·재완료 409·null 시 가드 리다이렉트 + `grep -rn "onboarding_completed" src` 0건 확인.
  **vitest 117개(19파일)·tsc·vite build 전부 통과**
- **Phase 3.9a — 토큰·로고·레이아웃 셸** (2026-08-22, 메인이 Q 역할 수행): `src/styles/tokens.css`
  단일 정의(§1 표 그대로 + @theme 유틸리티 노출) / Pretendard CDN dynamic-subset + tabular-nums(§2) /
  타이포 스케일·카드·버튼(.btn 3종+위험 변형)·입력·테이블 헤더·진행바·빈 상태 규격(§5, index.css) /
  상태·역할 컬러 정본화(§3 — labels.ts STATUS_BADGE_CLASSES·STATUS_STRIP_CLASSES·ROLE_*_CLASSES,
  pending_approval 좌측 도트) / BrandLogo png 2종 variant 전환(§7) / **내부 레이아웃 = 좌측 다크
  사이드바 232px(오렌지 활성 마커·하단 행사명/유형 뱃지/설정, 모바일 햄버거 드로어), 발주처 =
  슬림 다크 상단 바 + 오렌지 언더라인 탭(§4)** / PageHeader·EmptyState 공용 컴포넌트 신설
- **Phase 3.9b — 내부 화면 S0~S6·S9 depth** (2026-08-22, 에이전트 R 역할 4분할 병렬): S1 KPI 4카드
  (31/650 tabular·지연 negative·임박 accent)+2열 재배치 / S2 브라운 카테고리 캡션+상태 스트립 3px /
  S3 2단 분할(660+300 메타 사이드·버전 세로 타임라인, 큐시트는 좌측 전폭) / S4 통계 3카드+오렌지
  언더라인 탭+§5 테이블 규격 / S5 단계 필터 pill(다크 활성)·간트 역할 컬러 바(완료 40% 투명·지연
  negative·임박 accent·오늘 오렌지선)·R&R 좌보더 역할 컬러 / S6 섹션 카드 분리+위험 동작
  ghost-negative / S9 종이 메타포(중앙 시트 880·오렌지 헤어라인·브라운 대형 섹션 번호) /
  S0 중앙 카드 720·세로 스텝 레일·유형 카드 오렌지 선택
- **Phase 3.9c — 발주처 S7·S8 모바일** (2026-08-22, 에이전트 S 역할): 1열 카드, [승인]=accent
  대형(h-11)·[수정요청]=ghost(h-11), 확정본 positive 뱃지, 진행바 수치 라벨 바 아래 줄, 375px 검증
- **§7 DoD-17 충족** (2026-08-22, 메인 통합 검수): gray/slate grep 0건 / 기준치 117개 전부 통과
  (dod13·14의 스타일 클래스 계약 가드만 새 토큰으로 치환 — 의미 무변경, CLAUDE.md §4 Phase 3.9 허용
  조항) / tsc·vite build 통과 / 스크린샷 11장(S0·S1·S2·S3 일반·S3 큐시트·S4·S5 체크리스트·S5 간트·
  S9·발주처 큐 375px·발주처 현황 375px) / 데모 아티팩트 재발행

- **Phase 3.9.1 — 폴리시 4건** (2026-08-22, 챗 측 독립 실측 검수 반영 — 스타일·레이아웃만):
  P1 S3 큐시트 1단 전폭(메타를 에디터 위 가로 스트립으로 — 상태·담당·마감 한 줄 + 버전 최신 1건·
  전체 보기 토글, 콘솔 칩 1줄 truncate+툴팁, 열 최소폭 지정, 표 가로 스크롤은 카드 안) /
  P2 S5 간트 바 코드 라벨(3일 미만 기간은 바 밖 우측)+행 좌측 160px 라벨 컬럼(코드+제목)+7일 간격
  눈금(대시 --border, D-day만 brown 실선)+축 캡션 / P3 S4 상단 통계 3카드 상시 노출(일반형=참관객 수
  대체, 통계 탭은 보조 수치만) / P4 오늘이 축 범위 밖이면 "오늘 D-n · 축 범위 밖" 캡션.
  **117/117·tsc·build·gray/slate 0 유지, dod13·14 가드 무수정 통과** — PR #11 머지

- **설계서 v1.5 + CLAUDE.md v1.5 채택** (2026-08-22): v1.4.1 대체 — 다중 행사(projects 복수·status
  active/closed·행사개요 확장 필드·초대), 행사 설정 3탭 = S0 동일 폼, 진입점 원칙(§10),
  DataProvider v4(+5메서드), DoD 18~20, Phase 3.10 로드맵 추가. 목업 HTML은 참고만(정본=설계서 §10,
  레포 미저장 — 사용자 지시)
- **Phase 3.10a — DataProvider v4 재동결·다중 행사 코어** (2026-08-22, 메인이 T 역할 수행):
  ProjectStatus('active'|'closed')·Project 확장(event_end_date·start/end_time·expected_headcount·
  seating·organizer·target_audience·status·closed_at)·ProjectInvite·ProjectSummary(온보딩 단계 0~3
  포함)·ProjectCreateInput·MemberInput → **v4(58메서드: +listProjects·createProject·closeProject·
  addMember·removeMember, 기존 53 시그니처 불변) 재동결**. MockProvider 전면 다중 행사화 —
  projects[] 배열·전 조회/집계 project_id 스코프·assertWritable(closed 쓰기 409)·마지막 PM 삭제 409·
  이메일 중복 409·createProject(코드 자동 EVT-nnn·생성자 pm 자동·onboarded_at null)·
  wbs 재전개 프로젝트 단위 치환. 픽스처 4행사(①모객형 완료 ②일반형 완료·28건 전개 ③세팅 미완료
  ④closed — ②~④는 오늘 기준 상대 날짜 생성)
- **Phase 3.10b — 셀렉터·S-1·컨텍스트 배선** (2026-08-22, 에이전트 U 역할): ProjectContext
  (localStorage `communicator.currentProjectId`·미저장 시 첫 active 기본, 라우트 불변 — URL prefix 2차)
  → 화면 8곳 PROJECT_ID 상수 제거·useProject() 치환 / 사이드바 셀렉터 드롭다운(진행 중·종료 그룹·
  새 행사 만들기·전체 목록 링크)+메뉴 순서(행사 목록→행사 설정→홈→…) / S-1 행사 목록(카드 그리드·
  요약 수치·종료 뱃지·새 행사 만들기) / S5 행사일 변경 시 재전개 유도 배너
- **Phase 3.10c — 행사 설정 3탭·S0 공용 폼·유도 동선** (2026-08-22, 에이전트 V 역할):
  S6 행사 설정 = '① 행사개요'(16필드·필수 4 클라이언트 검증)/'② 담당자'(추가·삭제·마지막 PM 409
  표면화)/'③ 유형·연동' 3탭 + 세팅 완료/미완료 뱃지·'온보딩 이어서 하기' 유도 배너 / S0 위저드가
  동일 폼 컴포넌트 재사용(①행사개요→②담당자→③유형·확인) / OnboardingGuard = 차단 대신 /settings
  유도(v1.5 §10) / S9 ①은 행사 설정 값 읽기 조립+'행사 설정에서 편집' 링크(인쇄 숨김) /
  MembersEditor 삭제 성공 판정 버그 픽스(useMutation void 반환 → return true 래핑)
- **§7 DoD 18~20 테스트 코드화·통과** (2026-08-22, 메인 통합 검수): dod18(셀렉터 전환 시 화면 데이터
  전환·localStorage 유지·② 일반형 28건), dod19(필수 미입력 저장 거부·미완료 뱃지·담당자 추가/삭제·
  마지막 PM 409), dod20(S-1 새 행사→S0 3단계→onboarded_at·WBS 28건·R&R 시드·목록 반영 + 미완료 행사
  /settings 유도 동선). **vitest 124개(22파일)·tsc·vite build 전부 통과, PROJECT_ID grep(*.tsx) 0건**
- **Phase 3.10.1 — 검수 후속 폴리시 5건(문구·스타일만, 로직·데이터 무변경)** (2026-08-22, 메인 단독):
  R1 큐시트 표 1280 수납(대본→내용 셀 하단 캡션 링크, 콘솔 3열 124px·액션 열 132px·↑↓/삭제 28px
  컴팩트·삭제=아이콘+title) / R3 발주처 연락처 표 열 규격(이름 nowrap·소속 truncate+title·만료일은
  뱃지 아래 캡션, 폭 부족 시 가로 스크롤) / R4 셀렉터 드롭다운 데스크톱 300px 오버레이(모바일 드로어
  현행 유지) / R5 세팅 미완료 missingCount 0 분기 문구(뱃지 '온보딩 확인 필요'·배너 '필수 항목은 모두
  입력됐습니다…') / R2 간트 '축 범위 밖' 캡션을 토글 왼쪽으로 이동(축 행은 눈금만)+D+28 눈금은
  D+30과 28px 미만 겹침 시 생략(실측 폭 기반)

- **설계서 v2.0 + CLAUDE.md v2.0 채택** (2026-08-22, 커밋 `89c84a2`): v1.5 대체 — 견적 Configurator
  (jsx-easy-shift) 단일 플랫폼 흡수, #RULE-NO-PRICE-TO-CLIENT, profiles(app_role)·quotes·
  compliance_cards·모객 필드 4종·wbs_tasks.target, Phase 3.11/4/4.6 로드맵, DoD 21~26
- **Phase 3.11a — 엔진·데이터 이식 + DataProvider v5 재동결** (2026-08-22, 메인이 W 역할 수행):
  jsx-easy-shift main `6047834`에서 §17.1 전 파일 이식(`src/modules/quote/{engine,data,export}` +
  `src/lib/dateFormat.ts`) — 로직·상수 불변·TS 타입만 부여. 예외 2건: venuedb reference_cases(+동일
  사유의 source_files) 제거 / exportEstimate Drive 백업 경로 제거. **골든 벡터 14+조정 1 = 15/15 0원
  일치(DoD 21) + headcount_grid 47행 전량 대조 + 이식 테스트 84케이스(calcEstimate 14·exportEstimate
  26·kpiRules 5·pricingExtensions 28·rememberQuote 11) + 외부 fetch 0건 어서션(DoD 22)**. 타입 v5:
  Quote·QuoteInput·QuoteBreakdown·QuoteStatus·ComplianceCard·Profile(app_role)·Targeting,
  Project 모객 4종·WbsTask.target·CurrentUser.app_role. Mock: 견적 4건(①연결 v1 보관·v2 제안·v3
  확정=quo-003↔prj-stc26 상호 링크 + 미연결 초안 quo-010 "파트너 서밋 2026") — 금액은 전부 엔진 산출,
  setAppRole 토글(기본 sales), WBS 템플릿 target 시드(39건), 컴플라이언스 2종 시드(①②)
- **Phase 3.11b — S-2 견적 UI** (2026-08-22, 메인이 X 역할 수행): 사이드바 [행사 목록 → **준비**(견적·
  행사 설정) → **운영**(홈~운영계획서)] 그룹 캡션 + 견적 메뉴 admin·sales 게이트 + 셀렉터 "견적만
  있음 · 행사 미생성" 그룹(지연 로드) / `/quotes` 목록(행사 연결·미연결 그룹별 버전 표: 버전·인원·
  베뉴·모객·총액 tabular·상태 pill + 우측 선택 버전 요약 s1~s5·옵션·모객·참관객·VAT 별도/포함 +
  Excel 내려받기·새 버전·새 견적) / 에디터 5스텝(①규모·유형: 일자·시간·행사 성격 7종·모객 토글·
  KPI 게이지·참관객·타겟팅 5축 ②베뉴: venuedb 20곳 지역 필터·홀 적합도(getScaledHalls)·후보 택1·
  직접 입력·디스플레이 ③옵션 12종+부스 2타입+기념품 오버라이드 ④확인·확정: 조정 에디터·고객 정보·
  확정 잠금·Excel ⑤행사 만들기: 확정 전 비활성) — RQC 로직 분해 이식·tokens.css 전면 교체·한/영
  유지·다크 토글 제거 / staff 403 화면(QuoteGate)
- **Phase 3.11c — 핸드오프·흡수 기능** (2026-08-22, 메인이 Y 역할 수행): ⑤ → `createProjectFromQuote`
  (§16 매핑 그대로: venue=이름·홀 결합, event_type=include_leads 매핑, 타겟팅 요약+notes →
  target_audience, overview_items 3종, kpi_show_rate 90 기본, 코드 이니셜+연도 제안, 금액 키 전달
  없음) → S0 ① 프리필(주황 틴트 `--accent-tint`+배너·전부 수정 가능) → 상호 링크 / 행사 설정 ①
  모객형 전용 그룹(보장 인원·쇼업 KPI·타겟팅 5축 칩·"견적 vN 확정 기준" 링크·견적 연결 액션
  admin·sales) — 일반형 숨김·데이터 보존 / S5 소통 대상 열(3버킷 칩) + R&R 옆 컴플라이언스 카드
  2종(체크 왕복) / §10 옛 라우트 리다이렉트 6종 + `?client_view=1` 410 안내
- **§7 DoD 21~25 테스트 코드화·통과** (2026-08-22, 메인 통합 검수): dod23(금액 키 런타임 부재
  4경로 + 소스 grep 가드), dod24(§16 전 필드·상호 링크·미확정 409·⑤ 비활성·견적 없는 S0 경로·
  완료 후 링크 유지), dod25(staff 메뉴 미표시/403·admin 접근·모객형 그룹 숨김/보존·컴플라이언스
  왕복), 리다이렉트 가드 7건. **vitest 312개(32파일) 2회 연속 전부 통과 + tsc + build + grep 4종 0건**

- **Phase 3.12 — 데모 픽스처 리빌드화** (2026-08-22, 메인 단독): 기존 4행사 픽스처는 **비파괴**로 두고
  실제 운영 행사 2건을 추가. 출처는 사용자가 첨부한 **[리멤버] RE:BUILD 26 운영계획서(2026.04)·
  결과보고서(2026.05)** — 수치가 엇갈리면 결과보고서(실적)를 정본으로 삼았다
  - `src/fixtures/rebuildFixtures.ts` 신설(단일 진입점 `appendRebuildFixtures(state)`) —
    `createFixtureState()` 마지막에서 호출. 기존 픽스처 파일은 import·호출 3줄만 추가
  - ⑤ `prj-rebuild26` 리멤버 RE:BUILD 26 (종료·2026-05-07): 프로그램 20세션(연사·소속·Reach/Trust/
    Convert 태그) · 존 운영 9건(인사이트/리빌드/커넥트/사일런트/등록/리프레시/애프터파티/부대이벤트/
    외부·전기) · 제작물 **42건**(내부 16 · 발주 15 · 전시존 11, 규격·수량·위치·종류·기재내용·마감일
    전부 원문) · 큐시트 2건(개막 세션 8큐 — 콘솔 3채널 / 애프터파티 5큐) · 마일스톤 11 ·
    WBS 37건 전부 완료 · 등록 통계 **703명**(사전출력 134 · 사전등록 551 · 현장등록 18, 체크인 100%) ·
    RSVP 컨택 485건(참석 예정 277 · 참석 불가 40 · 결제 취소 32 · 미결제 사유 5버킷 73 · 부재 63)
  - ⑥ `prj-rebuild27` RE:BUILD 27 (진행 중 · **데모 기본 선택**, 행사일 2026-09-10(목)은 가안 = D-19):
    WBS 모객형 37건 전개 · **지연 2건 = 2.2 기초 자료 수령 리마인더 · 2.3 기초 자료 수령**(코드 고정
    시드, 상대 보정 규칙 없음) · 임박 4건(2.5 doing 포함) · 제작물 8건(지시됨 3 · 초안 2 · 내부검토 1 ·
    컨펌대기 2, 마감은 event_date 오프셋 D-13~D-8) · 존 운영 1(가안) · 큐시트 1(지시됨) ·
    프로그램 4(가안) · 마일스톤 5 · RSVP 30 · 인박스 1 · 발주처 토큰 `rb27` ·
    견적 2버전(v1 proposed 480명 243,120,000원 / v2 draft 400명 207,750,000원 — 전부 엔진 산출값,
    베뉴 = venuedb `pie_factory`, 대관료는 계약 전이라 0)
  - **보정 3건** (사용자 지시 2026-08-22, PR #16 위에 추가 커밋): ① 행사일 2026-09-24 → **2026-09-10**
    — 그 결과 마감이 지난 태스크가 1.1~1.4 · 2.1~2.4 · 3.1 · 3.2 열 건으로 정해지고, 그중 2.2·2.3만
    미완료로 두면 지연이 실무적으로 자연스러운 '기초 자료 수령' 2건으로 고정된다
    ② 견적 인원 800/700 → **480/400**(엔진 `TARGET_MAX` 500 안) — 별도 협의 모드가 풀려 실제 금액이
    산출된다. `input.notes`에 "자동 견적 상한 500명 — 총 참관 800명 규모는 별도 협의" 유지
    ③ **종료 행사의 S2 보드에서 '새 항목 생성'·'지시 발행' 폼 숨김** — `AreaBoardPage`가 현재 행사의
    `status==='closed'`면 두 폼 대신 "종료된 행사입니다 — 열람만 가능합니다." 안내를 렌더한다.
    provider의 409는 그대로 유지(방어선은 두 겹). **데이터 전용 원칙의 승인된 예외 1건**
  - 데모 기본 선택: `demo/seedProject.ts`(신설)가 `localStorage.communicator.currentProjectId`를
    `prj-rebuild27`로 시드 — **앱 본체(BrowserRouter 빌드)는 무변경**. 목록 정렬은 기존 규칙
    (진행 중 → 종료 / 진행 중은 created_at 오름차순) 그대로이고, RE:BUILD 27의 created_at을
    2026-07-28로 두어 진행 중 첫 카드가 되게 했다
  - DoD-26 테스트 11건(`src/test/dod26-rebuild-fixtures.test.tsx`): (a) 종료 그룹 접힘·쓰기 409·
    **종료 보드 폼 숨김(진행 중 행사 대조군 포함)** (b) 진행 중 첫 카드·WBS 37·지연 2건이 2.2·2.3·
    홈 집계 (c) S9 7섹션 실적 조립·견적 2버전 **엔진 재계산 일치(computeQuoteOutputs 왕복)·상한 내 검증**
    (d) 금지 문자열 정규식 가드 3종 (e) 기존 픽스처 비파괴.
    지연 판정은 기준일 `2026-08-22`를 박아 실행 날짜와 무관하게 결정적으로 검증한다
  - 데모 검증 스크립트 2건은 **기본 행사가 바뀐 사실만 반영**(느슨하게 바꾼 곳 없음):
    `demo/verify/routing.check.tsx`는 엔트리와 같은 시드를 적용하고 RE:BUILD 27 컨텐츠를 단언,
    `browser-check.mjs`의 첫 화면 단언도 동일 교체(`/c/demo` 발주처 검증은 prj-stc26 그대로)

- **Phase 3.13.1 — 핫픽스 5건** (2026-08-23, 메인 단독, base=main `4f5a4e4`)
  - **H1 랜딩 스코프 정정(Major)** — `MockProvider.listLandingPages()`가 인자 없이
    `currentUser().project_id`(= `members`의 **첫 멤버십 행**)로 필터해, 어떤 행사를 골라도 늘
    `prj-stc26`의 랜딩이 떴다. `createLandingPage()`도 같은 값을 써서 **종료 행사에서 생성이 409가
    아니라 성공**했다(`assertWritable`이 엉뚱한 행사를 검사).
    · `listLandingPages(projectId)` · `createLandingPage(projectId, input)`로 시그니처 정정
      → **DataProvider v6.1 재동결**(메서드 수 75 불변). 나머지 6메서드는 `landingId`로 대상을 찾고
      가드를 `landing.project_id`로 판정하고 있어 **시그니처 불변**(§4-21 R-L2 — 코드 확인 완료)
    · MockProvider: 필터·`assertWritable`·`assertSlugFree`·저장 `project_id`·활동 로그 전부 인자 기준.
      `currentUser()`는 **행위자 신원(로그)에만** 남김
    · `LandingBoardPage`가 `useProject()`의 `projectId`를 넘긴다(`useAsync` 의존 배열 유지 — 전환 시 재조회).
      `LandingEditorPage`는 list/create를 호출하지 않아 무변경
    · 픽스처: 랜딩을 **행사별로 덧붙이는** 구조로 바꿔(`appendLanding`) ⑤ RE:BUILD 26 발행 완료 1건 ·
      ⑥ RE:BUILD 27 초안 1건 시드. 둘 다 slug `rebuild` — `(project_id, slug)` 복합 유일이라 정상(R-L4)
    · **`user.project_id` 전수 확인 결과: 스코프 용도 사용처는 랜딩 5줄이 전부였고, 그 외 0건.**
      다른 곳은 전부 명시 `projectId` 인자이거나 엔티티 필드(`landing.project_id`·`quote.project_id` 등)
    · DoD-27 신규 4케이스(지시 3 + 멤버십 대조 1) — 행사 전환 시 목록 교체 / 종료 행사 생성 409 /
      같은 slug 타 행사 허용 / 생성된 랜딩이 인자 행사에 붙고 `user.project_id`와 다름
  - **H2 DoD grep 확대(재발 방지)** — `src/test/dod-project-scope-guard.test.ts` 신설(3케이스).
    프로덕션 소스(`pages·components·providers·context·hooks·lib·modules·fixtures`)를 훑어
    ① `*.tsx`의 `PROJECT_ID` ② 어디서든 `user.project_id`·`currentUser().project_id` 를 잡는다.
    · 예외는 **화이트리스트 등록 + 해당 줄의 `scope-exempt:` 주석** 둘 다 있어야 통과 — 무설명 예외 금지.
      현재 예외 **0건**
    · glob 오타로 0건 통과하는 것을 막는 "스캔 대상 30개 이상" 가드 동반
    · **가드가 실제로 잡는지 역검증**: 결함을 되돌려 넣으면 위반 줄을 정확히 지목하며 실패함을 확인
    · CLAUDE.md §7에 **상시 grep 가드 표 5종** + DoD 28 추가
  - **H3 dod10 flake 제거(테스트 전용, 제품 코드 무수정)** — 원인은 브리프 진단 그대로:
    `OnboardingPage`가 자기 `useAsync`로 헤딩을 먼저 그리는데 폼(`ProjectOverviewForm`)이 **별도
    `useAsync(getProject)`**를 돌려 그 사이 자리표시자를 렌더한다. 헤딩만 `await`하고 폼 요소를
    동기 `getBy`로 잡으면 깨진다.
    · 같은 패턴을 전수 훑어 **dod10 3곳 · dod20 3곳 · dod9 1곳**을 `findBy`로 교체.
      실제로 이번 전체 실행에서 **dod20 (b)가 같은 이유로 실패**하던 것을 함께 잡았다
    · 검증: `npm test` **연속 3회 전부 376/376 통과**(35파일)
  - **H4 골든 데이터셋 출처 정직화(Major)** — **사실 확인 결과 = (a)**.
    jsx-easy-shift `5dafc52`(#45)에서 `scripts/exportPricingDataset.mjs`를 돌린 산출물과 레포의
    `pricing-dataset.json`이 **`generated_at`·`source.commit` 두 줄 빼고 완전히 동일**했다 —
    즉 수치는 생성기 산출물이 맞고 **등가 검증이 자기 자신과의 비교가 아니었다**. 메타데이터만
    #45 **이전** 커밋(`6047834`)으로 찍혀 있었던 것이고, 생성기가 실행 시점의
    `git rev-parse --short HEAD`를 stamp하므로 **#45 커밋 전에 생성기를 돌린 결과**로 설명된다
    · 조치: 수기 편집 없이 **생성기 산출물로 파일을 통째 교체** → `source.commit = 5dafc52`,
      `generated_at = 2026-08-23`. 나머지 바이트는 종전과 동일
    · **데이터셋 출처 = `5dafc52` · 21+1 벡터 + 47행 그리드 0원 일치**(재확인 완료, 단가·수식 무변경)
  - **H5 jsx-easy-shift 엔진 동결(문서 3건, 기능 코드 0줄)** — 브랜치
    `claude/phase-3-13-1-hotfix-y5hwpx`, base=main `5dafc52`
    · `CLAUDE.md` 최상단 **⛔ 가격 엔진 동결(2026-08-23)** 선언 — `calcEstimate.js`·`kpiRules.ts`·
      `venuedb.js`·`exportEstimate.js`는 이 레포에서 수정하지 않고, 단가·수식은 communicator의
      `src/modules/quote`에서만. 생성기는 골든 데이터셋 재생성용으로 남김. Phase 4.6 아카이브 예정
    · `CLAUDE.md` MiceConfigurator 규칙 정리 — `/quote` 단일화(#45)와 충돌하던 "분해 전 Playwright
      snapshot 50건" 절을 **"구버전 화면은 이식 대상 아님(설계서 v2.1 §17.2)"**으로 대체.
      자동 머지 예외 항목·테스트 명령 주석·로드맵 체크박스의 잔재도 함께 정리(엔진 등가 기준은 유지)
    · PRD `pricing_rules` 키 `system_scaler4k_auto` → **`system_led_operating_auto`**(표시명 동반,
      금액 2,500,000 불변). 엔진 `normalizeOptions()` 호환 경로는 지시대로 그대로 둠

- **Phase 3.13.3 — 보드 항목 프리셋 (2026-08-23, 사용자 지적)**: 운영 보드에 제작물(디자인) 어휘가
  떠 있던 문제. 두 보드가 **같은 폼**을 써서 ① 카테고리가 자유 텍스트 + 디자인 예시("예: 배너"·
  "예: 현수막")뿐이었고 ② 스펙 4필드 라벨이 제작물 전용(규격·수량·위치·종류)이라 운영 항목에
  말이 맞지 않았다
  - `src/lib/boardPresets.ts` 신설(정본) — **스키마 무변경**. `spec_size|qty|location|type` 4열은
    그대로 두고 **영역별로 라벨·프리셋만 갈아 끼운다**. 컬럼 의미는 영역 안에서만 해석:
    design `규격·수량·위치·종류` / ops `규격·규모·수량·장소·구역·운영 구분` / common `분량·부수·보관 위치·문서 종류`
    (ops의 size는 1차에 '규모'였으나 실제 문서에 LED 12×3m 같은 **규격**이 그대로 나와 '규격·규모'로 정정)
  - 카테고리 프리셋 — 근거는 **실제 운영계획서·결과보고서(rebuildFixtures 이식본) + 설계서 §15 WBS**.
    1차로 9종을 넣었으나 **사용자 지적("스크린플레이·무대배치·포디움 위치 등 운영계획서 내용이 다 놓쳐져
    있다")으로 17종으로 확장**: 사전 준비(현장답사·운영안·존운영·협찬사 운영) / 현장 조성(**무대·시스템**·
    **스크린플레이**·**전기·네트워크**·사이니지·외부 조성·물류·셋팅) / 진행 운영(큐시트·시나리오·
    **참가자 동선·등록**·**케이터링·F&B**·**부대 이벤트**·리허설·안내문) / 사후(결과보고).
    드롭다운은 단계별 `<optgroup>`으로 묶는다. design 7종·common 2종은 종전대로
  - **초안이 일반론이 아니라 체크리스트다** — 예: 무대·시스템은 LED 규격·해상도 / 이동식 무대 규격·높이 /
    빔프로젝터 미디어월 / 조명타워·핀조명 / **포디움 수량과 위치** / **콘솔 위치(무대 기준 좌·우)** /
    프롬프터·타이머 인치 / 마이크 유선·무선·핀 수량 / 중계 카메라 대수를 열거한다.
    스크린플레이는 **큐시트의 각 큐와 1:1 대응**을 명시하고 큐별 송출 소스를 나열한다.
    실명·행사명·베뉴명·협찬사명은 담지 않는다(#RULE-NO-COMPANY — 예외는 rebuildFixtures.ts 한정)
  - **내용 프리셋** — 카테고리를 고르면 그 항목의 가이드 초안이 '가이드 내용'에 채워진다.
    사용자가 이미 쓴 내용은 덮지 않는다(비었거나 직전 템플릿 그대로일 때만 교체)
  - 자유 입력은 막지 않는다 — '직접 입력…'으로 프리셋 밖 항목 생성 가능(dod7이 이 경로를 함께 검증)
  - `BriefCard`(S3)도 `deliverable.area` 기준으로 스펙 라벨을 고른다. S9 ④제작물 리스트는
    원래 design 스코프(`designItems`)라 무변경
  - 테스트 `src/test/board-presets.test.tsx` 11건 — 운영 프리셋에 제작물 카테고리 부재·영역별 라벨 상이·
    화면 실측(운영 보드에 '규격/수량' 없음, 디자인 보드 대조군)·템플릿 채움/덮어쓰기 방지/자유 입력.
    **vitest 391개**(380 + 11) · tsc · build 통과

- **Phase 3.13.4 — 행사별 랜딩 내용 (2026-08-23, 사용자 지적)**: "각각의 프로젝트별 랜딩페이지가
  다를텐데 이를 반영해줘야지". H1에서 행사별로 랜딩을 시드했지만 **섹션 내용은 전부 빈 기본 템플릿**
  (`defaultSections`)이라, 목록만 갈라지고 열어 보면 같은 랜딩이었다
  - `landingTemplate.ts`에 `SectionSpec` 타입과 `sectionsFromSpec()` 빌더를 분리 export —
    기본 템플릿과 행사별 랜딩이 **같은 빌더**를 쓴다. `buildLanding(opts.sections?)`로 주입
  - 행사 단계가 내용에 드러나게 시드: **⑤ RE:BUILD 26 = 확정본**(포지셔닝 카피·티켓 2종
    「일반 참가」/「참가+애프터파티 정원 150명 한정」·혜택 4·FAQ 4·협찬/푸터) /
    **⑥ RE:BUILD 27 = 작성 중**(카피 "(가안)"·티켓 「미정」·혜택 검토 중·FAQ 1·협찬사 모집 중)
  - autofill 섹션(hero·speakers·agenda·zones·venue)은 원래부터 각 행사의 세션·존·개요에서 조립된다 —
    실측 확인: RE:BUILD 26 랜딩 편집기에 **연사 12건·타임테이블 20건**, RE:BUILD 27은 가안 4세션
  - DoD-27 신규 3케이스: 행사마다 lead 카피가 전부 다름(중복 0)·단계가 티켓/FAQ 수에 드러남·
    autofill agenda 항목 수가 각 행사 세션 수와 일치. **vitest 394개**

### 역검증 결과 (Phase 3.14 — 가드가 실제로 발화하는가)
가드는 "통과했다"만으로는 증명되지 않는다. 결함을 되돌려 넣어 **정확히 그 지점을 지목하며 실패**하는지
확인했고, 확인 후 전부 원복했다(원복 후 전 테스트 재통과).

| # | 되돌려 넣은 결함 | 발화한 가드 | 실패 건수 | 지목 내용 |
|---|---|---|---|---|
| A | `src/lib/landingExport.ts`에 `actual_amount` 식별자 주입 | `dod23-non-exposure` 소스 grep | 1 | `../lib/landingExport.ts에 금액·정산 식별자 노출` — 파일명을 그대로 지목 |
| B | `quoteBucketSpec`의 `s5`를 `has_cost: true`로 되돌림 | `dod29` ③ 원가 차단 | 1 | `has_cost=false 버킷에 발주·실비를 넣으면 422` |
| C | 마진 식을 `quote − ordered`로 변형 | `dod29` ② 항등식 + `settlement-math` 실물 검산 | 2 + 2 | 실물 검산 2건이 파일의 마진(27,943,409 · 9,415,136)과 어긋남 |
| D | 부가세 분리 제거(포함가를 그대로 저장) | `dod30` ① + `settlement-math` (d) | 3 + 2 | `round(v/1.1)` 미적용 |
| E | `getPlan` 조립 데이터에 `settlement` 키를 실어 보냄 | `dod30` ② 비노출 | 1 | `expected [ 'settlement' ] to deeply equal []` |
| F | (3.14.1) `updateSettlementBucket`의 원가 끄기 차단 제거 | `dod29` ⑥ | 2 | 아래 수치 참조 |
| G | (3.14.2) `assertCostAllowed`의 병합 판정 무력화 | `dod29` ⑦ | 1 | 마진 +21,000,000 부풀림 재현 |
| H | (3.14.2) 기준 갱신의 원가 되돌림 차단 제거 | `dod29` ⑧ | 1 | 마진 +9,000,000 부풀림 재현 |

C를 돌리다 **실물 검산 픽스처의 구멍**을 찾았다 — `ordered_amount`와 `actual_amount`가 같은 값이라
`quote − ordered`로 바꿔도 두 검산이 통과했다. 두 값을 다르게 두도록 픽스처를 고쳐, 이제 C는
DoD-29뿐 아니라 **실물 검산 2건에서 바로** 잡힌다(위 표의 "2 + 2"가 그 결과다).

#### F1 역검증 수치 (3.14.1) — 항등식이 왜 못 잡는가
데모 픽스처의 `s2`(시스템 구축, 실집행 35,000,000)를 가드 없이 `has_cost:false`로 뒤집은 실측:

| | 전 | 후 | 차이 |
|---|---:|---:|---:|
| `finalMargin` | 40,670,000 | **75,670,000** | **+35,000,000** |
| `totalActual` | 66,200,000 | 31,200,000 | −35,000,000 |
| `identityOk` | true | **true (경고 없음)** | — |
| 그 버킷에 금액이 남은 항목 | — | **4건** | — |

두 값이 **같은 크기로 함께 움직여 상쇄**되므로 `marginBase − totalActual === finalMargin`은
이 조작에 구조적으로 눈이 멀어 있다. 그래서 마진 식은 손대지 않고 **입력 경로에서 409로 막았다**.
가드를 되돌려 넣자 위 수치가 그대로 재현됐고, DoD-29 ⑥ 2건이 실패했다.

#### F4·F5 역검증 수치 (3.14.2) — 같은 실패 모드의 남은 문 둘
가드를 각각 무력화하고 격리 측정했다(테스트 파일 단위로 provider 상태가 갈리므로 따로 돌렸다).

| | 조작 | `finalMargin` 전 → 후 | 부풀림 | `identityOk` | 남은 흔적 |
|---|---|---|---:|---|---|
| **F4** | 실비 21,000,000짜리 항목을 `s1` → `s5`로 이동 | 40,670,000 → 61,670,000 | **+21,000,000** | true (경고 없음) | 도착 버킷 집계 실비 0, 항목에는 21,000,000 그대로 |
| **F5** | `s5` 원가를 켜고 9,000,000 입력 후 기준 갱신 | 31,670,000 → 40,670,000 | **+9,000,000** | true (경고 없음) | `has_cost`가 false로 되돌아감, 금액 남은 항목 1건 |

가드를 되돌려 넣자 두 수치가 그대로 재현됐고 DoD-29 ⑦·⑧이 각각 실패했다.

#### 전수 훑기 결과 — "금액이 든 항목이 집계에서 빠지는 상태 전이"
지시받은 3개를 포함해 정산 쓰기 경로를 전부 훑었다. **막지 않은 경로는 남아 있지 않다.**

| 경로 | 판정 | 조치 |
|---|---|---|
| `updateSettlementBucket({has_cost:false})` | 부풀림 | 409 (3.14.1 F1) |
| `updateSettlementItem({bucket_id})` | 부풀림 | 422 (3.14.2 F4 — 병합 결과로 판정) |
| `rebaseSettlementBoard` — 스냅숏이 `has_cost`를 되돌림 | **부풀림 (자체 발견)** | 409 (3.14.2 F5) |
| `createSettlementBucket(has_cost:false)` + 항목 이동 | 이동이 F4 가드에 걸림 | 추가 조치 불필요 |
| `createSettlementItem`에 금액 | 이미 422 (R-S4) | — |
| `deleteSettlementBucket` | 항목 있으면 409 (기존) | — |
| `deleteSettlementItem` | 항목과 금액이 함께 사라짐 — 조용한 누락 아님 | — |
| `updateSettlementItem({status:'cancelled'})` | **정상 동작**(집계 제외가 의도) | 막지 않음 |
| `is_margin_base` 뒤집기 | 항등식이 정상적으로 false로 잡음 | 막지 않음 |

`rebase`는 `quote` 버킷의 `quote_amount`·`has_cost`·`is_margin_base`를 code 매칭으로 되돌리는데,
`has_cost`만 이 실패 모드를 만든다 — `quote_amount`·`is_margin_base` 변경은 항등식이 잡거나
마진 기준을 정직하게 옮길 뿐이다.

### 의도적으로 두고 온 것 (Phase 3.14)
- **`importVendorQuote`(협력사 견적서 업로드 파싱)** — 설계서 §19.5대로 v8 예약. 스키마
  (`SettlementImport`)와 버튼만 두고, 버튼은 비활성 + "Phase 4.7에서 열립니다"를 그대로 노출한다
  (§10 진입점 원칙 — 게이트 뒤에 숨기지 않는다)
- **소스 grep의 `margin` 제외** — 근거는 §5 결정 로그. 랜딩 산출물은 HTML 문자열 검사로 대신 덮었다
- **`settlement_imports` 테이블/픽스처 시드 없음** — 파싱이 없으므로 넣을 행이 없다. 타입만 둔다
- **F3(레포 기본 브랜치 → main)** — 이 세션에 노출된 도구에 레포 설정 변경 수단이 없다(§3 미결 참조)

## 3. 미결
- **(열린 질문 — Phase 3.15a ①) 주최형 HT 템플릿의 phase_no·phase_name 매핑은 가정이다.**
  HT-1~12 코드는 기존 `code.split('.')[0]` 단계 유도에 맞지 않아 자체 매핑을 뒀다(코드 주석에
  가정 표기 — §15.3 자체가 "1개 행사 기반 일반화, 2번째 주최형 행사에서 검증 후 확정"이라 명시).
  확정 시 wbsTemplates.ts의 해당 매핑만 갱신하면 된다.
- ~~(열린 질문 — Phase 3.15a ②) `removePartner` 하드 삭제 409+철회 유도 정책~~ → **종결**
  (3.15.1 지시문 명시: "removePartner 정책(이력 시 409+철회 유도)은 사용자 승인됨" 2026-08-28)
- **(미처리 — F3) 레포 기본 브랜치가 `main`이 아니다.** "스스로 진행" 지시를 받았으나, 이 세션에
  노출된 GitHub MCP 도구에는 **레포 설정(기본 브랜치) 변경 API가 없다** — 브랜치·PR·파일 조작
  도구만 있다. 추측으로 처리하지 않고 남긴다. 사용자가 GitHub 웹에서
  Settings → General → Default branch에서 바꾸는 것이 유일한 경로다.
- **(미결) PR #24(정산 설계 결정 사항, 문서 전용)가 아직 머지되지 않았다.**
- ~~(열린 질문 — Phase 3.13.1 ①) `전체 녹화·편집` 영문 라벨의 단가가 틀렸다~~ → **종결**
  (사용자 지시 2026-08-23, Phase 3.13.2에서 수정): `KRW 3,500,000` → **`KRW 1,000,000`**,
  영문 detail도 국문과 같은 내용(스케치 영상과 별개 · 중계 선행 필수)으로 맞췄다.
  엔진·데이터셋 무관(표시 라벨 상수만) — 골든 벡터 재실행으로 0원 일치 유지 확인.
  재발 방지로 `src/test/quote-option-catalog.test.ts` 신설(4케이스) — ①항목별 국문↔영문 표시 단가
  일치 ②엔진 상수를 갖는 5항목은 상수와도 일치. **13항목 전수 대조 결과 어긋난 건 이 1건뿐이었다**
- **(관찰 — Phase 3.13.1 ②) 랜딩 유입 지표가 행사마다 똑같이 보인다.**
  `buildLandingMetrics(today)`가 기준일만으로 결정론적 수열을 만들어, ⑤·⑥·① 어느 행사를 열어도
  30일 수치가 동일하다(7,012 / 5,046 / 1,119 / 424). 브리프가 "지표는 기존 방식대로 mock"이라
  지시해 **현행 유지**했다. Phase 4에서 GA Data API 실연동으로 교체되면 자연 해소되지만,
  그 전까지 데모에서 어색하면 랜딩 id를 시드에 섞는 1줄 수정으로 갈라놓을 수 있다.
- **(관찰 — Phase 3.13.1 ③) jsx-easy-shift PRD의 옵션 키 `scaler4k` 표기 잔존.**
  H5-3은 `pricing_rules` 키(`system_scaler4k_auto`)만 정정 대상이었고, PRD 836·971·1250줄의
  **옵션 키** `scaler4k`는 엔진 `normalizeOptions()` 호환 경로와 짝이라 브리프 지시대로 두었다.
  §17.4의 정본 옵션 키는 `ledOperating`이므로, 문서 정합을 더 맞추려면 별건으로 처리한다.
- **(백로그 — v2.1) 견적 엔진 `TARGET_MAX`(500명)가 리멤버 실제 행사 규모를 못 담는다.**
  RE:BUILD 26 현장 참석이 703명인데 자동 견적 상한이 500명이라, 실제 규모의 행사는 전부
  '별도 협의 모드'(`isCustom` — 전 섹션 0원)로 떨어진다. **v2.1에서 상한 확장 검토** —
  단가표 근거(대관·시스템·운영 구간별 체증 산식이 500명 초과에서도 유효한가)가 필요하고,
  §9에 따라 골든 벡터 갱신 + 설계서 개정 + 사용자 승인을 동반해야 한다.
  현 픽스처는 상한 안(480·400명)으로 잡고 초과분을 `notes`에 별도 협의로 남겨 둔 상태
- ~~(열린 질문 — Phase 3.12 ①) RE:BUILD 27 견적 2건이 0원~~ → **종결** (사용자 확정 2026-08-22):
  견적 인원을 **480·400명**으로 낮춰 엔진 상한 안에서 실제 금액을 산출한다(ⓐ안 채택).
  엔진 상한 확장(ⓑ안)은 위 v2.1 백로그로 이관
- ~~(열린 질문 — Phase 3.12 ②) 참관객 레코드 703건 생성~~ → **종결** (사용자 확정 2026-08-22):
  **현행 유지** — 합성 레코드 703건으로 집계를 재현한다. 별도 지시 없음
- ~~(열린 질문 — Phase 3.12 ③) WBS 1단계 시드~~ → **종결** (사용자 확정 2026-08-22):
  행사일을 **2026-09-10**으로 옮겨 지연이 2.2·2.3으로 떨어지게 하고, 시드를 코드로 고정한다.
  상대 보정 규칙("마감 지난 것 중 최근 2건만 미완료")은 제거됨
- ~~(관찰) 종료 행사 S2 보드의 생성·지시 폼~~ → **종결** (사용자 승인 2026-08-22):
  데이터 전용 원칙의 예외로 승인받아 **이번 커밋에서 숨김 처리** — 종료 행사에 폼이 보이면
  데모에서 오해를 부른다는 사유. provider 409는 유지
- GitHub 기본 브랜치가 아직 `claude/extract-zip-to-repo-t6xstr` — Settings → Branches에서 `main`으로
  변경 필요 (세션 브리프 부록에 사용자 직접 수행 절차 안내됨). 머지된 `claude/*` 브랜치 삭제도
  사용자 직접 수행(git proxy가 ref 삭제 푸시 차단)
- (경미) `@types/node` 미도입 — dod9가 print CSS 파일 검증에 국소 우회(dynamic import 캐스팅) 사용 중.
  Node API 쓰는 테스트가 늘면 devDependency 추가 검토
- (경미) 큐시트 발송 시 RequestApprovalInput.version_id에 'auto' 센티널 전달(동결 인터페이스 관례) —
  다음 동결 해제 기회에 version_id 옵셔널화 검토. v1.4.1 ⑤는 스냅숏 파일 규약을 정본화한 것이고
  이 항목은 인터페이스 형상 문제라 별개로 유지
- (경미·데모 한정) 아티팩트 뷰어는 페이지가 시작하는 파일 저장(blob 링크·file-saver)을 허용하지 않아
  데모에서 **'Excel 내려받기' 버튼만 무동작**이다(실제 배포·로컬에서는 정상). 데모에서 견적서 파일을
  보여야 하면 Artifact `downloads` 능력 선언이 필요 — 현 단계 미적용
- **(백로그 — v2.1, 지금 수정 금지)** 확정 견적 편집 진입 시 안내 문구 1줄 추가 — "저장하면 새
  버전(vN)으로 저장됩니다"를 ④ 확인·확정 상단(현 `lockedBanner` 인근)에 명시. 현재도 버튼 라벨이
  '새 버전으로 저장'으로 바뀌고 잠금 배너가 뜨지만, 저장 결과가 새 버전 번호라는 점을 문구로 못박는
  것이 목적(사용자 지시 2026-08-22 — **이번 세션 수정 금지**, 다음 UI 작업 때 반영)
- **(백로그 — v2.0, 지금 수정 금지)** 3.10.1 R3 잔여: 발주처 연락처 표가 **반폭 카드**에서는 액션 열이
  가로 스크롤 뒤에 숨음(전폭에선 정상) — v2.0에서 행사 설정 ② 담당자 탭을 상하 1단 배치로 전환해
  해소 예정(사용자 결정 2026-08-22, 현 단계 수정 금지)
- ~~(열린 질문 — v2.0 ①) DataProvider v5 메서드 수~~ → **종결** (사용자 확정 2026-08-22, PR #14 검수):
  **현재 구현대로 v5 = 9메서드(67메서드)** 확정 — `updateComplianceCard` 포함. 설계서 §2.1의 "8메서드"
  문구 정정은 **챗이 v2.0.1에서 수행해 Phase 4 첨부 시 전달**하므로 레포 문서는 지금 수정하지 않는다
- ~~(열린 질문 — v2.0 ②) 견적서 Excel 로고 판~~ → **종결** (사용자 확정 2026-08-22, PR #14 검수):
  **`remember-logo-offwhite.png` 현행 유지** — 블랙 헤더 밴드 위 가시성·원본 시각 등가 근거 채택
- ~~리멤버 로고 실 자산 미수령~~ → **종결** (2026-08-22 ZIP 수령, png 2종 배치)
- ~~온보딩 완료 플래그 스키마 확정 필요~~ → **종결** (설계서 v1.4.1 §4-1 projects.onboarded_at,
  사용자 승인 — Phase 3.8a 반영)
- ~~일반형 28건 산식·임박 배타 산식·재전개 보존·큐시트 스냅숏 mock 규약 해석~~ → **종결**
  (설계서 v1.4.1 §4-15·§8·§15 정본화 — 열린 질문 ①~⑤ 전부 종결)

## 4. 다음 스텝
- **(v2.5 현재) ① PR #26(Phase 3.15.1 폴리시 P1~P9) 챗 검수 → 머지(사용자)** — 체크아웃
  보고·스크린샷 8장 첨부됨. 머지·검수 통과 후 **② Phase 3.16(운영보드 재구성) 착수**
  (AE 타입·v9 재동결 110메서드 → AF·AG·AH 병렬, 문서는 이미 v2.5 채택 상태라 교체 불요)
- ~~① PR #25 챗 검수 → 머지~~ → **종결** (사용자 지시 "머지하고 테스트할 수 있게" 2026-08-27 —
  merge commit `22e247f`, 머지본 재검증 통과. 검수에서 되돌릴 것이 나오면 main 위 후속 커밋으로)
- ~~② 데모 아티팩트 재발행~~ → **종결** (같은 세션에서 재시도 성공 — 기존 URL 유지, Phase 3.15
  머지본 기준. 사용자 실기 테스트 대기)
- ③ 서버 스프린트(Phase 4 Supabase → 5 Drive → 6 알림)는 **사용자 지시 대기**(CLAUDE.md v2.4 §4) —
  착수 시 dev 3키를 대화로 요청
- (아래 v2.2 시점 기록은 이력 보존)
- **[대기] 설계서 v2.2 §정산보드 절 수령** — 챗이 아래를 정본화하면 그걸 근거로 **DataProvider v7
  재동결** 후 Phase 3.14 착수. 필요한 내용은 다음과 같다(사용자 확정 4건 반영):
  - **엔티티 `purchase_orders`** — `project_id` · `bucket`(s1~s5·options·recruit·attendee) ·
    `title` · `vendor` · `owner_id` · `ordered_amount`(발주, nullable) · `actual_amount`(실비, nullable) ·
    `status`(planned→ordered→settled) · `ordered_at` · `settled_at` · `note` · 감사 필드
  - **정산 기준 견적 스냅숏** — 계약본이 기준이므로 `quote_id` 참조만으로는 부족하다.
    견적이 새 버전으로 바뀌어도 **기준은 불러온 시점 그대로 고정**되어야 하고, 다시 부르는 건
    명시적 동작이어야 한다. 스냅숏 보관 위치와 재불러오기 규약을 정해 달라
  - **VAT 기준 통일** — 견적 `total_amount`는 VAT 별도다. 발주·실비도 VAT 별도로 받을지,
    포함으로 받고 환산할지 정해야 ± 가 성립한다. **이 결정이 빠지면 숫자가 안 맞는다**
  - **권한** — 조회=전 멤버 / 발주목록 설정(생성·삭제·버킷 배정)=pm / 발주·실비 기입=담당자 본인 또는 pm /
    종료 행사 쓰기 409
  - **집계 규칙** — 버킷별 예산·발주합·실비합·잔여·집행률, 전체 ±. 미배정 발주와 예산 없는 버킷의 처리
  - **API 5종 + DataProvider v7**(80메서드 예상): `getSettlement(projectId)` ·
    `setSettlementBaseline(projectId, quoteId)` · `createPurchaseOrder` · `updatePurchaseOrder` ·
    `deletePurchaseOrder`
  - **§10 화면 명세** — S-4 정산보드, 사이드바 위치(운영 그룹). 견적 메뉴처럼 app_role 게이트는
    두지 않는다(전 멤버 공개 결정)
  - **DoD 29~31** — ①확정 견적 불러오기 시 8버킷 예산 스냅숏·견적 새 버전에도 기준 불변
    ②3단 집계와 버킷별 ± 정확·권한 4종 ③**비노출**: 발주·실비 키가 `/c/*` 응답·운영계획서 조립
    데이터·activity_log·랜딩 어디에도 없음(DoD 23과 같은 방식의 런타임+소스 grep 가드)
- **Phase 4 — 새 Supabase 프로젝트 이식** (★착수 전 사용자 승인 + 새 프로젝트 3키)
- **Phase 3.13.1 PR 챗 실측 검수 → 머지** (오토머지 동선 예외 — 동결 해제·설계서 개정 동반 건).
  머지 후 데모 아티팩트 재발행
- 위 열린 질문 ①(영문 라벨 단가) 확인 → 별건 처리 여부 결정
- **Phase 3.12 PR #16 챗 검수 → 머지** (보정 3건 반영 완료 · 열린 질문 전부 종결) → 머지 후 데모 아티팩트 재발행
- ~~Phase 3.11 PR 챗 검수 → 머지~~ → **완료** (2026-08-22, PR #14 → main `78c8aa9`)
- **Phase 4 — 새 Supabase 프로젝트 이식** (★착수 전 사용자 승인 + **새 프로젝트 3키**(URL·anon·
  service role — env·Vault만, 문서 기재 금지) 수령, **v2.0 스키마 기준**): 4a 마이그레이션+RLS(§6.2 —
  quotes·profiles·compliance_cards 포함)+seed(픽스처 4행사+견적) → 4b SupabaseProvider v5(67메서드,
  견적 저장 서버 재계산) → 4c 이메일 매직링크 로그인·AuthContext·app_role 게이트 → 4d DoD 26 검증.
  권장 모델: Fable 5 엑스트라(CLAUDE.md §5).
  **착수 시 첨부 예정: 설계서 v2.0.1**(§2.1 DataProvider v5 열거를 9메서드로 정정한 판 — 챗이 발행).
  레포의 v2.0 문서는 그때 교체하며, 그 전까지는 §2.1 문구와 코드(9메서드) 차이를 본 미결 종결
  기록으로 갈음한다
- **Phase 4.6 — 인프라 전환** (설계서 §18, ■ 게이트마다 사용자 확인): 새 Vercel·env → 옛 Configurator
  DB 1회 임포트(선택·dry-run) → 도메인 rmb-mice.com 이전 → 옛 라우트 301 → jsx-easy-shift 아카이브
- 이후 Phase 5(Drive) → Phase 6(알림·cron)

## 5. 결정 로그
- 2026-08-28 (Phase 3.15.1): **DataProvider v8.1 재동결 — 동결 해제 근거 = 사용자 3.15.1 승인
  (지시문 P2, 2026-08-28) + 설계서 v2.4.1 §21.1(v2.5 승계).** partner_guide_url·
  partner_contact_email 필드 추가만, 메서드 수 102 불변(v3.1 전례). 주최형 R&R·규약 카드
  **백필은 새 메서드가 아니라 expandHostWbs의 멱등 시드로** — S5 "템플릿 재전개" 버튼이 백필
  진입점이 되고 동결(102)이 유지된다(근거 주석은 expandHostWbs 백필 가드에).
- 2026-08-28 (Phase 3.15.1 P7): **큐시트 카테고리 생성 직후 = 인라인 패널 채택**(1순위안) —
  CuesheetEditor가 deliverableId만 받는 독립 컴포넌트라 보드 안에서 그대로 재사용 가능했다.
  카드 하단에 "상세 화면으로 이동" 링크 동반. 권한은 상세 화면과 동일 규칙(pm·ops 편집).
- 2026-08-28 (Phase 3.15.1): **S5 "제출 n/5"와 파트너 보드 "이번 마감 제출" KPI는 정의가 다르다
  (의도적)** — S5는 pending_approval·approved·final만 제출로 세고(수정요청은 파트너 액션이 남아
  미제출), 보드 KPI는 requested 아닌 것 전부를 센다. 데모 HT-1 기준 S5 3/5 vs 보드 4/5 — 각자
  정의로 둘 다 정답. 통일이 필요하면 다음 개정에서(테스트 파일 헤더에 문서화).
- 2026-08-28 (Phase 3.15.1 P6-③): 포털 접힘 요약은 1건 그룹에도 렌더하되 **'제출:' 접두**로
  펼친 카드 제목과의 정확 일치 중복을 피한다(정확 일치 쿼리 회귀 방지 — 데모 그룹이 전부
  1건이라 요약을 생략하면 지시 취지가 사라지는 문제를 통합 검수에서 정정).
- 2026-08-28 (Phase 3.15.1 P9): 등록 xlsx 테스트용 생성 헬퍼는 exceljs 규칙(§2 — quote 모듈 밖
  import 금지) 준수를 위해 `src/modules/quote/import/__tests__/fixtures/`에 배치 — 등록 테스트는
  ArrayBuffer 결과만 소비한다. 판별은 확장자·MIME, 파이프라인은 CSV와 동일(등가 테스트로 증명).
- 2026-08-28 (Phase 3.15.1): 데모 정적 검사의 외부 호스트 화이트리스트는 **정확 일치**라
  픽스처 가이드 URL을 `guide.example.com`(미등재 서브도메인)에서 등재된 더미 호스트
  `example.com` 경로로 변경 — 화이트리스트를 넓히는 대신 픽스처를 규약에 맞췄다.
  InfoTip의 중앙 정렬도 Tailwind translate 유틸 대신 인라인 transform — 클래스 문자열이
  디자인 토큰 grep(DoD 17)의 금지 팔레트명을 부분 문자열로 포함해 오탐되기 때문.
- 2026-08-27 (Phase 3.15 통합): **§5.1 version_upload 분기는 내부 업로드 경로에도 적용된다.**
  3.15a는 파트너 토큰 경로(submitPartnerItem)에만 분기를 뒀는데, 내부 멤버가 S3에서 같은
  항목에 업로드하면 inbound 항목이 draft로 떨어져 §5.1이 쓰지 않는 상태에 좌초했다. 통합에서
  uploadVersion을 보강 — inbound(partner_id 보유) 수정요청 항목의 내부 업로드(파트너 파일 대리
  등록)는 pending_approval로 복귀, 제출 전(requested) 항목의 내부 업로드는 409(전이표에 그 갈래가
  없다 — 대리 첫 제출이 필요해지면 v2.5에서 규칙으로 추가). dod33이 세 갈래 전부 잠근다
- 2026-08-27 (Phase 3.15d): **임포트 파서는 자체 동기 xlsx 리더로 구현** — MockProvider가 파서를
  동기 호출하는 동결 계약을 지키기 위해 exceljs(비동기 load)를 읽기에 쓰지 않고 raw-DEFLATE·
  ZIP·SpreadsheetML 최소 리더를 modules/quote/import 안에 내장했다(exceljs는 가상 픽스처 **생성**
  전용으로만 사용 — 허용 의존 규칙 내). Phase 4 서버 파싱이 비동기가 되면 exceljs 리더로 교체
  가능(파일 상단 주석). 실파일 3종·가상 3종 전부 검산 통과로 등가 입증
- 2026-08-27 (Phase 3.15 검증): **금액 가드 역검증** — `contract_amount` 참조를
  `components/partner/PartnerDetailPanel.tsx`에 고의 주입하자 dod23 소스 가드가 해당 파일을
  지목하며 실패했고(셸 grep도 18건으로 증가), 제거 후 복귀를 확인했다. 셸 grep의 잔존 17건은
  전부 `lib/landingExport.ts` 인라인 CSS의 `margin:` 선언 — Phase 3.14에서 정본화한 알려진
  허위 양성(식별자 검사 marginBase·finalMargin + 런타임 HTML 검사로 대체 커버, §5 기존 결정)
- 2026-08-27 (Phase 3.15 실파일 검산): **카페24는 v4.1 대신 v5가 첨부**됐으나 검산 기대값
  (8섹션·항목합 273,795,000·대행료 25%=68,440,000 만원절사·절사 −416,818·총 376,000,000 VAT
  포함)이 v5에서 그대로 성립 — 브리프 기대값 기준 검증 완료로 본다. TAAS GBR v12 = 최종
  341,400,000(VAT 별도)·PLZ v10 = 264,610,000(VAT 별도) 전부 파서 실측 일치. 브리프의 "B형
  4섹션"은 실물 기준 **8개 제목 블록**(0원 섹션·5-1·기획료·모객 포함)으로 실측 정정. 실파일은
  scratchpad 로컬 검증만 — 레포 커밋 0(R-Q4)
- 2026-08-27 (Phase 3.15a): **DataProvider v8 재동결 — 동결 해제 근거 = 사용자 v2.4 승인
  (2026-08-27, 시각안 4화면·구조 결정 7가지), 설계서 v2.4 §21·§22 선행.** 주최형 파트너
  13메서드 + 견적서 임포트 3메서드 = 16메서드 추가, **102메서드**. 기존 86메서드 시그니처 불변.
  `importVendorQuote`(협력사 견적서 파싱)는 **v9 예약 유지 — 만들지 않았다**(§19.5).
- 2026-08-27 (Phase 3.15a — §5.1 구현 해석 3건): ① 재제출의 version_upload 목적지 분기는
  전이표에 `host_inbound:true` 행으로 명기하되, 분기 판정은 provider가
  `deliverable.partner_id != null`(kind='host' 행사의 inbound 항목에만 존재)로 수행 —
  assertTransition 단일 경유 불변. ② 검토 승인·수정요청은 신규 via `partner_review`로 표기 —
  **신규 상태쌍은 requested→pending_approval(partner_submit) 1건뿐**이고 partner_review는
  기존 상태쌍의 내부 검토 경로 라벨이다(§5.1 "새 상태머신을 만들지 않는다"의 해석). ③ 파트너
  텍스트 제출도 파일 제출과 동일하게 versions 이력으로 남긴다(제출 근거 보존·경로 단일화).
  검토 코멘트는 shared 강제(파트너가 봐야 한다), 코멘트 없는 수정요청은 422.
- 2026-08-27 (Phase 3.15): **브랜치 = `claude/phase-3-15-host-import`(base=main), 드래프트
  PR #25.** 하네스 지정 브랜치는 main이나 브리프가 "Phase 3.15 = PR 1개"를 명시해 레포 관례
  (claude/* 브랜치 → PR)를 따랐다 — 3.11의 하네스-브리프 명명 결정과 같은 계열.
- 2026-08-27 (Phase 3.15a): **distributeQuoteImport는 단일 실행**(confirmed→distributed 1회,
  재실행 409) — 분배는 위저드 3단계에서 한 번에 선택한다. 프리필+정산 기준을 함께 원하면
  견적 확정 후 같은 호출에 두 플래그를 넘긴다. 증분 분배가 필요해지면 상태 모델 재검토.
- 2026-08-23 (Phase 3.14.2 F4): **원가 판정 대상은 patch가 아니라 patch를 적용한 뒤의 최종 상태다.**
  `bucket_id`만 바꾸는 이동은 patch에 금액이 없어 종전 검사를 그대로 통과했고, 그 순간 실집행이
  집계에서 빠지며 마진이 같은 크기로 부풀었다(+21,000,000). `assertCostAllowed`가 기존 항목과
  patch를 **병합한 값**으로 판정하게 바꿨다. 거부 코드는 항목 입력이므로 422 — 버킷 쪽(F1)의
  409와 구분한다. 취소 항목은 애초에 집계 밖이라 이동을 막지 않는다
- 2026-08-23 (Phase 3.14.2 F5, 전수 훑기에서 자체 발견): **기준 갱신도 같은 문이었다.**
  스냅숏은 code마다 `has_cost`를 고정값으로 되돌리는데, PM이 원가를 켜 두고(허용된 동작) 금액을
  넣은 버킷이 있으면 그 되돌림이 F1과 같은 부풀림을 만든다(+9,000,000). 갱신 자체를 409로 막고,
  무엇을 정리하면 되는지 버킷 이름으로 알린다. **잠그는 것이 아니라 막는 것** — 정리하면 갱신된다
- 2026-08-23 (Phase 3.14.2): 세 문의 존재를 `settlement.ts` 항등식 주석에 **번호로 못박았다**.
  이 실패 모드는 검산식으로는 영영 잡히지 않으므로, 다음 세션이 "항등식을 고쳐 잡자"로 새지
  않도록 막는 곳이 provider 입력 경로라는 사실을 식 옆에 남긴다

- 2026-08-23 (Phase 3.14.1 F1): **`has_cost`를 끄는 방향도 막는다 — 단, 마진 식은 손대지 않는다.**
  금액이 든 버킷의 원가를 끄면 실집행이 집계에서 통째로 빠지며 마진이 같은 크기로 부푸는데,
  두 값이 함께 움직여 상쇄되므로 **항등식이 구조적으로 못 잡는다**(실측 +35,000,000, `identityOk`
  는 true 유지). 고칠 곳은 검산식이 아니라 입력 경로라고 판단해 `updateSettlementBucket`에서
  409로 막았다. 켜는 방향은 그대로 허용한다 — 위험한 건 끄는 방향뿐이다
- 2026-08-23 (Phase 3.14.1 F2): 항등식 주석이 조건을 반대로 적고 있었다. 실제로 깨지는 조건은
  **`has_cost=true` + `is_margin_base=false` + 실비 입력**이고, `has_cost=false` 버킷은
  `bucketActual`이 항상 0이라 애초에 깨뜨릴 수 없다. 정정하면서 **F1이 항등식으로는 잡히지
  않는다는 사실**을 같은 자리에 못박았다 — 잘못된 주석은 다음 세션의 오수정을 부른다

- 2026-08-23 (Phase 3.14): **DataProvider v6.1 동결 해제 → v7 재동결(75 → 86메서드)** —
  근거: **사용자 승인(2026-08-23, 설계서 v2.2 + Phase 3.14 브리프) + 설계서 v2.2 §19·§4-23·§4-24**.
  §9 리추얼대로 **설계서 개정이 코드에 선행**했다(v6의 재발 방지 규칙 준수).
  기존 75메서드의 시그니처는 한 줄도 바뀌지 않았고, 추가는 정산 11메서드뿐이다.
  `importVendorQuote`(업로드 파싱)는 서버 의존이라 **v8 예약** — 이번에 만들지 않았다
- 2026-08-23 (Phase 3.14): **`recruit` → `rc`+`ld` 매핑의 정의처는 한 곳(`src/lib/settlement.ts`
  `quoteBucketSpec`)** — provider 스냅숏·픽스처 시드·화면의 기준 갱신 미리보기가 모두 같은 표를 본다.
  값은 견적 input에서 재유도하지 않고 **엔진 산출값(`rsvpPkg`·`showup`)을 그대로** 쓴다(§19.2).
  두 값의 합이 `breakdown.recruit`와 일치함을 DoD-29가 검사한다
- 2026-08-23 (Phase 3.14): **소스 grep 가드에서 `margin`은 일부러 뺐다** — 랜딩 내보내기 HTML의
  인라인 CSS에 `margin:` 선언이 정상적으로 들어 있어 식별자와 구분되지 않는다. 대신
  ① 런타임 키 검사에는 `margin`·`marginBase`·`marginRate`까지 넣고 ② 랜딩 산출물은 **만들어진 HTML
  문자열**을 식별자 정규식으로 따로 본다(dod30). 무설명 예외를 만들지 않기 위해 근거를 테스트 파일
  상단 주석과 이 로그 양쪽에 남긴다
- 2026-08-23 (Phase 3.14): **가드 역검증 5건** — 결함을 되돌려 넣어 가드가 실제로 발화함을 확인했다
  (아래 §3 미결 위 "역검증 결과" 참조). 그 과정에서 실물 검산 픽스처의 `ordered_amount`가
  `actual_amount`와 같아 `quote − ordered`로 식을 바꿔도 통과하던 구멍을 발견해, 두 값을 다르게 두도록
  픽스처를 고쳤다 — 이제 마진 식 변형이 **실물 검산 2건에서 바로 잡힌다**

- 2026-08-23 (Phase 3.14 정산보드 — 착수 전 설계 결정 4건, 사용자 확정): 발주금액을 실시간으로
  집계해 **최초 계약 견적 대비 ±**를 보는 내부 전용 보드. **구현은 설계서 절 수령 후 착수**한다
  (사용자 선택 — §4-21이 못박은 "동결 해제는 설계서가 선행한다"를 이번엔 지킨다. 랜딩보드 v6이
  이 순서를 어겨 3.13.1 핫픽스를 낳았다)
  · **① 금액 3단** = 견적 / 발주 / 실비. 발주와 실비를 나눠야 '발주는 넣었는데 정산 전'이 0으로
    잡히지 않는다(2단이면 실시간 운영비가 과소 집계된다)
  · **② 견적 연결 = breakdown 8버킷 배정** — 발주 행마다 `s1~s5·options·recruit·attendee` 중
    하나를 고른다. 견적서에 세부 라인이 없으므로 1:1 매핑은 매번 수작업이 되고, 총액 비교만으로는
    "어느 항목에서 초과했는지"가 안 나온다. 8버킷이 유일하게 **자동으로 잡히는 축**이다
  · **③ 열람 = 전 멤버 공개(내부 한정)** — 원가·마진이 팀 전원에게 보인다는 뜻이므로,
    **`/c/*` 발주처 비노출은 어느 경우든 절대 유지**한다(#RULE-NO-PRICE-TO-CLIENT 확장)
  · **④ 착수 순서 = 설계서 선행**
- 2026-08-23 (Phase 3.13.3–4 — 사용자 지적 반영): 운영 보드 프리셋을 실제 운영계획서 기준
  17종 체크리스트로 재작성(1차 9종 일반론은 껍데기였다) + 행사별 랜딩 섹션 내용 분리.
  ops 스펙 라벨은 문서 재독 후 `규격·규모`/`수량`으로 자체 정정
- 2026-08-23 (Phase 3.13.1 H1): **DataProvider v6 동결 해제 → v6.1 재동결(75메서드 불변)** —
  근거: **사용자 승인(2026-08-23) + 설계서 v2.1 §4-21**. `listLandingPages(projectId)` ·
  `createLandingPage(projectId, input)` 2메서드의 **시그니처만** 변경하고 나머지 6메서드는 불변.
  **v6은 설계서 선행 없이 코드가 먼저 나간 사례이며, v2.1이 사후 정본화했다**(§2.1 동결 이력에 기록,
  재발 방지 규칙은 §4-21 말미). 이번 해제는 §9 리추얼대로 설계서 개정이 선행했다
  · 프로젝트 스코프 규칙을 인터페이스 주석에 못박음 — "프로젝트 단위 조회·생성 메서드는 projectId를
    인자로 받는다. `currentUser()`는 행위자 신원·권한 판정 전용이며 스코프 유도에 쓰지 않는다"
  · 재발 방지는 문서만이 아니라 **테스트**로 — `dod-project-scope-guard.test.ts`가 상시 검사하고,
    결함을 되돌려 넣으면 실제로 실패함을 역검증했다
- 2026-08-23 (Phase 3.13.1 H4): **골든 데이터셋은 수기 편집하지 않고 생성기 산출물로 교체**한다 —
  근거: 설계서 v2.1 §17.3-4(원본 생성기 산출물만 인정 · `source.commit`은 실제 생성 커밋).
  사실 확인 결과 종전 파일도 생성기 산출물이었고(메타 2줄만 상이) **등가 검증은 유효했다**.
  단가·수식·벡터 값은 한 자리도 바뀌지 않았다
- 2026-08-23 (Phase 3.13.1 H5): **가격 엔진의 유일한 수정처는 communicator** — 사용자 확정.
  jsx-easy-shift는 생성기만 남기고 동결하며, 앱 은퇴·도메인 전환은 Phase 4.6 그대로
- 2026-08-22 (Phase 3.13 — v2.1 랜딩보드): **DataProvider v5 동결 해제 → v6 재동결(75메서드)** —
  근거: **사용자 v2.1 승인(2026-08-22, 범위 4문항 승인)**. listLandingPages·getLandingPage·
  createLandingPage·updateLandingPage·publishLandingPage·deleteLandingPage·listLandingMetrics·
  submitLandingLead 8메서드 추가, **기존 67메서드 시그니처 불변**. 타입 LandingPage·LandingSection·
  LandingItem·LandingFormField·LandingConsent·LandingAnalytics·LandingDailyMetric + 열거 4종 신설.
  사용자 승인 4건: ①범위=빌더+지표 동시 ②발행=단일 HTML 내보내기 ③행사 데이터 적극 연동 ④리드=등록(S4) 유입.
  · 섹션 카탈로그 13종은 실측 B2B 행사 랜딩을 뜯어 정규화한 것 — 문구는 전부 자리표시자(#RULE-NO-COMPANY 준수)
  · **autofill이 이 기능의 본령** — 세션·개요·존이 랜딩으로 흘러들어 이중 입력을 없앤다. 끄면 저장값 보존
  · GA는 형식 검증(G-/GTM- 정규식) 통과 ID만 주입 — 임의 문자열이 <script>로 새는 경로를 만들지 않는다.
    측정 ID 미설정이면 내보낸 HTML의 외부 요청은 0건
  · 지표는 mock 픽스처(결정론적 30일) — Phase 4에서 **GA Data API 실연동으로 교체**(서버 필요)
  · Attendee 스키마는 늘리지 않았다 — 유입 출처는 activity_log의 `landing.lead`(landing_id)로 남긴다
  **미결**: ①앱 내 공개 URL 서빙은 Phase 4.6 이후 ②설계서 v2.0에 §4-19~§4-22(랜딩) 절 추가 필요(코드 선행)
  ③데모 아티팩트 검사기에 googletagmanager 호스트와 <style> 2개를 판정 기록으로 추가
  (내보내기 템플릿 문자열이며 페이지 자체 요청 아님 — 브라우저로 외부 요청 0건 확인)
- 2026-08-22 (견적 단가 개정 — LED↔중계 분리): **엔진 상수·산식 변경** — 근거: **사용자 승인(2026-08-22)**
  + jsx-easy-shift 원본 동반 개정(PR #45 머지 `5dafc52`). CLAUDE.md §9 "0원 일치가 깨지면 머지 금지 —
  변경은 골든 벡터 갱신과 함께" 규약에 따라 **골든 벡터 데이터셋을 v1.0.0(14벡터) → v1.1.0(21벡터)로
  교체**하고 DoD 21 문구를 (14+1) → (21+1)로 정정했다. 교체 후 21벡터 + 그리드 47행 전량 0원 일치 확인.
  · LED 오퍼레이팅(구 '4K 스케일러/KVM') 250만원 **동결** — 명칭·내용만 'V-mix 스위칭 + 전담 엔지니어'로
    정정하고 중계 비용 불포함을 명시. sysBreakdown은 `ledOperating` 신 키 + `scaler4k` 값 미러(호환)
  · 화면중계 250만 → **200만원**(카메라 최소 2대) / **온라인중계 신설** — 화면중계 위 증분 +150만원
    → 합계 350만원(카메라 최소 3대·중계녹화 포함). 증분 모델이라 단독 선택도 350만, 동시 선택도 이중 청구 없음
  · 전체 녹화·편집 350만 → **100만원 + 중계 시스템 선행 필수**(중계 없으면 미과금)
  · LED↔중계는 **단방향 종속** — 중계는 LED 필수, LED는 중계를 강제하지 않음(LED만 쓰고 중계 없이 진행 가능)
  · 구 옵션 키 `scaler4k`는 엔진·Excel 양쪽에서 계속 인정(`normalizeOptions`로 신 키 승계) — 저장 견적 복원 무해
  **미결**: 설계서 v2.0 §17.1·§17.3의 원본 커밋 표기(6047834)와 벡터 수는 차기 개정 시 정정 대상.
- 2026-08-22 (용어 개정): **도메인 용어 '지시' → '가이드' 전면 교체** — 근거: **사용자 지시(2026-08-22)**.
  발주처·담당자에게 '지시'가 위계적으로 읽히는 문제를 해소. UI 노출 문구 전량 교체
  (상태 뱃지 '지시됨'→'가이드됨', 'S2 지시 발행' 폼·버튼·라벨·placeholder, S3 '지시 카드'→'가이드 카드',
  S1 '받은 지시'→'받은 가이드', 활동 로그 '지시가 발행되었습니다'→'가이드가 발행되었습니다',
  S9 제작물 리스트 '지시 스펙'→'가이드 스펙', 검증 메시지 3건, WBS R&R 템플릿 2건) + 주석 동반 정정.
  **식별자·API·상태값은 무변경** — `requested`·`brief`·`brief_refs`·`BriefCard`·`spec_*` 그대로
  (CLAUDE.md §6 '식별자=영어' 준수 · DataProvider 인터페이스 동결 유지 · 스키마 영향 0).
  예외: `src/test/dod8-plan-doc.test.tsx`의 '과제 지시서'는 에이전트 작업 브리프를 뜻하는 별개 표현이라 보존.
  설계서 v1.4 본문의 '지시' 표기는 차기 개정 시 일괄 정정 대상(코드가 선행).
- 2026-08-22 (Phase 3.12 보정 3건 — 사용자 지시, PR #16 위 추가 커밋): ① **RE:BUILD 27 행사일
  2026-09-24 → 2026-09-10(목)**. 근거: 이 날짜에서 §15 템플릿의 마감 경과 집합이 1.1~1.4 · 2.1~2.4 ·
  3.1 · 3.2 열 건으로 확정되고, 그중 2.2·2.3만 미완료로 두면 지연이 '기초 자료 수령 리마인더/수령'이
  되어 실무적으로 자연스럽다. 상대 보정 규칙을 제거하고 **DONE/DOING 코드를 그대로 시드**한다
  ② **견적 인원 800/700 → 480/400** — 엔진 `TARGET_MAX`(500) 안으로 들여 실제 금액을 산출.
  보장 인원은 원 비율(8:7)을 유지해 420/350. 금액은 여전히 엔진 산출값만 저장하며, 상한 초과분은
  `input.notes`의 "자동 견적 상한 500명 — 총 참관 800명 규모는 별도 협의"로 남긴다
  ③ **종료 행사 S2 보드의 생성·지시 폼 숨김** — 데이터 전용 원칙(§0.5)의 **승인된 예외 1건**.
  `AreaBoardPage`가 `useProject().summaries`에서 현재 행사 status를 읽어 `closed`면 `canWrite`·`isPm`을
  false로 떨어뜨리고 안내 문구를 렌더한다(추가 조회 없음). provider의 409는 그대로 둬 방어선 2겹
- 2026-08-22 (Phase 3.12 — #RULE-NO-COMPANY 예외 범위): 데모의 목적이 "합류 팀원이 **자기가 운영한
  실제 행사**를 도구 위에서 다시 본다"는 것이므로, **`src/fixtures/rebuildFixtures.ts` 한 파일에 한해**
  실행사명·연사명·소속·협찬사명·베뉴명 표기를 허용한다(사용자 명시 지시 — 2026-08-22 브랜드 로고
  예외와 같은 계열). 기존 픽스처(prj-stc26 등)는 가상 명칭 원칙 그대로다.
  **대신 금지 목록을 테스트로 못박았다**(DoD-26 (d)) — 운영사무국 이메일·휴대폰, 참가 신청 페이지·
  구글 시트·결제(토스페이먼츠)·내부 큐시트 시스템 URL, 개별 참가자·좌석 배정 명단, 실제 정산 금액·
  단가(케이터링 단가·경품 가액·별도 예산)는 원본에 있어도 **한 건도 옮기지 않는다**.
  휴대폰 가드는 `010-(?!0000-)\d` — 기존 픽스처의 예약 더미 `010-0000-XXXX`만 허용하고 그 외 형태는
  전부 실패시킨다(브리프 §5 ③의 `010-` 일괄 금지를 기존 픽스처 비파괴(§0.1)와 양립시킨 형태)
- 2026-08-22 (Phase 3.12 — 원본 대비 보정 2건): ① 연사 김경훈의 소속을 브리프는 "미확인 — 비워 둘 것"
  이라 했으나 결과보고서 p3·p15가 **OpenAI 코리아 총괄대표**로 확정하고 있어 채웠다
  ② 프로그램은 브리프의 18행 대신 결과보고서 p3의 **20행 실적표**(END·AFTER PARTY 섹션 포함)를 썼다.
  둘 다 "결과보고서가 정본" 원칙에 따른 것
- 2026-08-22 (Phase 3.12 — 표 렌더 회피): 원본 문서는 표 중심이지만 `renderLiteMarkdown`은
  `### 헤더`·`- 불릿`·문단만 지원한다. **기능 변경 금지(§0)** 이므로 렌더러를 건드리지 않고
  존 운영 content의 표를 전부 불릿으로 옮겨 적었다. 표 렌더가 필요하면 별도 UI 증분 사안
- 2026-08-22 (데모 아티팩트 빌드 방식): 아티팩트는 `/_f/{id}/` 하위 경로로 서빙되는데 앱이 쓰는
  BrowserRouter는 basename이 `/`라 **전 경로가 404**로 렌더됐다(Playwright로 재현·확인). 앱 라우팅
  의미를 바꾸지 않기 위해 `src/App.tsx`에서 **라우트 표만 `AppRoutes`로 분리 export**하고, 데모 전용
  진입점 `demo/main.tsx`가 이를 **HashRouter**로 감싼다(경로 독립). 배포 앱은 그대로 BrowserRouter.
  레포 구조 추가 2건(CLAUDE.md §3 기록 의무) — `demo/`(진입점 `main.tsx`·`index.html`,
  자가완결 플러그인 `plugins.ts`, 데모 안내 칩 `DemoNotice.tsx`)과 `vite.demo.config.ts`.
  빌드·검증은 `npm run demo` 한 줄(= demo:typecheck → demo:build → demo:check → demo:check:routing)
  = `dist-demo/artifact.html` 1파일(앱 빌드와 완전 분리). 눈으로 볼 땐 `npm run demo:serve`.
  플러그인 2종: ① `/brand/*.png` 절대 경로를 빌드 타임에 data URI로 치환(3곳 미달이면 빌드 실패)
  ② HTML·CSS·JS를 아티팩트 본문 조각으로 접고 **남은 자산·청크가 있으면 빌드를 세운다**.
  exceljs 의존(string_decoder·saxes)이 U+FFFD 리터럴을 갖고 있어 발행이 400으로 거절되므로
  `�` 이스케이프로 치환(의미 동일). 데모 한정 안내 칩으로 mock·내려받기 제약을 고지.
  검증 3단(`demo/verify/`, 전부 실패 시 exit 1): ① 정적 `demo:check` — 문서 셸 없음·외부 참조 0·
  http URL 호스트 전수 분류·`fetch()` 1건(로고 data URI)·U+FFFD 0·인라인 번들 구문 유효·16MB 이하
  ② 라우팅 `demo:check:routing` — jsdom URL을 실제 아티팩트 경로로 고정한 vitest 4건. **BrowserRouter가
  거기서 404로 떨어진다는 회귀 테스트 포함**(파일명 `*.check.tsx`라 `npm test` 312건에는 안 잡힘)
  ③ 실기 `demo:check:browser` — 퍼블리셔 셸을 재현한 서버 + Playwright 15항목(첫 화면·네트워크 요청
  문서 1건·에러 0·로고 디코드·해시 내비·375px). playwright는 레포 의존이 아니라 미설치면 건너뛴다
- 2026-08-22 (Phase 3.11 검수·머지): **사용자 확정 3건** — ① PR #14 검수 통과, **머지 승인**
  (main `78c8aa9`) ② 열린 질문 v2.0 ① 종결: **DataProvider v5 = 9메서드(67) 현재 구현 확정**,
  설계서 §2.1 "8메서드" 문구는 **챗이 v2.0.1에서 정정해 Phase 4 첨부 시 전달 — 레포 문서 지금 수정
  금지** ③ 열린 질문 v2.0 ② 종결: 견적서 Excel 로고 **offwhite 현행 유지**. 추가 지시: 확정 견적
  편집 안내 문구 1줄은 **백로그로만 기록(지금 수정 금지)**
- 2026-08-22 (Phase 3.11a): **DataProvider v4 동결 해제** — 근거: **사용자 v2.0 승인(2026-08-22,
  시각안 3화면·설계서 v2.0 개정 동반 — §9 준수)**. listQuotes·getQuote·createQuote·saveQuoteVersion·
  finalizeQuote·createProjectFromQuote·exportQuoteXlsx·listComplianceCards 8메서드 + updateComplianceCard
  (§8 PATCH /compliance-cards·DoD 25 대응 — §2.1 8메서드 열거와의 충돌은 §8 우선 해석, 열린 질문
  v2.0 ① 기록) 추가, Project 모객 필드 4종·WbsTask.target·CurrentUser.app_role·ProjectPatch 확장
  (기존 58메서드 시그니처 불변) → **v5(67메서드)로 개정 후 재동결 선언**
- 2026-08-22 (Phase 3.11 사용자 지시 — 챗 중간 접수 2건): ① "견적 단계에서 행사 세팅·금액을 설계해
  운영으로 가져오되 운영 단계에서 수정 가능해야" → §16 핸드오프+S0 프리필(수정 가능)+행사 설정 상시
  편집으로 충족(설계 무변경) ② "**/configurator(신규견적)·/quote(리멤버 견적) 분리 폐지 — 신규견적
  탭 불필요, 하나로 통합**" → §17.2(MiceConfigurator 미이식)·§10 리다이렉트와 일치. S-2는 리멤버
  견적 로직 단일 기반 에디터 1개, 두 옛 URL 모두 /quotes로 리다이렉트(가드 테스트 포함)
- 2026-08-22 (Phase 3.11 구현 판단 — 설계서 무저촉 범위):
  ① venuedb 이식 시 reference_cases와 함께 **source_files도 제거**(견적서 파일명에 실고객사명 포함 —
  §12 #RULE-NO-COMPANY 동일 사유). 20곳·halls·pricing·extraction_confidence·missing_fields는 유지
  ② 컴플라이언스 카드 템플릿의 실회사 표기(리멤버/엠앤씨)는 origin_role 코드(영업 RS·운영 RO·
  협력 총괄 MC-PM·협력 RSVP MC-AT)로 치환 — 규약 본문은 원문 유지(§15 역할 매핑 원칙 준거)
  ③ exportEstimate 이식 테스트의 화이트라벨 공급자 픽스처(실사업자 정보)를 가상 명칭으로 치환 —
  richSupplier/mncLayout 렌더 메커니즘 검증은 동일(#RULE-NO-COMPANY)
  ④ WBS 소통 대상 = 원본 event_tasks.target을 §4-15b 예시 3버킷으로 매핑(고객→고객사 / 엠앤씨
  계열→협력사 / 리멤버 계열→내부, 복수 대상은 '·' 결합) — 정본 구현 src/fixtures/wbsTemplates.ts
  ⑤ 견적 저장은 항상 스냅샷 신규(생성 또는 새 버전) — §8에 PATCH /quotes가 없음(불변 스냅숏 계약).
  에디터는 미변경 시 재저장 생략(dirty 판정), 확정본 저장 시 새 버전·확정본 잠금 유지
  ⑥ "견적 연결" 액션은 ProjectPatch.quote_id 경유(updateProject) — app_role admin·sales 게이트 +
  quote.project_id 상호 동기화(시그니처 불변·필드 추가만)
  ⑦ mock 견적 픽스처 ID는 100 미만 대역(quo-010) — nextId('quo')가 quo-101부터 발급해 충돌 방지
  ⑧ R&R 카드 그리드 4열→2열 — 컴플라이언스 카드와 좌우 반폭 배치 시 4열이 뭉개짐(§6 의미 유지)
  ⑨ QuoteInput.selected_venue는 §16의 객체 접근(name·hall)과 엔진 택1 인덱스를 겸하도록
  {…후보, index} 형태로 정의. breakdown.subtotal = 엔진 pk(VAT별도) = total_amount
  ⑩ 브랜치: 브리프의 claude/phase-3.11-quote-module 대신 **하네스 지정 claude/progress-9jxt7x**로
  개발·푸시(웹 세션 지정 브랜치 준수) — PR 제목은 브리프 그대로
- 2026-08-22 (Phase 3.10a): **DataProvider v3.1 동결 해제** — 근거: **사용자 v1.5 승인(2026-08-22,
  설계서 v1.5 개정 동반 — §9 준수)**. listProjects·createProject·closeProject·addMember·removeMember
  5메서드 추가, 기존 53 시그니처 불변 → **v4(58메서드)로 개정 후 재동결 선언** — 이후 변경은 다시
  사용자 승인+설계서 개정 필요
- 2026-08-22 (Phase 3.10 구현 판단 — 설계서 무저촉 범위): ① listProjects 정렬 = active 먼저
  created_at asc, closed는 뒤에 closed_at desc(셀렉터 기본 선택 안정성 — 테스트 기본 행사 = ①)
  ② ProjectContext는 저장값 검증을 생략(새 행사 즉시 신뢰 — mock에 행사 삭제 없음)
  ③ 픽스처 ②~④ 행사는 오늘 기준 상대 날짜로 생성해 지연·임박 집계를 결정적으로 고정
  ④ 테스트 내 행사 ID는 리터럴 문자열(PROJECT_ID grep 0건 계약 — 픽스처 .ts 정의만 허용)
  ⑤ MembersEditor useMutation은 void 반환 시 성공 판정 불가 → return true 래핑(실버그 픽스)
- 2026-08-22 (Phase 3.10 운영): 머지된 브랜치 재사용 금지 — 3.9.1=`claude/phase-3.9.1-polish`,
  3.10=`claude/phase-3.10-multi-project`(3.9.1 머지 후 main 분기), 둘 다 base=main. Configurator
  연동 코드·라우트 prefix·토큰 값 변경 금지(경계 준수). Configurator 분석은 새 세션 이관(사용자 지시)
- 2026-08-22 (Phase 3.9 디자인 해석 — 지시서 개정 없이 값 미변경 원칙 하의 구현 판단):
  ① `--border-strong`(#C9C2B2)은 §5 테이블 규격이 참조하나 §1 표에 미정의 — --border 1단계 진한
  값으로 파생해 tokens.css에 등록 ② 간트 바는 역할 컬러가 기본이되 지연=--negative·임박=--accent가
  역할색을 대체(§3 상태 우선), 완료는 역할색+40% 투명 ③ S1 KPI는 §6 명시 4종(미결 컨펌·지연·임박·
  D-day)으로 확정 — 기존 인박스 수 타일은 우측 '미등록 인박스' 카드와 중복이라 제거 ④ dod13·14의
  색 클래스 어서션은 새 토큰 계약(bg-brown/opacity-40/bg-negative(-tint)/bg-accent(-tint))으로
  치환 — 테스트 의미(DoD) 무변경, CLAUDE.md §4 Phase 3.9 허용 조항 준거 ⑤ 발주처 410/404 안내
  (ClientMessage)는 톤 박스 대신 중립 ui-card(§5 빈 상태 문법) ⑥ 큐시트 콘솔 3채널 값은 캡션 칩으로
  표기(정보 위계 §2 캡션 규격) ⑦ 아티팩트 데모는 CSP상 CDN 폰트 차단 → Pretendard 폴백 스택으로 렌더
- 2026-08-22 (Phase 3.8a): **DataProvider v3 동결 해제** — 근거: **사용자 v1.4.1 승인(2026-08-22,
  설계서 v1.4.1 개정 동반 — §9 준수)**. `Project.onboarded_at`·`OnboardingStatus.onboarded_at` 필드
  추가만(메서드 수 53 불변) → **v3.1로 개정 후 재동결 선언** — 이후 변경은 다시 사용자 승인+설계서
  개정 필요
- 2026-08-22 (Phase 3.8): 3.8과 3.9는 **별도 커밋·별도 PR**(CLAUDE.md §5 — 타입·로직 vs 스타일 리뷰
  diff 분리). 3.9 브랜치는 3.8 브랜치 위에 스택 — 3.8 머지 시 3.9 PR base가 main으로 자동 전환
- 2026-08-22 (Phase 3.6a·3.7a): **DataProvider v2 동결 해제** — 근거: **사용자 v1.4 승인(2026-08-22)**
  (v1.3 내용 포함·설계서 v1.4 개정 동반, §9 준수). EventType·Cue·WbsTask·RoleCharter·WbsStatus 반영,
  큐시트 CRUD/스냅숏·프로젝트 기본정보 패치·온보딩·WBS 전개/조회/패치·R&R 조회 12메서드 추가 →
  **v3(53메서드)로 개정 후 재동결 선언**
- 2026-08-22 (Phase 3.6·3.7 해석 결정 — §9 '열린 질문' 겸): ①온보딩 완료 플래그가 §4 스키마에 없음 —
  mock은 앱 상태(MockState.onboarding_completed)로 구현, **Phase 4에서 projects.onboarded_at 컬럼 추가
  제안**(사용자 확인 필요) ②일반형 28건 산식 — 3.x 5건+4.x 7건 중 **4.6 '데일리 현황 공유(내부)'만
  존치**(리드 특화 아님)하고 11건 제외+3G 2건 추가 = 정확히 28건(§15 '가정' 문언 준거, 확정 시 갱신)
  ③큐시트 스냅숏 mock = 파일명 .pdf 규약+내용은 인쇄용 HTML blob(PDF 생성은 Phase 5) ④임박 판정은
  지연과 배타(미완료·오늘≤end_date≤오늘+2) — 설계서 산식 그대로면 지연⊂임박이라 집계 중복
  ⑤WBS 재전개는 code 매칭으로 기존 status·done_at·연결 보존 ⑥Phase 3.6이 레포에 부재하여 v1.4
  로드맵(3.6 머지 후 3.7)에 따라 본 세션에서 3.6→3.7 순차 수행
- 2026-08-22 (Phase 3.5a): **DataProvider v1 동결 해제** — 근거: **사용자 v1.2 승인(2026-08-22, 시각안 기반)**,
  설계서 v1.2 개정 동반(§9 준수). status 'requested'·지시서/스펙/content 필드·ProgramSession·행사개요 반영해
  **v2(41메서드)로 개정 후 재동결 선언** — 이후 변경은 다시 사용자 승인+설계서 개정 필요
- 2026-08-19: 아키텍처 하이브리드 / 무로그인 토큰 / 컨펌 발송 PM 단독 / 프론트 우선·서버 후행 / 미리보기 포맷 발송 조건
- 2026-08-19 (Phase 0): 라우트 확정 / Tailwind v4 · react-router v6
- 2026-08-19 (Phase 1): **DataProvider v1 동결(35메서드)** — 변경은 사용자 승인+설계서 개정 동반 /
  타입 snake_case 유지 / 전이 규칙 via 차원 / vitest 채택
- 2026-08-22 (Phase 2·3): 상태 라벨·뱃지 색 단일 정본 `src/lib/labels.ts`(시맨틱 고정, 라벨 동반) /
  발주처 승인 확인은 네이티브 confirm 대신 인라인 확인 패널(모바일 UX·테스트 안정성) /
  S3 Drive 폴더 링크는 Phase 5로 보류(Drive 미연동) / S6 토큰 값 비노출(링크 복사 버튼만) /
  favicon 인라인 SVG 추가
- 2026-08-22: B·C 서브에이전트 병렬 실행(§5) — 파일 경계 분리로 충돌 0, 메인이 통합 검수
- 2026-08-22: **DoD 상시 검증 = vitest+RTL 컴포넌트 테스트로 확정** — 브라우저 E2E(Playwright)는
  환경 의존적(로컬은 /opt/pw-browsers 부재 시 실행 불가)이라 CI·로컬 공통 실행이 안 되는 문제.
  픽스처 초기화 단위 = 테스트 파일(페이지가 모듈 스코프에서 provider 캡처 → 파일 내 시나리오 순서 유지)
- 2026-08-22: 리멤버 로고 상시 노출은 사용자 명시 지시 — #RULE-NO-COMPANY의 예외로 기록.
  코드에는 자산 경로 참조만 두고 로고 파일은 public/brand/ 에서 주입(폴백: 텍스트 워드마크)
- 2026-08-22: 테스트 측 타입은 동결 타입 조합·캐스팅으로만 해결(동결 파일 무수정 원칙 유지) —
  보고된 AttendeeWithRsvp 타입 에러는 현 HEAD에서 재현 안 됨(tsc 통과)
- 2026-08-22 (Phase 3.5): 지시 발행 트리거 = brief 또는 스펙 필드 포함(§8 문언 그대로) — pm 전용·담당자
  필수·status=requested. 담당자 셀프 생성(brief 없음)은 기존대로 draft
- 2026-08-22 (Phase 3.5): S9 섹션 진행률 산식은 MockProvider.getPlan 주석을 정본으로 고정(개요 슬롯 5·
  프로그램 start_time·존 content·제작물 스펙 4필드 완비·등록 존재 여부·마일스톤 완료) —
  SupabaseProvider도 동일 산식 유지 조건
- 2026-08-22 (Phase 3.5): G는 메인이 직접 수행(3.5a는 후속 H·I의 선행 의존이라 직렬 구간 — 산출·검수
  기준은 §5와 동일), H·I는 서브에이전트 병렬 — 파일 경계 분리(공유 라우트·index.css는 I 단독 소유)로
  충돌 0. brief_refs 입력은 줄바꿈 구분 textarea 채택. dod9의 CSS 파일 검증은 @types/node 없이 국소
  dynamic import 우회(테스트 파일 내 한정)
- 2026-08-22 (Phase 3.10.1 구현 판단 — 문구·스타일 범위): ① R2 D+28 생략 판정은 축 컨테이너 실측 폭
  (getBoundingClientRect+resize 리스너) 기반 픽셀 환산 — jsdom(폭 0)에선 항상 생략되나 눈금 존재를
  가드하는 테스트 없음 확인 ② R5 문구 변경으로 픽스처 ③(필수 4 모두 입력·onboarded_at null)이
  missingCount 0 분기에 해당 → dod19 (a)의 배너 가드를 새 문구로 갱신(의미 유지 — 유도 배너 존재 증명)
  ③ 간트 '축 범위 밖' 캡션 판정 로직은 WbsBoard로 이동(WbsGantt는 축 안 오늘 선만 담당) ④ 큐시트
  표 min-w 820→936 상향(열 규격 합계와 일치 — 1280 콘텐츠 폭 958 안에서 무스크롤 실측)

## 6. 세션 로그
- 2026-08-23 세션 #6 계속: **Phase 3.14 정산보드**(설계서 v2.2·CLAUDE.md v2.2 채택 → 3.14a~3.14d).
  사용자 요청의 출발점은 "발주금액을 실시간으로 확인하고 최초 계약 견적 대비 ±를 파악한다"였고,
  마진 식은 사용자가 공유한 실물 내부정산 2건에서 원 단위로 검산해 잠갔다.
  결과: vitest **433** 연속 3회 · tsc · build · demo 4단 · 가드 역검증 5건 · 스크린샷 5장.
  F3(레포 기본 브랜치 → main)은 노출된 MCP 도구에 레포 설정 변경 수단이 없어 **미처리**로 남긴다

- 2026-08-22 세션 #5: **Phase 3.12 데모 픽스처 리빌드화** (메인 단독, 브랜치 `claude/gg-5jaapu`,
  base=main `bfccb26` — 이전 지정 브랜치가 원격에서 삭제돼 main에서 재분기). 세션 도중 사용자가
  **RE:BUILD 26 운영계획서·결과보고서 PDF 2부를 추가 첨부**해, 브리프의 요약본 대신 원문에서
  프로그램 20세션·제작물 42건·존 운영 9건·등록 통계 전 항목을 발췌해 픽스처를 확장했다.
  결과: vitest 322(312+10) · tsc(앱·데모) · build · `npm run demo` 4단 전부 통과 · 금지 문자열 0건 ·
  스크린샷 6장. PR #16 발행(드래프트)
- 2026-08-22 세션 #5 계속: PR #16 상태 확인(clean · CI 미설정 · 리뷰 0) 후 **사용자 보정 3건 반영** —
  행사일 2026-09-10 / 견적 인원 480·400 / 종료 행사 보드 폼 숨김. 열린 질문 ①~③ 전부 종결,
  견적 엔진 상한은 v2.1 백로그로 이관. vitest **323**(DoD-26 11건) · tsc · build ·
  `npm run demo` 4단 · 가드 5종 0건 · 스크린샷 2장 재촬영. **머지는 사용자 검수 후**
- 2026-08-19 세션 #1: ZIP 배치→main 생성→Phase 0(PR #1 머지)→Phase 1(동결·테스트 33, PR #2 머지)
- 2026-08-22 세션 #1 계속: Phase 2(B)·Phase 3(C) 병렬 구현 → 메인 통합 검수(DoD 1~6 브라우저 증명,
  스크린샷 11장 사용자 공유) → PR 발행
- 2026-08-22 세션 #1 계속(2): DoD 1~6을 RTL 컴포넌트 테스트로 코드화(50개 통과) + 리멤버 로고 슬롯
  + PR #3 머지. **다음 세션 = Phase 4(Supabase 이식, 착수 전 사용자 승인·Supabase 프로젝트 정보 필요)**
- 2026-08-22 세션 #2: 설계서 v1.2·CLAUDE.md v1.2 채택(v1.1 대체) → Phase 3.5 사용자 승인 하에 진행 —
  3.5a(메인: 동결 해제 기록→타입 개정→v2 재동결) → 3.5b(H)·3.5c(I) 병렬 → 메인 통합 검수
  (vitest 72·tsc·빌드 전부 통과, DoD 1~9 코드화 완료) → PR #4 발행 → 사용자 지시로 머지(2d40342)
- 2026-08-22 세션 #2 계속: 설계서 v1.4·CLAUDE.md v1.4 채택(v1.2 대체) → Phase 3.6 부재 확인 후
  로드맵 순서로 3.6→3.7 수행 — 코어(메인: v3 재동결·37/28 템플릿·전개/판정/스냅숏/자동 done) →
  K(온보딩)·L(큐시트)·O(WBS UI) 3병렬 → 메인 통합 검수(섹션 번호 정본화, vitest 114·tsc·빌드 통과,
  DoD 1~15 완비) → PR #7 머지(사용자 사전 승인)·데모 아티팩트 재발행.
  **다음 세션 = Phase 4(착수 전 사용자 승인·Supabase 프로젝트 정보 필요)**
- 2026-08-22 세션 #3: 용어 개정 '지시'→'가이드' (20파일 63줄) — vitest 114·tsc·빌드 전부 통과,
  브라우저 스크린샷으로 S1·S2·S9 노출 문구 확인. 식별자·스키마 무변경이라 Phase 4 이식에 영향 없음.
- 2026-08-22 세션 #3: 문서 채택 커밋(설계서 v1.4.1·CLAUDE.md v1.4.1·디자인지시서 v1·로고 자산) →
  Phase 3.8(메인 단독: v3.1 재동결·onboarded_at 정합·DoD-16 3건·열린 질문 ①~⑤ 종결, vitest 117·
  tsc·빌드 통과) → 3.8 PR 발행(드래프트, 머지는 사용자 검수 후). **Phase 3.9 기준치 = 117개 기록**
- 2026-08-22 세션 #3 계속: Phase 3.9 디자인 스프린트 — 3.9a(메인: 토큰·타이포·컬러 정본·레이아웃 셸·
  로고) → 3.9b·3.9c(서브에이전트 5분할 병렬: 내부 4화면 / S3·큐시트 / S9 / S5·S0 / 발주처 —
  파일 경계 분리로 충돌 0) → 메인 통합 검수(DoD-17: 117개 통과·tsc·빌드·grep 0건·스크린샷 11장·
  데모 재발행) → 3.9 PR 발행(3.8 위 스택, 드래프트). **머지는 사용자 검수 후, 다음 세션 = Phase 4
  (착수 전 사용자 승인·Supabase 프로젝트 정보 필요)**
- 2026-08-22 세션 #4: PR #9·#10 사용자 지시로 머지(d67b165·4246aeb) → **Phase 3.9.1 폴리시 4건**
  (메인 단독, 브랜치 `claude/phase-3.9.1-polish`, base=main — 기본 브랜치 미전환 지속) →
  PR 발행·체크아웃 보고, 머지는 사용자 검수 후. 다음 = v1.5 채택 → Phase 3.10(T→U·V) →
  Configurator 읽기 분석(v2 브리프, ② PR 후)
- 2026-08-22 세션 #4 계속: PR #11 머지(사용자 지시) → 설계서 v1.5·CLAUDE.md v1.5 채택 커밋 →
  **Phase 3.10** — 3.10a(메인: v4 재동결·MockProvider 다중 행사화·픽스처 4행사) → 3.10b(U)·3.10c(V)
  병렬 → 메인 통합 검수(DoD 18~20 코드화, vitest 124·tsc·빌드·grep 2종 0건, 스크린샷 6장) →
  PR 발행·머지(사용자 사전 승인 "작업 완료되면 머지/커밋 진행")·데모 아티팩트 재발행.
  **다음 세션 = ① Configurator 읽기 분석(v2 브리프) ② Phase 4 게이트(착수 전 사용자 승인·
  Supabase 프로젝트 정보 필요)**
- 2026-08-22 세션 #5: PR #12 사용자 검수 완료 접수(main f97c794) → **Phase 3.10.1 폴리시**(메인 단독,
  브랜치 `claude/phase-3.10.1-fix`, base=main — 3.9.1 잔여 R1·R2 + 3.10 검수 R3·R4·R5, 문구·스타일만) →
  검증(vitest 124·tsc·빌드·grep 2종 0건·1280 무스크롤 실측·스크린샷 5장) → PR #13 발행·체크아웃 보고 →
  **사용자 승인으로 머지(bbb2c52)·데모 아티팩트 재발행(phase-3.10.1)**.
  다음 = ① Configurator 읽기 분석(v2 브리프, 새 세션) ② Phase 4 게이트
- 2026-08-22 운영 지시(사용자): **이후 작업 완료 시마다 오토머지·커밋 + 데모 아티팩트(실기) 재발행**을
  기본 동선으로 함 — 단, CLAUDE.md·설계서 개정, DataProvider 동결 해제, Phase 4 착수 같은 게이트 항목은
  §9 리추얼대로 여전히 사용자 승인 선행

- 2026-08-22 세션 #6 (Phase 3.11, 새 세션·레포 2개 연결): 설계서 v2.0·CLAUDE.md v2.0 채택 커밋 →
  **Phase 3.11** — 3.11a(메인=W: jsx-easy-shift 6047834 §17.1 이식·골든 벡터 15/15 0원·타입 v5
  재동결·mock 견적/컴플라이언스) → 3.11b(메인=X: 사이드바 준비/운영 그룹·/quotes·5스텝 에디터·확정
  잠금·Excel) → 3.11c(메인=Y: §16 핸드오프·S0 프리필·모객형 그룹·S5 소통 대상+컴플라이언스·옛 라우트
  리다이렉트) → DoD 21~25 코드화 → 검증(vitest 312 ×2·tsc·build·grep 4종 0건·스크린샷 7장·jsx-easy-shift
  쓰기 0) → PR 발행(드래프트, **머지는 챗 검수 후**). 챗 중간 지시 2건 반영(결정 로그).
- 2026-08-22 세션 #6 계속(체크아웃): 사용자 검수 통과·머지 승인 → **PR #14 머지(main `78c8aa9`)** →
  머지본 재검증(vitest 312·tsc·build·grep 4종) → 열린 질문 2건 종결·백로그 1건 기록 → **데모
  아티팩트 실기 재발행**(HashRouter 데모 빌드 신설 — 기존 아티팩트가 하위 경로에서 404였던 문제
  해결, 결정 로그 참조) → 데모 검증 3단(`npm run demo`) 신설 → PROGRESS 갱신 → **PR #15 발행·머지**
  (§6 운영 지시의 오토머지 동선 — 게이트 항목 아님).
  **다음 세션 = Phase 4 게이트(사용자 승인 + 새 Supabase 3키, Fable 5 엑스트라 권장).
  Phase 4 착수 시 챗이 설계서 v2.0.1(§2.1 9메서드 정정판) 첨부 예정**
- 2026-08-22 세션 #4: 견적 모듈 단가 개정(LED↔중계 분리·온라인중계 신설) — 엔진·Excel·UI·테스트·골든
  벡터 전량 이식. vitest 342(323+19)·tsc·빌드·demo 3단 통과, 아티팩트에서 옵션 화면 직접 확인.
- 2026-08-22 세션 #5: Phase 3.13 랜딩보드 신설 — 타입·v6 재동결·MockProvider 8메서드·섹션 템플릿 13종·
  autofill·HTML 내보내기(GA 주입)·빌더/보드 2화면·DoD-27 27케이스. vitest 369(342+27)·tsc·빌드·demo 통과,
  브라우저로 보드·빌더·외부요청 0건 확인.

- 2026-08-23 세션 #7 (Phase 3.13.1 핫픽스, 레포 2개 쓰기): 설계서 v2.1 채택 커밋(v2.0 삭제·코드 무변경) →
  H1(랜딩 스코프·v6.1 재동결·픽스처·DoD-27 +4) → H2(스코프 가드 테스트 3 + CLAUDE.md 상시 grep 표)·
  H3(flake 7곳 findBy 교체) → H4(사실 확인 = (a), 생성기 재실행 교체) → H5(jsx-easy-shift 문서 3건) →
  검증(vitest 376 **연속 3회** · tsc · build · demo 4단 · grep 5종 0건 · 스크린샷 4장) →
  양 레포 PR 발행(드래프트, **머지는 챗 검수 후**).
  신규 관찰 3건을 열린 질문에 기록 — 그중 ①(영문 라벨 단가 오기)은 범위 밖이라 **손대지 않고 보고**.
  **다음 = ① 3.13.1 검수·머지 ② Phase 4 게이트(사용자 승인 + 새 Supabase 3키)**

- 2026-08-23 세션 #7 계속(체크아웃 2): **사용자 지시로 PR #21·#46 머지** — 드래프트 해제 후
  communicator는 merge commit(`df947a0`, 기존 관례), jsx-easy-shift는 squash(`1154614`, 레포 규약).
  머지본 main 재검증(vitest 376·tsc·build) → **Phase 3.13.2 후속 2건**(사용자 지시 "둘 다 해줘"):
  ① 영문 라벨 단가 오기 수정 + `quote-option-catalog.test.ts` 가드 4건(역검증 완료 — 결함을 되돌리면
  `fullRecording: ko=1000000 en=3500000`을 지목하며 실패) ② `npm run demo:build` 후 **기존 아티팩트
  URL에 재발행**(같은 링크 유지). vitest 380·tsc·build·demo 4단 통과.
  **브리프의 "머지는 챗 검수 후" 조건은 사용자 지시로 건너뛰었다** — 검수에서 되돌릴 것이 나오면
  main 위 후속 커밋으로 처리한다.
  **다음 = Phase 4 게이트(사용자 승인 + 새 Supabase 3키, Fable 5 엑스트라 권장)**

- 2026-08-27 세션 #10 (Phase 3.15 — v2.4 주최형 확장 + 견적서 임포트): 문서 교체 커밋(설계서
  v2.4·CLAUDE.md v2.4) → 체크인 승인 → **AA 직렬**(타입·전이표 §5.1·v8 재동결 102메서드·
  MockProvider 16메서드·주최형 픽스처) → 메인이 라우트 셸 선배선(/partners·/p/:token·
  /quotes/import) → **AB·AC·AD 병렬**(성격 카드·S-11 / 포털 / 파서·위저드) → 통합(uploadVersion
  §5.1 분기 보강·DoD 31~34 4파일·가드 확대+역검증·수정요청 데모 토큰) → 검증(vitest **548
  연속 3회** · tsc · build · **demo 4단** · 스크린샷 5장). 실견적서 3종(카페24 v5·TAAS GBR
  v12·PLZ v10) 로컬 검산 전부 기대값 일치 — 커밋 0(R-Q4). 데모 브라우저 검증은 playwright
  1.56.1(사전 설치 chromium 1194와 리비전 일치)로 수행. **PR #25 드래프트 — 머지는 챗 검수 후.**
  아티팩트 재발행은 권한 분류기 차단으로 보류(다음 스텝 ②).
  **다음 = ① PR #25 챗 검수·머지 ② 서버 스프린트는 사용자 지시 대기**

- 2026-08-27 세션 #10 계속(체크아웃 2): **사용자 지시("머지하고 테스트할 수 있게")로 PR #25 머지** —
  드래프트 해제 후 merge commit(`22e247f`, 레포 관례). 머지본 main 재검증(vitest **548** · tsc ·
  build · demo 4단 브라우저 포함) → **데모 아티팩트 기존 URL 재발행 성공**(직전 차단은 발행
  프로토콜의 라이브 버전 확인 절차로 해소 — URL 직접 read 후 발행). PR 구독 해제·예약 체크인
  삭제로 감시 종료. 견적서 임포트는 파서가 전부 클라이언트 사이드라 **아티팩트에서 실파일
  xlsx 업로드 테스트 가능**. **다음 = 사용자 실기 테스트 → 피드백 반영(main 후속 커밋) ·
  서버 스프린트는 지시 대기**

- 2026-08-28 세션 #10 계속(Phase 3.15.1): 문서 v2.5 선채택(사용자 승인 — v2.4.1 승계 갈음) →
  메인이 InfoTip·helpTexts 선작성 + **P1 charset**(수정 전 백지 재현 → 선두 0바이트 보장 →
  no-charset 3라우트 검증 신설) → **PA 직렬**(v8.1 필드·주최형 R&R/규약 시드·target 파트너명)
  → **PB·PC·PD 병렬**(주최형 홈/포털·스케일/등록 xlsx·보드 폼 통합/InfoTip 적용) → 통합
  (P6-③ 1건 그룹 요약 복원 '제출:' 접두 · 가이드 URL 호스트 화이트리스트 정합) → 검증
  (vitest **612 연속 3회** · tsc · build · demo 4단 no-charset 포함 · 가드 5종 0건 ·
  스크린샷 8장). **PR #26 드래프트 — 머지는 챗 검수 후. 다음 = 검수·머지 → Phase 3.16 착수.**

## 7. 세션 잠금
- 잠금 없음 (한 폴더 = 동시 1세션)
