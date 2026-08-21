# PROGRESS.md — MICE 커뮤니케이터

> 가변 상태 파일. 매 세션 체크아웃 시 에이전트가 갱신한다 (CLAUDE.md §9 리추얼).

## 1. 상태 요약
- 현재 Phase: **Phase 0~3 완료 — 서버 없는 구간(프론트) 종료**. Phase 4(Supabase 이식)는 착수 전 사용자 승인 필요
- 정본 문서: `docs/mice-communicator-설계서-v1.1.md` (스키마·상태 머신·API SoT)
- 브랜치: `main` = 정본, 작업은 `claude/extract-zip-to-repo-t6xstr` → main PR 흐름

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

## 3. 미결
- GitHub 기본 브랜치가 아직 `claude/extract-zip-to-repo-t6xstr` — Settings → Branches에서 `main`으로 변경 필요
- Phase 2·3 PR 리뷰·머지 대기

## 4. 다음 스텝
- **Phase 4 — Supabase 이식** (★착수 전 사용자 승인 필수): 마이그레이션(§4)+RLS(§6.2)+Auth+seed →
  SupabaseProvider 구현 → MockProvider 교체(프론트 무수정 목표)
- 이후 Phase 5(Drive) → Phase 6(알림·cron)

## 5. 결정 로그
- 2026-08-19: 아키텍처 하이브리드 / 무로그인 토큰 / 컨펌 발송 PM 단독 / 프론트 우선·서버 후행 / 미리보기 포맷 발송 조건
- 2026-08-19 (Phase 0): 라우트 확정 / Tailwind v4 · react-router v6
- 2026-08-19 (Phase 1): **DataProvider v1 동결(35메서드)** — 변경은 사용자 승인+설계서 개정 동반 /
  타입 snake_case 유지 / 전이 규칙 via 차원 / vitest 채택
- 2026-08-22 (Phase 2·3): 상태 라벨·뱃지 색 단일 정본 `src/lib/labels.ts`(시맨틱 고정, 라벨 동반) /
  발주처 승인 확인은 네이티브 confirm 대신 인라인 확인 패널(모바일 UX·테스트 안정성) /
  S3 Drive 폴더 링크는 Phase 5로 보류(Drive 미연동) / S6 토큰 값 비노출(링크 복사 버튼만) /
  favicon 인라인 SVG 추가
- 2026-08-22: B·C 서브에이전트 병렬 실행(§5) — 파일 경계 분리로 충돌 0, 메인이 통합 검수

## 6. 세션 로그
- 2026-08-19 세션 #1: ZIP 배치→main 생성→Phase 0(PR #1 머지)→Phase 1(동결·테스트 33, PR #2 머지)
- 2026-08-22 세션 #1 계속: Phase 2(B)·Phase 3(C) 병렬 구현 → 메인 통합 검수(DoD 1~6 브라우저 증명,
  스크린샷 11장 사용자 공유) → PR 발행. 다음 = Phase 4 (사용자 승인 대기)

## 7. 세션 잠금
- 잠금 없음 (한 폴더 = 동시 1세션)
