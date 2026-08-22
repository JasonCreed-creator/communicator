# PROGRESS.md — MICE 커뮤니케이터

> 가변 상태 파일. 매 세션 체크아웃 시 에이전트가 갱신한다 (CLAUDE.md §9 리추얼).

## 1. 상태 요약
- 현재 Phase: **Phase 0~3.10.1 완료** — main=3.10.1 머지 커밋(PR #13, `bbb2c52` — 검수 통과·사용자
  머지 승인 2026-08-22). 다음 = Phase 4(Supabase 이식, ★착수 전 사용자 승인·**v1.5 스키마 기준**).
  Configurator(jsx-easy-shift) 읽기 분석은 **새 세션**에서 v2 브리프로 착수(사용자 지시 2026-08-22)
- 정본 문서: `docs/mice-communicator-설계서-v1.5.md` (스키마·상태 머신·API·WBS 템플릿 SoT — v1.4.1 대체)
  + `docs/mice-communicator-디자인지시서-v1.md` (디자인 토큰·레이아웃·컴포넌트 규격 정본, Phase 3.9)
- 브랜치: `main` = 정본 — 3.8은 PR #9, 3.9는 PR #10, 3.9.1은 PR #11, 3.10은 PR #12, 3.10.1은
  PR #13(`claude/phase-3.10.1-fix`) 머지. 머지된 브랜치 재사용 금지 원칙(신규 브랜치 분기) 유지
- **Phase 3.10 결과: vitest 124개(22파일) = 기준치 117 + dod18(3)·dod19(2)·dod20(2) 전부 통과 +
  tsc 클린 + vite build 성공 + `grep -rn "gray-\|slate-" src` 0건 +
  `grep -rn "PROJECT_ID" src --include=*.tsx` 0건(픽스처 .ts 내 정의만) + 스크린샷 6장 (DoD 18~20 충족)**
- **Phase 3.10.1 결과: vitest 124개·tsc·build·grep 2종 0건 유지 + 1280 큐시트 표
  scrollWidth==clientWidth 실측(958==958) + 스크린샷 5장(액션 열·발주처 표·셀렉터·0개 분기 배너·간트 우측 끝)**

## 2. 완료
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

## 3. 미결
- GitHub 기본 브랜치가 아직 `claude/extract-zip-to-repo-t6xstr` — Settings → Branches에서 `main`으로
  변경 필요 (세션 브리프 부록에 사용자 직접 수행 절차 안내됨). 머지된 `claude/*` 브랜치 삭제도
  사용자 직접 수행(git proxy가 ref 삭제 푸시 차단)
- (경미) `@types/node` 미도입 — dod9가 print CSS 파일 검증에 국소 우회(dynamic import 캐스팅) 사용 중.
  Node API 쓰는 테스트가 늘면 devDependency 추가 검토
- (경미) 큐시트 발송 시 RequestApprovalInput.version_id에 'auto' 센티널 전달(동결 인터페이스 관례) —
  다음 동결 해제 기회에 version_id 옵셔널화 검토. v1.4.1 ⑤는 스냅숏 파일 규약을 정본화한 것이고
  이 항목은 인터페이스 형상 문제라 별개로 유지
- **(백로그 — v2.0, 지금 수정 금지)** 3.10.1 R3 잔여: 발주처 연락처 표가 **반폭 카드**에서는 액션 열이
  가로 스크롤 뒤에 숨음(전폭에선 정상) — v2.0에서 행사 설정 ② 담당자 탭을 상하 1단 배치로 전환해
  해소 예정(사용자 결정 2026-08-22, 현 단계 수정 금지)
- ~~리멤버 로고 실 자산 미수령~~ → **종결** (2026-08-22 ZIP 수령, png 2종 배치)
- ~~온보딩 완료 플래그 스키마 확정 필요~~ → **종결** (설계서 v1.4.1 §4-1 projects.onboarded_at,
  사용자 승인 — Phase 3.8a 반영)
- ~~일반형 28건 산식·임박 배타 산식·재전개 보존·큐시트 스냅숏 mock 규약 해석~~ → **종결**
  (설계서 v1.4.1 §4-15·§8·§15 정본화 — 열린 질문 ①~⑤ 전부 종결)

## 4. 다음 스텝
- **Configurator(jsx-easy-shift) 읽기 분석 — 새 세션에서 v2 브리프로 착수** (사용자 지시 2026-08-22):
  add_repo 읽기 전용·해당 레포 브랜치/커밋/파일 생성 금지·보고서는 대화창 출력만(communicator에도
  미저장)·"## 0. 이식 인벤토리" 절 포함 확인. 맥락: Lovable 폐기 확정, 통합 베이스=communicator,
  가격 엔진·베뉴 DB → `src/modules/quote` 이식 예정(분석 세션에선 이식 코드 작성 금지 — 인벤토리·
  사실 보고까지만)
- **Phase 4 — Supabase 이식** (★착수 전 사용자 승인 필수, **v1.5 스키마 기준**): 마이그레이션(§4 전체 —
  projects 복수·status/closed_at·행사개요 확장·invites·cues·wbs_tasks·role_charters·event_type·
  onboarded_at 포함)+RLS(§6.2)+Auth+seed → SupabaseProvider 구현(v4 58메서드) → MockProvider 교체
  (프론트 무수정 목표). Supabase 프로젝트 정보(URL·anon key·service role key) 필요
- 이후 Phase 5(Drive) → Phase 6(알림·cron)

## 5. 결정 로그
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

## 7. 세션 잠금
- 잠금 없음 (한 폴더 = 동시 1세션)
