# MICE 커뮤니케이터 — 시스템 설계서 v2.6

| 항목 | 내용 |
|---|---|
| 문서 상태 | **v2.6 확정 — UI/UX 고도화(패턴 정본) + 등록 구글 시트 연동 + 행사 유형 4분류(§25 증분)**. §25 증분(Phase 3.18, 2026-08-29): `projects.format`(conference/dms/exhibition)·`psa_enabled` 신설 — **format 권한은 3가지로 한정**(온보딩 시드·견적 모델·복합 게이트 구성요소), 상시 모듈 게이트는 기존 축 유지. 판매 플래너(dms·exhibition 판매형 도구) 신설, conference 견적 경로 **무접촉**. **DataProvider v11 재동결**(v10은 3.17c에서 소진). 초청제 모드·PSA 모듈은 미착수(§25.6·§25.5). **시각안 없이 진행** — 사용자 지시로 생략, 대체 게이트는 스크린샷 검수. 앞선 v2.6 — (2026-08-28 핸드오프 채택, 2026-08-29 챗 실측 검수 반영). ① 공통 패턴 정본 = 디자인지시서 §7-1(배지 의미 4단계+중립·표 정본·빈 상태 5종·시각화 어휘·인쇄·외부 지면) ② 등록 시트 연동 §24 — 시트가 정본·앱은 읽기만, 자동 감지는 하되 **반영은 항상 사람 확인 후**, 필드 소유 분리, 하드 삭제 금지, 동시 접속 낙관적 잠금(§24.3 R-S1~R-S4) ③ **체크인 배치 = B안(사이드바 S-12 별도 화면)** — 3.17 구현은 A안이었고 이는 Code 판단, 3.17.1에서 B안으로 복원 ④ **DataProvider v10 재동결(10메서드 추가 · 120메서드)**, importVendorQuote는 v11 예약. 직전 v2.5 확정 — **운영보드 재구성: 문서 유형 우선 + 시나리오·운영가이드 빌더** (2026-08-28, 시각안 3화면·구조 결정 5가지 전부 승인 — 계기: 사용자 데모 실측 피드백 "운영보드에 큐시트·시나리오·운영가이드가 들어가야 하고 항목별 전용 빌더가 필요"). ① 운영보드 1면 = 유형 카드 4종(큐시트/시나리오/운영가이드/기타 제작물) — "카테고리가 빌더를 결정한다" 원칙의 보드 레벨 확장, 유형 선택 시 빌더 인라인 ② 시나리오 빌더(프로그램표 뼈대 자동·진행 블록·큐시트로 내보내기)·운영가이드 빌더(존/역할/비상/연락망 4섹션·원본 연동 stale 확인) 신설 — 정형 테이블 §4-27, 컨펌·스냅숏은 큐시트 규약 재사용 ③ S9 ⑦비상 대응 섹션 신설·②시나리오 펼침·③존운영 확장(§10.2) ④ **DataProvider v9 재동결(8메서드 · 110메서드)**, importVendorQuote는 v10 예약 순연. 구현 = Phase 3.16(mock·3.15.1 머지 후). 직전 v2.4.1 확정 — **패치: 3.15 머지본 챗 감수(2026-08-27, 조건부 보완) 반영** — ① §15.3b 주최형 R&R 4카드·§15.3c 규약 카드 3종 정의(감수 M4 — 설계 공백 보완, 가정) ② projects에 파트너 안내 필드 2종(partner_guide_url·partner_contact_email — DataProvider v8.1, 필드 추가만) ③ 데모 아티팩트 charset 선두 보장 규약(§13b — 감수 M1, 미선언 서빙 백지 실증) ④ 폴리시 P1~P6은 CLAUDE.md 무개정·지시문 3.15.1로 수행. 직전 v2.4 확정 — **주최형(파트너) 확장 + 견적서 임포트** (2026-08-27, 시각안 4화면·구조 결정 7가지 전부 승인). ① 프로젝트 성격 축 `kind`(대행형/주최형) 신설 — 주최형은 파트너 N곳이 무로그인 링크 `/p/{token}`으로 제출하고 우리가 검토(기존 상태머신 방향 반전 재사용), 파트너 간 완전 격리·계약액 비노출(§21) ② 직접 설계한 견적서 xlsx 업로드 → 자동 인식 → 확인 큐 → 요소 분배 4종(§22, 실서식 3형 계약). DataProvider **v8 재동결(16메서드 · 102메서드)**, WBS 3번째 템플릿 "주최형" 12건(§15.3). 구현은 Phase 3.15(mock 우선·서버 0). 직전 v2.3 확정 — **서버 스프린트: 키 최후 주입 실행 개정(기능 무변경)** (2026-08-27, 범위 게이트 승인). Phase 4(Supabase)·5(Drive)·6(알림)을 운영 자격증명 없이 D-Day(8/31 월, 첫 출근일) 전에 전부 구현·검증하고, D-Day에는 §20 런북의 자격증명 주입(서버 3키·Slack 웹훅·Drive OAuth)만으로 실전 투입 가능 상태를 만든다. 사전 검증은 개발용 무료 Supabase 프로젝트, API 키는 신형 체계(sb_publishable/sb_secret — §12, 웹검증 2026-08-27) 채택. 직전 v2.2 확정 — **정산보드(S-10) 신설** (2026-08-23, 내부정산 실물 13건 분석 기반·시각안 승인). 마진 식(항목 마크업 + PCO 기획료 + RSVP 운영비, 리드젠 제외)을 실물 2건에서 원 단위 검산하고 §19에 정본화한다. §4-23 테이블 4종 + §4-24 계약 R-S1~R-S10, DataProvider **v7 재동결(11메서드 · 86메서드)**. 직전 v2.1 — **랜딩보드(S-3) 정본화 + 랜딩 스코프 계약 + 가격 상수 v1.1 정의** (2026-08-23). 코드가 선행한 Phase 3.13 랜딩보드를 §4-19~§4-22·§8·§10에 정본으로 흡수하고, `listLandingPages`·`createLandingPage`가 현재 행사가 아닌 사용자 첫 멤버십으로 스코프되던 결함을 계약으로 못박는다(§4-21). LED 오퍼레이팅·중계 단가 분리(§17.4)와 골든 데이터셋 출처 규약(§17.3)을 확정. 직전 v2.0: **견적 Configurator(jsx-easy-shift) 단일 플랫폼 통합** (2026-08-22, 시각안 3화면 승인 · 읽기 분석 보고 기반): 견적 모듈 S-2 · 견적→행사 핸드오프 · 새 Supabase 프로젝트 · 인프라 전환 절차. 직전 v1.5: **다중 행사(프로젝트 셀렉터·행사 목록) + 행사 설정 메뉴(개요·담당자 입력) 확장** (2026-08-22, 시각안 3화면 승인). 직전 v1.4.1: v1.4(유형별 WBS·R&R, 2026-08-22 시각안 승인)에 **Phase 3.6·3.7 구현 해석 정본화** 패치: projects.onboarded_at 확정(사용자 승인 2026-08-22) · 임박/지연 배타 산식 · 일반형 28건 파생 규칙 · 재전개 보존 규칙 · 큐시트 스냅숏 mock 규약 (Code PROGRESS 열린 질문 ①~⑤ 종결) |
| 목적 | Claude Code가 본 문서만으로 추가 질문 없이 구현 착수 |
| 정본 관계 | 스키마·상태 머신·API 계약은 본 문서가 SoT. 구현 지침·작업 순서는 동봉 CLAUDE.md |
| 확정 결정 | 아키텍처=하이브리드(파일=Drive, 상태=Supabase) / 발주처=무로그인 토큰 링크 / 컨펌 발송=PM 단독 / 업로드=웹앱 경유 원칙+Drive 감지 인박스 / 등록 1차=CSV 임포트 / **구현 순서=프론트 우선·서버 후행 이식(DataProvider 어댑터 계층)** / **v1.2: 지시(requested)→제작→컨펌→운영계획서(S9) 조립 파이프라인 — 웹 문서 우선, PPTX·발주처 뷰는 2차** / **v1.3: S0 온보딩(개요→유형→담당자) → 유형(일반형·모객형) 모듈 토글 → 큐시트 정형 에디터(3채널 콘솔, 컨펌 스냅숏 자동)** / **v1.4: 유형별 WBS 템플릿 자동 전개(Configurator 37태스크 이식·호환 코드 체계) + 역할별 R&R 카드** / **v1.4.1: 온보딩 완료 상태는 projects.onboarded_at 컬럼이 정본(DataProvider v3.1 재동결)** / **v1.5: 다중 행사 — 사이드바 프로젝트 셀렉터+S-1 행사 목록, "행사 설정" 메뉴 상시 노출(①개요 ②담당자 ③유형·연동), S0 위저드=같은 폼의 단계형, 행사개요 단일 원천(S9 ①은 읽기 조립)** / **v2.0: 견적 모듈(S-2) 흡수 — 가격 엔진·베뉴 DB를 `src/modules/quote`로 이식, 견적 확정→행사 생성 프리필, 견적은 로그인 내부 전용(금액은 발주처·운영계획서에 구조적 비노출), 데이터는 새 Supabase 프로젝트(옛 Configurator DB는 1회 임포트 후 폐기), 도메인 rmb-mice.com 재연결·jsx-easy-shift 아카이브** |

---

## 1. 시스템 개요

MICE 프로젝트 착수 시 역할별(디자인·운영·등록·발주처) 산출물을 **단일 저장소(Google Drive)** 에 업로드·관리하고, **발주처 컨펌까지 한 화면**에서 처리하는 협업 허브.

