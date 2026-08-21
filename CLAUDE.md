# CLAUDE.md — MICE 커뮤니케이터 구현 지침 v1.2 (Claude Code용)

> 레포 루트에 이 파일을 두고, `docs/mice-communicator-설계서-v1.2.md`를 함께 배치할 것(v1.1은 대체).
> **스키마·상태 머신·API 계약·권한 규칙의 정본은 설계서 v1.2다.** 본 파일은 작업 순서와 규약만 정의한다. 충돌 시 설계서 우선.
> v1.1 변경 핵심: **프론트 우선·서버 후행** — Phase 0~3은 서버 0, Supabase·Drive는 Phase 4~5 이식.
> v1.2 변경 핵심: **지시(requested)→제작→컨펌→운영계획서(S9) 조립 파이프라인** — Phase 3.5로 프론트 증분(여전히 서버 0). Phase 4 이식은 v1.2 스키마 기준.

## 1. 프로젝트 정의
MICE 프로젝트 협업 허브 — 역할별(디자인·운영·등록) 산출물을 Google Drive 단일 저장소에 버전 관리하고, 발주처가 무로그인 토큰 링크로 컨펌하는 웹앱. 파일=Drive, 상태=Supabase의 하이브리드.

## 2. 스택 (고정 — 임의 변경 금지)
- React 18 + Vite + TypeScript + Tailwind (프론트, Vercel 배포)
- Supabase: Postgres + RLS + Auth + Edge Functions(Deno) — **Phase 4부터**
- Google Drive API v3 (전용 운영 계정 OAuth, Production 게시 — 설계서 §2) — **Phase 5부터**
- 알림: Slack Incoming Webhook + Resend(이메일) — **Phase 6부터**

## 3. 레포 구조 (제안 — 조정 시 사유를 PROGRESS.md에 기록)
```
/                      # Vite 앱 (레포는 사용자가 GitHub에 생성)
├ CLAUDE.md            # 본 파일
├ PROGRESS.md          # 세션 상태 (체크아웃 시 갱신 — §9)
├ docs/                # 설계서 v1.1 + 감수 리포트
├ src/
│  ├ pages/            # S1~S8 (설계서 §10)
│  ├ components/
│  ├ providers/        # ★ DataProvider 인터페이스 + mock/ + supabase/(후행)
│  ├ fixtures/         # Mock 픽스처 (샘플 행사 1건: 항목·버전·RSVP·마일스톤·코멘트)
│  ├ lib/              # api client, utils
│  └ types/            # 도메인 타입 — 설계서 §4 스키마와 1:1
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

### 서버 이식 구간 (추후 — 착수 전 사용자 승인)
- **Phase 4 — Supabase 이식**: 마이그레이션(설계서 §4 전체)+RLS(§6.2)+Auth+seed → SupabaseProvider 구현 → MockProvider와 교체(프론트 무수정이 목표)
- **Phase 5 — Drive 이식**: OAuth(운영 계정·Production)·표준 트리(§7.1)·업로드+파일명 규약(§7.2)·프록시 ReadableStream 패스스루+100MB 캡(§7.4)·Changes API 인박스(§7.3)·final 스냅숏 원자성(§7.5) — `supabase/functions/_shared/drive.ts` 모듈화
- **Phase 6 — 알림·cron**: Slack·이메일 유틸 + 이벤트 훅(§9) + reminders cron

## 5. 서브에이전트 병렬 분담 (v1.1)
| 에이전트 | 담당 | Phase | 권장 모델 |
|---|---|---|---|
| A: types-mock | 타입·DataProvider·MockProvider·픽스처 | 1 | Sonnet |
| B: internal-ui | S1~S6 | 2 | Sonnet |
| C: client-view | S7·S8·/c/demo | 3 | Sonnet |
| D: supabase-port | 마이그레이션·RLS·SupabaseProvider | 4 | Sonnet |
| E: drive-core | Drive 서비스 모듈 전체 | 5 | Opus 계열 (인증·스트리밍 난도) |
| F: notify | 알림·cron | 6 | Haiku |
| G: types-v12 | 3.5a 타입 개정·재동결·픽스처 | 3.5 | Sonnet |
| H: brief-ui | 3.5b 지시 흐름 UI | 3.5 | Sonnet |
| I: plan-doc | 3.5c S9 운영계획서 | 3.5 | Sonnet |

실행 순서: Phase 0(메인 단독) → A → **B·C 병렬** → **G → H·I 병렬**(G의 재동결 인터페이스 의존) → [사용자 승인] → D → E → F.
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

## 8. 서버 이식 완료 기준 (Phase 4~6 DoD)
1. Provider 교체 후 프론트 무수정으로 §7의 1~6 전부 실DB에서 재현
2. 토큰: 만료·회수 시 410 / pending·final·shared 코멘트 외 데이터 접근 불가(테스트로 증명)
3. RLS: reg 역할의 design 항목 쓰기 거부 / 비멤버 프로젝트 조회 거부
4. Drive: 표준 트리 자동 생성 / 06 스냅숏 원자성(강제 실패 시 approved 유지+재시도) / 인박스가 직접 업로드 감지
5. OAuth 동의 화면 Production 게시 상태 확인(Testing이면 7일 만료 — 배포 차단 조건)
6. 알림: 컨펌 발송 시 Slack+이메일, D-1 리마인드 cron 동작

## 9. 세션 리추얼 (jc-workspace-ops 세션 규약 준용)
- 체크인: CLAUDE.md+PROGRESS.md 로드 → 3줄 복명(현재 상태/이번 세션 목표/열린 질문) → 사용자 승인 후 개시
- 체크아웃: PROGRESS.md 갱신(상태 요약·완료·미결·다음 스텝·결정 로그·세션 로그·잠금 해제)
- 설계서와 다르게 구현해야 할 사정이 생기면 임의 진행 금지 — PROGRESS.md '열린 질문'에 기록하고 사용자 확인
- **DataProvider 인터페이스 동결 후 변경이 필요하면 반드시 사용자 승인 + 설계서 개정을 동반**
