# MICE 커뮤니케이터 — 디자인 업그레이드 지시서 v1 (전체 depth)

| 항목 | 내용 |
|---|---|
| 목적 | Tailwind 기본 회색 체계 → 리멤버 웜 페이퍼 룩 전면 전환 + 화면 위계·구분감 확립 |
| 근거 | 2026-08-22 진단: public/brand 로고 부재, 브랜드 토큰 0건, 전 화면 gray-* 단일 톤 |
| 범위 | S0~S9 + 발주처 뷰 전체. 기능·데이터 로직 무변경(스타일·레이아웃만) |
| 첨부 | communicator-brand-assets.zip (로고 2종, public/ 구조 그대로) |

---

## 1. 디자인 토큰 (정본 — `src/styles/tokens.css`에 CSS 변수로 등록 후 전 화면 치환)

| 토큰 | 값 | 용도 |
|---|---|---|
| --canvas | #FBFAF6 | 앱 배경 (웜 아이보리) |
| --card | #FFFFFF | 카드·시트 |
| --border | #DCD6C8 | 1px 웜 보더 (기본 구분선) |
| --track | #EFEBE0 | 진행바 트랙·비활성 면 |
| --ink | #1A1A1A | 본문 (퓨어 블랙 #000 금지) |
| --ink-sub | #6E6E6E | 보조 텍스트 |
| --ink-cap | #8C867A | 캡션·라벨 |
| --brown | #4A463F | 서브 잉크·섹션 번호 |
| --accent | #EB6F2A | 리멤버 오렌지 — CTA·활성·강조 |
| --accent-deep | #B8431A | 액센트 텍스트·호버 |
| --accent-tint | #FFF1E6 | 액센트 배경 틴트 |
| --steel | #476580 | 보조 컬러 (정보성) |
| --dark | #211E1A | 사이드바·다크 바 |
| --dark-ink | #F4F0E9 | 다크 위 텍스트 |
| --positive | #196B24 / 틴트 #E8F2E9 | 승인·완료 |
| --negative | #D93636 / 틴트 #FBEAEA | 수정요청·지연 |
| 그림자 | 0 1px 3px rgba(74,70,63,.08) 한 단계만 | 카드 |
| 라운드 | 버튼 6 / 카드 10~12 / 뱃지 pill | — |
| 간격 | base 4px 배수 | — |

**금지**: gray-*·slate-* 등 쿨 그레이 전면 제거(치환 후 `grep`으로 0건 증명), #000, 그라디언트(홈 히어로 1곳 외 금지), 보라·파랑 계열 임의 사용(steel 제외).

## 2. 타이포그래피

- Pretendard(CDN dynamic-subset) 전역 적용, 숫자는 `font-variant-numeric: tabular-nums`
- 스케일: 페이지 타이틀 25/600 · 섹션 타이틀 20/600 · 카드 타이틀 16/600 · 본문 14/400 · 캡션 12/500(+letter-spacing .02em, --ink-cap)
- KPI 숫자 31/650

## 3. 상태·역할 컬러 체계 (전 화면 통일)

| 상태 | 뱃지 (틴트 bg / 텍스트) |
|---|---|
| 지시됨 requested | --accent-tint / --accent-deep |
| 작성중 draft | --track / --ink-sub |
| 내부검토 internal_review | #EAF0F5 / --steel |
| 컨펌요청 pending_approval | --accent-tint / --accent-deep + 좌측 도트 |
| 수정요청 changes_requested | negative 틴트 / --negative |
| 승인·확정 approved·final | positive 틴트 / --positive |
| 지연 | --negative | 임박 | --accent |

간트·담당 역할 컬러: pm #4A463F · design #EB6F2A · ops #476580 · reg #F3B48A — R&R 카드 좌측 보더에도 동일 적용.

## 4. 레이아웃 전면 전환 — 구분감의 근본 해결

- **내부 화면: 상단 탭 → 좌측 사이드바(고정 232px, --dark 배경)**. 상단에 offwhite 로고, 메뉴는 아이콘+라벨(--dark-ink 70%), 활성 항목 = 오렌지 3px 좌측 마커 + 텍스트 100%. 하단에 행사명·유형 뱃지·설정. 모바일(<768px)은 햄버거 드로어.
- 콘텐츠 영역: --canvas 배경, max-width 1120 중앙, 페이지 헤더 패턴 통일(캡션 라벨 → 타이틀 25 → 우측 액션 버튼).
- **발주처 뷰: 사이드바 없음.** 슬림 다크 상단 바(--dark + offwhite 로고 + 행사명), 이하 모바일 1열 카드.