**핵심 설계 원칙**
1. 파일 실체는 전부 Google Drive에 산다. 앱이 사라져도 파일과 폴더 구조는 온전히 남는다.
2. 워크플로우 상태(컨펌·버전·RSVP·코멘트)는 Supabase(Postgres)가 갖는다.
3. 발주처는 로그인 없이 토큰 링크 하나로 컨펌과 현황 확인만 한다. 내부 초안·단가·정산은 구조적으로 노출 불가.
4. 디자인보다 기능·편의성 우선 — 화면은 최소, 클릭 수는 최소.
5. Drive 공유 권한은 앱이 절대 변경하지 않는다. 파일 접근은 항상 앱 프록시 경유.
6. (v1.2) 커뮤니케이터의 최종 산출물은 운영계획서다 — 지시서·업로드·컨펌·등록의 모든 입력이 문서 섹션으로 실시간 조립된다.
7. (v2.0) 행사의 생애는 **견적 → 설정 → 운영 → 결과**로 한 앱 안에서 이어진다. 견적(단가·총액)은 내부 로그인 화면과 Excel에만 존재하며, 발주처 토큰 경로·운영계획서·활동 로그 어디에도 금액이 흐르지 않는다(#RULE-NO-PRICE-TO-CLIENT).
8. (v2.4) 행사에는 **성격(kind)** 이 있다 — **대행형**(수주: 우리가 만들고 발주처가 컨펌)과 **주최형**(자체 주최: 파트너가 제출하고 우리가 검토). 성격은 event_type(일반형·모객형)과 직교 2축이며, 유형 토글과 같은 표시 계층 원칙(전환 시 데이터 손실 없음)을 따른다. 정본은 §21.

---

## 2. 아키텍처

```
┌─ 내부 팀 (로그인: Supabase Auth 이메일) ─┐   ┌─ 발주처 (무로그인: /c/{token}) ─┐
└──────────────┬─────────────────────────┘   └──────────────┬─────────────────┘
               ▼                                            ▼
        React + Vite + TypeScript SPA (Vercel 호스팅)
               │
               ▼
        Supabase ──────────────────────────────────────────────
        ├ Postgres (스키마 §4) + RLS (§6)
        ├ Auth (내부 멤버)
        └ Edge Functions (Deno) — API 계약 §8
               │
               ├──> Google Drive API v3  (파일 원본·폴더 트리·프록시 스트리밍)
               ├──> Slack Incoming Webhook (내부 알림)
               └──> 이메일 발송 (Resend 등 — 발주처 토큰 링크·리마인드)
```

**기술 스택**

| 계층 | 선택 | 비고 |
|---|---|---|
| 프론트 | React 18 + Vite + TypeScript + Tailwind 4 | v2.0: Configurator의 가격 엔진·베뉴 DB·Excel 내보내기(ExcelJS)를 모듈로 흡수. shadcn/Radix·Tailwind 3는 도입하지 않음(핵심 화면이 인라인 스타일이라 토큰 재스킨으로 충분) |
| 백엔드 | Supabase Edge Functions (Deno) | 서버 별도 운영 없음. v2.0: **새 Supabase 프로젝트**(ap-northeast-2) — 옛 Configurator 프로젝트는 RLS 개방·무인증·키 하드코딩으로 폐기(§18) |
| DB | Supabase Postgres + RLS | Free tier로 MVP 충분 |
| 파일 | Google Drive API v3 | 스토리지 비용 0 |
| 배포 | Vercel(프론트) + Supabase(백엔드) | 저비용 |

**Drive 인증 (v1.1 개정 — 감수 M-1 반영, 웹검증 2026-08-19)**: **전용 운영 Google 계정**(개인 계정 아님)의 OAuth. 최초 1회 동의 → refresh token을 Supabase Vault/환경변수에 저장 → Edge Function이 모든 Drive 작업을 대행. 파일 소유권이 운영 계정으로 단일화되고, 토큰 유출 시에도 개인 Drive가 아닌 운영 계정만 노출된다.
- **OAuth 동의 화면은 반드시 Production 게시** — External+Testing 상태의 refresh token은 7일 만료로 매주 재인증 장애가 난다. Drive 전체 scope는 restricted scope이나, 100인 미만 개인용 앱은 '미확인 앱' 경고 통과로 사용 가능(정식 검증은 불요).
- OAuth scope: `https://www.googleapis.com/auth/drive` (전체). `drive.file` scope는 앱이 만든 파일만 보여 '직접 업로드 감지'가 불가하므로 전체 scope + **앱 로직에서 프로젝트 루트 폴더 하위로만 접근 제한**.

### 2.1 구현 전략 — 프론트 우선·서버 후행 (v1.1 확정)

프론트는 Supabase client를 **직접 호출하지 않는다**. 모든 데이터·파일 접근은 `DataProvider` 인터페이스 경유(도메인 타입은 §4 스키마와 1:1):

```
프론트(S1~S8) → DataProvider 인터페이스 (착수 시점에 동결 — freeze)
                 ├ 1단계  MockProvider    : 픽스처+메모리, 업로드=blob URL (서버 0)
                 ├ 2단계  SupabaseProvider: DB·Auth·RLS 이식 (파일은 여전히 mock)
                 └ 3단계  DriveFileStore  : Drive 업로드·프록시·스캔·스냅숏 이식
```

- **인터페이스 동결이 전제 조건** — 동결 없이는 이식 시 전 화면 재작업이 발생해 어댑터의 이점이 소멸한다 (감수 Steelman 조건부 판정)
- 동결 이력: v1(35메서드, Phase 1) → v2(41, v1.2 승인) → v3(53, v1.3·v1.4 승인) → v3.1(v1.4.1 — 필드 추가만) → v4(v1.5 승인 — 다중 행사 5메서드) → **v5(v2.0 승인 — 견적 모듈: `listQuotes`·`getQuote`·`createQuote`·`saveQuoteVersion`·`finalizeQuote`·`createProjectFromQuote`·`exportQuoteXlsx`·`listComplianceCards`·`updateComplianceCard` **9메서드** 추가, `Project`에 모객 필드(guarantee_pax·targeting·kpi_show_rate·quote_id), `WbsTask.target` 추가. 기존 시그니처 불변)** → **v6(v2.1 승인 — 랜딩보드 8메서드: `listLandingPages`·`getLandingPage`·`createLandingPage`·`updateLandingPage`·`publishLandingPage`·`deleteLandingPage`·`listLandingMetrics`·`submitLandingLead`)** → **v6.1(v2.1 정정 — 스코프 결함 해소: `listLandingPages(projectId)`·`createLandingPage(projectId, input)`로 시그니처 변경. 나머지 6메서드는 landingId로 프로젝트를 역참조하므로 불변)** → **v7(v2.2 승인 — 정산보드 11메서드: `getSettlementBoard`·`createSettlementBoard`·`rebaseSettlementBoard`·`createSettlementBucket`·`updateSettlementBucket`·`deleteSettlementBucket`·`createSettlementItem`·`updateSettlementItem`·`deleteSettlementItem`·`listVendors`·`upsertVendor` = **86메서드**. 기존 시그니처 불변. 업로드 파싱(`importVendorQuote`)은 서버 의존이라 v8 예약 슬롯으로 남긴다 — §19.5)**. v5부터는 MockProvider와 SupabaseProvider가 동시에 이 인터페이스를 구현한다(Phase 4). 매 해제는 사용자 승인+본 문서 개정 동반이 조건 — **v6은 이 조건을 어기고 코드가 선행했다(2026-08-22 Phase 3.13). v2.1이 사후 정본화하며, 재발 방지 규칙은 §4-21 말미에 둔다**
- **현재 행사 컨텍스트(v1.5)**: 프론트는 `PROJECT_ID` 상수를 쓰지 않는다. `ProjectContext`(React)가 선택된 projectId를 보관(localStorage `communicator.currentProjectId`, 없으면 목록 첫 진행 중 행사)하고 모든 화면은 컨텍스트에서 읽는다. 라우트는 불변(`/`, `/board/...`) — URL prefix(`/p/:projectId/...`) 방식은 2차(북마크 공유 요구 발생 시)
- Mock 단계 산출: UI/UX 전체 검증 + 발주처 데모 라우트(`/c/demo`)
- 리스크 직렬화: 최대 리스크인 Drive 계층(OAuth·프록시)을 최후행에 배치

---

## 3. 모듈 구조 (6개)

| # | 모듈 | 하위 기능 | 데이터 성격 |
|---|---|---|---|
| 1 | 디자인 | 디자인의뢰서(양식+첨부) / 키비주얼 / 제작물(품목: 배너·명찰·백월·리플렛·사이니지 등) | deliverable + 버전 파일 |
| 2 | 운영 | **(v2.5) 문서 유형 우선 보드** — 큐시트(정형 3채널 큐)·시나리오(진행 대본 빌더)·운영가이드(존/역할/비상 빌더)·기타 제작물(파일형). 유형 선택 시 해당 빌더 인라인 | deliverable + 정형 테이블(cues·scenario_blocks·guide_sections) |
| 3 | 등록 | 모객 RSVP(리스트·발송상태·응답) / 참관객 등록 / 참관객 관리(체크인·통계) | 정형 데이터 테이블 |
| 4 | 발주처 | 컨펌 큐(전 영역 컨펌요청 집결) / 운영현황 대시보드 | 뷰 전용(자체 데이터 없음) |
| 5 | 일정·WBS·R&R (v1.4 승격) | 유형별 WBS 템플릿 자동 전개(체크리스트·간트) / 담당별 R&R 카드 / D-day·컨펌 기한 | wbs_tasks·role_charters + approvals.due_at |
| 6 | 공통 | **행사 목록·프로젝트 셀렉터·행사 설정(v1.5)** / 홈 미결 대시보드 / 기획 문서 / 회의록·의사결정 로그 / 예산·정산 문서함 / 알림 / 미등록 파일 인박스 | 혼합 |
| 7 | 운영계획서 (v1.2) | S9 웹 문서 — 01 개요·02 프로그램·03 큐시트·04 존운영·05 제작물 리스트·06 등록 통계·07 비상 대응·08 일정 자동 조립 + 진행률 + 인쇄 CSS | 뷰 + 정형 데이터 |
| 9 | 파트너 (v2.4, 주최형 전용) | 파트너 목록·등급(tier)·제출 진행(S-11) / 파트너 제출 뷰(`/p/{token}`) / 제출물 검토 큐 / 마감 타임라인 | partners·partner_tiers·기존 deliverables(inbound) |
| 8 | 견적 (v2.0, S-2) | 5스텝 에디터(규모·유형 → 베뉴 → 옵션 → 확인·확정 → 행사 만들기) / 버전·확정 잠금 / 섹션별 산출(s1 베뉴·s2 시스템·s3 디자인·s4 운영·s5 PCO 기획료·옵션·모객·참관객) / Excel 내보내기 / 확정 견적 → 행사 생성 프리필 / **(v2.4) 견적서 임포트 — 업로드→확인 큐→분배(§22)** | quotes + 코드 상수(단가·베뉴 DB 20곳·옵션 12종) + quote_imports |

- 회의록·예산 문서는 별도 모듈 UI 없이 deliverables의 area='common' 카테고리로 수용 (컨펌 루프 없이 보관·버전만).
- (v1.3) 행사 유형 토글: event_type='general'(일반형)이면 등록 모듈이 경량 모드(참관객 명단·체크인만 — RSVP 파이프라인·모객 대시보드·리마인드 숨김), 'recruiting'(모객형)이면 전체 노출. 스키마는 동일하고 표시 계층 토글이라 유형 변경 시 데이터 손실 없음.

---

## 4. 데이터 모델 (Postgres DDL 요약)

> 타입·제약은 아래가 정본. 마이그레이션 파일은 이 순서대로 작성.

```sql
-- 열거형
create type member_role as enum ('pm','design','ops','reg');
create type deliverable_area as enum ('design','ops','common');
create type deliverable_status as enum
  ('requested','draft','internal_review','pending_approval','changes_requested','approved','final');
  -- v1.2: requested = PM 지시 발행 상태 (산출물 없음)
create type approval_decision as enum ('approved','changes_requested');
create type invite_status as enum ('none','sent','accepted','declined');
create type attendee_channel as enum ('rsvp','onsite','import');
create type event_type as enum ('general','recruiting');   -- v1.3: 일반형·모객형
create type project_status as enum ('active','closed');      -- v1.5
create type app_role as enum ('admin','sales','staff');      -- v2.0: 전역 역할 (견적 권한은 admin·sales)
create type quote_status as enum ('draft','proposed','accepted','archived','superseded'); -- v2.0 (Configurator estimates.status 승계)
create type compliance_kind as enum ('internal','client');   -- v2.0 컴플라이언스 카드 종류

-- 1. 프로젝트
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,          -- 행사 약칭 (파일명 규약에 사용, 전역 유일)
  event_date date,                    -- 시작일 (WBS 전개·D-day 기준)
  event_end_date date,                -- v1.5 종료일 (null=당일 행사)
  start_time time, end_time time,     -- v1.5 운영 시간
  expected_headcount int,             -- v1.5 예상 인원
  seating text,                       -- v1.5 좌석 형태 (극장식·라운드·교실식·스탠딩·혼합 — 자유 텍스트, enum 아님)
  organizer text,                     -- v1.5 주최·주관
  target_audience text,               -- v1.5 참가 대상
  status project_status not null default 'active',  -- v1.5 active|closed (종료 행사는 읽기 전용·목록 접힘)
  closed_at timestamptz,
  -- v2.0 모객형 전용 (Configurator events·special_notes 타겟팅 흡수) — 일반형이면 null·UI 숨김
  guarantee_pax int,                  -- 보장 인원 (events.guarantee_pax)
  kpi_show_rate numeric,              -- 쇼업 KPI % (events.kpi_show_rate)
  targeting jsonb,                    -- 타겟팅 5축 {company_size[],title[],industry[],job[],region[]} (leadTargeting.ts 상수 키)
  quote_id uuid,                      -- v2.0 확정 견적 링크 (quotes.id, 핸드오프 시 기록; FK는 quotes 생성 후 alter)
  drive_root_folder_id text,          -- 표준 트리 루트
  slack_webhook_url text,
  -- v1.2 행사개요 (운영계획서 §행사개요 소스)
  event_type event_type not null default 'general',  -- v1.3 S0 온보딩에서 선택
  -- v2.6 §25 행사 유형 4분류 — format의 권한은 3가지뿐(온보딩 시드·견적 모델·복합 게이트 구성요소).
  -- 상시 모듈 게이트는 기존 축이 유지한다(파트너 보드=kind, 등록 깊이=event_type, PSA=psa_enabled).
  format event_format not null default 'conference',  -- conference|dms|exhibition
  psa_enabled boolean not null default false,         -- 비즈매칭(PSA) 옵션
  audience_model text,                                -- 'invite'|'open' — dms 기본 'invite'
  theme text, venue text, mc_name text,
  overview_items jsonb,               -- 자유 키-값 개요 불릿 (대상·주차 안내 등)
  onboarded_at timestamptz,           -- v1.4.1 S0 온보딩 완료 시각. null=미완료(본체 라우트 차단 기준). pm이 완료 처리 시 now() 기록, 이후 불변
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- 1b. 프로필 (v2.0 — 전역 역할. 견적 메뉴 접근은 admin·sales)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  email text not null,
  app_role app_role not null default 'staff',
  created_at timestamptz default now()
);
-- 신규 가입은 auth 트리거로 profiles 자동 생성(app_role='staff'), 승격은 admin만

-- 2. 멤버·역할
create table project_members (
  project_id uuid references projects on delete cascade,
  user_id uuid references auth.users,
  role member_role not null,
  primary key (project_id, user_id)
);
-- v1.5 담당자 '입력': 행사 설정 ②에서 이름·이메일·역할을 직접 추가한다. Phase 4 전(mock)은 추가 즉시 멤버로 취급,
-- Phase 4부터는 초대 레코드 → 가입·수락 시 project_members로 승격. 같은 사람이 행사마다 다른 역할 가능(역할은 행사 단위).
create table project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  email text not null, display_name text not null,
  role member_role not null,
  invited_by uuid references auth.users, invited_at timestamptz default now(),
  accepted_at timestamptz, accepted_user_id uuid references auth.users,
  unique (project_id, lower(email))
);
-- 제약(앱 레벨): 행사당 role='pm' 멤버(또는 수락 대기 초대) 최소 1명. 마지막 PM 삭제 거부(409).

-- 3. 발주처 연락처·토큰
create table client_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  name text not null, org text, email text
);
create table client_tokens (
  token uuid primary key default gen_random_uuid(),   -- URL에 그대로 사용
  project_id uuid references projects on delete cascade,
  contact_id uuid references client_contacts,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

-- 4. 산출물 항목
create table deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  area deliverable_area not null,
  category text not null,             -- '키비주얼','큐시트','명찰' 등 자유 + 프리셋
  title text not null,
  status deliverable_status not null default 'draft',
  assignee_id uuid references auth.users,
  due_date date,
  drive_folder_id text,               -- 항목 전용 하위 폴더
  requires_approval boolean default true,   -- common 문서는 false
  -- v1.2 지시서·스펙 (전부 선택적 — 지시 없이 만든 항목은 null)
  brief text,                         -- 지시 내용
  brief_refs jsonb,                   -- 참고자료 링크 배열 (첨부 테이블은 2차)
  spec_size text,                     -- 규격 표기 예: '23000×5000mm'
  spec_qty int,
  spec_location text,                 -- 제작·설치 위치
  spec_type text,                     -- 종류 (현수막·합지·PET·이미지 등)
  content text,                       -- 항목 본문 (운영사항 등, 마크다운) — 운영계획서 렌더 소스
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. 버전
create table versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  version_no int not null,
  drive_file_id text not null,
  file_name text not null,            -- 규약 적용된 최종 파일명
  note text,
  uploaded_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (deliverable_id, version_no)
);

-- 6. 컨펌 요청
create table approvals (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  version_id uuid references versions,
  requested_by uuid references auth.users,   -- PM만 (앱 레벨 강제)
  requested_at timestamptz default now(),
  due_at timestamptz,
  decided_at timestamptz,
  decision approval_decision,
  client_comment text,
  decided_via_token uuid references client_tokens(token)
);

-- 7. 코멘트 (v1.1: 내부/공유 가시성 분리 — 감수 C-1 반영)
create type comment_visibility as enum ('internal','shared');
create table comments (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  author_user_id uuid references auth.users,        -- 내부면 세팅
  author_token uuid references client_tokens(token),-- 발주처면 세팅 (회수된 토큰 참조 유지는 의도 — 작성자 이력 보존)
  visibility comment_visibility not null default 'internal',
  body text not null,
  created_at timestamptz default now(),
  check (author_user_id is not null or author_token is not null),
  check (author_token is null or visibility = 'shared')  -- 발주처 작성분은 shared 강제
);
-- 발주처 화면에는 shared만 노출. 내부 UI는 코멘트 작성 시 internal(기본)/shared 토글 제공.

-- 8. 마일스톤
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  title text not null,
  area deliverable_area,              -- null = 전체
  due_date date not null,
  done boolean default false
);

-- 9. 등록 — 모객(RSVP)
create table rsvp_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  name text not null, org text, title text, email text, phone text,
  group_tag text,                     -- VIP/미디어/일반 등
  invite_status invite_status default 'none',
  invited_at timestamptz, responded_at timestamptz,
  memo text
);

-- 10. 등록 — 참관객
create table attendees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  rsvp_contact_id uuid references rsvp_contacts,    -- RSVP 전환 시 연결
  name text not null, org text, email text, phone text,
  channel attendee_channel default 'import',
  registered_at timestamptz default now(),
  checked_in_at timestamptz,
  badge_no text
);

-- 11. 활동 로그 (알림 트리거 겸 감사)
create table activity_log (
  id bigint generated always as identity primary key,
  project_id uuid references projects on delete cascade,
  actor text not null,                -- 'user:{id}' | 'client:{token}' | 'system'
  action text not null,               -- 'version.uploaded','approval.requested' 등
  target_type text, target_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);

-- 12. 미등록 파일 인박스 (Drive 직접 업로드 감지)
create table unregistered_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  drive_file_id text not null unique,
  file_name text, detected_folder text,
  detected_at timestamptz default now(),
  linked_deliverable_id uuid references deliverables,  -- 연결 시 세팅 후 versions 생성
  dismissed boolean default false
);

-- 13. 프로그램 세션 (v1.2 — 운영계획서 §프로그램 섹션의 정형 소스)
create table program_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  section text,                       -- 블록 구분 (오전/오후/애프터파티 등)
  start_time time, end_time time,
  title text not null,
  speaker_name text, speaker_title text, speaker_org text,
  note text,                          -- 비고 태그 (기조·파트너 연사 등)
  sort_order int not null default 0
);

-- 14. 큐시트 큐 (v1.3 — category='큐시트'인 운영 항목에 귀속, 정형 에디터 소스)
create table cues (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid references deliverables on delete cascade,
  cue_no text,                        -- C01 등 표시 번호
  time_at time,
  segment text,                       -- 구분 (사전·오프닝·MC·세션·전환 등)
  body text,                          -- 내용·대본 (마크다운, 전문 포함)
  console_audio text, console_light text, console_screen text,   -- 콘솔 3채널
  sort_order int not null default 0
);
-- 큐시트 컨펌 발송 시: 앱이 표를 PDF 스냅숏으로 자동 생성해 버전 등록 → §5 발송 조건(미리보기 포맷) 충족

-- 15. WBS 태스크 (v1.4 — 유형별 템플릿을 온보딩 완료 시 행사일 기준으로 전개)
create type wbs_status as enum ('todo','doing','done');
create table wbs_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  phase_no int not null, phase_name text not null,   -- 1 사전착수 ~ 6 사후관리
  code text not null,                 -- '2.5' 등 — Configurator 코드 체계 호환
  title text not null,
  offset_start int not null, offset_end int not null, -- D 기준(음수=D-), 원본 보존
  start_date date, end_date date,     -- 전개 시 event_date로 계산 저장
  role member_role not null,          -- 커뮤니케이터 역할 매핑
  origin_role text,                   -- 원본 역할 태그(RS·RO·MC-PM·MC-AT·공동) — Configurator 연동 대비
  status wbs_status not null default 'todo',
  done_at timestamptz,
  linked_deliverable_id uuid references deliverables,  -- 연결 시 상태 뱃지 표시, final이면 자동 done
  note text, sort_order int not null default 0
);
-- 지연 = (미완료 and end_date < today)
-- 임박 = (미완료 and today <= end_date <= today+2) — 지연과 배타 (v1.4.1 정정: 원 산식 end_date<=today+2는 지연⊂임박이라 홈 집계가 중복됨)
-- 둘 다 저장하지 않고 계산. end_date가 null이면 지연·임박 모두 false. 정본 구현 = src/lib/wbs.ts(isDelayed·isImminent)
-- 재전개(wbs-expand 재호출) 규칙: code 매칭으로 기존 status·done_at·linked_deliverable_id·note 보존, 날짜만 재계산. 템플릿에서 사라진 code는 삭제하지 않고 유지(사용자 데이터 보호)

-- 15b. WBS 소통 대상 (v2.0 — Configurator event_tasks.target 승계)
alter table wbs_tasks add column target text;   -- 예: '고객사', '협력사', '내부' — 템플릿 시드에 포함

-- 16. 역할 헌장 R&R (v1.4 — 유형별 템플릿, 온보딩 담당자 지정 시 부여)
create table role_charters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  role member_role not null,
  origin_role text,
  title text not null,                -- '총괄 PM' 등
  items jsonb not null                -- 책임 불릿 배열
);

-- 17. 컴플라이언스 카드 (v2.0 — Configurator SocDashboard 정적 상수 INTERNAL_COMPLIANCE·CLIENT_COMPLIANCE_RULES 승계, 온보딩 시 시드)
create table compliance_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  kind compliance_kind not null,
  title text not null,
  items jsonb not null,               -- 체크 항목 배열 [{text, checked, checked_at}]
  sort_order int not null default 0
);

-- 18. 견적 (v2.0 — Configurator estimates 승계. 단가·베뉴·옵션 정의는 DB가 아니라 코드 상수(src/modules/quote) — 2차에 pricing_rules DB화)
create table quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete set null,  -- 견적만 있는 단계는 null, 핸드오프 시 연결
  title text not null,                -- 행사명(가칭)
  version int not null default 1,
  status quote_status not null default 'draft',
  is_final boolean not null default false,
  locked_at timestamptz,
  superseded_by uuid references quotes,
  input jsonb not null,               -- 입력 스냅샷: {event_name,event_date,start_time,end_time,event_type,include_leads,headcount,guarantee,venues[],selected_venue,options{},display_type,targeting{},client_company,contact{},manager,notes,adjustments[]} (Configurator config 스키마 승계 + targeting)
  breakdown jsonb not null,           -- 산출 스냅샷: {s1,s2,s3,s4,s5,options,recruit,attendee,subtotal,vat,total} — 엔진 재계산과 일치해야 함(테스트)
  total_amount bigint not null,       -- 원 단위 (VAT 별도)
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index uq_quote_final_per_project on quotes (project_id) where is_final and project_id is not null;
alter table projects add constraint fk_projects_quote foreign key (quote_id) references quotes(id);
-- 확정(is_final) 후 input·breakdown·total_amount 변경은 트리거로 거부(409) — Configurator lock_finalized_estimate 승계. 수정은 새 버전(superseded_by 체인)

-- 19. 랜딩 페이지 (v2.1 — Phase 3.13 사후 정본화. 섹션·폼·동의는 mock과 1:1로 jsonb 유지, 정규화는 2차)
create table landing_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,  -- **행사 종속. §4-21 스코프 계약**
  title text not null,
  slug text not null,                 -- 영소문자·숫자·하이픈. 내보낸 파일명·공개 주소에 사용
  status landing_status not null default 'draft',   -- draft | published | closed
  public_url text,                    -- 내보낸 HTML을 올린 위치(수동 입력). 앱이 서빙하지 않는다
  sticky_nav boolean not null default true,
  cta_label text not null default '참가 신청',
  submit_target landing_submit_target not null default 'registration',  -- registration | external
  external_submit_url text,           -- submit_target='external'일 때만
  analytics jsonb not null default '{}'::jsonb,  -- {ga_measurement_id, conversion_event}
  sections jsonb not null default '[]'::jsonb,        -- LandingSection[] (type·정렬·autofill 여부·본문)
  form_fields jsonb not null default '[]'::jsonb,     -- LandingFormField[]
  consents jsonb not null default '[]'::jsonb,        -- LandingConsent[] (필수 동의는 개인정보 항목)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz
);
create unique index uq_landing_slug on landing_pages (project_id, slug);   -- slug는 **행사 안에서만** 유일
create index ix_landing_project on landing_pages (project_id, updated_at desc);

-- 20. 랜딩 일자별 유입 지표 (v2.1 — mock=픽스처 / Phase 4=GA Data API 적재)
create table landing_daily_metrics (
  landing_id uuid not null references landing_pages on delete cascade,
  day date not null,
  pageviews int not null default 0,
  visitors int not null default 0,
  form_views int not null default 0,
  submits int not null default 0,
  primary key (landing_id, day)
);
-- 지표는 GA에서 당겨온 파생값이다. 앱이 직접 계측하지 않으며, 제출 수(submits)와 attendees 실제 행 수는
-- 일치하지 않을 수 있다(중복 제출·외부 제출 대상). 불일치는 화면에 그대로 노출하고 보정하지 않는다.

-- 무결성 보조 (v1.1 — 감수 M-3·Minor 반영)
create unique index uq_rsvp_email on rsvp_contacts (project_id, lower(email)) where email is not null;
create unique index uq_attendee_email on attendees (project_id, lower(email)) where email is not null;
-- deliverables.updated_at은 moddatetime 트리거로 자동 갱신
-- client_tokens.contact_id insert 시 contact의 project_id 일치를 앱 레벨에서 검증(교차 프로젝트 연결 차단)
```

### §4-21 랜딩 스코프 계약 (v2.1 — 결함 정정)

랜딩은 **행사에 종속된 산출물**이다. "현재 행사"는 언제나 `ProjectContext`가 보관한 선택 행사이며, 사용자의 멤버십 행에서 유도하지 않는다.

| 규칙 | 내용 |
|---|---|
| R-L1 | 목록·생성 API는 **projectId를 인자로 받는다**. `listLandingPages(projectId)` · `createLandingPage(projectId, input)` |
| R-L2 | 조회·수정·발행·삭제·지표는 `landingId`로 대상을 찾고, 권한·쓰기 가드는 **그 랜딩의 `project_id`**로 판정한다(`landing.project_id`, 사용자 소속이 아님) |
| R-L3 | `status='closed'` 행사에서는 랜딩 **생성·수정·발행·삭제가 전부 409**. 판정 대상은 R-L1/R-L2가 정한 projectId다 |
| R-L4 | slug 유일성은 `(project_id, slug)` 복합 — 다른 행사가 같은 slug를 쓰는 것은 정상이다 |
| R-L5 | 폼 제출(`submitLandingLead`)은 랜딩의 `project_id`로 `attendees`(channel='rsvp')에 적재한다. 교차 행사 적재는 금지 |

> **왜 규칙으로 못박는가** — Phase 3.13 구현에서 `listLandingPages()`가 인자 없이 `currentUser().project_id`(멤버십 첫 행)로 필터해, 다른 행사를 보고 있어도 같은 목록이 뜨고 종료 행사에서도 생성이 통과했다. v1.5가 `PROJECT_ID` 상수를 없앴지만 **DoD grep이 리터럴 `PROJECT_ID`만 검사**해 `user.project_id` 경로가 통과했다.
>
> **재발 방지(정본)**: ① DoD grep 대상에 `user.project_id`·`currentUser().project_id`를 추가하고, 프로젝트 스코프가 필요한 provider 메서드는 **projectId 인자 없이는 구현 금지**. ② 새 모듈은 "행사 A를 보다가 B로 전환하면 목록이 바뀐다"를 테스트로 반드시 포함. ③ **DataProvider 동결 해제는 설계서 개정이 선행**한다 — v6은 이 순서를 어겼고 v2.1이 사후 정본화한 사례다.

### §4-22 랜딩 → 등록 유입 계약 (v2.1)

| 항목 | 내용 |
|---|---|
| 제출 대상 | `submit_target='registration'`이면 앱 내부 등록(S4)으로, `'external'`이면 `external_submit_url`로 넘긴다 |
| 적재 | 내부 제출은 `attendees`에 `channel='rsvp'`로 1행. 랜딩 폼 필드 ↔ 참관객 필드 매핑은 이름·소속·직함·이메일·연락처 고정 |
| 개인정보 | 필수 동의(consents) 미체크 제출은 거부. 동의 이력은 제출 행에 함께 남긴다 |
| 지표 | 화면의 페이지뷰·순 방문자·폼 열람·신청 완료는 **§4-20의 GA 파생값**이며 `attendees` 집계와 별개다. 두 값이 다를 수 있음을 화면 캡션에 명시한다 |
| 금액 | 랜딩은 발주처·외부 공개물이다. **§원칙 7(NO-PRICE-TO-CLIENT)이 그대로 적용** — 섹션 템플릿·autofill·내보낸 HTML 어디에도 견적 금액이 들어가지 않는다 |

---

### §4-23 정산 테이블 (v2.2 — S-10)

```sql
-- 협력사 마스터 (프로젝트 비종속 — 조직 단위)
create table vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- 실거래처명 (#RULE-NO-COMPANY 예외, 픽스처는 가상명)
  biz_no        text,                             -- 사업자번호 (선택)
  note          text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index vendors_name_uniq on vendors (name) where archived_at is null;

-- 정산 보드 (행사당 1개, 확정 견적 스냅숏 보유)
create table settlement_boards (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references projects(id) on delete cascade,
  quote_id          uuid references quotes(id),   -- 기준 견적 (스냅숏 출처)
  quote_version     int,                          -- 스냅숏 시점 버전
  baselined_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 버킷 (기본 9 + 행사별 추가) — §19.2
create table settlement_buckets (
  id              uuid primary key default gen_random_uuid(),
  board_id        uuid not null references settlement_boards(id) on delete cascade,
  code            text not null,                  -- s1·s2·s3·s4·ot·at·s5·rc·ld 또는 custom 슬러그
  label           text not null,
  quote_amount    bigint not null default 0,      -- 부가세 별도, 스냅숏 시점 고정
  has_cost        boolean not null default true,  -- false = 원가 없음(발주·실비 입력 금지)
  is_margin_base  boolean not null default true,  -- false = 마진 기준 계약액에서 제외(리드젠)
  source          text not null default 'quote'   -- 'quote' | 'custom'
                  check (source in ('quote','custom')),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create unique index settlement_buckets_code_uniq on settlement_buckets (board_id, code);

-- 항목 (발주 단위 = 견적 항목 단위) — §19.3
create table settlement_items (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references settlement_boards(id) on delete cascade,
  bucket_id          uuid not null references settlement_buckets(id) on delete cascade,
  title              text not null,
  spec               text,
  vendor_id          uuid references vendors(id),
  assignee_id        uuid references profiles(id),
  ordered_amount     bigint,                      -- 발주(약정) · 부가세 별도
  actual_amount      bigint,                      -- 실비(집행) · 부가세 별도
  input_amount_raw   bigint,                      -- 담당자가 실제로 받은 원본 금액(포함/별도 표기 그대로)
  vat_included_input boolean not null default false,
  status             text not null default 'planned'
                     check (status in ('planned','ordered','settled','cancelled')),
  evidence           text,                        -- 세금계산서·카드전표 등 근거 표기
  import_id          uuid references settlement_imports(id),  -- 업로드에서 생성된 경우
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index settlement_items_bucket on settlement_items (bucket_id);

-- 협력사 견적서 업로드 (Phase 4.7 — 스키마만 v2.2에서 확정) — §19.5
create table settlement_imports (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references settlement_boards(id) on delete cascade,
  file_name    text not null,
  drive_file_id text,                             -- 원본 보존 (Phase 5 이후)
  vendor_id    uuid references vendors(id),
  parsed       jsonb,                             -- 파싱 결과 원본
  questions    jsonb,                             -- 확인 큐 (미해결 항목)
  status       text not null default 'parsed'
               check (status in ('parsed','confirmed','discarded')),
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);
```

> `settlement_items.import_id`는 `settlement_imports`를 참조하므로 마이그레이션 순서는 **vendors → settlement_boards → settlement_buckets → settlement_imports → settlement_items**다.

### §4-24 정산 계약 (v2.2 — 정본)

| 규칙 | 내용 |
|---|---|
| R-S1 | 정산은 **행사에 종속**된다. 목록·생성 API는 projectId를 인자로 받는다(§4-21 R-L1 승계). `currentUser().project_id`로 유도 금지 |
| R-S2 | 기준 견적은 **스냅숏**이다. 버킷의 `quote_amount`는 불러온 시점에 고정되며 `quotes`를 실시간 참조하지 않는다. 갱신은 `rebaseSettlementBoard`로만 — 이전 기준과의 차이를 보여주고 activity_log에 남긴다 |
| R-S3 | 모든 금액은 **부가세 별도**로 저장한다. `vat_included_input=true`로 들어온 값은 저장 직전 `round(v / 1.1)`로 분리하고 원본을 `input_amount_raw`에 남긴다(§19.4) |
| R-S4 | `has_cost=false` 버킷(`s5`·`rc`·`ld`)에는 **발주·실비를 넣을 수 없다** — API는 422, UI는 입력 칸 자체를 두지 않는다 |
| R-S5 | `is_margin_base=false` 버킷(`ld` 리드젠)은 마진 기준 계약액에서 제외한다. 화면에서 **숨기지 않고** 회색으로 남겨 제외 사유를 보인다 |
| R-S6 | 발주는 **항목 단위**다. 한 항목에 협력사 하나. 협력사가 여러 항목을 묶어 청구하면 항목별로 나눠 적는다(§19.3) |
| R-S7 | `projects.status='closed'`에서는 정산 **생성·수정·삭제가 전부 409**(`assertWritable` 승계) |
| R-S8 | 견적 초과는 **막지 않는다**. 버킷 헤더 경고 + 홈 카드로 알리되 저장은 통과시킨다 — 정산은 사후 기입이라 게이트는 이미 쓴 돈을 막는 셈이다 |
| R-S9 | 정산 데이터는 **발주처 토큰 경로·운영계획서 조립·랜딩·알림 본문 어디에도 나가지 않는다**. 금지 키·검사 범위는 §19.7 |
| R-S10 | 마진 식과 항등식은 §19.1이 정본이다. 화면은 `마진 기준 계약액 − Σ실집행 = 최종 마진`을 검산해 어긋나면 경고한다 |

---

## 5. 컨펌 워크플로우 — 상태 머신 (정본)

```
[PM 지시 발행] requested ──(첫 버전 업로드 시 자동)──> draft   ※ 담당자 셀프 생성은 draft에서 시작

draft ──(담당/PM)──> internal_review ──(PM만)──> pending_approval
  ▲                        │                          │
  │                 (PM 반려)│                  (발주처 토큰)
  │                        ▼                          ├──> approved ──(시스템)──> final
  └──(새 버전 업로드)── changes_requested <────────────┘        └ 06_발주처공유 스냅숏 완료 시
```

| 전이 | 주체 | 부수 효과 |
|---|---|---|
| (생성·지시 발행) → requested | **PM** | 지시서(brief·스펙·마감·담당) 작성, 담당자 알림 (v1.2) |
| requested → draft | 자동 — 첫 버전 업로드·인박스 연결 시 | assertTransition 경유 (v1.2) |
| draft → internal_review | 영역 담당 또는 PM | Slack 알림 |
| internal_review → draft | PM (반려) | 코멘트 필수 |
| internal_review → pending_approval | **PM 단독** | **발송 조건: 해당 버전이 미리보기 포맷(PDF·PNG·JPG)일 것** — approvals 생성, 발주처 이메일(토큰 링크), Slack |
| pending_approval → approved | 발주처 토큰 | approvals.decision 기록, Slack |
| approved → final | 시스템 자동 | `copy_file` → `06_발주처공유/` **성공 후에만 final 커밋** — 실패 시 approved 유지+재시도 큐 (v1.1, M-4) |
| pending_approval → changes_requested | 발주처 토큰 | client_comment 필수, Slack |
| changes_requested → draft | 새 버전 업로드 시 자동 | version_no+1 |

- (v1.3) 큐시트 항목은 컨펌 발송 시 표의 PDF 스냅숏이 자동으로 버전 등록되어 발송 조건을 충족한다.
- `requires_approval=false` 항목(회의록·예산 등 common)은 draft ↔ internal_review만 사용.
- 등록 모듈은 상태 머신 미사용 — 파이프라인: rsvp_contacts(none→sent→accepted/declined) → attendees(등록) → checked_in_at(체크인).

---

### 5.1 (v2.4) 주최형 inbound 매핑 — 새 상태머신을 만들지 않는다

주최형 제출물은 **기존 deliverables·기존 전이표를 그대로 재사용**하고, 라벨 계층(labels.ts 패턴)에서 주최형 문구로 표기만 바꾼다:

| 기존 상태 | 대행형 라벨 | 주최형 라벨 | 전이 주체 |
|---|---|---|---|
| requested | 가이드됨 | **제출 요청됨**(마감 전개 시 자동 생성) | 시스템(WBS 전개) |
| pending_approval | 컨펌요청 | **검토중**(파트너 제출 직후) | 파트너(`/p` 제출) |
| approved → final | 승인·확정 | **승인됨**(승인 시 final 동일 규칙) | 내부(pm 또는 담당) |
| changes_requested | 수정요청 | **수정요청**(코멘트 필수) | 내부 |
| (재제출) | version_upload로 draft 복귀 | version_upload로 **검토중 복귀**(pending_approval 직행) | 파트너 |

- 주최형 신규 전이 1건만 추가: `requested → pending_approval via partner_submit`(파트너 첫 제출). 재제출은 기존 version_upload 전이의 목적지를 kind='host'에서 pending_approval로 분기 — 분기 근거는 전이표에 명기하고 assertTransition 경유는 불변.
- draft·internal_review는 주최형 inbound 경로에서 쓰지 않는다(내부가 만드는 산출물은 주최형에서도 기존 경로 그대로).

---

## 6. 권한 모델

### 6.1 역할 매트릭스 (앱 레벨 + RLS 이중 강제)

| 기능 | pm | design | ops | reg | 발주처(token) |
|---|---|---|---|---|---|
| 자기 영역 deliverable 생성·업로드 | ● | ●(design) | ●(ops) | — | — |
| 지시 발행(requested 생성) (v1.2) | ● | — | — | — | — |
| 행사개요·프로그램표 편집 (v1.2) | ● | — | ● | — | — |
| 전 영역 열람 | ● | ● | ● | ● | — |
| internal_review 전이 | ● | ● | ● | — | — |
| pending_approval 발송 | ● | — | — | — | — |
| 승인/수정요청 | — | — | — | — | ● |
| 코멘트 | ● | ● | ● | ● | ●(자기 큐 항목) |
| 등록 데이터 CRUD | ● | — | — | ● | — |
| 멤버·토큰·설정·Drive 연결 | ● | — | — | — | — |
| 행사 생성(S0 새 행사)·행사개요 편집·종료 (v1.5) | ● | — | — | — | — |
| 행사 목록 열람·셀렉터 전환 (v1.5) | ●(멤버인 행사만) | ● | ● | ● | — |
| 견적 생성·버전·확정·Excel (v2.0) | ●(app_role admin·sales만 — 프로젝트 역할과 무관) | — | — | — | — |
| 연결 견적 요약 열람 (v2.0) | ●(해당 행사 pm) | — | — | — | — (토큰 경로는 quotes 테이블 자체를 조회 불가) |
| 컴플라이언스 카드 체크 (v2.0) | ● | ● | ● | ● | — |
| 현장 체크인(S-12) 열람·체크인 토글 (v2.6) | ● | — | ● | ● | — |
| 정산보드 열람 (v2.2) | ● | ● | ● | ● | — (토큰 경로는 settlement_* 조회 불가) |
| 정산 버킷 추가·삭제·기준 견적 갱신 (v2.2) | ● | — | — | — | — |
| 발주 항목 생성 (v2.2) | ● | — | — | — | — |
| 발주액·실비 입력 (v2.2) | ● | ●(자기 담당 항목) | ●(자기 담당 항목) | ●(자기 담당 항목) | — |
| 협력사 마스터 등록·수정 (v2.2) | ● | ● | ● | ● | — |

### 6.2 RLS 방향

> **(v2.6) `onsite` 전용 롤은 Phase 5 신설이다.** 3.17.1은 화면 분리(S-12)와 pm·ops·reg 게이트까지만 한다 —
> 현장 접수 담당에게 이 화면 하나만 열어 주려면 프로젝트 역할과 별개의 롤이 필요하고, 그건 Auth(Phase 4) 이후다.
- 모든 테이블: `project_id in (select project_id from project_members where user_id = auth.uid())`.
- 쓰기: deliverables/versions는 역할-영역 일치 또는 pm. approvals insert는 pm만.
- (v2.2) settlement_boards·settlement_buckets·settlement_items·settlement_imports: `select` = 프로젝트 멤버 전원. `insert·update·delete` = 보드·버킷·기준 갱신은 pm만, 항목 금액은 pm 또는 `assignee_id = auth.uid()`. vendors는 조직 단위라 로그인 사용자 전원 `select`, `insert·update`도 전원(중복 등록 방지는 unique 인덱스). **토큰 경로 화이트리스트에 settlement_*·vendors를 추가하지 않는다**(§19.7).
- (v2.0) quotes: `select` = profiles.app_role in (admin,sales) OR (project_id가 null이 아니고 해당 프로젝트 pm 멤버) / `insert·update` = admin·sales만. compliance_cards·profiles: 멤버 범위.
- (v2.4) partners·partner_tiers·partner_tokens: `select·insert·update` = 프로젝트 멤버(등급·계약액 열람 포함 — 내부 전용), 파트너 토큰 발급·회수는 pm만. **`partners.contract_amount`는 어떤 외부 경로(`/c/*`·`/p/*`·랜딩·운영계획서·알림)에도 나가지 않는다** — 금액 비노출 가드 대상에 추가(§19.7 확장).
- (v2.4) 파트너 토큰 경로(`/p/{token}`)는 발주처 토큰과 동일 원칙 — RLS 미통과, Edge Function(service) 화이트리스트 쿼리만. 접근 가능 범위: **자기 partner_id의** 제출 항목·버전·shared 코멘트·방향이 partner_submit/host_notice인 WBS 태스크(자기 전개분)·행사 기본 정보(명칭·일시·장소). **타 파트너의 어떤 행도 쿼리 자체에서 제외**(파트너 간 완전 격리). 만료·회수 = 410.
- 발주처 토큰 경로는 **RLS를 통과하지 않고** Edge Function(service role)이 토큰 검증 후 화이트리스트 쿼리만 수행 — 토큰으로 접근 가능한 데이터: 자기 프로젝트의 pending_approval 항목 + 그 버전 파일 + final 항목 + 마일스톤 진행률 + **visibility='shared' 코멘트만**(internal 코멘트는 쿼리 자체에서 제외 — v1.1, C-1). 그 외 어떤 테이블도 조회 불가.

### 6.3 토큰 설계
- URL: `/c/{token}` (UUID v4). 발급 시 연락처 단위, 만료일 지정 가능, PM이 즉시 회수(revoked_at).
- 접근 시마다 last_seen_at 갱신. 만료·회수 토큰은 410 화면("담당자에게 새 링크를 요청하세요").
- **기본 만료 = 행사일+30일**(발급 시 조정 가능). 발주처 화면 전체에 `Referrer-Policy: no-referrer`, 서버 로그는 토큰 앞 8자만 기록(마스킹) — 이메일 포워딩·브라우저 히스토리·로그 경유 유출 완화 (v1.1, M-6).
- **권한 위생 강제**: 발주처가 볼 수 있는 파일 = 컨펌요청된 버전 + final 확정본뿐. 내부 초안·02_견적·정산 폴더는 API 경로 자체가 없다.

---

## 7. Google Drive 연동 설계

### 7.1 표준 폴더 트리 (jc-workspace-ops 표준 준용 — 새 트리 발명 금지)
프로젝트 생성 시 앱이 자동 생성:

```
[행사 루트]/
├ CLAUDE.md · PROGRESS.md      ← 세션 규약 2파일 (템플릿 복사)
├ 01_기획
├ 02_견적·정산                  ← 발주처 API 경로 없음 (내부 전용)
├ 03_회의록
├ 04_운영                       ← ops 영역 + 등록 CSV 내보내기 저장처
├ 05_산출물
│   └ 디자인                    ← design 영역 (항목별 하위 폴더 자동 생성)
├ 06_발주처공유                  ← final 스냅숏 전용 (앱만 기록)
└ 99_archive
```

영역→폴더 매핑: design → `05_산출물/디자인/{항목명}/` · ops → `04_운영/{항목명}/` · common(회의록) → `03_회의록` · common(예산) → `02_견적·정산` · common(기획) → `01_기획`.

### 7.2 업로드 플로우 (웹앱 경유 — 원칙)
1. 프론트: 파일 선택 + 버전 노트 → Edge Function `POST /versions/upload`
2. Edge Function: Drive resumable upload → 항목 폴더에 저장
3. 파일명 자동 규약화: `YYMMDD_{project.code}_{category}_{title}_v{n}.{ext}` — jc-workspace-ops 표준(`YYMMDD_약칭_문서종류_vN`)의 확장형(문서종류를 category+title 2필드로 세분)
4. versions insert (version_no 자동 증가) → 상태 changes_requested였으면 draft로 자동 전이 → Slack 알림

### 7.3 직접 업로드 감지 (인박스)
- Edge Function cron(5분) + 화면의 수동 새로고침 버튼: **Drive Changes API(startPageToken 증분)** — modifiedTime 폴링 대비 이동·삭제 감지와 페이지 경계 유실에 강함 (v1.1, M-5)
- DB의 versions.drive_file_id에 없는 파일 → unregistered_files insert → 홈 인박스에 노출
- 인박스에서 원클릭: 기존 항목에 연결(새 버전으로 등록) / 새 항목 생성 / 무시(dismissed)
- **파일명 규약화 rename은 옵션(기본 off)** — 타인이 직접 올린 파일명을 앱이 임의 변경하면 협업 혼란·파일명 기반 외부 참조 파손 위험 (v1.1, M-5)

### 7.4 파일 접근 — 프록시 원칙
- 발주처는 항상 `GET /files/{version_id}` 프록시 경유 — Edge Function이 `files.get?alt=media`를 **ReadableStream 패스스루**로 중계(메모리 버퍼링 금지). **프록시 사이즈 캡 100MB** — Edge Functions 한도(메모리 150MB heap+150MB external, wall clock 400초, idle 150초 — 웹검증 2026-08-19)상 대용량 원본 중계는 부적합 (v1.1, M-2)
- 컨펌 대상은 §5 발송 조건(미리보기 포맷 버전)으로 대용량 문제를 원천 차단 — 원본(AI·PSD·영상)은 컨펌용이 아니라 보관용
- 내부 멤버는 Drive 직접 접근 병행 — 행사 루트 폴더를 팀 계정에 1회 공유(Drive UI에서 수행), 앱은 항목마다 webViewLink 버튼 제공
- 이미지·PDF는 브라우저 인라인 미리보기, 그 외 다운로드
- **Drive 공유 권한은 앱이 절대 수정하지 않는다** (anyone 링크 생성 금지)

### 7.5 final 스냅숏 (v1.1 원자성 보강 — M-4)
- approved 처리 직후: 해당 버전 파일 `files.copy` → `06_발주처공유/` (파일명 유지) → **copy 성공 확인 후에만** status=final 커밋
- copy 실패 시 approved 유지 + 재시도 큐(지수 백오프 3회) → 최종 실패 시 Slack 경보 + 홈 대시보드 노출

---

## 8. API 계약 (Edge Functions)

인증: 내부 = Supabase JWT / 발주처 = 경로 토큰. 응답은 JSON, 오류는 `{error: {code, message}}`.

| Method·Path | 권한 | 동작 |
|---|---|---|
| GET /projects | 로그인 | 멤버인 행사 목록 + 요약(ProjectSummary: D-day·유형·status·미결 컨펌·지연·확정 비율·온보딩 단계) — 셀렉터·S-1 공용 (v1.5) |
| POST /projects | 로그인(생성자=pm 자동) | 프로젝트 생성(v1.5: 개요 필드 일괄 수신 — S0 ① 저장 시 호출, onboarded_at은 null) + Drive 표준 트리 생성 + 세션 2파일 템플릿 복사 |
| POST /projects/{id}/close · reopen | pm | status=closed/active 토글 (v1.5). closed면 쓰기 API 전부 409 |
| POST /projects/{id}/members | pm | 담당자 추가(이름·이메일·역할 — v1.5 project_invites 생성, mock은 즉시 멤버) / DELETE /projects/{id}/members/{id} = 제거(마지막 pm이면 409) |
| POST /projects/{id}/client-tokens | pm | 토큰 발급 (연락처·만료) / DELETE = 회수 |
| GET /projects/{id}/dashboard | 멤버 | 홈 데이터(미결 컨펌·D-day·인박스 수·영역 진행률·최근 활동) |
| GET /projects/{id}/landings | 멤버 | 그 행사의 랜딩 목록(최신 수정순) — **projectId 필수, §4-21 R-L1** (v2.1) |
| POST /projects/{id}/landings | 멤버 | 랜딩 생성. 섹션·폼·동의는 기본 템플릿 시드, autofill 섹션은 행사 개요·세션·존에서 즉시 조립. closed 행사면 409 (v2.1) |
| PATCH /landings/{id} · POST /landings/{id}/publish · DELETE /landings/{id} | 멤버(삭제=pm) | 수정·발행(공개 주소 기록, null이면 draft 복귀)·삭제. 권한 판정은 `landing.project_id` 기준 (v2.1) |
| GET /landings/{id}/metrics | 멤버 | 일자별 유입 지표. mock=픽스처 / Phase 4=GA Data API (v2.1) |
| POST /landings/{id}/leads | 공개(폼) | 랜딩 폼 제출 → attendees(channel=rsvp) 적재. §4-22 계약 (v2.1) |
| POST /deliverables | 역할-영역 일치 (지시 발행은 pm) | 항목 생성 + Drive 하위 폴더 생성. v1.2: brief·스펙 포함 시 status=requested |
| PATCH /deliverables/{id}/status | §5 전이 규칙 | 상태 전이 (검증 실패 시 409) |
| POST /deliverables/{id}/versions | 역할-영역 일치 | §7.2 업로드 |
| POST /deliverables/{id}/approvals | **pm** | 컨펌 발송 (due_at 지정) → 이메일+Slack |
| GET /files/{version_id} | 멤버 or 유효 토큰(스코프 검증) | 프록시 스트리밍 |
| GET /c/{token}/queue | 토큰 | 컨펌 대기 목록(+미리보기 메타) |
| POST /c/{token}/decisions | 토큰 | {approval_id, decision, comment} → §5 전이 |
| GET /c/{token}/status | 토큰 | 현황 대시보드 데이터(진행률·마일스톤·최근 확정본) |
| POST /registration/import | pm·reg | CSV 업로드 → rsvp_contacts/attendees 벌크 insert (중복=email 기준 upsert) |
| PATCH /attendees/{id}/checkin | pm·reg | 체크인 토글 |
| GET·POST·PATCH·DELETE /program-sessions | pm·ops | 프로그램표 CRUD (v1.2) |
| GET·POST·PATCH·DELETE /cues | pm·ops | 큐시트 큐 CRUD (v1.3) |
| POST /deliverables/{id}/cue-snapshot | pm | 큐시트 PDF 스냅숏 생성 → 버전 등록 (v1.3, 컨펌 발송 전처리). Mock 단계 규약(v1.4.1): 파일명은 `.pdf` 규약 그대로, 내용은 인쇄용 HTML blob — 실제 PDF 렌더는 Phase 5 Drive 이식과 함께 |
| PATCH /projects/{id} | pm | 행사 유형·기본정보 수정 (v1.3) — v1.5: 개요 전 필드(종료일·시간·장소·인원·좌석·주최·사회자·대상·overview_items). event_date 변경 시 응답에 `wbs_reexpand_required=true` → S5 배너 |
| GET /projects/{id}/onboarding | 멤버 | `{completed, onboarded_at}` — 라우트 가드가 참조 (v1.4.1, completed = onboarded_at is not null) |
| POST /projects/{id}/onboarding-complete | pm | 온보딩 완료 확정: `onboarded_at=now()` 기록 → wbs-expand·R&R 시드 순차 호출 (v1.4.1). 이미 완료면 409. 한 트랜잭션 |
| POST /projects/{id}/wbs-expand | pm | 유형별 WBS 템플릿을 event_date 기준 실제 날짜로 전개 (v1.4, 온보딩 완료 시 자동 호출). 재호출 시 §4-15 재전개 보존 규칙 적용 (v1.4.1) |
| GET·PATCH /wbs-tasks | 담당 역할+pm(체크)·pm(편집) | WBS 태스크 조회·상태 변경 (v1.4) |
| GET /role-charters | 멤버 | 역할별 R&R 카드 (v1.4) |
| PATCH /projects/{id}/overview | pm·ops | 행사개요 편집 (v1.2) |
| GET /projects/{id}/plan | 멤버 | 운영계획서 조립 데이터 — 전 섹션 + 섹션별 진행률 (v1.2) |
| POST /sync/drive-scan | 멤버(수동)·cron | §7.3 인박스 스캔 |
| cron /jobs/reminders | system | 컨펌 due D-1 미응답·마일스톤 D-1 알림 |
| GET /quotes · GET /quotes/{id} | admin·sales (+연결 행사 pm은 요약만) | 견적 목록(버전 체인·상태·총액)·상세 (v2.0) |
| POST /quotes · POST /quotes/{id}/versions | admin·sales | 새 견적 / 새 버전(이전 버전 superseded) — 서버가 엔진으로 breakdown·total 재계산해 저장(클라이언트 값 신뢰 안 함) (v2.0) |
| POST /quotes/{id}/finalize | admin·sales | is_final=true·locked_at 기록. 같은 프로젝트의 다른 final은 archived (v2.0) |
| POST /quotes/{id}/create-project | admin·sales | **핸드오프**: 확정 견적에서 projects 생성(§16 매핑으로 프리필, onboarded_at null) + quote.project_id·project.quote_id 상호 연결 → S0 진입 (v2.0) |
| GET /quotes/{id}/export.xlsx | admin·sales | ExcelJS 견적서 — 자동 외부 업로드 없음(Phase 5에서 Drive 저장은 명시 버튼) (v2.0) |
| GET·PATCH /compliance-cards | 멤버(체크)·pm(편집) | 컴플라이언스 카드 (v2.0) |

---

### 8.1 (v2.4) 추가 API

| Method·Path | 권한 | 동작 |
|---|---|---|
| GET·POST·PATCH·DELETE /projects/{id}/partner-tiers | 멤버(쓰기 pm) | 등급 체계 CRUD (기본 3종 시드) |
| GET·POST·PATCH·DELETE /projects/{id}/partners | 멤버(쓰기 pm) | 파트너 CRUD + 제출 진행 요약(S-11) |
| POST /partners/{id}/tokens · DELETE | pm | 파트너 제출 링크 발급·회수 |
| GET /p/{token} | 파트너 토큰 | 제출 포털 데이터 — 자기 체크리스트·제출물 상태·안내(host_notice)·가이드 링크. §6.2 화이트리스트 |
| POST /p/{token}/submissions | 파트너 토큰 | 항목 제출(파일 업로드 또는 텍스트) → requested→pending_approval 전이(§5.1) |
| POST /submissions/{id}/review | pm·담당 | {decision: approved|changes_requested, comment} → §5.1 전이. 수정요청 시 comment 필수(422) |
| POST /projects/{id}/wbs-expand-host | pm | 주최형 템플릿(§15.3)을 event_date 기준 전개 — partner_submit 방향은 **파트너별 인스턴스** 생성 |
| POST /quote-imports | admin·sales | xlsx 업로드 → 서식 감지(A·B·C형)·섹션·항목·검산 결과 반환. **커밋 없음** |
| POST /quote-imports/{id}/confirm | admin·sales | 확인 큐에서 수정한 매핑 확정 → quotes 등록(source='imported', 새 버전) |
| POST /quote-imports/{id}/distribute | admin·sales | 분배 실행: {targets: project_prefill? board_seed? settlement_base?} — §22.4 규칙 |

---

### 8.2 (v2.5) 추가 API

| Method·Path | 권한 | 동작 |
|---|---|---|
| GET·PUT /deliverables/{id}/scenario-blocks | pm·ops(쓰기)·멤버(읽기) | 시나리오 블록 벌크 조회·저장(정렬 포함). category='시나리오' 항목만 |
| POST /deliverables/{id}/scenario-seed | pm·ops | 프로그램표 세션에서 뼈대 생성(세션당 그룹 헤더 + 기본 블록). 기존 블록 있으면 409(덮어쓰기 금지 — 빈 문서에서만) |
| POST /deliverables/{id}/scenario-export-cues | pm·ops | 영상·전환 등 큐 성격 블록을 큐 뼈대로 변환해 대상 큐시트 항목에 추가(기존 큐 보존·후미 삽입). 응답에 변환 건수 |
| GET·PUT /deliverables/{id}/guide-sections | pm·ops(쓰기)·멤버(읽기) | 가이드 섹션 벌크 조회·저장. category='운영가이드' 항목만 |
| POST /deliverables/{id}/guide-seed | pm·ops | 존별 운영(존운영 항목)·역할 체크리스트(R&R)에서 초기 로드. 기존 섹션 있으면 409 |
| POST /deliverables/{id}/doc-snapshot | pm | 정형 문서(큐시트·시나리오·운영가이드) 인쇄 스냅숏 → 버전 등록(§8 cue-snapshot 일반화 — 기존 경로는 위임 유지). 컨펌 발송 전처리 |

---

## 9. 알림 매트릭스

| 이벤트 | 내부 Slack | 발주처 이메일 |
|---|---|---|
| 새 버전 업로드 | ● | — |
| 컨펌 발송 | ● | ● (토큰 링크 포함) |
| 승인 / 수정요청 | ● | — |
| 컨펌 기한 D-1 미응답 | ● | ● 리마인드 |
| 마일스톤 D-1 | ● | — |
| 미등록 파일 감지 | ●(일 1회 묶음) | — |
| (v2.4) 파트너 제출 도착 | ● | — |
| (v2.4) 파트너 마감 D-1 미제출 | ● | ●(해당 파트너에게 리마인드 — Phase 6b 이메일 갖춘 후) |

- Slack: 프로젝트별 Incoming Webhook 1개(설정 화면에서 등록). 메시지 포맷: `[행사코드] 이벤트 — 항목명 (링크)`.
- 이메일: Resend(무료 티어) 권장. 발신 도메인 미보유 시 MVP는 공용 발신 주소.
- (v2.3) **구현 시점 분리**: Slack 웹훅 = Phase 6(D-Day 전 구현, URL은 D-Day 주입 — §20). 발주처 이메일(Resend) = **Phase 6b** — 첫 발주처 토큰 발송 전까지만 갖추면 된다(내부 선사용 단계에선 불필요). 컨펌 발송 UI는 "이메일 발송은 준비 중 — 링크를 복사해 직접 전달" 안내를 명시한다(게이트 뒤에 숨기지 않음).
- (v2.3) **no-op 폴백**: `SLACK_WEBHOOK_URL` 미설정이면 알림 유틸은 콘솔 로그로만 동작한다. 발송은 항상 fire-and-forget + 실패 로그 — 알림 실패가 본 동작(전이·업로드·컨펌)을 절대 막지 않는다.

---

## 10. 화면 명세 (v1.5: S-1 추가, S0·S6 재정의)

**진입점 원칙(v1.5)**: 모든 화면은 사이드바 메뉴 또는 명시적 버튼으로 도달 가능해야 하며, 데모 픽스처는 그 진입 흐름을 실제로 보여줘야 한다(게이트 뒤에만 존재하는 화면 금지). 사이드바 순서(v2.0): [프로젝트 셀렉터] → 행사 목록 → **준비** 그룹(견적 · 랜딩보드 · 행사 설정) → **운영** 그룹(홈 → 디자인 보드 → 운영 보드 → 등록 → **현장 체크인(v2.6 S-12)** → 일정 → 운영계획서 → **정산보드(v2.2)**). 정산보드는 견적 메뉴와 달리 **프로젝트 멤버 전원에게 보인다**(내부 한정·발주처 비공개). 견적 메뉴는 app_role이 admin·sales가 아니면 숨김. 셀렉터에 "견적만 있음 · 행사 미생성" 상태 표시.

| # | 화면 | 구성 | 주요 액션 |
|---|---|---|---|
| 공통 | 프로젝트 셀렉터 (v1.5) | 사이드바 최상단 드롭다운: 진행 중/종료 그룹, 행사명·유형·D-day·미결 컨펌/지연 요약, "＋ 새 행사 만들기", "전체 목록 보기" | 전환(컨텍스트 변경·마지막 선택 기억), 새 행사 → S0 |
| S-2 | 견적 (v2.0, 메뉴 "준비" 그룹) | 좌: 견적 버전 표(버전·인원·베뉴·모객 포함·총액·상태) / 우: 선택 버전 요약(섹션별 금액·합계·VAT 별도) / 에디터 5스텝 ①규모·유형(행사명·일자·시간·유형·인원·보장·타겟팅) ②베뉴(20곳 필터·홀 적합도·후보 택1) ③옵션(12종+부스) ④확인·확정(Excel 미리보기) ⑤행사 만들기(확정 후 활성) | 새 버전·확정·Excel 내려받기·"이 견적으로 행사 만들기". 접근 = admin·sales. 금액은 이 화면과 Excel에만 |
| S-3 | 랜딩보드 (v2.1, 메뉴 "준비" 그룹) | 좌: 랜딩 표(제목·slug·상태·GA 측정 ID·수정일) / 우: 선택 랜딩 요약(공개 주소·제출 대상·GA·전환 이벤트) + 유입 지표 4카드(페이지뷰·순 방문자·폼 열람·신청 완료)와 일자별 막대. 빌더는 섹션 템플릿 13종·폼 필드·동의 편집 + HTML 내보내기(GA 주입) | 새 랜딩·편집·발행·내보내기. **현재 행사의 랜딩만 보인다(§4-21)**. 지표는 GA 파생값 — mock 단계에서는 픽스처임을 화면에 명시 |
| S-1 | 행사 목록 (v1.5) | 카드 그리드(행사명·유형·일자·장소·D-day·PM·예상 인원·미결/지연/확정·전체 진행률). 세팅 미완료 행사는 "온보딩 n/3" 표시, 종료 행사는 접힘 | 카드 클릭=전환, 새 행사 만들기, 종료/재개(pm) |
| S0 | 새 행사 위저드 (v1.3→v1.5 재정의) | **행사 설정 ①②③과 동일한 폼 컴포넌트**를 3단계로 배치: ①행사개요(필수 4: 행사명·코드·시작일·장소) ②담당자(내부 담당자 입력 — 이름·이메일·역할, PM 1명 필수 / 발주처 담당자·토큰 선택) ③유형·확인 — **(v2.6 §25) format 4카드**(컨퍼런스 일반형·컨퍼런스 모객형·DMS·전시회) + PSA 체크박스 + 시드된 kind·event_type 세부 토글(노출·수정 가능), WBS 전개 예고 | 완료 = onboarded_at 기록 + **format 프리셋 일괄 전개**(WBS·R&R·컴플라이언스·tier) + R&R 시드. 미완료 행사는 목록에 남고 진입 시 행사 설정으로 유도(차단 아님) |
| S1 | 홈 대시보드 | 미결 컨펌(기한순) · D-day·마일스톤 · **지연/임박 WBS 태스크(v1.4)** · 미등록 인박스 · 영역별 진행률 바 · 최근 활동 | 인박스 연결/무시, 항목·태스크 바로가기 |
| S2 | 영역 보드 (design/ops 공용) | 카테고리 그룹 카드: 상태 뱃지(지시됨 포함)·최신 vN·담당·마감 | 항목 생성, (pm) 지시 발행 폼, 필터(상태·담당), 상태 전이 |
| S3 | 항목 상세 | 지시 카드(브리프·스펙 칩, v1.2)·버전 이력(최신 뱃지)·미리보기·코멘트 스레드·컨펌 이력·Drive 폴더 링크 — **큐시트 항목은 파일 대신 정형 에디터 렌더(v1.3: 행 편집·드래그 정렬·대본 전문)** | 버전 업로드, 전이, (pm) 컨펌 발송(큐시트=스냅숏 자동) |
| S4 | 등록 모듈 | 탭: RSVP 리스트 / 참관객 / 통계(응답률·등록수·체크인율) + **(v2.6) 시트 연결 카드 상시 노출·시트 기준 KPI 4카드(신청·확정·취소·체크인)·읽기 전용 명단** | CSV 임포트·내보내기, 상태 변경, RSVP→참관객 전환. **체크인 조작은 S-12로 이관(v2.6) — 여기서는 상태 표시만** |
| S5 | 일정·WBS·R&R (v1.4 승격) | 단계 필터(1~6)·체크리스트/간트 토글·태스크(코드·기간·담당·**소통 대상(v2.0)**·상태·산출물 연결 뱃지)·R&R 카드 그리드·**컴플라이언스 카드 2종(내부·고객사 계약 규약, v2.0 — 체크 가능)**·컨펌 기한 오버레이 | 태스크 체크(담당+pm)·편집(pm), 템플릿 재전개(pm), 마일스톤 CRUD |
| S6 | 행사 설정 (v1.5 재정의 — 메뉴 2번째 상시 노출) | 탭 ①행사개요: 행사명·코드·유형·시작/종료일·시작/종료 시간·장소·예상 인원·좌석 형태·주제·주최/주관·사회자·참가 대상·기타 개요 항목(overview_items) + **(v2.0) 모객형 전용 그룹: 보장 인원·쇼업 KPI·타겟팅 5축 칩, 연결 견적 링크("견적 v3 확정 기준")** — **행사개요의 단일 원천(S9 ①은 여기서 읽기 조립, 인라인 편집 제거)** / 탭 ②담당자: 내부 담당자 표(추가 행·삭제·역할 변경) + 발주처 담당자·토큰 통합 표(발급·회수·링크 복사) + R&R 미리보기 / 탭 ③유형·연동: 유형 토글 안내·Drive·Slack | pm 편집(타 역할 읽기). 상단에 "세팅 완료·일자" 또는 "세팅 미완료(필수 n개)" 뱃지 |
| S7 | 발주처 컨펌 큐 (`/c/{token}`) | 대기 항목 리스트 → 미리보기 → [승인] [수정요청+코멘트] · 처리 완료 이력 | 승인/수정요청 |
| S8 | 발주처 현황 (`/c/{token}/status`) | 영역별 진행률 · 마일스톤 · 최근 확정본 목록(다운로드) | 읽기 전용 |
| S-10 | 정산보드 (v2.2, 메뉴 "운영" 그룹 마지막) | 상단 KPI 4(마진 기준 계약액·실집행·최종 마진·마진율) + **마진 구성 3분할 막대**(항목 마크업=변동 / PCO 기획료=고정 / RSVP 운영비=고정)와 검산 블록 / 버킷 표(견적·발주·실집행·마크업·마크업률, `has_cost=false`는 "원가 없음"·`ld`는 "마진 계산 밖") / 버킷 펼침 = 발주 항목 표(항목·협력사·담당·발주·실비·상태·증빙) / 협력사 견적서 업로드 패널(Phase 4.7 전에는 안내) | ＋발주 항목(pm)·발주액/실비 입력(담당)·버킷 추가(pm)·기준 견적 바꾸기(pm)·협력사 견적서 올리기. **발주처에게 절대 노출되지 않는다(§19.7)**. 견적 초과는 경고만 하고 막지 않는다 |
| S9 | 운영계획서 (v1.2) | 섹션 자동 조립 — **번호 정본은 코드**(`planSections.ts`의 `PLAN_SECTION_ORDER`, 3.17.1 T6): **01 행사개요**(v1.5: 행사 설정 ①에서 읽기 조립 — 일자·시간·장소·인원·좌석·주최·대상) · **02 프로그램** · **03 큐시트**(v1.3) · **04 존별 운영**(content+도면) · **05 제작물 리스트**(스펙 표+최신 시안·상태 뱃지) · **06 등록 통계** · **07 비상 대응**(v2.5) · **08 일정** — 섹션별 진행률·인쇄 CSS(A4)·표지·러닝 헤더/푸터(v2.6) | 프로그램 인라인 편집(pm·ops), 개요는 "행사 설정에서 편집" 링크, 인쇄(PDF) |
| S-12 | 현장 체크인 (v2.6) | 현장 데스크 전용 — 큰 검색창(이름·소속·뱃지번호)·큰 행·[체크인] 44 고정·'체크인 n / m'(확정 기준)·스냅숏 배지. **밀집 모드 없음. 명단 편집·시트 설정·내보내기 경로 없음**(현장 담당에게 관리 화면을 열지 않기 위한 분리) | 체크인 토글(pm·ops·reg) |

**옛 Configurator 라우트 리다이렉트(v2.0, 도메인 재연결 후 301)**: `/quote`→`/quotes`(로그인 필요) · `/setup`→`/onboarding` · `/configurator`→`/quotes` · `/events`→`/projects` · `/events/:id`→`/projects`(셀렉터 안내) · `/events/:id/soc`→`/schedule` · `/events/:id/soc?client_view=1`→410 안내("발주처 링크는 담당자에게 새 링크를 요청"). 구버전 MiceConfigurator·PreSetup·SocDashboard 화면은 이식하지 않는다(기능은 행사 설정·일정·S-2가 흡수).

UI 공통: 한국어, 데스크톱 우선 + 반응형(발주처 화면은 모바일 대응 필수 — 임원이 폰으로 컨펌하는 시나리오), 장식 최소·표와 뱃지 중심.

---

### 10.1 (v2.4) 추가 화면

- **행사 설정 ③ 성격·유형**: 성격 카드 2종(대행형/주최형, 시각안 화면 A) + 기존 유형 칩. 주최형 선택 시 파트너 등급 편집 블록 노출(기본 3종 시드: DIAMOND·GOLD·SILVER — 명칭·설명·정원 편집, 등급 추가 가능). 성격 전환은 확인 다이얼로그(표시 계층 전환·데이터 보존 안내).
- **S-11 파트너 보드**(`/partners`, 주최형 전용 — 사이드바 운영 그룹, 홈 다음): KPI 4(파트너 수·이번 마감 제출·검토 대기·수정요청 미회신) + 마감 타임라인 스트립(방향 3종 표기: ▲ 파트너 제출 / ▼ 주최 통지 / ■ 내부) + 파트너 표(등급 배지·담당·링크 상태·이번 마감 진행률·상태) + 파트너 상세(제출물 목록·검토 패널 = S3 상세 컴포넌트 재사용·가이드 문서·활동 이력). 검토 대기는 홈(S1) 미결 위젯에 집계.
- **`/p/{token}` 파트너 제출 포털**(시각안 화면 C): 슬림 다크 상단 바 + 등급 배지. 이번 마감(가장 가까운 미완 마감) 섹션 상단 고정 → 항목 카드(상태 배지·수정요청 코멘트·새 버전 업로드 드롭존·텍스트 항목은 인라인 폼) → 다음 마감(대기) → 주최 측 안내(host_notice 읽기 전용). 하단에 격리 고지 문구. 반응형(데스크톱 중심, 375px 동작 보장).
- **견적서 가져오기 위저드**(S-2 내 버튼, admin·sales — 시각안 화면 D): 1단계 업로드 → 2단계 인식 결과 확인(KPI 4: 섹션·항목·검산·확인 필요 / 섹션→버킷 매핑 표에서 애매 항목만 노랑 표시·드롭다운 수정 / 인식된 행사 정보 미리보기) → 3단계 분배 선택(견적 등록·행사 프리필·정산 기준·보드 시드 체크박스) → 완료. 임포트 견적은 목록에 '임포트' 배지.
- **판매 플래너**(v2.6 §25 — S-11 파트너 보드 **상단 탭**, 게이트 `kind='host' && format in ('dms','exhibition')`): dms·exhibition의 판매형 설계 도구. 3스텝 — ①상품 정의(등급 카드 = partner_tiers 시드·편집) ②목표 시뮬레이션(Σ 정원×단가 + 판매 진행률 = 파트너 확정 수 대비) ③프리셋 확인(WBS·알림 예고). 게이트 뒤 숨은 화면 금지 원칙에 따라 **탭으로 가시 노출**한다. `tier.price`는 내부 전용 — `/p`·발주처 경로 비노출.
- **대행형/주최형 표시 규칙**: 주최형에서 숨김 = 발주처 컨펌 큐 발송 UI·발주처 연락처 탭(파트너 탭으로 대체) / 대행형에서 숨김 = 파트너 보드·`/p` 발급 UI. 진입점 원칙(§10) 준수 — 게이트 뒤에 숨은 화면 금지, 성격이 다르면 메뉴 자체가 없어야 한다.

### 10.2 (v2.5) 운영보드 재구성 화면

- **운영보드 홈(유형 우선)**: 상단 유형 카드 4종 — 큐시트 / 시나리오 / 운영가이드 / 기타 제작물(각 카드에 건수·최신 상태 요약). 카드 선택 시 해당 유형의 문서 목록 + **인라인 빌더**(별도 화면 이동 없음 — "빌더 열기" 시 목록 아래 펼침). "+ 항목 추가"의 카테고리 선택도 같은 원칙: 정형 카테고리(큐시트·시나리오·운영가이드)를 고르면 생성 직후 해당 빌더가 인라인으로 열린다(3.15.1 P7의 완성형). 기존 데이터 이관: category='큐시트' → 큐시트 카드 / 신설 2종 카테고리 추가 / 나머지 → 기타 제작물. 자동 분류·무손실.
- **시나리오 빌더**: 세션 그룹(프로그램표 연동 표시) → 진행 블록 행(시각·구분 칩[MC/영상/의전/전환/커스텀]·대본(펼침)·비고). 상단 액션 = 큐시트로 내보내기 · 인쇄 · 컨펌 발송(스냅숏). 세션 접기. 시나리오·큐시트 역할 분리 도움말(InfoTip) 명시.
- **운영가이드 빌더**: 섹션 카드 4종 시드(존별 운영[존운영 연동] · 역할별 체크리스트[R&R 연동] · 비상 대응 · 연락망/비품) + 섹션 추가. 연동 섹션은 원본 변경 시 "갱신 있음" 표시 → 차이 확인 후 반영(자동 덮어쓰기 금지 — 기준 견적 갱신과 동일 패턴). 개인 연락처는 화면·S9 조립 제외, 인쇄 스냅숏에만 포함 옵션.
- **S9 확장**(번호는 코드 정본 01~08 기준 — 3.17.1 T6): **02 프로그램** 섹션에 세션별 시나리오 상세 펼침(있을 때만) · **04 존별 운영**에 가이드 존 섹션 반영 · **07 비상 대응 섹션 신설**(가이드 비상 섹션 조립, 인쇄 포함, 섹션 진행률 집계에 포함).

## 11. 등록 모듈 상세 (MVP)

- **CSV 스키마(임포트)**: `name, org, title, email, phone, group_tag, memo` — 헤더 자동 매핑 UI(열 이름 상이 대응), email 기준 중복 upsert, 1,000행 이상 벌크 처리.
- RSVP 상태는 수기 변경(발송·응답 체크). 자체 초청 이메일 발송·응답 폼·QR 체크인은 **2차**.
- 내보내기: 현재 필터 상태 그대로 CSV 다운로드 + Drive `04_운영/`에 스냅숏 저장 옵션.

---

## 12. 보안·운영

- 시크릿: Drive refresh token·Slack webhook·Resend key → Supabase Vault/환경변수. 프론트에 어떤 시크릿도 노출 금지.
- 감사: 모든 상태 전이·토큰 접근·파일 프록시 요청은 activity_log 기록.
- 회사명·실명 하드코딩 금지(#RULE-NO-COMPANY) — 발주처·행사명은 전부 데이터.
- 백업: DB는 Supabase 자동 백업, 파일은 Drive 자체가 원본.
- (v2.0) 금액 비노출 4중 차단 — 분석 보고에서 확인된 Configurator의 노출 경로를 전부 닫는다: ① `/quote` 공개 렌더 → 로그인+app_role 게이트 ② estimates RLS 개방 → quotes RLS(§6.2) + 새 프로젝트 ③ Excel 다운로드 시 외부 Edge Function으로 자동 Drive 업로드 → 제거(Phase 5 Drive 모듈의 명시 버튼만) ④ `?client_view=1` URL 파라미터 공유 → 폐기(발주처는 `/c/{token}`만). 운영계획서·활동 로그·알림 본문에 금액 필드 포함 금지(테스트로 증명).
- (v2.2) 정산 비노출 — 금지 키에 `settlement`·`ordered_amount`·`actual_amount`·`markup`·`margin`을 추가하고, 검사 범위에 `pages/Landing*`·`lib/landing*`를 추가한다(랜딩은 토큰조차 없는 유일한 완전 공개 지면인데 v2.1까지 검사 밖이었다). 가드는 결함을 되돌려 넣어 **실제로 실패하는지 역검증**한 뒤 통과로 인정한다. 상세는 §19.7.
- (v2.4.1 §13b) **데모 아티팩트 charset 규약**: 빌드된 단일 HTML은 `<meta charset="utf-8">`이 문서 선두 1,024바이트 안에 있어야 한다(HTML 프리스캔 규칙). 근거 = 2026-08-27 감수 실증: charset 미선언 서빙에서 한글 정규식 파싱 오류로 전면 백지(빌드가 meta를 51KB 지점으로 밀어냄, 자체 검증 스크립트는 charset 주입 서빙이라 미탐지). 데모 검증(browser-check)에 **charset 미명시 서빙 케이스**를 포함한다.
- (v2.3) API 키는 Supabase **신형 체계**로 채택: 프론트 = `sb_publishable_…`, 서버(Edge Function·스크립트) = `sb_secret_…` (대시보드 Settings→API Keys). 레거시 anon/service_role JWT 키는 2026년 말 폐기 예정이라 신규 사용 금지(웹검증 2026-08-27). 본 문서의 "3키" = Project URL · publishable key · secret key. secret 키는 `VITE_*` env에 절대 넣지 않는다.
- (v2.0) 클라이언트 번들에 Supabase URL·anon key 하드코딩 금지 — env만. 베뉴 DB의 `reference_cases`(실고객사명·실거래액)는 이식하지 않는다(#RULE-NO-COMPANY).
- (v2.0) 내부 로그인 = Supabase Auth 이메일 매직링크, 허용 도메인 화이트리스트(env). profiles.app_role 승격은 admin만.

---

## 13. MVP 범위 vs 2차 로드맵

| MVP (이번 구현) | 2차 |
|---|---|
| 프로젝트·멤버·역할 / Drive 트리 자동 생성 | 자체 RSVP 초청 이메일·응답 폼 |
| design·ops 항목 + 버전 + 컨펌 루프 전체 | QR 체크인·현장 등록 키오스크 |
| 발주처 토큰 뷰(큐·현황) + final 스냅숏 | 미리보기 위 주석(마크업) 코멘트 |
| 홈 대시보드·인박스·일정 | 다중 발주처 담당자 승인 체인 |
| (v1.2) 지시 발행 흐름·프로그램표·S9 운영계획서 웹 문서+인쇄 | (v1.2) 운영계획서 PPTX 내보내기·발주처용 운영계획서 뷰·지시 첨부 테이블 |
| (v1.3) S0 온보딩 위저드·유형 모듈 토글·큐시트 정형 에디터+S9 연동 | (v1.3) 큐시트 리허설 모드(실시간 진행 표시)·유형별 견적 연동 |
| (v1.4) WBS 템플릿 전개·체크리스트/간트·R&R 카드·산출물 연결 뱃지+final 자동 done | (v1.4) Configurator 실연동(양방향 동기화)·템플릿 편집기·태스크 코멘트 |
| (v1.5) 프로젝트 셀렉터·S-1 행사 목록·행사 설정 3탭·S0 동일 폼·담당자 입력·종료/재개 | (v1.5) URL prefix 라우팅(`/p/:id`)·이메일 초대 수락 흐름(Phase 4)·행사 복제 |
| (v2.0) 견적 모듈 S-2(엔진·베뉴 DB·옵션·버전·확정·Excel)·견적→행사 핸드오프·모객형 필드·컴플라이언스 카드·WBS 소통 대상·새 Supabase·로그인·인프라 전환 | (v2.0) 단가·베뉴·옵션 DB화(pricing_rules)와 관리 화면·견적 PDF·고객용 견적 공유 링크·견적 승인 워크플로우·Configurator 랜딩 아카이브 |
| (v2.2) 정산보드 S-10(마진 3분할·버킷 9+추가·항목 3단 추적·부가세 자동 분리·협력사 마스터) | (v2.2) 협력사 견적서 업로드 파싱(Phase 4.7)·발주서 발행·협력사 단가 누적 통계 → 견적 단가 DB화 연결 |
| (v2.5) 운영보드 유형 우선·시나리오 빌더·운영가이드 빌더·S9 ⑦비상 대응 | (v2.5 2차) 구글시트 등록 실연동(Google OAuth — Phase 5 축)·시나리오 리허설 모드·가이드 다국어 |
| (v2.4) 주최형: kind 축·파트너 등급·S-11 파트너 보드·`/p` 제출 뷰·검토 루프·주최형 WBS 템플릿 / 견적서 임포트(xlsx 3형·확인 큐·분배 4종) | (v2.4 2차) 임포트 PDF 서식·파트너 초대 이메일·파트너 다국어 / **Claude MCP 연동** — 원격 MCP 서버(Edge Function)로 Claude에서 현황 조회·검토 큐 처리·임포트 실행, DataProvider 비즈니스 계층 경유·내부 인증 필수(v2.5 설계 예정, 서버 가동 후) |
| — | 현장사진 갤러리·결과보고서 조립 |
| 등록 CSV 임포트·테이블·체크인 토글·통계 기초 | 통계 대시보드 고도화(mice-dashboard 연동) |
| Slack·이메일 알림 + D-1 리마인드 | 모바일 앱 수준 최적화, 다국어 |

---

## 14. 개정 이력

- **v2.6 증분 §25** (2026-08-29): **행사 유형 4분류 × 프리셋** — `projects.format`·`psa_enabled`·`audience_model` 신설. ① format 권한 3종 한정(감수 C1 — 상시 게이트 이원화 방지) ② 정본 진입점 = S0 ③유형 4카드(감수 C2 — 'S-2 스텝 0' 폐기), 판매 플래너는 S-11 상단 탭으로 가시 노출 ③ S-10 정산 무변경(감수 M1 — §19.1 마진 항등식 보호) ④ psa_requests는 attendees FK(감수 M2) ⑤ program_sessions.track 등재(감수 M3) ⑥ PSA 알림·격리·비노출 가드 정의(감수 M4) ⑦ 초청제 모드는 기존 상태 재사용 불가로 판명 — **구현하지 않고 §25.6 열린 질문**(감수 M5의 '추측 구현 금지' 준수). **DataProvider v11 재동결** — 원 지시문의 'v10 재동결'은 3.17c의 v10(120메서드) 동결을 반영하기 전 표기라 사실대로 정정. **절차 이탈**: 협업 리듬 '시각안 먼저'를 사용자 지시(2026-08-29 "레드팀 검증 후 결과물만 전달, 코드로 진행")로 생략했다 — 시각안 승인은 존재하지 않으며, 실제 사용자 승인은 4분류 도입·[B] 게이트·레드팀 대체 검증 셋뿐이다. 3.18c(PSA)는 3.17.2 명단 식별 미확정으로 **미착수**.
- **v2.5** (2026-08-28): **운영보드 재구성 — 문서 유형 우선 + 시나리오·운영가이드 빌더 신설** (시각안 3화면·구조 결정 5가지 승인, 계기=사용자 데모 실측 피드백). ① 운영보드 1면 = 유형 카드 4종, 유형 선택 시 빌더 인라인("카테고리가 빌더를 결정한다" 보드 레벨 확장 — 3.15.1 P7의 완성형) ② §4-27 scenario_blocks·guide_sections 정형 테이블(큐시트 cues 패턴 준용 — deliverable 연결, 컨펌·버전·스냅숏 루프 재사용) ③ 시나리오 빌더 — 프로그램표 세션 뼈대 자동 생성·진행 블록(MC/영상/의전/전환/커스텀)·**큐시트로 내보내기**(시나리오↔큐시트 역할 분리 명문화: 대본 vs 콘솔 큐) ④ 운영가이드 빌더 — 존별 운영(존운영 항목 연동)·역할 체크리스트(R&R 연동)·비상 대응·연락망/비품, 원본 변경 시 stale 표시 후 확인 반영(자동 덮어쓰기 금지) ⑤ §20b — S9 ⑦비상 대응 신설·②프로그램 상세(시나리오) 펼침·③존운영 확장, 인쇄 포함 ⑥ 기존 운영 항목 자동 분류 이관(category='큐시트'→큐시트 카드, 나머지→기타 — 무손실) ⑦ **DataProvider v9 재동결(8메서드 · 110메서드)**: listScenarioBlocks·saveScenarioBlocks·seedScenarioFromProgram·exportScenarioToCues·listGuideSections·saveGuideSections·seedGuideFromSources·createDocSnapshot(큐시트 cue-snapshot의 일반화 — 기존 메서드는 내부 위임 유지). importVendorQuote는 **v10 예약으로 순연**

- **v2.4.1** (2026-08-27): 패치 — Phase 3.15 머지본(main 22e247f) 챗 감수(⚠️ 조건부 보완, vitest 548 재현) 반영. ① §15.3b 주최형 R&R 4카드·§15.3c 규약 카드 3종 정의(감수 M4 — §15.3에 R&R·규약 정의가 없던 설계 공백, 가정 표기) ② projects.partner_guide_url·partner_contact_email 신설(감수 M2 — 포털 가이드·문의 창구), **DataProvider v8.1 재동결(필드 추가만, 메서드 수 102 불변 — v3.1 전례)** ③ §12에 데모 charset 규약 신설(감수 M1 실증) ④ 감수 M3(주최형 홈·동선)·M5(검색·페이지네이션)·Minor 6건은 스키마 무관 폴리시 — 지시문 3.15.1로 수행, CLAUDE.md 무개정

- **v2.4** (2026-08-27): **주최형(파트너) 확장 + 견적서 임포트** — 시각안 4화면·구조 결정 7가지 전부 승인. ① `projects.kind`(agency/host) 축 신설 — event_type과 직교, 표시 계층 전환 원칙(§1-8·§21) ② partner_tiers·partners·partner_tokens 신설, 계약액 내부 전용·파트너 간 완전 격리(§6.2·§21) ③ `/p/{token}` 제출 포털 + inbound 상태 매핑(§5.1 — 새 상태머신 없이 기존 전이표 재사용, 신규 전이 1건) ④ S-11 파트너 보드·검토 큐(§10.1) ⑤ WBS 주최형 템플릿 12건(§15.3, DMS 마감 체계 일반화 — 가정) ⑥ 견적서 임포트(§22 — 실서식 3형 계약·확인 큐 필수·분배 4종·자동 커밋 금지) ⑦ **DataProvider v8 재동결(16메서드 · 102메서드)**, importVendorQuote(협력사 견적 파싱)는 v9 예약으로 순연 ⑧ 알림 2행·API 10종·비노출 가드에 `/p`·Partner 경로 추가. 계기 = DMS 2026 파트너사 커뮤니케이션 이식 + 자체 설계 견적서(카페24·TAAS·CATOPIA 서식) 활용

- **v2.3** (2026-08-27): **서버 스프린트 — 키 최후 주입 실행 개정(기능·스키마·화면 무변경)**. 계기 = 8/31(월) 리멤버 첫 출근일에 서버설정·슬랙연동·Drive 연동만으로 즉시 실사용 가능해야 함(첫 투입 후보: DMS 2026 파트너사 커뮤니케이션). ① Phase 4·5·6을 D-Day 전 일괄 구현 — 검증은 개발용 Supabase 프로젝트, 운영 자격증명은 D-Day 주입 ② API 키 신형 체계 채택(§12 — 레거시 2026년 말 폐기, 웹검증 2026-08-27) ③ §9 알림 구현 시점 분리(Slack=6, Resend 이메일=6b·첫 발주처 발송 전) + no-op 폴백 ④ §18 개정(0단계 dev 프로젝트·setup.sql 산출 규약) ⑤ **§20 D-Day 런북 신설**(서버·슬랙·드라이브 3트랙 + 배포) ⑥ Phase 4.6의 사용자 게이트 단계를 §20으로 이동

- **v2.2** (2026-08-23): **정산보드(S-10) 신설** — 내부정산 실물 13건 분석 기반, 시각안 승인. ① **§19 정산보드 정본** — 마진 식(항목 마크업 + PCO 기획료 + RSVP 운영비, 리드젠 제외)을 실물 2건에서 원 단위 검산 ② §4-23 테이블 4종(vendors·settlement_boards·settlement_buckets·settlement_items) + settlement_imports ③ **§4-24 정산 계약 R-S1~R-S10** — 견적 스냅숏 고정·부가세 별도 저장·원가 없음 버킷 입력 차단·리드젠 제외·항목 단위 발주·초과는 경고만 ④ 버킷 기본 9종(견적 `recruit`를 rc/ld로 분리하는 것이 유일한 비자명 매핑) + **행사별 버킷 추가**(실물 섹션 수 5~9 가변) ⑤ §6.1 권한 5행·§6.2 RLS·§10 S-10 화면·사이드바 순서 ⑥ **§19.7 비노출 가드 확장** — 금지 키 5종 추가 + 검사 범위에 랜딩 파일 포함 + 역검증 의무 ⑦ §19.5 협력사 견적서 업로드 파싱(Phase 4.7, 스키마만 선반영). **DataProvider v7 재동결(11메서드 · 86메서드)**

- **v2.1** (2026-08-23): **랜딩보드(S-3) 사후 정본화 + 스코프 결함 정정 + 가격 상수 v1.1 확정**. ① §4-19·§4-20 랜딩 테이블 신설 ② **§4-21 랜딩 스코프 계약** — `listLandingPages(projectId)`·`createLandingPage(projectId, input)`로 시그니처 정정, 쓰기 가드는 `landing.project_id` 기준, DoD grep에 `user.project_id` 추가(v1.5가 없앤 단일 프로젝트 전제가 랜딩 모듈에만 되살아난 결함) ③ §4-22 랜딩→등록 유입 계약(금액 비노출 재확인) ④ §8 랜딩 API 6종·§10 S-3 화면 명세·사이드바 순서 갱신 ⑤ **§17.3-4 골든 데이터셋 출처 규약** — 원본 생성기 산출물만 인정, `source.commit`은 실제 생성 커밋(어긋나면 검증 실패로 간주) ⑥ **§17.4 가격 상수** — LED 오퍼레이팅 250만원 = V-mix 스위칭 + 전담 엔지니어 일체(사용자 확정), 화면중계 200만·온라인중계 +150만 증분·전체 녹화 100만, `scaler4k`→`ledOperating` 승계 ⑦ §2.1 동결 이력 정정(v5는 9메서드) + v6·v6.1 기록. **DataProvider v6.1 재동결**

- **v1.0** (2026-08-19): 최초 확정 — 구조안 v0.9 승인 승격
- **v2.0** (2026-08-22): 견적 Configurator 단일 플랫폼 통합 (시각안 3화면 승인, jsx-easy-shift 읽기 분석 보고 기반) — 원칙 7(#RULE-NO-PRICE-TO-CLIENT) · 모듈 8 견적 · profiles(app_role)·quotes·compliance_cards 신설, projects 모객 필드 4종·wbs_tasks.target · API 7건 · S-2 견적 화면·사이드바 준비/운영 그룹·옛 라우트 리다이렉트 · RLS·보안 4중 차단 · DataProvider v5(8메서드) · 부록 §16 핸드오프 계약 확정(실필드 매핑 11/13+보정 2) · §17 이식 인벤토리·검증 기준(골든 벡터 0원 일치) · §18 인프라 전환 절차(새 Supabase·Vercel·도메인·1회 임포트·아카이브). 전제: Lovable 폐기, 홈 레포=communicator, 옛 DB 폐기
- **v1.5** (2026-08-22): 다중 행사·행사 설정 확장 (시각안 3화면 승인) — 계기: "초기 세팅 메뉴가 없다"(S0가 게이트 뒤에만 존재·담당자 단계 읽기 전용·개요 필드 분산) + 동시 다수 행사 운영. projects 개요 필드 7종·status 추가, project_invites 신설, API(GET /projects·close/reopen·members DELETE·PATCH 확장), DataProvider v4(5메서드 추가), ProjectContext(PROJECT_ID 상수 폐지), S-1 행사 목록·프로젝트 셀렉터, S6를 "행사 설정" 3탭으로 재정의·메뉴 2번째 상시 노출, S0=동일 폼 단계형(미완료 행사는 차단이 아닌 유도), S9 ① 개요 읽기 조립로 단일화, 진입점 원칙 명문화, 부록 §16 Configurator 핸드오프 수신 계약(가정). 2차: URL prefix·초대 수락·행사 복제
- **v1.4.1** (2026-08-22): 패치 — Phase 3.6·3.7 구현 중 Code가 PROGRESS 열린 질문으로 올린 해석 5건을 정본화(기능 추가 없음). ① `projects.onboarded_at timestamptz` 신설(사용자 승인) — S0 완료 판정·API 2종(GET onboarding / POST onboarding-complete)·DataProvider v3.1 재동결(필드 추가만) ② §4-15 임박 산식을 지연과 배타로 정정(today ≤ end_date ≤ today+2) ③ §15 일반형 28건 제외 집합을 코드 단위로 명시(4.6 존치) — 가정 표기는 유지 ④ wbs-expand 재전개 보존 규칙(code 매칭·status·done_at·연결 보존) ⑤ cue-snapshot mock 규약(.pdf 파일명+HTML blob, PDF 렌더는 Phase 5). 스키마 변경은 ①뿐 — Phase 4 마이그레이션은 v1.4.1 기준
- **v1.4** (2026-08-22): 유형별 WBS·R&R 확장 (시각안 승인) — wbs_tasks·role_charters 테이블, Configurator 37태스크 코드 체계 이식(부록 §15, origin_role 태그로 연동 호환), 온보딩 완료 시 event_date 기준 자동 전개, S5를 일정·WBS·R&R 뷰로 승격(체크리스트/간트 토글), 홈에 지연·임박 집계, 산출물 연결 뱃지+final 자동 done. Configurator 실연동·템플릿 편집기는 2차
- **v1.3** (2026-08-22): 온보딩·유형·큐시트 확장 (시각안 승인) — S0 위저드(개요→유형→담당자, 완료 전 진입 차단), event_type(general/recruiting) 모듈 토글, cues 테이블·큐시트 정형 에디터(3채널 콘솔·대본)·S9 큐시트 섹션·컨펌 스냅숏 자동, API 3종 추가. 리허설 모드·유형별 견적 연동은 2차
- **v1.2** (2026-08-22): 지시→제작→컨펌→문서 조립 확장 (시각안 승인 기반) — status 'requested'+지시서·스펙 필드(brief·spec_*·content), program_sessions 신설, projects 행사개요 필드, S9 운영계획서 웹 문서(섹션 자동 조립·진행률·인쇄 CSS), API 4종 추가. 발주처용 운영계획서 뷰·PPTX 내보내기·지시 첨부는 2차
- **v1.1** (2026-08-19): jc-redteam Deep Audit 반영(판정: 조건부 보완 → 전량 수정) — 코멘트 visibility 분리(C-1) / DataProvider 어댑터 계층·프론트 우선-서버 후행 구현 전략 §2.1 신설(C-2) / 전용 운영 계정+OAuth Production 게시(M-1) / 프록시 스트리밍·100MB 캡·미리보기 포맷 발송 조건·내부 Drive 직접 접근(M-2) / 이메일 partial unique 인덱스(M-3) / final 스냅숏 원자성·재시도(M-4) / Changes API·rename 기본 off(M-5) / 토큰 기본 만료·no-referrer·로그 마스킹(M-6) / Minor 6건(code unique, 기획 카테고리, 규약 확장 명기 등)

---

## 15. 부록 — WBS 기본 템플릿 (모객형 37태스크, Configurator v0.2 이식)

역할 매핑 원칙: 계약·정산·컨펌 게이트=pm / 랜딩·제작물=design / 현장 운영·리허설·결과보고=ops / 리드젠·모객·RSVP·등록=reg. 원본 역할(RS 리멤버영업·RO 리멤버운영·MC-PM 엠앤씨총괄·MC-AT 엠앤씨RSVP·공동)은 origin_role로 보존.

| 코드 | 태스크 | 기간 | 역할(원본) |
|---|---|---|---|
| 1.1 | 계약 검토 및 최종 날인 | D-42~40 | pm (RS) |
| 1.2 | 킥오프 (영업+운영+협력) | D-38~35 | pm (공동) |
| 1.3 | 클라이언트 실행 계획 미팅 | D-35~33 | pm (RS) |
| 1.4 | 현장답사 (주차·이동경로·교통) | D-33~28 | ops (MC-PM) |
| 2.1 | 행사 기초 자료 요청 (Key Visual 등) | D-33~30 | pm (RS) |
| 2.2 | 기초 자료 수령 리마인더 | D-28~26 | pm (RS) |
| 2.3 | 기초 자료 수령 | D-26~23 | pm (RS) |
| 2.4 | 자료 수령 후 협력사 전달 | D-23~22 | pm (RS) |
| 2.5 | 랜딩페이지 디자인·개발 1차 | D-22~18 | design (MC-PM) |
| 2.6 | 랜딩페이지 1차 수정·내부 검토 | D-18~17 | design (MC-PM) |
| 2.7 | 랜딩페이지 최종 컨펌·URL 오픈 | D-17~16 | pm (MC-PM) |
| 2.8 | 제작물 (배너·렌탈장비·기념품·현수막) | D-13~5 | design (MC-PM) |
| 3.1 | 리드젠 서베이 문항 설계·시스템 구축 | D-25~22 | reg (RO) |
| 3.2 | 서베이 링크 전달·검수 | D-22~20 | reg (RO) |
| 3.3 | 서베이+랜딩 통합 테스트 | D-20~18 | reg (RO) |
| 3.4 | 대시보드 최초 세팅·전달 | D-18~17 | reg (RO) |
| 3.5 | 실시간 리드 관리 시트 세팅 | D-17~16 | reg (RO) |
| 4.1 | 리드 수집 시작 | D-16~5 | reg (RO) |
| 4.2 | 타겟 일치/불일치 실시간 협의 | D-16~3 | pm (RS) |
| 4.3 | 불일치 리드 적격 확정 후 전달 | D-16~3 | reg (RO) |
| 4.4 | 1차 참석 확인 (전화·알림톡·메일) | D-8~5 | reg (MC-AT) |
| 4.5 | 2차 참석 확정·노쇼 방지 | D-3~1 | reg (MC-AT) |
| 4.6 | 데일리 현황 공유 (내부) | D-5~1 | reg (MC-AT) |
| 4.7 | 데일리 현황 공유 (고객) | D-5~1 | reg (RO) |
| 5.1 | 행사 물류 배송·현장 셋팅 | D-3~2 | ops (MC-PM) |
| 5.2 | 현장 운영 자료 수집·테스트 | D-2~1 | ops (MC-PM) |
| 5.3 | 전체 리허설·테크니컬 체크 | D-1 | ops (MC-PM) |
| 5.4 | 현장 등록 데스크·출입 관리 | D-Day | reg (MC-AT) |
| 5.5 | VIP 케어·연사 관리·프로그램 운영 | D-Day | ops (MC-PM) |
| 6.1 | 최종 쇼업 리드 리스트 정리·전달 | D+1~2 | reg (MC-AT) |
| 6.2 | 쇼업 리드 raw data 납품 | D+2~3 | reg (RO) |
| 6.3 | 전체 행사 결과 보고서 작성·전달 | D+3~10 | ops (MC-PM) |
| 6.4 | 운영 견적서 확정·전달 | D+3~5 | pm (MC-PM) |
| 6.5 | 세금계산서 발행·고객 입금 확인 | D+5~15 | pm (RS) |
| 6.6 | 운영비 협력사 정산 (이윤 포함) | D+15~20 | pm (RS) |
| 6.7 | 고객사 회계 처리 마감 | D+20~30 | pm (RS) |
| 6.8 | 프로젝트 회고·개선 사항 정리 | D+10~20 | pm (공동) |

**일반형 템플릿 (가정 유지 — 확정 시 갱신)**: 위 37건에서 리드 마케팅·모객 **11건**을 제외하고 대체 2건을 추가해 총 **28건**. 제외 집합은 v1.4.1에서 코드 단위로 명시 — 3.1~3.5(5건) + 4.1·4.2·4.3·4.4·4.5·4.7(6건). **4.6 데일리 현황 공유(내부)는 존치**(내부 현황 공유는 리드 특화 업무가 아님). 추가 2건 — 3G.1 참석 대상 명단 확정(D-20~15, reg, origin_role null), 3G.2 초청장 발송·회신 관리(D-14~5, reg, origin_role null). 정본 구현 = src/fixtures/wbsTemplates.ts(GENERAL_EXCLUDED_CODES·GENERAL_EXTRA_TASKS). 기획자 확정 전까지 "가정" 표기를 유지하며, 확정 시 본 단락만 갱신한다.

---

### 15.3 (v2.4) 주최형 WBS 템플릿 — 12태스크 (DM Summit 2026 마감 체계 기반 일반화)

> 출처: DMS 2026 파트너사 통합가이드북 v1.5 확정 마감 체계. **1개 행사 기반 일반화이므로 구성은 가정** — 2번째 주최형 행사에서 검증 후 확정. D오프셋·명칭은 행사별 편집 가능. direction: `partner_submit`(파트너별 인스턴스 전개) / `host_notice` / `internal`.

| 코드 | D | 태스크 | direction | 담당 역할 |
|---|---|---|---|---|
| HT-1 | D-45 | 파트너 기본 자료 제출 — 로고·회사소개·발표자 프로필·발표 개요 | partner_submit | pm |
| HT-2 | D-37 | 트랙 배정·부스 배치 확정 통지 | host_notice | pm |
| HT-3 | D-30 | 참관객 이용권·경품 제안 제출 | partner_submit | pm |
| HT-4 | D-27 | 부스 그래픽 제출 | partner_submit | design |
| HT-5 | D-23 | 발표자료 1차 초안 제출 | partner_submit | pm |
| HT-6 | D-16 | 주최 검토 회신(전 파트너 발표자료) | internal | pm |
| HT-7 | D-14 | 부스 인력 명단·추가 신청(전력·인터넷·임대) 제출 | partner_submit | ops |
| HT-8 | D-7 | 최종 발표자료·물품 반입 신고 제출 | partner_submit | pm |
| HT-9 | D-3 | 수정 반영 확인·설치/리허설 배정표·반입 동선 통지 | host_notice | ops |
| HT-10 | D-1~D0 | 설치·리허설·행사 당일 운영 | internal | ops |
| HT-11 | D+7 | 참관 등록 리드 데이터 제공(암호화) | host_notice | reg |
| HT-12 | D+14 | 결과 리포트 발송 | host_notice | pm |

- 전개 규칙: partner_submit 태스크는 파트너 수만큼 인스턴스 생성(파트너별 체크·상태 독립). host_notice·internal은 단일 인스턴스. 재전개 보존 규칙(§4-15)은 동일 적용 — code+partner_id 매칭.
- 기존 모객형 37·일반형 28 템플릿과 병존: 주최형 행사도 event_type이 모객형이면 등록 모듈(참관객 모객)은 그대로 쓴다 — 직교 2축의 의미.

#### 15.3b (v2.4.1) 주최형 R&R 카드 — 4역할 시드 (온보딩 완료 시, 가정: DMS 1건 기반 일반화)

| 역할 | R&R 요지 |
|---|---|
| pm | 파트너 총괄 — 제출 독려·주최 검토 회신(HT-6) 총괄, 트랙·부스 배정 통지(HT-2), 발표자료 검토 조율, 마감 D-1 리마인드 확인 |
| design | 부스 그래픽 검토(HT-4) — 규격·재단·해상도 가이드 준수 확인, 키비주얼·현장 사인물 제작 |
| ops | 현장 운영 — 부스 인력·추가 신청 취합(HT-7), 설치/리허설 배정·반입 동선(HT-9), 행사 당일 운영(HT-10) |
| reg | 참관객 모객·등록·체크인 + 리드 데이터 암호화 제공(HT-11, D+7) 및 제공 이력 관리 |

#### 15.3c (v2.4.1) 주최형 컴플라이언스 카드 — 3종 시드 (온보딩 완료 시, 가정)

| 코드 | 규약 카드 | 체크 요지 |
|---|---|---|
| C-H1 | 리드 데이터 취급 | 참관 등록 리드는 종료 후 기한 내 암호화 제공 · 파트너의 목적 외 이용·재제공 금지 고지 · 보존 기한 경과 시 파기 확인 |
| C-H2 | 파트너 제출물 권리·발표 가이드 | 로고·발표자료 사용 범위 확인 · 발표 내 노골적 세일즈 피치 금지 가이드 준수 확인 |
| C-H3 | 부스 안전·시공 규정 | 행사장 규정(방염·전력·반입 동선) 준수 · 설치·철거 시간 엄수 · 규격 외 반입물 사전 신고 |

## 16. 부록 — 견적 → 행사 핸드오프 계약 (v2.0 확정 — jsx-easy-shift main 6047834 분석 기준)

`POST /quotes/{id}/create-project`가 수행하는 매핑. 좌측은 projects, 우측은 quotes.input(= Configurator events·estimates.config 승계 필드).

| projects | quotes.input | 변환 |
|---|---|---|
| name | event_name (없으면 title) | 그대로 |
| code | — | 행사명 이니셜+연도 2자리 자동 제안, S0 ①에서 확인(필수) |
| event_date / event_end_date | event_date / event_end_date(신규, null 허용) | date |
| start_time / end_time | start_time / end_time | time |
| venue | selected_venue.name + ' · ' + selected_venue.hall | 텍스트 결합 (베뉴 DB FK는 두지 않음) |
| expected_headcount | headcount | int |
| guarantee_pax | guarantee | int (모객형만) |
| seating | — (베뉴 홀 capacity 키 theater/banquet/classroom/reception 중 선택값이 있으면 라벨로) | 없으면 null |
| event_type | include_leads ? 'recruiting' : 'general' | 매핑. Configurator 행사 유형 7종(eventTypes.ts)은 overview_items에 "행사 성격"으로 보존 |
| organizer | client_company | 텍스트 (주최≒고객사, S0에서 수정 가능) |
| target_audience | targeting 요약 문장 + notes의 대상 문구 | 텍스트 |
| targeting / kpi_show_rate | targeting{} / 90(기본) | jsonb / numeric |
| overview_items | [{행사 성격}, {담당 매니저}, {고객 연락처 — 이름·이메일}] | 키-값 불릿. **금액·섹션 산출은 어떤 키로도 넘기지 않음** |
| quote_id ↔ quotes.project_id | 상호 링크 | 트랜잭션 |
| wbs_tasks 시드 | — | 온보딩 완료 시 §15 템플릿(target 열 포함)으로 전개 — Configurator event_tasks는 시드하지 않음 |

견적 없이 행사를 먼저 만드는 경로(S-1 → S0)는 그대로 유지. 행사 설정 ①에서 "견적 연결"로 사후 연결 가능(admin·sales).

---

## 17. 부록 — Configurator 이식 인벤토리·검증 기준 (v2.0)

### 17.1 이식 대상 (순수 로직 — 의존 0, 그대로 옮기고 TS 타입만 부여)

| 원본 (jsx-easy-shift) | 이식 위치 (communicator) | 비고 |
|---|---|---|
| src/lib/calcEstimate.js (179) | src/modules/quote/engine/calcEstimate.ts | 가격 엔진 단일 출처. 함수 시그니처·상수 값 불변 |
| src/lib/kpiRules.ts (26) | src/modules/quote/engine/kpiRules.ts | 모객 KPI 인정선 |
| src/lib/venueOptions.ts (31) · components/remember-quote/quoteMode.ts (44) | src/modules/quote/engine/ | 다중 베뉴 택1 · 모객 포함/제외 |
| src/lib/venuedb.js (2,542) | src/modules/quote/data/venuedb.ts | **reference_cases 필드 전부 제거**(실고객사명·실거래액). 20곳·holls·pricing·extraction_confidence 유지. "DO NOT EDIT" 헤더 유지 |
| src/lib/leadTargeting.ts (43) · eventTypes.ts (41) · dateFormat.ts (33) | src/modules/quote/data/ · lib/ | 타겟팅 5축·행사 성격 7종 |
| src/lib/exportEstimate.js (934) | src/modules/quote/export/exportEstimate.ts | ExcelJS·file-saver 유지. **driveUpload 호출·backup 파라미터 제거**. 로고 자산은 public/brand png 사용 |
| handover/cowork-port/remember-pricing-dataset_*.json | src/modules/quote/__tests__/fixtures/pricing-dataset.json | **v1.1.0 기준 골든 벡터 21 + 조정 벡터 1 + 인원 그리드 47행**(v2.1 — LED↔중계 분리 반영). `source.commit`은 **생성에 실제로 사용한 jsx-easy-shift 커밋**이어야 한다(§17.3-4) |
| src/lib/__tests__ (calcEstimate 14·exportEstimate 26·kpiRules 5·pricingExtensions 28·rememberQuote 11) | src/modules/quote/__tests__/ | 84케이스 중 엔진·Excel 관련 전부 이식, UI 의존 케이스는 RTL로 재작성 |

### 17.2 UI 이식
- components/remember-quote/RememberQuoteConfigurator.tsx(1,017, 인라인 스타일·자체 THEMES) → src/pages/QuotePage.tsx + components/quote/* 로 **분해 이식**: 로직·스텝 상태는 유지, 스타일은 tokens.css(웜 페이퍼)로 전면 교체, 한/영 토글은 유지, 다크 토글은 제거(앱 테마 단일).
- 이식하지 않음: MiceConfigurator.jsx(구버전), PreSetup.tsx, EventBriefForm.tsx, EventList.tsx, EventDetail.tsx, SocDashboard.tsx, shadcn/ui 50개, landingPages.js·public/landing-archives(고객 실명 — 아카이브만).

### 17.3 검증 기준 (DoD 21~23의 정본)
1. **엔진 등가**: pricing-dataset.json의 전 벡터(**21+1**, 인원 그리드 47행 포함)에 대해 이식 엔진 산출이 **0원 차이** — Configurator README_코웍이식 합격 기준 그대로. (v2.1: v1.1.0 데이터셋으로 교체)
2. **Excel 등가**: 동일 입력으로 생성한 .xlsx의 셀 값·수식(NUMBERSTRING 한글금액·O/X 재계산)이 원본과 일치(exportEstimate 테스트 26케이스 통과).
3. **비노출**: quotes·breakdown·total_amount가 `/c/*` 응답·운영계획서 조립 데이터·activity_log·알림 페이로드 어디에도 없음(테스트로 증명).
4. **데이터셋 출처(v2.1 신설)**: 골든 데이터셋은 **jsx-easy-shift의 생성기로 만든 산출물만** 인정한다. 커뮤니케이터의 이식 엔진으로 기대값을 만들면 자기 자신과의 비교가 되어 등가 검증이 무의미해진다.
   - `source.repo`·`source.commit`·`source.engine`은 **생성 시점에 실제로 사용한 커밋**을 적는다. 단가를 바꾼 PR 이후에 재생성했는데 `source.commit`이 그 이전 커밋이면 **그 자체로 검증 실패**로 본다.
   - 재생성 절차: ① jsx-easy-shift를 해당 커밋으로 체크아웃 → ② 생성기 실행 → ③ 산출 JSON을 그대로 커밋(수기 편집 금지) → ④ `version`·`generated_at`·`source.commit` 갱신 → ⑤ PR 본문에 원본 커밋 해시 명기.
   - **엔진 상수를 바꾸는 변경은 데이터셋 재생성과 같은 PR에서만** 머지한다(§9 리추얼).

### 17.4 가격 상수 개정 이력 (v2.1 — LED 운용·중계 분리)

2026-08-22 jsx-easy-shift #45 → communicator #19로 이식. **LED 오퍼레이팅과 중계는 완전히 별개 비용**이며, LED 단가에는 어떤 중계 비용도 포함되지 않는다. 중계는 LED를 전제로 하지만, LED가 중계를 강제하지는 않는다(일방 의존).

| 항목 | 정의 (v2.1 확정) | 단가 | 조건 |
|---|---|---|---|
| LED 오퍼레이팅 | **V-mix 스위칭 + 전담 엔지니어 일체** (구 '4K 스케일러/KVM' 슬롯 승계 — 단가 동결, 성격만 장비→운영으로 재정의. **사용자 확정 2026-08-23**) | 2,500,000 | 100명 이상 + LED 운용 시 시스템 기본 포함. 100명 미만은 옵션 |
| 화면중계 | 발표자·무대 실황을 행사장 화면에 실시간 송출 | 2,000,000 | 카메라 최소 2대. LED 선행 필수 |
| 온라인중계 | 외부 온라인 송출 + 중계녹화 | +1,500,000 (합계 3,500,000) | 카메라 3대. 화면중계 위에 얹히는 **증분** — 단독 선택 시 화면중계가 자동 포함되고, 둘 다 선택해도 이중 과금되지 않는다 |
| 전체 녹화·편집 | 전 세션 풀 녹화 + 세션별 편집본 | 1,000,000 | 중계 시스템(카메라·스위칭) 선행 필수 |

- 옵션 키: 구 `scaler4k` → 신 `ledOperating`. 엔진은 `normalizeOptions()`로 구 키를 승계하므로 **저장된 옛 견적은 그대로 복원**된다. UI·저장 경로는 신 키 단일로 수렴한다.
- `relayBreakdown`이 중계 과금의 단일 출처이며 Excel 내보내기도 이 값을 소비한다(게이트 재유도 금지).
- **PRD·CLAUDE.md의 `system_scaler4k_auto` 키 표기는 `system_led_operating_auto`로 정정**한다(v2.1).

---

## 18. 부록 — 인프라 전환 절차 (v2.3 개정 — 사전 검증=개발 프로젝트 / 운영 전환=§20 D-Day 런북. 사용자 확인 게이트 표시 ■)

0. **(v2.3) 사전 검증 프로젝트** — Phase 4~6 구현·테스트는 개발용 무료 Supabase 프로젝트(`communicator-dev`, 기획자님 개인 계정) 기준으로 수행·통과시킨다. 운영 프로젝트는 D-Day에 생성하고, 전환은 **"키 교체 + setup.sql 1회 실행"뿐**이어야 한다(코드 변경 0 — 어긋나면 Phase 4 미완료로 본다). dev 프로젝트는 운영 전환 검증 후 Pause.
1. **새 Supabase 프로젝트** 생성(리전 ap-northeast-2, 이름 예: remember-mice-platform) ■ → URL·anon key·service role key 3종. service role은 Code 세션 env·Supabase Vault에만(챗·문서에 절대 기재 금지).
2. Auth: 이메일 매직링크 활성, 허용 도메인 env(`AUTH_ALLOWED_DOMAINS`), 첫 admin 계정 승격 SQL 1회 ■.
3. 마이그레이션: §4 전체를 순서대로(v2.2 DDL). **산출 규약(v2.3)**: `supabase/migrations/*.sql`(개발 이력) + 통합 **`supabase/setup.sql`**(신규 프로젝트의 SQL 에디터에서 1회 실행으로 전체 구축 — 멱등: 2회 실행 무해를 테스트로 증명) + `supabase/seed.sql`(데모 픽스처 4행사, 선택 — 운영 프로젝트엔 실행하지 않아도 된다).
4. **옛 Configurator DB 1회 임포트**(선택 ■ — 운영 중 견적 행이 있을 때만): events→projects(§16 매핑, onboarded_at=null·status active), estimates→quotes(config→input, total_amount, version·is_final·status 승계, breakdown은 엔진 재계산), event_tasks→wbs_tasks(code 매칭·checked→done·note·target). 스크립트 `scripts/import-configurator.ts`(service role, 1회, dry-run 출력 후 실행).
5. Vercel: communicator용 새 Vercel 프로젝트 생성 → env 3종(URL·anon·allowed domains) → 프리뷰 배포 확인 ■ → 도메인 `rmb-mice.com`을 옛 프로젝트에서 제거하고 새 프로젝트에 추가(DNS 변경 없음, Vercel 내부 이전) ■ → 옛 라우트 리다이렉트(§10 표) 동작 확인.
6. 옛 Vercel 프로젝트(jsx-easy-shift)는 도메인 제거 후 1주 유지 → 삭제 ■. GitHub jsx-easy-shift는 README 상단에 "아카이브 — communicator로 통합(2026-xx-xx)" 1줄 커밋 후 Archive ■. 옛 Supabase 프로젝트는 임포트 검증 후 Pause → 30일 뒤 삭제 ■.
7. 롤백: 5단계까지는 도메인을 옛 프로젝트로 되돌리면 즉시 복구. 6단계 이후는 아카이브 해제로 복구.

---

## 19. 부록 — 정산보드 정본 (v2.2, S-10)

> 근거: 내부정산 실물 13건(2026-08-23 사용자 제공) 분석. 마진 식은 실물 2건에서 원 단위 일치 검산을 마쳤다.
> 실고객사명·실거래액은 본 문서에 담지 않는다(#RULE-NO-COMPANY). 화면 예시 수치는 데모 확정 견적 `quo-003`의 엔진 산출값을 쓴다.

### 19.1 마진 모델 (정본)

사용자 정의: **최종 마진 = 항목별 마크업 합 + PCO 기획료 + RSVP 운영비. 리드젠(쇼업 보장)은 제외.**

```
항목 마크업(bucket) = bucket.quote_amount − Σ item.actual_amount      … has_cost=true 버킷만
최종 마진           = Σ 항목 마크업 + Σ bucket.quote_amount           … 뒤 항은 has_cost=false·is_margin_base=true 버킷
마진 기준 계약액     = Σ bucket.quote_amount                          … is_margin_base=true 버킷 전체
마진율              = 최종 마진 ÷ 마진 기준 계약액
```

**항등식(화면 검산에 쓴다)**: `마진 기준 계약액 − Σ 실집행 = 최종 마진`. 두 값이 어긋나면 화면 상단에 경고를 띄운다 — 어긋나는 경우는 버킷 플래그가 잘못 설정된 때뿐이다.

실물 검산(고객사명 제외):

| 계약 규모 | 항목 마크업 | ＋ PCO 기획료 | ＋ RSVP 운영비 | ＝ 계산값 | 파일의 마진 |
|---|---:|---:|---:|---:|---:|
| 84.0M | 13,899,909 | 10,043,500 | 4,000,000 | **27,943,409** | 27,943,409 |
| 16.6M | 6,825,136 | 1,830,000 | 760,000 | **9,415,136** | 9,415,136 |

- 실물 내부정산 시트의 실집행 합계 수식은 **PCO 기획료·모객 섹션을 아예 더하지 않는다**(예: `=G18+G31+G52+G62+G68`). 원가 없음을 실무가 이미 수식으로 표현하고 있었다.
- 리드젠(쇼업 보장)은 실물에서도 **별도 계약**이라 견적 총액에 포함되지 않는다. RSVP 운영비는 운영의 몫이므로 마진에 남고, PCO 기획료 base에도 포함된다.
- 실측 마진율 밴드 **27.5% ~ 69.0%**(7건). 규모가 클수록 낮아진다(100M대 31.8% ↔ 16M대 56.6%). 화면은 이 밴드를 참고선으로 표시하되 **판정하지 않는다**(표본 7건, 가정).

### 19.2 버킷 체계 — 기본 9 + 행사별 추가

기본 버킷은 확정 견적 breakdown에서 스냅숏된다. `recruit` 한 덩어리를 **rc와 ld로 쪼개는 것이 유일한 비자명 매핑**이다.

| code | 라벨 | 견적 breakdown 출처 | has_cost | is_margin_base |
|---|---|---|:---:|:---:|
| `s1` | 베뉴 사용료 | `s1` | ● | ● |
| `s2` | 시스템 구축 | `s2` | ● | ● |
| `s3` | 디자인·브랜딩 | `s3` | ● | ● |
| `s4` | 운영·등록·보험 | `s4` | ● | ● |
| `ot` | 추가옵션 | `options` | ● | ● |
| `at` | 참관객 관리 | `attendee` | ● | ● |
| `s5` | PCO 기획료 | `s5` | — | ● |
| `rc` | RSVP 운영비 | `recruit` 중 `rsvpPkg` | — | ● |
| `ld` | 리드젠(쇼업 보장) | `recruit` 중 `showup` | — | — |

- `has_cost=false` 버킷은 **발주·실비 입력을 UI와 API 양쪽에서 막는다**(입력 시 422). 견적액 전체가 마진이다.
- `is_margin_base=false`(현재 `ld`뿐)는 마진 기준 계약액에서 빠진다. 화면에는 회색으로 남겨 "왜 안 세는지"를 보이게 한다 — 숨기면 담당자가 누락으로 오해한다.
- **행사별 버킷 추가**: `source='custom'`, `quote_amount=0`, `has_cost=true`, `is_margin_base=true`가 기본값. 넣는 즉시 마크업이 음수로 잡히고 그것이 맞다.
  - 실물 근거 — 섹션 수가 행사마다 5~9개로 다르고, 다음이 실제로 추가되었다: F&B 추가비용 · 전시 및 이벤트 · 가구 임차 · 기념품 · 연사 사례비 · 행사장 조성비용 · 추가 발생 비용. 고정 8버킷으로는 담기지 않는다.

### 19.3 3단 추적과 항목 상태

한 항목은 **견적(버킷이 보유) → 발주(약정) → 실비(집행)** 세 값을 갖는다. 실물에는 발주/실비 구분이 없고 실집행 한 칸뿐이므로, 3단은 **새로 얹는 층**이다.

| 상태 | 뜻 | 쓰는 사람 | 금액 |
|---|---|---|---|
| `planned` | PM이 목록에 올림 | pm | 없어도 됨 |
| `ordered` | 담당자가 협력사·발주액 확정 | 담당자 | `ordered_amount` 필수 |
| `settled` | 실비·증빙 확정 | 담당자 | `actual_amount` 필수 |
| `cancelled` | 취소 — 집계에서 제외 | pm·담당자 | 보존 |

- **발주는 항목 단위다.** 실물에서 한 협력사의 11개 항목 중 10개가 0원이고 한 줄에 몰려 있는 사례가 있으나, 이는 구조가 아니라 **손입력 부담 때문의 관행**이다(협력사 견적서에는 상세 항목이 다 있다). 묶음 입력을 허용하면 관행이 그대로 옮겨 와 버킷별 ± 외에는 아무것도 얻지 못한다.
- 그 대가로 **§19.5 업로드 파싱이 필수 전제**가 된다. 파싱 없이 항목 단위를 강제하면 담당자는 첫 행사에서 이탈한다.
- 할인·조정은 **음수 금액 항목**으로 넣는다(실물에 `-4,550,000` 사례 존재). 별도 필드를 만들지 않는다.

### 19.4 부가세 규약 (실물 결함 대응)

실물 시트가 손계산 중이다 — `=23320000/1.1`, 심한 곳은 `=241000+(85800/1.1)`로 **한 셀에 포함분과 별도분이 섞여** 있다.

| 규칙 | 내용 |
|---|---|
| 저장 | 모든 금액은 **부가세 별도**로 저장한다. 견적 breakdown이 별도 기준이므로 비교축이 일치한다 |
| 입력 | 입력 칸마다 `vat_included` 토글. `true`면 저장 직전 `round(v / 1.1)`로 분리하고, 받은 원본값을 `input_amount_raw`에 함께 남긴다 |
| 표시 | 항목 상세에 "받은 금액 1,320,000(포함) → 저장 1,200,000(별도)"를 같이 보여준다. 사람이 계산하게 두지 않는다 |
| 파싱 | 업로드 문서에 부가세 표기가 없으면 **자동 판정하지 않고 반드시 묻는다**(§19.5 확인 큐) |
| 반올림 | 원 단위 반올림. 버킷 소계는 항목 저장값의 단순 합이며 재반올림하지 않는다 |

### 19.5 협력사 견적서 업로드 → 자동 배분 (Phase 4.7)

PDF·엑셀·사진에서 항목·단가·수량을 읽어 버킷에 배정하고, **확신이 서지 않는 것만 담당자에게 묻는다.**

```
업로드 → 파싱(서버) → 자동 배정(확신 높음) ┐
                     └ 확인 큐(확신 낮음) ┴→ 담당자 확인 → settlement_items 생성
                                              원본 파일은 근거로 보존
```

- 묻는 것은 대개 둘이다 — **어느 버킷인지**, **부가세가 포함인지**. 그 외는 자동으로 넣는다.
- **읽은 결과는 항상 담당자 확인을 거쳐 저장한다.** 파싱 결과를 직접 커밋하지 않는다(오독이 곧 정산 오류가 된다).
- 단계: 엑셀(구조가 가장 또렷) → PDF → 사진. 엑셀만으로도 항목 단위가 성립한다.
- 파싱은 서버가 필요하므로 **Phase 4.7**로 둔다. 스키마(`settlement_imports`)는 v2.2에서 미리 만들고, Mock 단계에서는 업로드 버튼이 "Phase 4.7에서 열립니다" 안내를 띄운다 — **게이트 뒤에 숨기지 않는다**(§10 진입점 원칙).
- 이 절이 §19.3의 항목 단위를 성립시키는 조건이다. 순서를 뒤집지 말 것.

### 19.6 협력사 마스터

같은 협력사가 행사 간에 반복 등장하고, 실물에는 같은 업체가 역할별로 갈려 적힌 사례가 있다. 행사마다 이름을 다시 치면 표기가 갈려 집계가 불가능해진다.

- `vendors`는 **프로젝트에 종속되지 않는 조직 단위 마스터**다(§4-23 DDL 참조). 항목은 `vendor_id`로 참조하고, 자유 입력은 신규 등록으로 승격시킨다.
- 누적되면 "이 협력사는 이 버킷에서 평균 얼마"가 나오고, 그것이 다음 견적의 근거가 된다 — 단가표를 코드에서 DB로 옮기는 2차 과제(§13)와 연결된다.
- `vendors.name`은 실제 거래처명이라 **#RULE-NO-COMPANY의 예외**다(픽스처에는 가상 명칭만 쓴다).

### 19.7 비공개 보증 — 규칙이 아니라 가드로

"발주처 절대 비공개"는 문장으로는 지켜지지 않는다. §12의 금액 비노출 검사를 확장한다.

| 조치 | 내용 |
|---|---|
| 금지 키 확장 | `quotes` · `breakdown` · `total_amount`에 **`settlement` · `ordered_amount` · `actual_amount` · `markup` · `margin`** 추가 |
| 검사 범위 확장 | 기존 `pages/Client*` · `components/plan` · `components/client`에 **`pages/Landing*` · `lib/landing*`** 추가 — 랜딩은 토큰조차 없는 유일한 완전 공개 지면인데 현재 검사 밖이다 |
| 런타임 검사 | `getClientQueue` · `getClientStatus` · `getPlan` · `listActivity` 응답 객체 트리에 위 키가 0건 |
| 역검증 | 결함을 일부러 되돌려 넣어 가드가 실제로 실패하는지 확인하고, 그 사실을 체크아웃 보고에 적는다 |
| 토큰 경로 | `settlement_*` · `vendors`는 §6.2 화이트리스트 쿼리에 **포함하지 않는다**. Edge Function이 조회 대상으로 삼는 테이블 목록에 추가 금지 |

### 19.8 열린 질문 (v2.2 시점)

- 실측 마진율 밴드는 표본 7건이다. 참고선으로만 쓰고, 20건 이상 쌓이면 규모 구간별 기준선으로 승격을 재검토한다 — **가정**.
- 협력사 견적서 파싱의 정확도 목표치는 정하지 않았다. Phase 4.7 착수 시 엑셀 10건으로 실측한 뒤 정한다 — **가정**.
- 발주서 발행(우리 → 협력사) 기능은 이번 범위 밖이다. 정산보드는 **기록**만 하며, 발주 문서 자체는 기존 방식을 유지한다.

---

## 20. 부록 — D-Day 런북 (v2.3 신설 — 2026-08-31 월 첫 출근일, 자격증명 주입만으로 실전 전환)

> 전제: Phase 4·5·6 PR이 전부 main 머지·챗 검수 통과 상태. 아래는 **코드 변경이 0인 작업만** 담는다 — 하나라도 코드 수정이 필요해지면 그 항목은 Phase 미완료였던 것이므로 레포 이슈로 되돌린다.
> 수행자 = 기획자님(비개발자 기준, 전 단계 클릭 단위). 클릭 단위 상세판은 별도 런북 문서로 제공(스프린트 완료 후 최종본 — 레포 실물과 대조 검증을 거친다). ■ = 진행 전 확인 게이트.

### 20.1 트랙 개요 (총 예상 90분, 순서 고정)

| 순서 | 트랙 | 하는 일 | 예상 | 산출 |
|---|---|---|---|---|
| 1 | **서버(Supabase)** | 운영 프로젝트 생성 → setup.sql 1회 실행 → 3키 확보 | 25분 | Project URL · publishable key · secret key |
| 2 | **배포(Vercel)** | 레포 import → env 입력 → 배포 확인 (■ rmb-mice.com 이전은 별도 결정) | 20분 | 접속 URL |
| 3 | **슬랙** | 리멤버 워크스페이스에 Incoming Webhook 생성 → 등록 | 15분 | SLACK_WEBHOOK_URL |
| 4 | **구글드라이브** | 전용 운영 계정 확보(■ 회사 계정 정책 확인) → OAuth 클라이언트 생성·Production 게시 → 최초 1회 동의 → refresh token 저장 | 30분 | Drive OAuth 자격증명 4종 |
| 5 | **스모크** | `scripts/drive-smoke.ts` 5단계 + 알림 1건 + 로그인 매직링크 왕복 + 데모 시나리오 1개 | 15분 | 전 항목 통과 확인 |

### 20.2 트랙별 정본 절차

**T1 서버**: supabase.com에서 운영 프로젝트 생성(§18-1: ap-northeast-2, 이름 `remember-mice-platform` ■ 조직 계정 여부는 당일 결정 — 개인 계정으로 시작해도 이관 가능) → SQL Editor에서 `supabase/setup.sql` 전문 1회 실행 → (선택) `seed.sql`은 운영엔 실행하지 않음 → Auth 설정: 이메일 매직링크 활성 + 허용 도메인 env(§18-2) → Settings→API Keys에서 3키 복사. 첫 admin 승격 SQL 1회 ■(setup.sql 말미에 주석으로 동봉된 1줄을 본인 이메일로 실행).

**T2 배포**: Vercel 가입(GitHub 로그인) → communicator 레포 import(`vercel.json` 동봉 — 설정 무변경) → 환경 변수 입력: `VITE_SUPABASE_URL`·`VITE_SUPABASE_PUBLISHABLE_KEY`·`VITE_DATA_PROVIDER=supabase` + 서버측 secret은 Supabase Edge Function secrets에만(§12) → Deploy → 접속 URL 확인. ■ rmb-mice.com 도메인 이전(§18-5)과 jsx-easy-shift 아카이브(§18-6)는 사내 협의 후 별도 수행 — 당일 필수 아님.

**T3 슬랙**: 리멤버 워크스페이스에 앱 생성 → Incoming Webhooks 활성 → 알림 채널 지정 → Webhook URL 복사 → Supabase Edge Function secrets에 `SLACK_WEBHOOK_URL` 등록 → 앱 설정 화면(S6 ③연동 탭)에서 프로젝트별 웹훅 확인. ■ 워크스페이스 앱 설치 권한이 관리자 승인제면 당일 요청 발송으로 대체하고, 그동안 no-op 폴백(§9)으로 사용 개시.

**T4 드라이브**: §2 정본 그대로 — 전용 운영 Google 계정(■ 회사 Workspace 계정 발급 가능 여부에 따라 개인 보조 계정으로 임시 시작 가능, 단 실파일 축적 전에 확정) → Google Cloud Console에서 OAuth 클라이언트 생성 → 동의 화면 **Production 게시**(Testing 금지 — 7일 만료) → scope `auth/drive` → 최초 1회 동의로 refresh token 발급(`scripts/drive-auth.ts` 안내 절차) → Supabase secrets에 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·`GOOGLE_REFRESH_TOKEN`·`DRIVE_ROOT_FOLDER_ID` 등록.

**T5 스모크**: ① `drive-smoke` 5단계(refresh 교환→트리 생성→업로드→copy→스트리밍) 전부 통과 ② 아무 항목 상태 전이 1건 → 슬랙 채널에 알림 도착 ③ 본인 이메일 매직링크 로그인 왕복 ④ 데모 시나리오 1개(항목 생성→업로드→컨펌 발송→토큰 링크 열람) 실기 왕복. 전부 통과 시 실전 투입 가능 — 첫 행사 온보딩(후보: DMS 2026)으로 진행.

### 20.3 되돌림
- T1~T4 중 실패한 트랙은 해당 env만 비우면 즉시 이전 상태(mock 또는 no-op)로 복귀 — 다른 트랙 진행을 막지 않는다.
- dev 프로젝트(`communicator-dev`)는 T5 통과 확인 후 Pause(§18-0).


---

## 21. 부록 — 주최형(파트너) 확장 정본 (v2.4)

### 21.1 스키마 (Postgres DDL 요약 — §4 규약 준용)

```
projects
  + kind text not null default 'agency'          -- 'agency' | 'host'
  + partner_guide_url text null                  -- (v2.4.1) 파트너 참가 가이드 링크 — /p 포털 상단 버튼
  + partner_contact_email text null              -- (v2.4.1) 파트너 문의 창구 — /p 포털 하단 안내

partner_tiers (
  id uuid pk, project_id fk, code text,           -- 'diamond' 등 slug
  name text, description text, capacity int null, sort int,
  unique(project_id, code) )

partners (
  id uuid pk, project_id fk, name text,
  tier_id fk partner_tiers, status text default 'active',   -- active | withdrawn
  contract_amount bigint null,                    -- ★ 내부 전용. 외부 경로 직렬화 금지(§19.7 확장)
  note text, created_at )

partner_tokens (                                   -- client_tokens와 동형 (연락처 단위)
  id uuid pk, partner_id fk, contact_name text, contact_email text,
  token uuid unique, expires_at, revoked_at, last_seen_at )

deliverables
  + partner_id uuid null fk partners              -- inbound 제출물 소유 파트너 (대행형 항목은 null)

wbs_tasks
  + direction text not null default 'internal'    -- 'partner_submit' | 'host_notice' | 'internal'
  + partner_id uuid null fk partners              -- partner_submit 인스턴스만 사용

quotes
  + source text not null default 'engine'         -- 'engine' | 'imported'

quote_imports (
  id uuid pk, project_id fk null, file_name text, format text,   -- 'A'|'B'|'C'
  parsed jsonb,                                   -- 섹션·항목·헤더·검산 스냅숏 (원본 보존)
  mapping jsonb, status text,                     -- detected → confirmed → distributed
  quote_id fk null, created_by, created_at )
```

### 21.2 계약 (R-H1~R-H7)

| # | 계약 |
|---|---|
| R-H1 | kind 전환은 표시 계층만 바꾼다 — 어떤 행도 삭제되지 않는다(유형 토글과 동일 원칙, 테스트로 증명) |
| R-H2 | `/p/{token}` 응답에 타 파트너의 어떤 행도 포함되지 않는다 — 쿼리 자체에서 제외(대조군 테스트) |
| R-H3 | `contract_amount`·정산·견적 금액 키는 `/p/*` 응답·파트너 화면 소스에 0건 — grep 가드 범위에 `src/pages/Partner*`·`src/components/partner` 추가 |
| R-H4 | 파트너 제출·재제출·검토 전이는 전부 assertTransition 경유(§5.1) — 수정요청 코멘트 필수(422) |
| R-H5 | partner_submit 태스크의 파트너별 인스턴스는 재전개 시 code+partner_id 매칭으로 상태 보존(§15.3) |
| R-H6 | 파트너 제출물의 코멘트 visibility 규칙은 발주처와 동일 — 내부 internal, 파트너 작성분 shared 강제 |
| R-H7 | 주최형에서도 발주처 경로(`/c/*`)는 유효하다(주최 행사에 별도 발주처가 있는 경우) — 두 외부 경로는 서로 독립 |

### 21.3 데모 픽스처 (Phase 3.15)

주최형 데모 행사 1건 추가: "가상 서밋 2026"(주최형 × 모객형, D-49) — 파트너 5(다이아 1·골드 1·실버 3, 전부 가상 명칭 #RULE-NO-COMPANY), 등급 3종 시드, HT 템플릿 전개, 제출 상태 분포(승인 2·검토중 1·수정요청 1·미제출 1), `/p/demo-partner` 데모 토큰. 기존 대행형 픽스처 4행사는 불변(kind='agency' 기본값).

---

## 22. 부록 — 견적서 임포트 계약 (v2.4)

### 22.1 지원 서식 3형 (실서식 분석 기반, 2026-08-27)

| 형 | 실례 | 열 구조 | 특징 |
|---|---|---|---|
| A형 단가·수량형 | 카페24 이커머스서밋 v4.1 | 구분·항목·규격/사양·단가·수량·일수·금액·비고 | 상단 합계 블록(항목합→대행료 %→절사→VAT→총액), 섹션 8± |
| B형 금액 단식 | TAAS2026 GBR v12·PLZ v10 | ITEM·DESCRIPTION·SPEC·금액·REMARKS | 단가·수량 없음, 섹션 합계(total 행), 최종견적+VAT |
| C형 패키지형 | CATOPIA 패키지(Remember MICE Package Estimate) | ITEM·DESCRIPTION·SPEC·UNIT PRICE·QTY·AMOUNT(·SELECT) | 엔진과 동일한 6섹션 + Add-ons O/X + PCO 25% |

PDF 서식은 2차(xlsx 우선). 같은 행사의 복수 안(예: TAAS GBR/PLZ 베뉴 2안)은 **한 견적의 버전 2개**로 등록해 비교한다.

### 22.2 인식 규칙 (파서 계약)

1. **헤더 필드**: 라벨 사전 매칭 — 행사명/Project Title, 고객명, 일시/기간, 장소/Venue, 견적일, 담당자, 총액 계열(최종 견적·총 견적·Total). 인식 실패 필드는 빈 값으로 확인 큐에 노출(추정 금지).
2. **섹션**: "N." 숫자 프리픽스 제목 행(뒤에 소계/total 행 동반) 기준. 섹션 없는 문서는 전체를 1섹션으로.
3. **항목 행**: 금액 열에 숫자가 있는 행. 열 역할(단가·수량·일수·금액)은 헤더 행 라벨로 추정하고, A형은 단가×수량×일수=금액 검산으로 역확인.
4. **합계 체계**: 항목합·대행료/기획료(율 % 인식 — 마진 기준과 연결)·절사·부가세(포함/별도 판별)·총액.
5. **검산**: Σ항목 = 문서 총액(대행료·절사·VAT 반영 후 오차 0원). 불일치는 차액과 함께 경고로 표시하되 진행은 차단하지 않는다(확인 큐에서 사람이 판단).
6. **버킷 매핑 기본표**: 베뉴·대관·장소 → s1 / 무대·시스템·AV·LED·음향·조명·중계·전기·부스 → s2 / 디자인·브랜딩·콘텐츠·사인 → s3 / 인력·운영·보험·MC → s4 / 대행료·기획료 → s5 / 등록·RSVP·모객 → rc / 기념품·경품·F&B·웰컴·애드온 → custom 버킷. 신뢰도 낮은 항목(키워드 복수 매칭·무매칭)만 확인 필요로 표시.

### 22.3 원칙 (R-Q1~R-Q4)

| # | 계약 |
|---|---|
| R-Q1 | **자동 커밋 금지** — 모든 임포트는 확인 큐(2단계)를 거친 confirm 호출로만 quotes가 된다(§19.5와 동일 원칙) |
| R-Q2 | 원본 보존 — 파싱 스냅숏(parsed)과 사람이 수정한 매핑(mapping)을 분리 저장, 등록 후에도 근거 추적 가능 |
| R-Q3 | 임포트 견적도 금액 비노출 가드 전 규칙 적용 — 발주처·파트너·랜딩·운영계획서·알림에 0건 |
| R-Q4 | **실고객 견적서 파일은 레포에 커밋 금지** — 파서 골든 테스트는 실서식 구조를 본뜬 가상 데이터 픽스처 3종(A·B·C형)으로 작성. 실파일 검증은 Code 세션 로컬에서만 수행하고 결과 수치만 보고 |

### 22.4 분배 4종 (3단계)

| 대상 | 동작 | 조건 |
|---|---|---|
| 견적 모듈 등록 | quotes(source='imported') 새 버전 생성, S-2 목록에 '임포트' 배지 | 기본 켜짐(필수) |
| 행사 만들기 프리필 | §16 핸드오프 매핑 재사용 — 인식된 행사명·일시·장소·인원으로 S0 프리필 | 행사 미연결 시 |
| 정산보드 기준 견적 | 확정(finalize) 후 §19 버킷 스냅숏 — 매핑 확정본이 버킷 배정 근거 | 확정 견적만 |
| 보드 항목 시드 | 디자인·운영 성격 항목을 해당 보드에 시드 — **금액 제외, 품목·규격·수량만** | 선택(기본 꺼짐) |


---

## 23. 부록 — 운영보드 재구성 정본 (v2.5)

### 23.1 스키마 (§4 규약 준용 — cues 패턴)

```
deliverables.category 정형 3종: '큐시트' | '시나리오' | '운영가이드'   -- 정형 카테고리는 파일 업로드 대신 빌더

scenario_blocks (
  id uuid pk, deliverable_id fk deliverables,     -- category='시나리오' 항목에만
  session_id uuid null fk program_sessions,       -- 프로그램표 연동(세션 그룹)·수동 블록은 null
  time text null, kind text not null,             -- 'mc'|'video'|'protocol'|'transition'|'custom'
  script text, note text, sort_order int )

guide_sections (
  id uuid pk, deliverable_id fk deliverables,     -- category='운영가이드' 항목에만
  kind text not null,                             -- 'zone'|'role'|'emergency'|'contacts'|'custom'
  title text, content text,                       -- content = 마크다운(§S9 초경량 렌더러 재사용)
  source_ref text null,                           -- 'zone_items'|'role_charters'|null — 연동 출처
  source_stale boolean default false,             -- 원본 변경 감지 표시(자동 덮어쓰기 금지)
  sort_order int )
```

### 23.2 계약 (R-O1~R-O6)

| # | 계약 |
|---|---|
| R-O1 | 유형 전환·이관은 무손실 — 기존 운영 항목은 자동 분류(큐시트→큐시트 카드·나머지→기타)만 되고 어떤 행도 삭제·변형되지 않는다 (테스트로 증명) |
| R-O2 | 시나리오·운영가이드의 컨펌·버전·스냅숏 루프는 큐시트 규약을 그대로 재사용 — 새 상태머신·새 스냅숏 규약 금지(doc-snapshot은 cue-snapshot의 일반화·위임) |
| R-O3 | seed(프로그램표·존운영·R&R 초기 로드)는 빈 문서에서만 — 기존 블록·섹션이 있으면 409 (덮어쓰기 금지) |
| R-O4 | 연동 섹션(source_ref)은 원본 변경 시 stale 표시 후 **사람이 차이를 확인하고 반영** — 자동 동기화 금지(기준 견적 갱신 패턴) |
| R-O5 | exportScenarioToCues는 기존 큐를 보존하고 후미 삽입만 한다 — 큐시트를 재생성·대체하지 않는다 |
| R-O6 | 개인 연락처는 화면·S9 조립 데이터에 포함하지 않는다 — 인쇄 스냅숏 포함은 명시 옵션(기본 꺼짐) |

### 23.3 시나리오 ↔ 큐시트 역할 분리 (정본)

시나리오 = **사람이 읽는 진행 대본**(MC·진행팀·의전) / 큐시트 = **콘솔 오퍼레이터용 3채널 큐**(음향·조명·영상). 내보내기 변환 규칙: kind='video'·'transition' 블록 + script 내 조명·음향 큐 표기(예: "M-02", "C-11")를 큐 후보로 추출 → 대상 큐시트에 큐 행으로 추가(시각·구분 매핑, 대본 전문은 미복사 — 비고에 시나리오 블록 참조만). 이후 두 문서는 독립 편집.

### 23.4 데모 픽스처 (Phase 3.16)

RE:BUILD 27에 시나리오 1건(세션 3개 그룹·블록 8행, 프로그램표 연동)·운영가이드 1건(4섹션, 존운영·R&R 연동 시드 + 존운영 원본 1건 변경으로 stale 상태 1개 시연). 기존 큐시트 2건은 큐시트 카드로 이관 표시.

## 24. 부록 — 등록 구글 시트 연동 정본 (v2.6, S4)

> 사용자 승인 2026-08-28 (디자인 핸드오프 `등록 보드 · 구글시트 연동` 시안). 미결 2건 확정 —
> **체크인 배치 = B안(사이드바 '현장 체크인' 별도 화면) — 사용자 확정.** 3.17 구현은 A안(등록 보드 탭)이었고
> 이는 Code 판단이었으며, 챗 실측 검수(2026-08-29) 후 3.17.1에서 B안으로 복원했다.
> 동기화 = **B안(주기 자동 확인 + 수동 병행)**.
> DataProvider **v10 재동결(10메서드 추가 · 120메서드)**. `importVendorQuote`는 v11 예약(만들지 말 것).

### 24.1 대원칙

1. **시트 → 앱 단방향. 시트가 정본.** 앱은 어떤 경우에도 시트에 쓰지 않는다 — 이 방향은 연결 후 변경 불가.
2. **자동 덮어쓰기 없음.** 자동 확인은 **감지까지만** 하고, 화면 반영은 항상 사람이 차이를 확인한 뒤에 일어난다(§23.2 R-O4와 같은 패턴).
3. **필드 소유 분리.** 매핑된 명단 필드는 시트 소유(앱에서 수정 불가), 체크인·비고는 앱 소유(시트를 덮어쓰지 않음).
4. **하드 삭제 금지.** 시트에서 행이 사라져도 삭제하지 않고 `sheet_status='removed'`(시트에서 제거됨)로 이력을 보존한다.
5. **연락처 기본 마스킹.** 원문은 내보내기 시 명시 옵션으로만 포함한다.

### 24.2 스키마 (§4 규약 준용)

```
sheet_connections (
  id uuid pk, project_id fk projects unique,      -- 행사당 1개
  state text not null,                            -- 'disconnected'|'connected'|'stale'|'revoked'
  title text, url text, tab_name text,
  mapping jsonb not null,                         -- [{column, field}] field: name|org|title|email|phone|group_tag|registered_at|null
  connected_at timestamptz, connected_by text,
  snapshot_at timestamptz,                        -- 화면이 기준으로 삼는 마지막 성공 읽기 시각
  snapshot_version int not null default 1,        -- 낙관적 잠금 키 (§24.3)
  checked_at timestamptz,                         -- 마지막 자동/수동 확인
  auto_check_minutes int not null default 15,     -- 0이면 수동만
  source_modified_at timestamptz null,            -- 원본 시트 최종 수정 — stale 판정 근거
  pending_added int, pending_changed int, pending_removed int,
  failure_times jsonb, last_success_at timestamptz null )

attendees 확장 (전부 nullable — 시트 연결 시에만 채워진다)
  sheet_row_id text null,                         -- 원본 행 식별자
  title text null, group_tag text null,           -- 시트 소유
  sheet_status text null,                         -- 'applied'|'confirmed'|'cancelled'|'removed'
  note text null                                  -- 앱 소유
```

### 24.3 동시 접속 계약 (다중 담당자 운영)

행사 당일에는 여러 담당자가 같은 등록 보드를 동시에 연다. 서로 다른 스냅숏을 보고 있다는 사실이
**반드시 감지되어야** 하므로 낙관적 잠금을 계약에 넣는다.

| # | 계약 |
|---|---|
| R-S1 | `applySheetDiff(projectId, snapshotVersion)`는 호출자가 **보고 있던** 버전을 넘긴다. 저장된 값과 다르면 **409 conflict** — "다른 담당자가 이미 반영했습니다. 최신 차이를 다시 확인해 주세요." 화면은 조용히 덮어쓰지 않는다 |
| R-S2 | `checkSheetUpdates`는 상태·버전·미확인 건수만 갱신한다 — 데이터를 반영하지 않는다(자동 감지 전용) |
| R-S3 | 반영이 성공하면 `snapshot_version`이 증가하고 `snapshot_at`이 원본 수정 시각으로 이동한다 |
| R-S4 | Phase 4에서 폴링을 Supabase Realtime 구독으로 교체할 때 **이 계약은 그대로 둔다** — 감지 경로만 바뀌고 반영 경로(사람 확인 → 버전 검사)는 불변이다 |

> **열린 질문(Phase 4)**: 진정한 실시간 상호 반영 — 담당자 A의 반영이 담당자 B 화면에 즉시 나타나는 것 — 은
> 서버 푸시가 있어야 가능하다. mock·서버 0 단계에서는 R-S1의 409 감지가 그 자리를 대신한다.
> Phase 4 착수 시 `sheet_connections` 변경을 Realtime 채널로 브로드캐스트할지 확정할 것.

### 24.4 DataProvider v10 (110 → 120)

```
getSheetConnection(projectId)                    -> SheetConnection | null
probeSheet(projectId, url)                       -> SheetProbe          -- 위저드 1·2단계(제목·탭 목록)
previewSheetColumns(projectId, url, tabName)     -> SheetColumnPreview[] -- 3단계(첫 행 미리보기·마스킹)
connectSheet(projectId, input)                   -> SheetConnection      -- 필수 매핑 name+email 없으면 422
disconnectSheet(projectId)                       -> void
reauthorizeSheet(projectId)                      -> SheetConnection      -- revoked 복구
checkSheetUpdates(projectId)                     -> SheetConnection      -- 감지만(R-S2)
getSheetDiff(projectId)                          -> SheetDiff
applySheetDiff(projectId, snapshotVersion)       -> SheetApplyResult     -- 버전 불일치 409(R-S1)
getSheetRegistrationStats(projectId)             -> SheetRegistrationStats | null   -- 미연결이면 null
```

> **3.17.1 T4 — 반환 타입 개명**: `SheetRegistrationStats.response_rate` → **`confirm_rate`**(확정 ÷ 신청).
> RSVP '응답률'(발송 대비 응답)과 분모가 다른데 이름이 같아 화면에서 오독을 낳았다. 화면 라벨도 '확정률'이다.
> 같은 개정에서 `pending_added`·`pending_removed`·`excluded_rows`를 반환에 추가했다(§24.5 캡션 항등식·제외 목록).
> **메서드 수는 120 불변** — 시그니처 추가가 아니라 반환 타입 확장이다.

> **null 반환 사유(구현 확정)**: 연결 카드는 상시 노출이므로 미연결 행사에서 404를 던지면 KPI가 오류 화면으로 보인다.
> 화면은 null일 때 기존 `getRegistrationStats`로 폴백한다.
>
> **`auto_check_minutes` 저장 경로는 v10에 없다.** 자동 확인 주기는 화면이 뷰어 단위로 보관하며,
> 행사 단위로 공유 저장하려면 사용자 승인 + 설계서 개정이 따라야 한다 — Phase 4 열린 질문.
>
> **열린 질문(Phase 4)**: 신청 상태(`sheet_status`)는 시트 소유 값이지만 매핑 필드 7종에 없다.
> mock은 원본 행의 상태를 그대로 따라간다 — 상태 컬럼을 매핑 대상에 넣을지 확정할 것.

### 24.5 화면 계약 (S4)

- **연결 카드**는 탭 위 페이지 상단에 **상시 노출**(게이트 뒤에 숨기지 않음 — §10 진입점 원칙). 상태 4종:
  연결됨·정상 / 갱신 있음(주의 + ● 도트) / 권한 끊김·재인증 필요(차단) / 미연결(빈 상태 ②).
- **갱신 있음 → 인라인 차이 확인**: 카드 안 canvas 인셋에 `구분 / 대상 / 현재 화면(스냅숏 시각) / 시트 원본(수정 시각)` 4열 표 +
  [나중에] · [변경 n건 반영]. 확인 전까지 화면은 직전 스냅숏 기준을 유지한다.
- **KPI 4카드**(시트 기준): 신청 · 확정 · 취소 · 체크인. 응답률·체크인율은 보조 수치로 내린다.
- **명단 표는 읽기 전용**이며 상단 steel 배너로 필드 소유 분리를 명시한다.
- **체크인 탭**(결정 A)은 현장용이므로 밀집 모드 금지 · 터치 타깃 44 고정.
- **최초 연결 3단계**: URL → 탭 선택 → 컬럼 매핑. 필수 매핑은 **이름 + 이메일**. `시트 → 앱 단방향` 고지는 3단계 내내 상단 고정.
- **xlsx 임포트는 약화** — 버튼이 아니라 작은 텍스트 링크 + "시트 연결 중에는 보조 수단입니다".

### 24.6 금지

시트에 쓰는 코드 일체 · 명단 필드의 앱 내 편집 UI · 확인 없는 자동 반영 · 하드 삭제 · 연락처 원문 기본 노출.

## 25. 부록 — 행사 유형 4분류 × 프리셋 정본 (v2.6 증분, Phase 3.18)

> 원본 = `mice-communicator-추가설계안-행사유형4분류-v1.0.md`(jc-redteam Deep Audit 반영 확정본).
> **절차 이탈 표기**: 협업 리듬 '시각안 먼저'를 **사용자 지시로 생략**했다(2026-08-29 "레드팀 검증 후 결과물만 전달,
> 코드로 진행"). 대체 게이트 = 구현 후 스크린샷 검수 + 시각 이탈 보고. **시각안 승인은 존재하지 않는다** —
> 사용자 승인이 실제로 있었던 것은 ①4분류 도입 ②[B] 게이트 ③레드팀 대체 검증 셋뿐이다.

### 25.1 format의 권한은 3가지로 한정한다 (계약 — 감수 C1)

행사 유형을 **3포맷 + 1옵션**으로 분류한다: `projects.format`(conference / dms / exhibition) + `psa_enabled`(비즈매칭).

`format`이 할 수 있는 일은 **다음 3가지뿐**이다.

| # | 권한 | 내용 |
|---|---|---|
| 1 | **온보딩 시드** | format 선택 시 kind·event_type 기본값, WBS 템플릿, R&R·컴플라이언스·tier 시드를 **1회** 전개 |
| 2 | **견적 모델 결정** | conference = 비용형(현행 엔진, **무변경**) / dms·exhibition = 판매형(신설 `calcRevenue`) |
| 3 | **전용 화면의 복합 게이트 구성요소** | 예: 판매 플래너 = `kind='host' && format in ('dms','exhibition')` |

**상시 모듈 표시 게이트는 기존 축이 그대로 가진다** — 파트너 보드(S-11)=`kind`, 등록 모듈 깊이=`event_type`,
PSA 보드=`psa_enabled`. format이 상시 토글의 **두 번째 주인이 되지 않는다**. 이 한정이 §10 진입점 원칙
("성격이 다르면 메뉴 자체가 없어야 한다")과의 충돌을 막는다.

format 선택은 **시드이지 잠금이 아니다** — 이후 kind·event_type을 독립적으로 바꿀 수 있고, 전환 시 데이터는
보존된다(표시 계층 원칙). format 전환은 확인 다이얼로그 + WBS 재전개(§4-15 보존 규칙 재사용 — code 매칭·
status·done_at 보존).

**매핑**: 컨퍼런스 일반형 = conference·agency·general / 컨퍼런스 모객형 = conference·agency·recruiting /
DMS = dms·host·recruiting / 전시회 = exhibition·host·recruiting.

**B안(kind×event_type 조합 해석) 기각 사유**: DMS·전시회가 같은 조합(host×recruiting)이라 구분 축이 없다.

### 25.2 진입점 (감수 C2 — v0.9의 "S-2 스텝 0" 폐기)

- **정본 진입점 = S0 온보딩 ③유형 스텝.** 현행 2카드(일반형/모객형) → **4카드**(컨퍼런스 일반형·컨퍼런스 모객형·
  DMS·전시회) + PSA 체크박스 + 세부 토글(시드된 kind·event_type을 노출하고 **수정 가능**). 완료 시 프리셋 일괄 시드.
- **S-2 견적 모듈은 conference 전용 도구로 존치**(현행 5스텝 무변경). 주최형은 발주처 견적이 없어 S-2를 경유하지 않는다.
- **판매 플래너**(명칭 고정, 신규 화면): dms·exhibition의 판매형 설계 도구. **파트너 보드(S-11) 상단 탭**으로
  가시 노출 — 게이트 뒤 숨은 화면 금지 원칙 준수.
- §16 핸드오프는 conference 경로만 해당(현행 유지) + 스냅샷에 `format`('conference' 고정)·`psa_enabled` 추가.
  판매 플래너는 핸드오프가 아니라 **행사 내 도구**(행사가 먼저 존재한다).

### 25.3 프리셋 매트릭스

| 세팅 항목 | 컨퍼런스 일반형 | 컨퍼런스 모객형 | DMS | 전시회 [가정] |
|---|---|---|---|---|
| 견적 도구 | S-2 비용형(무변경) | S-2 비용형+리드(무변경) | 판매 플래너(세션+부스) | 판매 플래너(부스+스폰서십) |
| 모객 KPI | — | 게런티·하방비율·쇼업률 | **내부 목표만 — 보장 개념 미적용(확정)** | 참관객 내부 목표 |
| 등록 모듈 | 경량 | 전체 | 전체 + 초청제 모드 **[미구현 — §25.6 열린 질문]** | 전체 |
| WBS 템플릿 | 일반형 28 | 모객형 37 | HT 12(파트너별 전개) + 내부 운영 37 병행 | EX 신규 **[전부 가정]** |
| R&R·컴플라이언스 시드 | 대행형 기본 | 대행형 기본 | 주최형 4역할(§15.3b)·C-H1~3 | 주최형 4역할+시공 감리 [가정] |
| 정산(S-10) | 현행 | 현행 | **무변경(비용 추적만) — 감수 M1** | 무변경 |
| 전용 화면 | — | — | 트랙 편성·판매 현황(판매 플래너 내) | 부스 배치 현황(판매 플래너 내) |
| PSA | 옵션 | 옵션 | 옵션 | 옵션 |

### 25.4 DMS 프리셋 (조인트 참가가이드 실물 기반 — 1행사 근거라 "가정" 표기 유지)

- **판매 상품**: `partner_tiers` 확장 — `session_slots`·`booth_included`·`staff_cap`(실물 3명)·`price`
  (**내부 전용** — §21 비노출 가드 대상). 실물 등급: DIAMOND·GOLD·SILVER.
- **청중**: `audience_model='invite'`. 정원은 세션 단위(실물: 오전 150·오후 150).
- **트랙 편성**: `program_sessions.track text null`(감수 M3 — §25.5 영향표 등재). 행사별 정의
  (실물: 오전 Back-office / 오후 Front-office). HT-2 배정 통지와 연동.
- **부스**: `partners`에 부스 필드 그룹(번호·규격·전력·인터넷) — HT-4·HT-7 매핑.
- **경품·이용권**: 파트너 제출물 카테고리 `'benefit'` — HT-3.
- **운영 프리셋**(큐시트·가이드 시드 문구): Q&A 미운영 · 발표 40분 · 개인 노트북 연결 불가 ·
  리허설 파트너별 10분 · 당일 철거.

### 25.5 스키마·DataProvider 영향

| 변경 | 내용 |
|---|---|
| projects | `format`(enum) · `psa_enabled`(bool) · `audience_model`(text null) |
| partner_tiers | `session_slots` · `booth_included` · `staff_cap` · `price`(내부 전용) |
| partners | 부스 필드 그룹(번호·규격·전력·인터넷) |
| program_sessions | `track`(text null) — 감수 M3 |
| deliverables | 카테고리 `'benefit'` 추가 |
| 신설 [설계만 — 3.18c 미착수] | `psa_slots` · `psa_requests`(attendee_id FK) · `psa_meetings` |
| 알림(§9) [설계만] | PSA 3행 |
| 비노출 가드 | `/p`·발주처 경로에 `tier.price`·타 파트너 정보 비노출(dod 테스트) |

```sql
create type event_format as enum ('conference','dms','exhibition');
alter table projects add column format event_format not null default 'conference';
alter table projects add column psa_enabled boolean not null default false;
alter table projects add column audience_model text null;   -- 'invite'|'open' — dms 기본 'invite'

alter table partner_tiers add column session_slots int not null default 0;
alter table partner_tiers add column booth_included boolean not null default false;
alter table partner_tiers add column staff_cap int null;
alter table partner_tiers add column price bigint null;      -- 내부 전용(§21 비노출)

alter table partners add column booth_no text null;
alter table partners add column booth_size text null;
alter table partners add column booth_power text null;
alter table partners add column booth_internet boolean null;

alter table program_sessions add column track text null;

-- [3.18c 미착수 — 설계만] PSA 3테이블
create table psa_slots (
  id uuid primary key, project_id uuid not null references projects,
  table_no text not null, starts_at timestamptz not null, ends_at timestamptz not null );
create table psa_requests (
  id uuid primary key, project_id uuid not null references projects,
  attendee_id uuid not null references attendees,   -- §4-10 실존 엔티티 FK(감수 M2)
  partner_id uuid not null references partners,
  topic text, status text not null default 'requested' );   -- requested→matched→declined
create table psa_meetings (
  id uuid primary key, slot_id uuid references psa_slots, request_id uuid references psa_requests,
  status text not null default 'confirmed',                 -- confirmed→done→noshow
  note text );
```

**DataProvider v11 재동결** — v10(120메서드)은 Phase 3.17c에서 이미 소진됐으므로 본 증분은 **v11**이다
(원 지시문의 "v10 재동결"은 3.17.1 동결을 반영하기 전 표기 — 사실대로 정정한다).
`importVendorQuote`는 계속 예약(만들지 말 것).

### 25.6 열린 질문 — 초청제 모드 (구현하지 않음)

DMS 등록의 "신청 → 주최 승인 → 확정" 게이트를 **기존 RSVP 파이프라인으로 표현할 수 없다.**

- `InviteStatus = none|sent|accepted|declined`는 **주최가 초대장을 보내고 상대가 응답하는 방향**이다.
  초청제가 요구하는 흐름은 **신청자가 먼저 오는 반대 방향**이라 '승인 대기' 상태가 없다.
- `Attendee.sheet_status`의 `applied`는 형태가 비슷하지만 **시트 소유 필드**(§24.1 — 앱이 쓰지 않는 단방향)라
  앱에서 승인 액션을 걸 수 없다.

원 설계 §3.3의 "추측 구현 금지"에 따라 **구현하지 않고 열린 질문으로 남긴다.** 선택지는 두 가지다 —
(가) `InviteStatus`에 `requested`(신청 접수) 추가 + 승인 전이, (나) 등록 신청 전용 상태를 앱 소유 필드로 신설.
어느 쪽이든 상태 머신 개정이라 **사용자 승인 + 설계서 개정**이 선행해야 한다.

### 25.7 전시회 프리셋 [전부 가정 — 첫 실전 전 확정 게이트]

- 참가업체 = `partners` 일반화(tier는 부스 규격 중심), 참관객 = 모객형 등록 모듈 재사용,
  **무료입장 전제**(등록 모듈에 결제 없음, 유료화는 2차).
- EX WBS 템플릿(안): 참가업체 모집 오픈(D-90) → 부스 판매 마감(D-45) → 배치도 확정 통지(D-40) →
  그래픽·장치 신청(D-21) → 참관객 등록 오픈(D-30) → 시공(D-2~D-1) → 운영(D0) → 철거(D0~D+1) →
  리드 제공(D+7) → 리포트(D+14). 파트너별 전개 규칙은 HT와 동일.

### 25.8 금지

- **conference 견적 경로 파일 무접촉** — `calcEstimate.ts`·`kpiRules.ts`·`quoteMode.ts`.
  골든 벡터 전 벡터 **0원 일치**가 깨지면 어떤 사유로도 머지 금지.
- **S-10 정산에 주최형 매출 버킷 주입 금지**(§19.1 마진 항등식 보호 — 감수 M1). 주최형 손익은 2차 읽기 조립.
- `/p`·발주처 경로에 `tier.price`·타 파트너 정보 노출 금지.
