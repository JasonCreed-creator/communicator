# PROGRESS.md — MICE 커뮤니케이터

> 가변 상태 파일. 매 세션 체크아웃 시 에이전트가 갱신한다 (CLAUDE.md §9 리추얼).

## 1. 상태 요약
- 현재 Phase: **Phase 0 착수 전** (레포 초기 세팅 완료 상태)
- 정본 문서: `docs/mice-communicator-설계서-v1.1.md` (스키마·상태 머신·API SoT)

## 2. 완료
- 설계서 v1.0 → jc-redteam Deep Audit(조건부 보완) → v1.1 개정 확정 (2026-08-19)
- 구현 지침 CLAUDE.md v1.1 확정 — 프론트 우선·서버 후행, DataProvider 어댑터 계층

## 3. 미결
- (없음)

## 4. 다음 스텝
- Phase 0: Vite+TS+Tailwind 스캐폴딩, 라우팅 골격, .env.example
- Phase 1: 도메인 타입 + DataProvider 인터페이스 정의 → **동결 선언을 본 파일 결정 로그에 기록**

## 5. 결정 로그
- 2026-08-19: 아키텍처 하이브리드(파일=Drive, 상태=Supabase) / 발주처 무로그인 토큰 / 컨펌 발송 PM 단독
- 2026-08-19: 프론트 우선·서버 후행 — Phase 0~3 서버 0, Phase 4 착수 전 사용자 승인 필수
- 2026-08-19: 컨펌 발송 조건 = 미리보기 포맷(PDF·PNG·JPG) 버전 / 코멘트 visibility 분리

## 6. 세션 로그
- (아직 없음)

## 7. 세션 잠금
- 잠금 없음 (한 폴더 = 동시 1세션)
