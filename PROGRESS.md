# PROGRESS.md — MICE 커뮤니케이터

> 가변 상태 파일. 매 세션 체크아웃 시 에이전트가 갱신한다 (CLAUDE.md §9 리추얼).

## 1. 상태 요약
- 현재 Phase: **Phase 0 완료 → Phase 1 착수 전**
- 정본 문서: `docs/mice-communicator-설계서-v1.1.md` (스키마·상태 머신·API SoT)
- 브랜치: `main` = 정본, 작업은 `claude/extract-zip-to-repo-t6xstr` → main PR 흐름

## 2. 완료
- 설계서 v1.0 → jc-redteam Deep Audit(조건부 보완) → v1.1 개정 확정 (2026-08-19)
- 구현 지침 CLAUDE.md v1.1 확정 — 프론트 우선·서버 후행, DataProvider 어댑터 계층
- 레포 초기 커밋(문서 5종) + `main` 브랜치 생성 (2026-08-19)
- **Phase 0 — 스캐폴딩 완료** (2026-08-19): Vite 6 + React 18 + TS + Tailwind 4,
  S1~S8 라우팅 골격(자리표시 페이지), 내부/발주처 레이아웃 분리, `.env.example`
  - 검증: `npm run build`(tsc+vite) 통과 + 전 라우트(11개) 브라우저 스모크 테스트 통과(375px 뷰포트)

## 3. 미결
- GitHub 기본 브랜치가 아직 `claude/extract-zip-to-repo-t6xstr` — 사용자가 Settings → Branches에서
  기본 브랜치를 `main`으로 변경 필요 (웹 UI rename이 반영되지 않아 에이전트가 동일 커밋으로 `main` 생성함)
- Phase 0 PR(작업 브랜치 → main) 리뷰·머지 대기

## 4. 다음 스텝
- Phase 1: 도메인 타입(설계서 §4와 1:1) + DataProvider 인터페이스 정의
  → **동결 선언을 본 파일 결정 로그에 기록** → MockProvider(픽스처+메모리, 업로드 blob URL)
- Phase 1 완료 후: B(내부 UI)·C(발주처 뷰) 병렬 착수 가능

## 5. 결정 로그
- 2026-08-19: 아키텍처 하이브리드(파일=Drive, 상태=Supabase) / 발주처 무로그인 토큰 / 컨펌 발송 PM 단독
- 2026-08-19: 프론트 우선·서버 후행 — Phase 0~3 서버 0, Phase 4 착수 전 사용자 승인 필수
- 2026-08-19: 컨펌 발송 조건 = 미리보기 포맷(PDF·PNG·JPG) 버전 / 코멘트 visibility 분리
- 2026-08-19 (Phase 0): 라우트 확정 — `/`(S1) `/board/:area`(S2, design|ops) `/items/:itemId`(S3)
  `/registration`(S4) `/schedule`(S5) `/settings`(S6) `/c/:token`(S7) `/c/:token/status`(S8), 404 폴백
- 2026-08-19 (Phase 0): Tailwind v4(@tailwindcss/vite, postcss 설정 無) · react-router-dom v6 채택.
  ESLint는 Phase 0 미도입 — 도입 여부·설정은 Phase 1 착수 시 결정

## 6. 세션 로그
- 2026-08-19 세션 #1 (Claude Code 원격): 스타터 ZIP 배치·초기 커밋 → main 생성 →
  Phase 0 스캐폴딩·검증 → PR 발행. 다음 세션 = Phase 1 (types-mock)

## 7. 세션 잠금
- 잠금 없음 (한 폴더 = 동시 1세션)
