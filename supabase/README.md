# supabase/ — 서버 스프린트 Phase 4 (Supabase 이식)

정본: 설계서 v2.6 §4(스키마)·§6.2(RLS)·§8(API)·§12(키·보안)·§18(전환 절차)·§20(D-Day 런북). 이 폴더는 그 정본을 실행 파일로 옮긴 것이다.

| 파일 | 역할 | 편집 |
|---|---|---|
| `migrations/*.sql` | 스키마·트리거·RLS·RPC 원본 17개(파일명 순 = 실행 순). 전부 멱등 | 손으로 편집 |
| `setup.sql` | migrations를 이어 붙인 **통합 1회 실행 파일**(§18-3) | 생성물 — `npm run supabase:setup` |
| `seed.sql` | 데모 행사 8건(= mock 픽스처 그대로). 선택 실행 | 생성물 — `npm run supabase:seed` |
| `test/local-shim.sql` | 로컬 Postgres에 Supabase의 `auth` 스키마·롤을 흉내 내는 심. **Supabase에 실행 금지** | 손으로 편집 |
| `migrations/…1600_rpc_core.sql`·`…1700_rpc_portals.sql` | RPC — 다단계 쓰기(온보딩·WBS·검토·확정)와 **토큰 경로(`/c`·`/p`)·랜딩 리드·시트 반영**. 설계서 §8의 Edge Function 자리를 SQL 함수로 구현(사용자 결정 2026-09-07 — 배포 단계 0) | 손으로 편집 |
| `../api/` | Vercel Functions — 견적 서버 재계산(`quote-recalc`)·시트 읽기(`sheets`). Edge Functions(Deno) 대신 Vercel(같은 레포·같은 배포, 사용자 결정 2026-09-07) | 손으로 편집 |

## 1. 검증(dev) 프로젝트 만들기 — 기획자님 클릭 절차