## 5. 컴포넌트 규격

- 카드: --card + 1px --border + r12 + 그림자 1단계. 카드 안 카드 금지(면 분리는 --canvas 인셋으로).
- 버튼: primary(--ink bg/white) · accent(--accent bg/white — 컨펌 발송·승인 등 핵심 CTA 전용, 화면당 1개 원칙) · ghost(1px --border). 높이 36, r6.
- 테이블: 헤더 = 캡션 스타일(--ink-cap, 12/500) + 하단 1px --border-strong, 행 높이 44, hover --accent-tint 30%, 줄무늬 금지.
- 입력: --card bg + --border, focus 시 --accent 1.5px 링. 라벨은 캡션 스타일.
- 진행바: 트랙 --track, 필 --accent, 높이 6, r3. 수치 라벨은 항상 바 **아래** 줄(겹침 재발 금지).
- 빈 상태: 중앙 아이콘(--ink-cap) + 한 줄 설명 + ghost CTA.

## 6. 화면별 depth 지시

- **S0 온보딩**: 캔버스 중앙 카드(maxw 720). 좌측 세로 스텝 레일(완료=오렌지 체크). 유형 카드 선택 시 오렌지 2px 보더 + --accent-tint.
- **S1 홈**: 상단 KPI 4카드(미결 컨펌·지연 태스크·임박·D-day — 숫자 31 tabular). 아래 2열: 좌 '내 할 일'(지시·컨펌 대기 통합 리스트) / 우 최근 활동·인박스. 지연 항목은 negative 도트.
- **S2 보드**: 카테고리 그룹 헤더(브라운 캡션+건수). 항목 카드 좌측에 상태 컬러 스트립 3px — 목록만 봐도 상태 분포가 보이게.
- **S3 상세**: 2단 분할 — 좌(660) 지시 카드(--accent-tint 배경)·미리보기·코멘트, 우(300) 메타 사이드(상태·담당·마감·버전 타임라인 세로선·Drive 링크). 큐시트 항목은 에디터가 좌측 전폭.
- **S4 등록**: 상단 통계 3카드, 탭은 하단 오렌지 언더라인 방식, 테이블 규격 §5 적용.
- **S5 WBS**: 단계 필터 pill(활성=--dark bg/white). 간트 바 = 역할 컬러(§3), 오늘 = 오렌지 세로선, 완료 바는 40% 투명. R&R 카드 좌보더 = 역할 컬러.
- **S6 설정**: 섹션별 카드 분리(멤버/발주처 토큰/유형/연동), 위험 동작(토큰 회수)은 negative ghost.
- **S9 운영계획서**: **종이 메타포** — 캔버스 위 중앙 white 시트(maxw 880, 상단 오렌지 4px 헤어라인). 섹션 번호는 브라운 대형 **01~08**(정본 = `src/components/plan/planSections.ts`의 `PLAN_SECTION_ORDER` — 01 행사개요 · 02 프로그램 · 03 큐시트 · 04 존별 운영 · 05 제작물 리스트 · 06 등록 통계 · 07 비상 대응 · 08 일정), 섹션 진행률은 우측 캡션. 인쇄 CSS는 시트만 출력.
- **발주처 큐·현황**: 모바일 우선 1열. [승인] = accent 대형 버튼, [수정요청] = ghost. 확정본은 positive 뱃지. 375px에서 손가락 타깃 44px 이상.

## 7. 로고 적용

첨부 ZIP → `public/brand/` 배치. 사이드바·다크 바 = `remember-logo-offwhite.png`, 라이트 컨텍스트·인쇄 = `remember-logo-black.png`. 높이 20~24px로만 스케일(비율 왜곡·재염색 금지). 텍스트 폴백은 이미지 로드 실패 시에만.

## 8. 실행·완료 기준 (전부 충족 후 체크아웃)

1. 토큰 파일 1곳 정의 → 전 컴포넌트 치환, `grep -r "gray-\|slate-"` 결과 0건
2. 기존 테스트 114/114 유지 + tsc 클린 (기능 무변경 증명)
3. 스크린샷 11장 제출: S0·S1·S2·S3(일반)·S3(큐시트)·S4·S5 체크리스트·S5 간트·S9·발주처 큐(375px)·발주처 현황(375px)
4. 데모 아티팩트 재발행
