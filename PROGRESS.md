# PROGRESS.md — MICE 커뮤니케이터

> 가변 상태 파일. 매 세션 체크아웃 시 에이전트가 갱신한다 (CLAUDE.md §9 리추얼).

## 1. 상태 요약
- 현재 Phase: **Phase 1 완료 → Phase 2·3 착수 전** (B: 내부 UI · C: 발주처 뷰 — 병렬 가능)
- 정본 문서: `docs/mice-communicator-설계서-v1.1.md` (스키마·상태 머신·API SoT)
- 브랜치: `main` = 정본, 작업은 `claude/extract-zip-to-repo-t6xstr` → main PR 흐름

## 2. 완료
- 설계서 v1.0 → jc-redteam Deep Audit(조건부 보완) → v1.1 개정 확정 (2026-08-19)
- 구현 지침 CLAUDE.md v1.1 확정 — 프론트 우선·서버 후행, DataProvider 어댑터 계층
- 레포 초기 커밋(문서 5종) + `main` 브랜치 생성 (2026-08-19)
- **Phase 0 — 스캐폴딩** (2026-08-19, PR #1 머지): Vite 6 + React 18 + TS + Tailwind 4,
  S1~S8 라우팅 골격, 내부/발주처 레이아웃, `.env.example`
- **Phase 1 — 타입·어댑터·픽스처** (2026-08-19):
  - `src/types/` — 설계서 §4와 1:1 도메인 타입(엔티티 13종 + 열거형 7종, snake_case 유지)
  - `src/lib/statusMachine.ts` — §5 전이표 단일 정본(7규칙) + 미리보기 포맷 발송 조건 + §7.2 파일명 규약
  - `src/lib/errors.ts` — `{error:{code,message}}` 규약, 400/403/404/409/410 매핑
  - `src/providers/DataProvider.ts` — **인터페이스 v1 동결** (아래 결정 로그)
  - `src/providers/mock/MockProvider.ts` — 픽스처+메모리, 업로드 blob URL, §5·§6 규칙 재현
  - `src/fixtures/sampleProject.ts` — 가상 행사 1건(#RULE-NO-COMPANY 준수): 항목 6(전 상태 분포)·
    버전 6·컨펌 3·코멘트(internal/shared 혼합)·마일스톤 5·RSVP 5·참관객 3·인박스 2·`demo` 토큰
  - 검증: vitest 33개 통과(전이표 409·발송 조건·internal 미노출·수정요청 루프·토큰 410·CSV upsert·통계)
    + `npm run build` 통과

## 3. 미결
- GitHub 기본 브랜치가 아직 `claude/extract-zip-to-repo-t6xstr` — Settings → Branches에서 `main`으로 변경 필요
- Phase 1 PR 리뷰·머지 대기

## 4. 다음 스텝
- Phase 2 (B: internal-ui): S1~S6 실제 UI — Mock 구동, 동결 인터페이스만 호출
- Phase 3 (C: client-view): S7·S8·`/c/demo` — 모바일(375px) 필수, shared 코멘트만 렌더
- B·C는 병렬 가능(둘 다 동결 인터페이스에만 의존). 완료 기준은 CLAUDE.md §7 DoD 1~6

## 5. 결정 로그
- 2026-08-19: 아키텍처 하이브리드(파일=Drive, 상태=Supabase) / 발주처 무로그인 토큰 / 컨펌 발송 PM 단독
- 2026-08-19: 프론트 우선·서버 후행 — Phase 0~3 서버 0, Phase 4 착수 전 사용자 승인 필수
- 2026-08-19: 컨펌 발송 조건 = 미리보기 포맷(PDF·PNG·JPG) 버전 / 코멘트 visibility 분리
- 2026-08-19 (Phase 0): 라우트 확정 — `/`(S1) `/board/:area`(S2) `/items/:itemId`(S3) `/registration`(S4)
  `/schedule`(S5) `/settings`(S6) `/c/:token`(S7) `/c/:token/status`(S8) / Tailwind v4 · react-router v6
- **2026-08-19 (Phase 1): DataProvider 인터페이스 v1 동결 선언** — `src/providers/DataProvider.ts`,
  메서드 35개(세션 1·프로젝트 2·대시보드 2·산출물 7·코멘트 1·마일스톤 4·등록 7·설정 5·인박스 3·발주처 3).
  이후 변경은 **사용자 승인 + 설계서 개정 동반** (CLAUDE.md §9)
- 2026-08-19 (Phase 1): 도메인 타입 필드명 = DDL snake_case 그대로 — Supabase row 무매핑 이식 목적
- 2026-08-19 (Phase 1): 상태 전이 규칙에 '경로(via)' 차원 추가 — 같은 전이라도 status_patch/
  approval_request/client_decision/version_upload/system 경로별로 구분해 우회 진입 차단
- 2026-08-19 (Phase 1): 테스트 러너 vitest 채택(§7 DoD-3 '테스트로 증명' 대비) / Mock의 final 스냅숏은
  항상 성공 가정(실 copy·재시도는 Phase 5) / 내부 코멘트 작성 경로는 addComment, 발주처는 decisions 경유만

## 6. 세션 로그
- 2026-08-19 세션 #1 (Claude Code 원격): 스타터 ZIP 배치·초기 커밋 → main 생성 → Phase 0
  스캐폴딩·검증 → PR #1 머지 → Phase 1 타입·statusMachine·DataProvider 동결·MockProvider·
  픽스처·테스트 33개 → PR 발행. 다음 = Phase 2·3 (B·C 병렬)

## 7. 세션 잠금
- 잠금 없음 (한 폴더 = 동시 1세션)
