# MICE Communicator

MICE 프로젝트 협업 허브 — 역할별(디자인·운영·등록) 산출물을 Google Drive 단일 저장소에 버전 관리하고, 발주처가 무로그인 토큰 링크로 컨펌하는 웹앱.

## 문서
- **구현 지침**: `CLAUDE.md` (작업 순서·Phase·서브에이전트 분담·DoD)
- **설계 정본**: `docs/mice-communicator-설계서-v1.1.md` (스키마·상태 머신·API·권한)
- **감수 리포트**: `docs/redteam-audit_MICE커뮤니케이터설계서_20260819.md`
- **세션 상태**: `PROGRESS.md`

## 진행 방식
1. Phase 0~3: 서버 없이 프론트 전체 완성 (Mock, 발주처 데모 `/c/demo` 포함)
2. Phase 4~6: Supabase → Google Drive → 알림 순 이식 (착수 전 승인)

Claude Code에서 클론 후 "체크인"으로 시작.

## 스택
React 18 · Vite · TypeScript · Tailwind / Supabase (Phase 4~) / Google Drive API v3 (Phase 5~)