1. [supabase.com](https://supabase.com) 로그인 → **New project** → Organization 선택 → 이름 `communicator-dev` → Region **Northeast Asia (Seoul) ap-northeast-2** → Database password는 생성기로 만들고 비밀번호 관리자에 저장(이 세션에는 필요 없음) → Create.
2. 생성 완료 후 **Project Settings → API**:
   - **Project URL** `https://<ref>.supabase.co` 복사
   - **API Keys** 탭 → *Publishable and secret API keys*(신형)에서 `sb_publishable_…` 복사, `sb_secret_…`은 눈 아이콘으로 표시 후 복사. **Legacy anon/service_role 탭은 쓰지 않는다**(§12 — 2026년 말 폐기 예정).
3. **Authentication → Providers → Email**: *Enable Email provider* 켬, *Confirm email* 끔(매직링크만 쓴다), *Secure email change* 기본. **Authentication → URL Configuration**: Site URL에 앱 주소(로컬 `http://localhost:5173`, 배포 후 `https://www.rmb-mice.com`), Redirect URLs에 같은 주소 + `/login` 추가.
4. 세 값을 이 세션 대화로 전달 → Code가 `.env.local`에만 기록한다(커밋 금지, 어떤 산출물에도 값 재인쇄 금지 — CLAUDE.md §9).

## 2. 스키마 올리기 — 두 경로 중 하나

**(가) SQL Editor(클릭)** — §20 T1 정본 방식
1. 대시보드 **SQL Editor → New query** → `supabase/setup.sql` 전문 붙여 넣기 → **Run**. 오류 없이 끝나야 한다(NOTICE는 무해).
2. 같은 방법으로 `supabase/seed.sql`(선택 — 데모 데이터). 운영 프로젝트에는 실행하지 않아도 된다.
3. 본인 계정 연결: `select app.grant_demo_access('본인@이메일');` (seed를 넣은 경우 — admin 승격 + 데모 행사 전부 pm 배정) 또는 `select app.promote_admin('본인@이메일');` (setup만 넣은 경우).
4. 두 번 실행해도 무해하다 — 멱등이 검증돼 있다(§3).

**(나) Management API(자동)** — Code 세션이 대신 실행
- 필요: **Personal Access Token**(계정 아이콘 → Account preferences → Access Tokens → Generate). 계정 전체 권한이므로 완료 후 **Revoke**.
- 이 컨테이너는 DB 포트(5432·6543)가 막혀 있어 `psql` 직결이 불가하고, `https://api.supabase.com/v1/projects/{ref}/database/query`만 통과한다. `npm run supabase:remote -- setup` → `npm run supabase:remote -- seed` 순으로 실행한다(`scripts/supabase-remote.mjs`, .env.local의 `SUPABASE_ACCESS_TOKEN`·`VITE_SUPABASE_URL` 사용). seed는 표 단위 청크(자체 트랜잭션·멱등)로 보낸다.

## 3. 로컬 검증 — 서버 없이 증명하는 것

`npm run supabase:check` (Postgres 16 `psql` + 로컬 클러스터 필요. `LOCAL_PG="host=/tmp/pg-communicator port=54329 user=postgres"` 식으로 접속 문자열을 넘긴다):

1. `test/local-shim.sql` → `setup.sql` **1회** → `setup.sql` **2회**(멱등, §8 DoD 7) → `seed.sql` 1회·2회(행 수 불변)
2. RLS 거부 3종(DoD 26): staff→quotes 0행·insert 거부 / 비멤버→project 0행 / anon(토큰 경로)→quotes 권한 없음
3. 역할-영역: reg의 deliverable 생성 거부, design의 ops 항목 생성 거부, design의 design 항목 생성 허용
4. 트리거 가드: §5 전이표 밖 전이 거부·표 안 전이 허용 / 확정 견적 금액 변경 거부 / has_cost=false 버킷 발주액 거부 / 종료 행사 쓰기 거부(authenticated)·허용(서비스) / onboarded_at 되돌리기 거부 / 프로필 app_role 자가 승격 거부 / version_no 자동 증가 / auth 가입 시 프로필 자동 연결 / 허용 도메인 밖 가입 거부
5. RPC: add_member(배정·중복 409·design 403) / remove_member 마지막 PM 409 / remove_person 배정 409 / complete_onboarding(이미 완료 409·미완료 기록) / transition_deliverable(허용·코멘트 422·전이표 밖 409) / upload_version 자동 draft / request_approval(pm·pdf) / finalize_quote(staff 403) / **토큰 경로(anon)**: client_queue·client_status(금액 키 0건·internal 코멘트 0건·회수 410·없는 토큰 404) · client_decide(승인→final·수정요청 코멘트 필수·shared 강제) · partner_portal(contract_amount·price 0건) · partner_submit(자기 항목만) · submit_landing_lead(성함 필수·정상 적재) · anon은 내부 RPC 실행 불가 / 시트: check_sheet_updates·apply_sheet_diff(낡은 버전 409·pm·reg만) — **총 85항목**

## 3b. dev 실검증 — 실 Supabase에서 증명하는 것 (Phase 4 3단 · DoD 26)

`npm run supabase:verify` (`.env.local`의 URL·publishable·secret 3키만 읽는다. PAT 불필요. `--dry`는 번들 로드·계획 출력만, `--keep`은 만든 검증 데이터 보존):

1. **사전 점검** — `app_config` 조회로 setup.sql 적용 여부(미적용이면 즉시 중단·안내), seed 여부(있으면 데모 토큰 경로 검사 포함), 허용 도메인(제한이 있으면 그 도메인으로 검증 계정을 만든다)
2. **로그인 = 매직링크 CI 대체(CLAUDE.md 4d)** — `admin.generateLink(magiclink)` → `verifyOtp(token_hash)`. 메일 발송·수신 없이 같은 verify 경로를 탄다. 실수신 왕복은 §20 D-Day 스모크
3. **DoD 1~25를 SupabaseProvider 흐름으로 재현** — 이 실행이 만든 행사 1건 안에서: 온보딩(WBS 37·R&R·컴플라이언스 시드, 재완료 409) · 담당자/주소록(마지막 PM 409·배정 있는 사람 삭제 409+행사명) · 컨펌 루프(승인→final, 수정요청 코멘트 필수→재업로드 draft 복귀, internal 코멘트 /c 비노출, 미리보기 포맷 422, 회수 토큰 410) · 지시 발행(requested→draft) · 등록(CSV upsert·체크인·통계) · 홈·S9(금액 키 0건) · 견적(서버 재계산·조작 시도 무시·staff 403·버전 체인·확정 잠금·§16 핸드오프 상호 링크) · 정산(버킷 9종 rc/ld·항등식·has_cost 422·부가세 분리) · 랜딩(13섹션·slug 스코프·anon 리드 → attendees) · 정형 문서(시나리오 시드 409·큐 내보내기 보존·운영가이드 4섹션·doc-snapshot) · 시트 연동(데모 모드 서버 함수: connect·감지만·낡은 버전 409·KPI) · 주최형(파트너 격리·검토 루프·R-H1 보존)
4. **RLS 거부 3종(DoD 26)** — staff→quotes 0행·insert 거부 / 비멤버→project 0행(REST·provider 양쪽) / anon→quotes·deliverables·settlement_items 권한 없음 + 역할-영역 403·app_role 자가 승격 거부
5. **서버 함수는 배포 전이라 같은 프로세스의 로컬 HTTP 서버가 `api/_lib` 핸들러를 감싼다** — provider는 `apiBase`만 다르고 코드 경로는 Vercel 배포본과 같다
6. **정리** — 만든 행사(cascade)·견적·auth 사용자·프로필을 지운다. 시드 행사는 읽기만 한다

실측(2026-09-07, dev 프로젝트): setup 2회 멱등 · seed 2회 행 수 불변 · **verify 83/83**(1회차 79/83 → 토큰·견적 참조 FK의 on-delete 규칙 추가 후 재실행, §5 표 참조).
컨테이너의 Chromium은 프록시 때문에 외부 접속이 끊겨 실서버 브라우저 E2E는 이 스크립트 범위 밖이다 — 화면 렌더는 mock 스위트가, 서버 계층은 이 스크립트가 본다.

## 4. 키 취급 규약 (CLAUDE.md §9 · 설계서 §12)

- `.env.local`(gitignore)에만: `VITE_SUPABASE_URL` · `VITE_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` · (임시) `SUPABASE_ACCESS_TOKEN`
- `sb_secret_…`·`sbp_…`는 **절대 `VITE_*`로 두지 않는다**(프론트 번들에 구워진다). Vercel 서버 env(`api/` 함수)·검증 스크립트에서만 읽는다.
- 옛 Configurator 프로젝트의 하드코딩 키는 사용 금지(§2).

## 5. 정본과 다른 지점 (Phase 4 개정 대상 — PROGRESS 결정 로그 참조)

| 지점 | 설계서 §4 요약 | 구현 | 근거 |
|---|---|---|---|
| `profiles.id` | `references auth.users` | 독립 PK + `auth_user_id`(null 허용, 첫 로그인 시 이메일로 연결) | §4-2b 담당자 마스터 — 로그인 전 사람이 주소록·배정에 존재해야 한다 |
| `references auth.users` FK 전부 | auth.users | `profiles(id)` | 같은 이유 |
| `profiles.title·phone·org` / `client_contacts.phone` | 없음 | 추가 | 3.18.1 노출 계약 + 사용자 승인 2026-09-07(3.19③) |
| `sheet_connections.mapping[].field` | 7종 | + `sheet_status` | 사용자 승인 2026-09-07(3.17③) |
| `landing_daily_metrics` 열 이름 | pageviews·visitors·form_views·day | TS 정본 `views·unique_visitors·form_starts·date` | entities.ts "DDL과 1:1" 원칙 — 코드가 정본 |
| `sheet_source_rows` 표 | 없음(mock 전용 타입) | 신설 — Sheets API 읽기 결과의 서버 적재 자리 | §24 차이 계산이 원본 행 ↔ attendees 비교이므로 서버에도 같은 자리가 필요 |
| `app_config` 표 | 없음(env) | 신설 — 허용 도메인의 서버측 정본 | §12 허용 도메인 강제를 DB 트리거로 — "키 교체+setup.sql 1회" 제약 안에서 가능한 유일한 서버측 게이트 |
| 토큰·견적 참조 FK의 on-delete | 미기재 | `approvals.decided_via_token`·`settlement_boards.quote_id` = set null, `comments.author_token` = cascade | 2026-09-07 dev 실측 — 행사 cascade 삭제가 막혔다. 회수·확정은 삭제가 아니라 운영 경로 무영향. 코멘트는 작성자 없는 행을 남길 수 없어 cascade(PROGRESS 결정 로그) |
