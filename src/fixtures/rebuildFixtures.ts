// Phase 3.12 — 데모 픽스처 리빌드화. 기존 가상 행사 픽스처(prj-stc26·prj-partner-day·
// prj-forum-h2·prj-ai-summit)는 손대지 않고, 실제 운영 행사 2건을 **추가**한다.
//
// 출처: [리멤버] RE:BUILD 26 운영계획서(2026.04) · 결과보고서(2026.05). 수치가 엇갈리면
//       결과보고서(실적)를 정본으로 삼는다.
//
// 목적: 합류 팀원이 자기가 운영한 행사를 데모에서 그대로 보고 도구 사용법을 익히게 하는 것.
// 따라서 이 파일에 한해 #RULE-NO-COMPANY 예외가 적용된다(사용자 명시 지시 — PROGRESS 결정 로그).
//   · 허용: 공개 프로그램에 공표된 행사명·연사명·소속·협찬사명·베뉴명, 제작물 스펙, 존 운영 사양
//   · 금지(세션 브리프 §4): 개인 휴대폰·이메일, 운영사무국 연락처, 협찬사 담당자 정보,
//     참가자 명단 시트 URL, 참가 신청 페이지·결제 실주소, 개별 참가자·좌석 배정 명단,
//     실제 정산 금액·단가(케이터링 단가·경품 가액·별도 예산 등)
//   → `dod26-rebuild-fixtures.test.tsx`의 정규식 가드가 상시 검증한다.
// 참관객·리드 레코드는 전부 합성값(`참관객 001` / `guest{n}@example.com`)이라 개인정보가 없다.
import type {
  Attendee,
  ClientContact,
  ClientToken,
  ComplianceCard,
  Cue,
  GuideSection,
  ProgramSession,
  Project,
  Quote,
  QuoteInput,
  RoleCharter,
  RsvpContact,
  ScenarioBlock,
  Targeting,
  WbsTask,
} from '../types/entities'
import type { AttendeeChannel, DeliverableStatus, InviteStatus } from '../types/enums'
import { offsetToDate, toIsoDate } from '../lib/wbs'
import { COMPLIANCE_CARD_TEMPLATES } from './complianceTemplates'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import {
  assembleRoleSectionContent,
  assembleZoneSectionContent,
  CONTACTS_SECTION_PLACEHOLDER,
  EMERGENCY_SECTION_PLACEHOLDER,
} from '../lib/guideAssembly'
import { RECRUITING_WBS_TEMPLATE, ROLE_CHARTER_TEMPLATES } from './wbsTemplates'
import type { MockState } from './sampleProject'
import { appendLanding, buildLanding } from './landingFixtures'
import type { SectionSpec } from '../lib/landingTemplate'

/** ⑤ 종료 — 실제 운영 행사(2026-05-07). 읽기 전용·목록 접힘 */
export const PROJECT_ID_REBUILD26 = 'prj-rebuild26'
/** ⑥ 진행 중 — 차기 행사 준비(행사일은 데모용 가안). 데모 기본 선택 행사 */
export const PROJECT_ID_REBUILD27 = 'prj-rebuild27'
/** ⑥의 발주처 링크 토큰 — 데모 기본 행사에서도 컨펌 루프를 밟을 수 있게 한다 */
export const REBUILD27_TOKEN = 'rb27'

/** ⑤의 랜딩 — 종료 행사이므로 발행 완료 상태로 남는다 */
export const LANDING_ID_REBUILD26 = 'lnd-rb26'
/** ⑥의 랜딩 — 준비 중이므로 초안. 랜딩보드의 기본 표시 대상이다 */
export const LANDING_ID_REBUILD27 = 'lnd-rb27'

const RB26 = PROJECT_ID_REBUILD26
const RB27 = PROJECT_ID_REBUILD27

/** 가이드·스펙·본문 기본값 (sampleProject의 NO_BRIEF와 동일 규약 — 파일 간 결합을 만들지 않으려 재정의) */
const NO_BRIEF = {
  brief: null,
  brief_refs: null,
  spec_size: null,
  spec_qty: null,
  spec_location: null,
  spec_type: null,
  content: null,
  partner_id: null, // v2.4 §21 — 이 레포의 대행형 픽스처는 파트너 제출물이 없다
}

/** 두 행사의 타겟팅은 동일 — 기업규모·직급(대리 이상)·IT/통신·마케팅/영업·서울 */
const REBUILD_TARGETING: Targeting = {
  company_size: ['대기업', '중견기업'],
  title: ['임원', '부장', '차장', '과장', '대리'],
  industry: ['IT/통신'],
  job: ['마케팅/광고', '영업'],
  region: ['서울특별시'],
}

const REBUILD_AUDIENCE =
  '(회사규모) 매출 100억 이상 중소·강소·중견·대기업 / (직무) B2B 마케팅 부서 대리급 이상 실무자, ' +
  'CMO·영업 전략 책임자, 세일즈 리더, 사업기획팀 리더, 매출팀 총괄'

// ── ⑤ 리멤버 RE:BUILD 26 (종료) ────────────────────────────────────
const REBUILD26_PROJECT: Project = {
  id: RB26,
  name: '리멤버 RE:BUILD 26',
  code: 'RB26',
  kind: 'agency',
  event_date: '2026-05-07',
  event_end_date: '2026-05-07',
  start_time: '10:30',
  end_time: '18:00',
  expected_headcount: 700,
  seating: '극장식 400석 (현장 500석 세팅)',
  organizer: '리멤버',
  target_audience: REBUILD_AUDIENCE,
  status: 'closed',
  closed_at: '2026-05-20T09:00:00.000Z',
  guarantee_pax: 700,
  kpi_show_rate: 90,
  targeting: REBUILD_TARGETING,
  quote_id: null,
  drive_root_folder_id: 'drv-root-rb26',
  slack_webhook_url: null,
  event_type: 'recruiting',
  theme: 'AI 시대, 새롭게 세우는 B2B 성장 공식',
  venue: '어린이대공원 파이팩토리 (서울 광진구 광나루로 441)',
  mc_name: '김경미 아나운서',
  overview_items: [
    { label: '모객 목표', value: '사전신청 1,200명 · 현장참석 700명' },
    { label: '실제 참석', value: '703명 (달성률 100.4%)' },
    { label: '애프터파티', value: '18:30~20:30 · 150인분 · 리프레시존(D 프렌치파이키친 + F 포레스트 다이닝룸)' },
    { label: '부대 프로그램', value: '부스 운영 · 럭키드로우 · 엡손 포토이벤트 · 키캡 키링' },
    { label: '주요 내용', value: '인사이트 제공 · 사례 공유 · 서비스 홍보 · 부스 운영' },
    { label: '주차·교통', value: '주차 지원 불가(대중교통 권장) · 어린이대공원역 7호선 2번 출구 도보 5분' },
  ],
  onboarded_at: '2026-03-20T09:00:00.000Z',
  partner_guide_url: null,
  partner_contact_email: null,
  created_by: 'usr-pm',
  created_at: '2026-03-05T09:00:00.000Z',
}

// ── ⑥ RE:BUILD 27 (진행 중 · 데모 기본 선택) ───────────────────────
// created_at을 ①(2026-08-01)보다 앞에 두어 '진행 중' 그룹의 첫 카드가 되게 한다(브리프 §3).
const REBUILD27_PROJECT: Project = {
  id: RB27,
  name: 'RE:BUILD 27',
  code: 'RB27',
  kind: 'agency',
  event_date: '2026-09-10',
  event_end_date: '2026-09-10',
  start_time: '10:30',
  end_time: '18:00',
  expected_headcount: 800,
  seating: '극장식',
  organizer: '리멤버',
  target_audience: REBUILD_AUDIENCE,
  status: 'active',
  closed_at: null,
  guarantee_pax: 700,
  kpi_show_rate: 90,
  targeting: REBUILD_TARGETING,
  // 확정 견적 없음 — v1 proposed·v2 draft 단계라 핸드오프(quote_id 기록) 전이다.
  quote_id: null,
  drive_root_folder_id: 'drv-root-rb27',
  slack_webhook_url: null,
  event_type: 'recruiting',
  theme: '(가안) 다시, 성장의 공식',
  venue: '어린이대공원 파이팩토리 (후보 · 계약 전)',
  mc_name: null,
  overview_items: [
    { label: '안내', value: '행사일(2026-09-10 목)은 데모용 가안입니다 — 실제 차기 행사 일정은 미정' },
    { label: '기준', value: 'RE:BUILD 26(2026-05-07 · 참석 703명) 실적을 기준으로 준비' },
    { label: '목표', value: '사전신청 1,400명 · 현장참석 800명' },
  ],
  onboarded_at: '2026-08-11T09:00:00.000Z',
  partner_guide_url: null,
  partner_contact_email: null,
  created_by: 'usr-pm',
  created_at: '2026-07-28T09:00:00.000Z',
}

// ── 프로그램 (결과보고서 p3 — 최종 실적표) ─────────────────────────
interface ProgramRow {
  section: string
  start: string
  end: string
  title: string
  speaker: string | null
  speakerTitle: string | null
  speakerOrg: string | null
  note: string | null
}

const REBUILD26_PROGRAM: ProgramRow[] = [
  { section: 'A', start: '10:30', end: '11:00', title: '성장 공식을 다시 세울 시간 – AI 시대 B2B의 RE:BUILD', speaker: '송기홍', speakerTitle: '대표', speakerOrg: '리멤버', note: "30' · Reach X Trust X Convert" },
  { section: 'A', start: '11:00', end: '11:30', title: 'The AI Data Revolution: How to Survive & Thrive', speaker: '김성하', speakerTitle: '사장', speakerOrg: '한국오라클', note: "30' · Trust" },
  { section: 'A', start: '11:30', end: '12:00', title: 'AX시대, 일하는 방식의 변화', speaker: '지용구', speakerTitle: '대표이사', speakerOrg: '더존비즈온', note: "30' · Reach X Trust" },
  { section: 'LUNCH', start: '12:00', end: '13:00', title: '점심시간 & 부스 운영', speaker: null, speakerTitle: null, speakerOrg: null, note: "60' · 다과박스 600개 배부" },
  { section: 'B', start: '13:00', end: '13:30', title: 'VS. AI 시대, 사람만 할 수 있는 일(아직은)', speaker: '이성헌', speakerTitle: '부대표', speakerOrg: '돌고래유괴단', note: "30'" },
  { section: 'B', start: '13:30', end: '13:55', title: "확률에서 확신으로 – AI 시대에 살아남는 'Zero-Waste' B2B 옴니채널 전략", speaker: '김범래', speakerTitle: '실장', speakerOrg: '리멤버', note: "25' · Trust" },
  { section: 'BREAK', start: '13:55', end: '14:15', title: '쉬는 시간', speaker: null, speakerTitle: null, speakerOrg: null, note: "20'" },
  { section: 'B', start: '14:15', end: '14:40', title: 'AI가 읽어버린 콘텐츠 vs. AI가 읽을 수 없는 콘텐츠', speaker: '황하운', speakerTitle: '마케팅 리드', speakerOrg: '리캐치', note: "25' · Reach" },
  { section: 'B', start: '14:40', end: '15:05', title: '스팸에서 공감으로: 맥락 있는 너처링이 전환을 만든다', speaker: '김우진', speakerTitle: '대표', speakerOrg: '리캐치', note: "25' · Convert" },
  { section: 'BREAK', start: '15:05', end: '15:25', title: '쉬는 시간', speaker: null, speakerTitle: null, speakerOrg: null, note: "20'" },
  { section: 'B', start: '15:25', end: '15:50', title: '본질 vs. 효율 – 정답의 시대, 우리가 놓치고 있는 것', speaker: '주대웅', speakerTitle: '실장', speakerOrg: '리멤버', note: "25' · Reach X Trust X Convert" },
  { section: 'B', start: '15:50', end: '16:20', title: '데이터가 흐르면 마케팅이 바뀐다 – 한국 시장 B2B 마케팅 여정과 AI 시대의 마케팅 혁신', speaker: '김희경', speakerTitle: '엔터프라이즈 & 이그제큐티브 마케팅 리드', speakerOrg: '스노우플레이크', note: "30' · Reach X Trust X Convert" },
  { section: 'BREAK', start: '16:20', end: '16:50', title: '쉬는 시간', speaker: null, speakerTitle: null, speakerOrg: null, note: "30'" },
  { section: 'C', start: '16:50', end: '17:00', title: '마케팅으로 돈 되는 산업군 찾기: 세일즈의 흔적을 기회로 바꾼 ABM 전략', speaker: '김우경', speakerTitle: '파트장', speakerOrg: 'NHN클라우드', note: "10' · Reach X Trust X Convert" },
  { section: 'C', start: '17:00', end: '17:10', title: '리드는 쌓이는데, 매출은 왜 안 나올까?', speaker: '강민구', speakerTitle: '매니저', speakerOrg: '한국엡손', note: "10' · Reach X Trust" },
  { section: 'C', start: '17:10', end: '17:40', title: 'AI가 완성할 B2B 비즈니스의 미래', speaker: '김경훈', speakerTitle: '총괄대표', speakerOrg: 'OpenAI 코리아', note: "30' · AI" },
  { section: 'END', start: '17:40', end: '17:50', title: '럭키드로우 (1등 1명 · 2등 2명 · 3등 3명)', speaker: null, speakerTitle: null, speakerOrg: null, note: "10' · 인사이트존 무대" },
  { section: 'END', start: '17:50', end: '18:00', title: '행사 종료 및 퇴장', speaker: null, speakerTitle: null, speakerOrg: null, note: "10'" },
  { section: 'AFTER PARTY', start: '18:00', end: '18:30', title: '카페테리아 공간 퇴장 안내 및 애프터파티 준비', speaker: null, speakerTitle: null, speakerOrg: null, note: "30'" },
  { section: 'AFTER PARTY', start: '18:30', end: '20:30', title: '애프터파티 (네트워킹 + 영업)', speaker: null, speakerTitle: null, speakerOrg: null, note: "120' · 150인분" },
]

/** RE:BUILD 27 프로그램 — 아직 확정 전이라 골격만(가안) */
const REBUILD27_PROGRAM: ProgramRow[] = [
  { section: 'A', start: '10:00', end: '10:30', title: '등록 · 웰컴 네트워킹', speaker: null, speakerTitle: null, speakerOrg: null, note: '(가안)' },
  { section: 'A', start: '10:30', end: '11:00', title: '오프닝 키노트 (연사 섭외 중)', speaker: null, speakerTitle: null, speakerOrg: null, note: '(가안) RE:BUILD 26 구성 기준' },
  { section: 'B', start: '13:00', end: '16:30', title: '트랙 세션 (연사 섭외 중)', speaker: null, speakerTitle: null, speakerOrg: null, note: '(가안) 25~30분 × 8세션' },
  { section: 'AFTER PARTY', start: '18:30', end: '20:30', title: '애프터파티 (네트워킹)', speaker: null, speakerTitle: null, speakerOrg: null, note: '(가안)' },
]
// ── 존별 운영 (운영계획서 p8~41 · 결과보고서 p4~36) ────────────────
// renderLiteMarkdown은 `### 헤더`·`- 불릿`·문단만 지원한다 — 표는 불릿으로 옮겨 적는다.
interface ZoneRow {
  title: string
  content: string
}

const REBUILD26_ZONES: ZoneRow[] = [
  {
    title: '인사이트존 (X 파이홀)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 10:30~20:00 / 장소: X 파이홀',
      '- 좌석: 극장식 400석 계획 → 현장 약 500석 세팅(부족 대비 의자 추가)',
      '### 무대 조성',
      '- LED 12×3m (3,840×960px) · 이동식 무대 12×3.6m (h 0.6m)',
      '- 엡손 빔프로젝터 2대 미디어월 13×4.2m (면적해상도 6,686×2,160px / 송출 3,840×2,160px)',
      '- 조명타워(연사 핀조명) · 기둥 현수막 · 모니터 스피커 · 무대 하단 조명 · 포디움 2대',
      '- 빔프로젝터 설치공간 3.5m 확보 + 차단봉 ㄷ자 설치 · 전기라인 분배',
      '### 시스템',
      '- 콘솔: 무대 기준 좌측 세팅 (영상 · 음향 · 조명 · 중계 통합)',
      '- 사회자 · 발표자용 포디움 발표시스템 각 1식',
      '- 무대 앞 PDP: 프롬프터 50인치 · 타이머 27인치',
      '- 중계 카메라 3대 · 마이크 유선/무선/핀 각 3ea · 마이크택 2개 추가',
      '- 송출 내용: 메인 키비주얼, 카운트다운 LED 싱크, 연사 프로필',
    ].join('\n'),
  },
  {
    title: '리빌드존 (L 그랜드호리존)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 10:30~20:00 / 장소: L 그랜드호리존',
      '### 구역 구성',
      '- 리멤버 부스존 — 블록 월 + 블록테이블 (ADS · 리드젠 · 리서치)',
      '- 협찬사 부스존 — 블록 테이블 + 철제배너 (더존비즈온 / 오라클+에티버스)',
      '- 네트워킹존 — 전시대 + 폼보드 (블록테이블 2,400×1,200mm 2개)',
      '- 이벤트존 — 엡손 포토 이벤트 · 키캡 키링 (듀라테이블 + 테이블보)',
      '- 충전존 — 듀라테이블 + 테이블보',
      '- 포토월 — I배너 / 철제 배너',
      '- 드링킹존(브리타) — 사각 바테이블',
      '### 운영 사항',
      '- 리멤버 부스 방문·상담 시 명찰에 스티커 표기, 상담 기프트 증정',
      '- 협찬사 기본 제공: 블록 테이블 2,700×900mm · 접이식 의자 3 · 철제 X배너 600×1,800mm · 3단 리플렛 거치대 · 콘센트 2구(1kw)',
      '- 부스당 기본 2구 콘센트 + 멀티탭 4구 1줄',
    ].join('\n'),
  },
  {
    title: '커넥트존 (B 빅파이룸)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 10:30~20:00 / 장소: B 빅파이룸',
      '### 세팅',
      '- 듀라테이블 + 접이식 의자 4set',
      '- 테이블당 멀티탭 4구 1개 · 우드POP 4개(양면)',
      '- 하이테이블 10개 — 간이 상담 형태로 상담 진입 장벽 최소화',
    ].join('\n'),
  },
  {
    title: '사일런트존 (A 파이호리존)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 10:30~20:00 / 장소: A 파이호리존',
      '### 세팅',
      '- 유튜브 비공개 중계 (30초~1분 딜레이 가능)',
      '- 엡손 중계빔 5,800×4,000mm (1,920×1,080px) · 3.5~4m 거리 확보',
      '- 접이식 의자 50개',
      '- 사일런스 디스코 시스템 — 소리 더블링 차단 및 커넥트존 소음 최소화 (AX선 필요)',
      '- 유선 LAN 중계용 1회선 · 중계용 노트북 + HDMI',
    ].join('\n'),
  },
  {
    title: '등록존 (C 크림파이룸)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 09:00~20:30 (본세션 종료 후 안내데스크로 전환)',
      '- 장소: C 크림파이룸',
      '### 참가자 동선',
      '- ① 사전등록 — 키오스크에서 개별 QR 체크인 → 명찰 출력',
      '- ② 안내/등록 데스크 — 행사 리플렛 지급, 애프터파티 신청자 손목 띠지 배부',
      '- ③ 현장등록 — 결제 QR 안내 → 결제 완료 확인 → 명찰 출력 및 리플렛 지급',
      '- ④ VIP · 연사 · 협찬사 · 운영인력은 사전 명찰 출력 후 현장 배부',
      '### 명찰 비표 운영',
      '- 연사·VIP·PRESS (WHITE) 100ea',
      '- 참석자 (ORANGE) 700ea',
      '- 운영인력·협찬사 (BLACK) 100ea',
      '### 참가자 안내 발송 실적',
      '- 최종 참가자 확정 안내 306명 — 04/30~05/06, 결제 확인 익일 오전 일괄 발송',
      '- D-7 리마인드 문자 369명 — 04/30',
      '- 당일 안내 문자 606명 — 05/07, VIP·초청사·임직원·유료결제자 일괄',
      '### 현장 참석 집계 703명',
      '- 사전 출력 134명 — VIP 56 · 연사 12 · PRESS 16 · STAFF 50',
      '- 사전 등록 551명 — 내부초청사 233 · 유료결제자 273 · 임직원 45',
      '- 현장 등록 18명 — 현장 결제 후 등록',
    ].join('\n'),
  },
  {
    title: '리프레시존 (D 프렌치파이키친 + F 포레스트 다이닝룸)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 10:00~20:30 / 장소: D 프렌치파이키친 + F 포레스트 다이닝룸',
      '- 협찬사 부스(브리타 · 원인터시스템 · 필그림커피) + 다과 케이터링 + 애프터파티',
      '### 커피 브레이크 (10:00~17:20)',
      '- 다과 케이터링 700인분 수시 리필 — 미니 머핀 · 모둠 쿠키 · 베이비 슈 · 브라우니',
      '- 세팅 05/07 08:30 / 철수 05/07 18:00',
      '### 다과 박스 (12:00~13:00)',
      '- 수량 600개 — 샌드위치 + 계절과일(중) + 쿠키&마들렌 + 오렌지 주스',
      '- 브랜딩: 검정 리본 + 라벨지(80×40mm), 병음료 스티커(40×50mm)',
      '- 배부: 배부존에서 명찰 비표에 주황색 도트 스티커 표시 → 수령 → 분리수거 안내',
      '- 각 존 쓰레기통 배치(음식물/일반 분리) · 차단봉 8개',
      '### 브리타 드링킹존',
      '- 리멤버 제공: 바테이블 1,200×600×1,000 3개 · 테이블보 3 · 멀티탭 4구 4개 · 종이컵 12oz 1,000개 · 블록테이블 1,800×900mm 1개 · 냉동고 410L 1대',
      '- 전기 8~10kw · 커피머신 급배수는 협찬사 자체 해결',
    ].join('\n'),
  },
  {
    title: '애프터파티 운영 (리프레시존)',
    content: [
      '### 운영 개요',
      '- 일시: 2026-05-07(목) 18:30~20:30 · 150인분',
      '- 장소: 리프레시존 (D + F) · 커넥트존(미팅)·사일런트존(중계) 병행 사용, 운영요원 배치',
      '### 메뉴',
      '- A 테이블: 그릴드 쉬림프 & 베지 스큐어, 안티파스토 스큐어, 스위트 퓨전 비프 로톨로, 하우스 미니버거, 연어 타르타르, 스터프드 쉬림프',
      '- B 테이블: 미니 쁘띠 디저트 4종, 계절 과일, 주스 1종, 생맥주, 스파클링 와인(알코올/논알코올 각 1종)',
      '- 대관 장소 방침으로 주류 상표 노출 금지',
      '### 입장',
      '- 애프터파티 신청자 손목 띠지 확인 후 입장 (사전 안내 문자 발송)',
    ].join('\n'),
  },
  {
    title: '부대 이벤트 (럭키드로우 · 키캡 키링 · 엡손 포토)',
    content: [
      '### 럭키드로우',
      '- 일시: 2026-05-07(목) 17:40~17:50 (10분) / 장소: 인사이트존 무대',
      '- 현장 참석자 중 6명 추첨 — 1등 1명 · 2등 2명 · 3등 3명',
      '- 경품: 1등 로봇청소기 1 · 2등 스마트워치 2 · 3등 백화점 상품권 3',
      '- 사전 포장 → 시상보드와 함께 당일 전달(딜리버리 인력 배치) → 기념 촬영',
      '### 키캡 키링 이벤트',
      '- 일시: 2026-05-07(목) 10:30~18:00 (소진 시까지) / 장소: 리빌드존 이벤트존',
      '- 목적: SNS 인증샷·해시태그 업로드를 통한 바이럴',
      '- 수량: 키캡 바디 300ea · 키캡 8종 2,000개',
      '- 투명 아크릴 함 별도 제작 625×315×80mm 2ea',
      '### 엡손 포토 이벤트',
      '- 장소: 리빌드존 이벤트존 (듀라테이블 + 테이블보)',
      '- 엡손 홍보 부스: 200인치 프로젝터 1 · 65인치 TV 1 · 블록테이블 1,800×900mm 1',
      '- 제작물: 벽면 로고 시트지 · 제품소개 폼보드 2 · 아크릴 바 2 · A2 입간판 1',
    ].join('\n'),
  },
  {
    title: '외부 조성 · 전기 (파이팩토리 외부)',
    content: [
      '### 현수막',
      '- 외부 전면 현수막 23,000×5,000mm 1조 (고소작업 여부 확인)',
      '- 난간 현수막 3,300×900mm 7개조 (설치 구간 14,900×900 / 10,000×900 / 5,000×900)',
      '- 외부 동선 배너 600×1,800mm 4개 — 도보 경로 3 · 차량 경로 1 (사방 아일릿 · 물통배너)',
      '### 전기 (총 21kw)',
      '- 인사이트존: 무드조명 · 시스템 조명 · LED · 음향(10kw) · 콘솔 · 카메라',
      '- 리프레시존: 무드조명 · 맥주기계 · 냉동고 · 커피머신 · 시음존 (콘센트 1구당 2.4kw, 커피머신 개별 연결)',
      '- 리빌드존: 엡손 · 충전존 / 커넥트존: 상담 테이블 / 사일런트존: 엡손 중계 1 · 벽면 2',
      '### 유선 LAN',
      '- 인사이트존 중계 1 · 사일런트존 중계 1 · 등록 키오스크 3',
    ].join('\n'),
  },
]

/** RE:BUILD 27 존 운영 — 베뉴 계약 전이라 26 구성을 기준으로 재검토 중 */
const REBUILD27_ZONES: ZoneRow[] = [
  {
    title: '존 구성 (가안)',
    content: [
      '### 기준',
      '- RE:BUILD 26의 6존 구성(인사이트 · 리빌드 · 커넥트 · 사일런트 · 등록 · 리프레시)을 기준으로 재검토',
      '- 베뉴 계약 전 — 확정 후 도면·전기·LAN 사양 재작성 필요',
      '### 검토 항목',
      '- 목표 인원 800명 기준 좌석 확대(400석 → 500석) 시 인사이트존 면적 재확인',
      '- 협찬사 부스 규모 확대 여부 (26년 2개사 → 27년 미정)',
      '- 애프터파티 정원 150명 유지 여부',
    ].join('\n'),
  },
]

// ── 제작물 리스트 (운영계획서 p47~48 · 결과보고서 p46~47) ──────────
// category = 원문 '구분'(내부 제작물 / 발주 제작물 / 전시존) — S2 보드가 카테고리로 묶어 보여준다.
interface ProductionRow {
  category: '내부 제작물' | '발주 제작물' | '전시존'
  title: string
  size: string | null
  qty: number | null
  place: string
  kind: string
  /** 기재 내용·제작 필수 사항 — brief 필드로 보존 */
  note: string | null
  /** 제작의뢰 마감일 */
  due: string | null
}

const REBUILD26_PRODUCTION: ProductionRow[] = [
  // ① 내부 제작물
  { category: '내부 제작물', title: '등록 키오스크 DID', size: '9:16 비율', qty: 1, place: '등록데스크', kind: '이미지 (JPG/Ai)', note: '기재: 행사명, 로고', due: '2026-04-29' },
  { category: '내부 제작물', title: '안내 POP (가로)', size: '297×210mm', qty: 1, place: '등록데스크', kind: 'A4 (JPG)', note: '기재: 행사명, 로고', due: '2026-04-29' },
  { category: '내부 제작물', title: '안내 POP (세로)', size: '210×297mm', qty: 1, place: '커넥트존(상담존)', kind: 'A4 (JPG)', note: '기재: 행사명, 로고', due: '2026-04-29' },
  { category: '내부 제작물', title: '리드젠 토탈 솔루션 POP', size: '210×297mm', qty: 2, place: '부스존', kind: 'A4 (JPG)', note: null, due: '2026-04-29' },
  { category: '내부 제작물', title: 'B2B 리서치 POP', size: '210×297mm', qty: 1, place: '부스존', kind: 'A4 (JPG)', note: null, due: '2026-04-29' },
  { category: '내부 제작물', title: 'B2B 타깃 광고 POP', size: '210×297mm', qty: 1, place: '부스존', kind: 'A4 (JPG)', note: null, due: '2026-04-29' },
  { category: '내부 제작물', title: 'LED 브릿지', size: '4,608×1,152px', qty: 1, place: '메인세션장', kind: 'PNG/PPT', note: '기재: 행사명, 주제, 로고, 연사사진, 아젠다', due: '2026-04-29' },
  { category: '내부 제작물', title: '럭키드로우 스크린', size: '4,608×1,152px', qty: 1, place: '메인세션장', kind: 'Ai', note: '시상 진행용 LED 화면', due: '2026-04-29' },
  { category: '내부 제작물', title: '발표 템플릿 (PPT)', size: '16:9 비율', qty: 1, place: '메인세션장', kind: 'JPG/PPT', note: null, due: '2026-04-29' },
  { category: '내부 제작물', title: 'LED 키비주얼 (루핑 타이틀)', size: '12,000×3,000mm (3,072×768px)', qty: 1, place: '메인세션장', kind: '이미지/영상 (PNG/PPT/mp4)', note: '기재: 행사명, 행사일시, 장소, 로고', due: '2026-04-29' },
  { category: '내부 제작물', title: '키비주얼', size: '16:9 비율', qty: 1, place: '디자인 베리에이션용', kind: '이미지 (JPG/PNG/Ai)', note: '기재: 행사명, 행사일시, 장소, 로고', due: '2026-04-29' },
  { category: '내부 제작물', title: '유튜브 중계 템플릿', size: '16:9 비율', qty: 1, place: '중계룸', kind: '이미지 (JPG)', note: '기재: 행사명, 주제, 로고, 연사사진, 아젠다 · 발표자료/연사 송출 2종', due: '2026-04-29' },
  { category: '내부 제작물', title: '삼각 마이크택', size: '363×50mm', qty: 4, place: '메인세션장', kind: '자체제작 (JPG)', note: '기재: 행사명', due: '2026-04-29' },
  { category: '내부 제작물', title: '큐카드', size: 'B5', qty: 50, place: '메인세션장', kind: '자체제작 (JPG)', note: '사회자용 · 기재: 행사명', due: '2026-04-29' },
  { category: '내부 제작물', title: 'VIP 좌석 폼텍', size: 'A5', qty: 45, place: '메인세션장', kind: '자체제작 (JPG)', note: '기재: 행사명 + 소속·성함·직함', due: '2026-04-29' },
  { category: '내부 제작물', title: '주차권', size: null, qty: 40, place: '안내데스크', kind: '자체제작 (JPG)', note: '기재: 행사명 + 주차권', due: '2026-04-29' },
  // ② 발주 제작물
  { category: '발주 제작물', title: '명찰', size: '100×120mm', qty: 4, place: '등록데스크', kind: '합지/스티커 (JPG/Ai)', note: '4종(연사·VIP·PRESS / 참석자 / STAFF / 뒷면 공통) · 앞면 행사명·로고, 뒷면 만족도조사 · 내지 가이드 확인 필요', due: '2026-04-24' },
  { category: '발주 제작물', title: '철제 배너', size: '600×1,800mm', qty: 7, place: '전시존 (협찬사 + 이벤트존)', kind: 'PET (JPG/Ai)', note: '협찬사 2 · 이벤트 전체 4 · 이벤트 키링 1 · 사방 아일릿', due: '2026-04-29' },
  { category: '발주 제작물', title: '외부 동선 배너', size: '600×1,800mm', qty: 4, place: '행사장 외부', kind: 'PET (JPG/Ai)', note: '도보 경로 3 · 차량 경로 1 · 사방 아일릿, 물통배너', due: '2026-04-29' },
  { category: '발주 제작물', title: '포디움 타이틀', size: '600×250mm', qty: 2, place: '메인세션장', kind: '폼보드 5T (JPG/Ai)', note: '기재: 행사명, 행사주제, 로고', due: '2026-04-29' },
  { category: '발주 제작물', title: '포토월 (I배너)', size: '4,000×2,500mm', qty: 1, place: '전시존 / 에어컨 가림막', kind: '텐트천 (JPG/Ai)', note: '기재: 행사명, 행사주제, 로고', due: '2026-04-29' },
  { category: '발주 제작물', title: '외관 대형 현수막', size: '23,000×5,000mm', qty: 1, place: '파이팩토리 외부', kind: '현수막 (JPG/Ai)', note: '기재: 행사명, 행사주제, 일시, 장소, 로고 · 고소작업 여부 확인', due: '2026-04-29' },
  { category: '발주 제작물', title: '난간 현수막', size: '3,300×900mm', qty: 7, place: '파이팩토리 외부', kind: '현수막 (JPG/Ai)', note: '각 3,300×900 총 7개조 · 기재: 행사명', due: '2026-04-29' },
  { category: '발주 제작물', title: '기둥 현수막', size: '1,900×3,000mm', qty: 3, place: '메인세션장', kind: '현수막 (JPG/Ai)', note: '3종 각 1조 · 기둥 보양 필수', due: '2026-04-29' },
  { category: '발주 제작물', title: 'STAFF 단체복', size: null, qty: 20, place: '운영 인력', kind: '나염인쇄 (앞 1도 · 뒤 2도)', note: 'XL 10벌 · 2XL 10벌 · 4/29 수령 완료', due: '2026-04-24' },
  { category: '발주 제작물', title: '애프터파티 손목 띠지', size: '180×20mm', qty: 150, place: '안내데스크', kind: '팔찌 (Ai)', note: '애프터파티 신청자 확인용', due: '2026-04-29' },
  { category: '발주 제작물', title: '이벤트 안내 리플렛', size: null, qty: 700, place: '등록데스크', kind: '리플렛', note: '리멤버 별도 발주', due: '2026-04-29' },
  { category: '발주 제작물', title: '럭키드로우 시상보드', size: '594×420mm', qty: 6, place: '메인세션장', kind: '폼보드 A2 (JPG/Ai)', note: '1등 로봇청소기 1 · 2등 스마트워치 2 · 3등 백화점 상품권 3', due: '2026-04-24' },
  { category: '발주 제작물', title: '리프레시존 폼보드', size: '420×594mm', qty: 1, place: '리프레시존', kind: '폼보드 A2 (JPG/Ai)', note: null, due: '2026-04-29' },
  { category: '발주 제작물', title: '전시존 바닥 시트지', size: null, qty: null, place: '전시존', kind: '시트지', note: '시안 및 부착 위치 별도 파일 참조', due: '2026-04-29' },
  { category: '발주 제작물', title: '큐브형 사이니지', size: '600×600mm', qty: 3, place: '전시존', kind: '시트지 (Ai)', note: '색상별 3종 · 총 12면', due: '2026-04-29' },
  // ③ 전시존 (블록 그래픽)
  { category: '전시존', title: '등록데스크 백월 (블록)', size: '3,608×1,804mm', qty: 1, place: '등록데스크', kind: '합지 (JPG/Ai)', note: '한판 사이즈 902×902mm', due: '2026-04-24' },
  { category: '전시존', title: '등록데스크 테이블', size: '3,608×902mm', qty: 1, place: '등록데스크', kind: '합지 (JPG/Ai)', note: null, due: '2026-04-24' },
  { category: '전시존', title: '리멤버 리드젠 부스 백월', size: '6,314×1,804mm', qty: 1, place: '전시존', kind: '합지 (JPG/Ai)', note: null, due: '2026-04-24' },
  { category: '전시존', title: '리멤버 리드젠 부스 데스크', size: '5,412×902mm', qty: 1, place: '전시존', kind: '합지 (JPG/Ai)', note: null, due: '2026-04-24' },
  { category: '전시존', title: '리멤버 ADS 부스 백월·데스크', size: '2,706×902mm', qty: 2, place: '전시존', kind: '합지 (JPG/Ai)', note: '백월 1 · 데스크 1', due: '2026-04-24' },
  { category: '전시존', title: '리멤버 리서치 부스 백월·데스크', size: '2,706×902mm', qty: 2, place: '전시존', kind: '합지 (JPG/Ai)', note: '백월 1 · 데스크 1', due: '2026-04-24' },
  { category: '전시존', title: '협찬사 부스 데스크 (더존비즈온)', size: '2,700×900mm', qty: 1, place: '전시존', kind: '시트지 (JPG/Ai)', note: null, due: '2026-04-24' },
  { category: '전시존', title: '협찬사 부스 데스크 (오라클+에티버스)', size: '2,700×900mm', qty: 1, place: '전시존', kind: '시트지 (JPG/Ai)', note: null, due: '2026-04-24' },
  { category: '전시존', title: '추가 협찬사 부스 데스크 (브리타)', size: '1,800×900mm', qty: 1, place: '리프레시존', kind: '시트지 (JPG/Ai)', note: '깊이(D) 750', due: '2026-04-24' },
  { category: '전시존', title: '부스 중앙 데스크', size: '1,200×900mm', qty: 8, place: '전시존', kind: '합지 (JPG/Ai)', note: null, due: '2026-04-24' },
  { category: '전시존', title: '부스 중앙 데스크 폼보드', size: '2,200×250mm', qty: 2, place: '전시존', kind: '폼보드 5T (JPG/Ai)', note: '좌/우 2종', due: '2026-04-24' },
]

/** RE:BUILD 27 제작물 — 26 리스트에서 착수분만. 상태는 WBS 진행도(2.5 진행·2.8 미착수)에 맞춘 혼합.
 *  마감일은 event_date 기준 오프셋으로 둔다 — WBS 2.8 제작물 구간(D-13~D-5) 안에 들어오도록. */
type Rb27ProductionRow = Omit<ProductionRow, 'due'> & { status: DeliverableStatus; dueOffset: number }

const REBUILD27_PRODUCTION: Rb27ProductionRow[] = [
  { category: '내부 제작물', title: '키비주얼', size: '16:9 비율', qty: 1, place: '디자인 베리에이션용', kind: '이미지 (JPG/PNG/Ai)', note: '기재: 행사명, 행사일시, 장소, 로고 · 26년 톤 계승 여부 검토', dueOffset: -13, status: 'internal_review' },
  { category: '내부 제작물', title: 'LED 키비주얼 (루핑 타이틀)', size: '12,000×3,000mm (3,072×768px)', qty: 1, place: '메인세션장', kind: '이미지/영상 (PNG/PPT/mp4)', note: '기재: 행사명, 행사일시, 장소, 로고', dueOffset: -10, status: 'requested' },
  { category: '내부 제작물', title: 'LED 브릿지', size: '4,608×1,152px', qty: 1, place: '메인세션장', kind: 'PNG/PPT', note: '기재: 행사명, 주제, 로고, 연사사진, 아젠다 · 연사 확정 후 착수', dueOffset: -8, status: 'requested' },
  { category: '내부 제작물', title: '등록 키오스크 DID', size: '9:16 비율', qty: 1, place: '등록데스크', kind: '이미지 (JPG/Ai)', note: '기재: 행사명, 로고', dueOffset: -8, status: 'requested' },
  { category: '내부 제작물', title: '유튜브 중계 템플릿', size: '16:9 비율', qty: 1, place: '중계룸', kind: '이미지 (JPG)', note: '발표자료/연사 송출 2종', dueOffset: -8, status: 'draft' },
  { category: '발주 제작물', title: '명찰', size: '100×120mm', qty: 4, place: '등록데스크', kind: '합지/스티커 (JPG/Ai)', note: '4종 · 26년 규격 그대로 · 수량은 모객 확정 후 발주', dueOffset: -13, status: 'draft' },
  { category: '발주 제작물', title: '외관 대형 현수막', size: '23,000×5,000mm', qty: 1, place: '파이팩토리 외부', kind: '현수막 (JPG/Ai)', note: '베뉴 계약 확정 후 실측 재확인 · 고소작업 여부 확인', dueOffset: -13, status: 'pending_approval' },
  { category: '발주 제작물', title: '포토월 (I배너)', size: '4,000×2,500mm', qty: 1, place: '전시존', kind: '텐트천 (JPG/Ai)', note: '기재: 행사명, 행사주제, 로고', dueOffset: -13, status: 'pending_approval' },
]

// ── 큐시트 (운영계획서 p34 · 결과보고서 p36) ───────────────────────
interface CueRow {
  no: string
  time: string
  segment: string
  body: string
  audio: string | null
  light: string | null
  screen: string | null
}

/** ① 개막 세션 큐시트 — 프로그램·인사이트존 사양 기반. S9 ③큐시트 섹션에 노출되는 첫 큐시트 */
const REBUILD26_OPENING_CUES: CueRow[] = [
  { no: 'C01', time: '09:00', segment: '사전', body: '### 등록데스크 오픈\n키오스크 3대 QR 체크인 개시 · 명찰 프린터 예비 1대 대기 · 안내데스크 리플렛/손목 띠지 배부 시작', audio: '등록존 BGM 온', light: '등록존 100%', screen: '키오스크 DID (9:16)' },
  { no: 'C02', time: '10:20', segment: '사전', body: '### 개장 안내방송\n잠시 후 RE:BUILD 26 본 세션이 시작됩니다. 인사이트존으로 이동해 착석해 주시기 바랍니다.', audio: '안내방송 · BGM 페이드다운', light: '객석 60%', screen: 'LED 카운트다운 싱크' },
  { no: 'C03', time: '10:30', segment: '오프닝', body: '오프닝 영상 재생 — LED 브릿지 + 엡손 미디어월 2대 동시 송출', audio: '영상 사운드', light: '암전', screen: 'LED 키비주얼 루핑 → 오프닝 영상' },
  { no: 'C04', time: '10:32', segment: 'MC', body: '### 사회자 오프닝\nAI 시대, 새롭게 세우는 B2B 성장 공식 — RE:BUILD 26에 오신 것을 환영합니다. (사회 김경미 아나운서)', audio: 'MC 무선 마이크 온', light: '무대 풀 + 핀조명', screen: '행사 타이틀' },
  { no: 'C05', time: '10:35', segment: '세션', body: '세션 1 — 성장 공식을 다시 세울 시간: AI 시대 B2B의 RE:BUILD (송기홍 대표 · 리멤버, 30분)', audio: '핀마이크 · 발표시스템', light: '연단 스팟', screen: '발표자료 + 중계 카메라 3대' },
  { no: 'C06', time: '11:00', segment: '전환', body: '연사 전환 — 포디움 교체 및 발표시스템 소스 전환. 프롬프터/타이머 리셋', audio: 'BGM 브릿지', light: '무대 하프', screen: '연사 프로필' },
  { no: 'C07', time: '12:00', segment: '안내', body: '런치 안내 — 리프레시존(D+F) 다과박스 600개 배부. 명찰 비표 주황 도트 확인 후 수령 안내', audio: 'MC 안내 멘트', light: '객석 100%', screen: '런치 안내 화면' },
  { no: 'C08', time: '17:40', segment: '이벤트', body: '### 럭키드로우\n1등 1명 · 2등 2명 · 3등 3명 추첨. 시상보드와 함께 경품 전달(딜리버리 인력 대기) → 기념 촬영', audio: '이벤트 SFX · MC 마이크', light: '무대 풀 · 무빙', screen: '럭키드로우 스크린 (4,608×1,152)' },
]

/** ② 애프터파티 진행표 — 결과보고서 p36 실적 기준 */
const REBUILD26_AFTERPARTY_CUES: CueRow[] = [
  { no: 'C01', time: '16:50', segment: '세팅', body: '세팅 시작 — BGM·건배사용 포터블 앰프, 맥주기계, 스파클링 와인, 애프터파티 케이터링 세팅', audio: '포터블 앰프 설치', light: '바조명 점등', screen: null },
  { no: 'C02', time: '18:00', segment: '세팅', body: '세팅 완료 및 스탠바이 (~18:20)', audio: 'BGM 온', light: '바조명 100%', screen: null },
  { no: 'C03', time: '18:20', segment: '입장', body: '애프터파티 신청자 입장 — 손목 띠지 확인 후 입장', audio: 'BGM 유지', light: '바조명 100%', screen: null },
  { no: 'C04', time: '18:30', segment: '의전', body: '환영사(대표) → 건배사(실장 2인)', audio: '건배사용 마이크 온 · BGM 페이드다운', light: '바조명 + 스팟', screen: null },
  { no: 'C05', time: '18:40', segment: '네트워킹', body: '자유 네트워킹(명함 교환) ~20:30 · 커넥트존·사일런트존 병행 개방', audio: 'BGM 온', light: '바조명 70%', screen: null },
]

// ── 등록·모객 (결과보고서 p38 RSVP 계획 및 통계) ───────────────────
// 개인정보는 한 건도 옮기지 않는다 — 인원 수만 재현하고 레코드는 전부 합성값으로 생성한다.
interface RsvpBucket {
  tag: string
  status: InviteStatus
  count: number
  memo: string
}

const REBUILD26_RSVP_BUCKETS: RsvpBucket[] = [
  { tag: '참석 예정', status: 'accepted', count: 277, memo: '결제 완료 · 동반자 일괄결제 포함' },
  { tag: '참석 불가', status: 'declined', count: 40, memo: '사전 참석 불가 응답' },
  { tag: '결제 취소', status: 'declined', count: 32, memo: '결제 환불 요청 (환불 완료)' },
  { tag: '결제 망각', status: 'sent', count: 21, memo: '결제 요청 안내 문자 및 TM 진행' },
  { tag: '일정 고려', status: 'sent', count: 17, memo: '결제 요청 안내 문자 및 TM 진행' },
  { tag: '내부 품의', status: 'sent', count: 19, memo: '별도 얼리버드 결제 안내 발송' },
  { tag: '비용 부담', status: 'sent', count: 13, memo: '미결제 사유 — 비용 부담' },
  { tag: '결제 미인지', status: 'sent', count: 3, memo: '미결제 사유 — 결제 여부 미인지' },
  { tag: '부재', status: 'sent', count: 63, memo: '결제 요청 안내 문자 및 TM 리터치 진행' },
]

interface AttendeeBucket {
  prefix: string
  channel: AttendeeChannel
  count: number
}

/** 현장 참석 703명 = 사전 출력 134 + 사전 등록 551 + 현장 등록 18 (결과보고서 p38) */
const REBUILD26_ATTENDEE_BUCKETS: AttendeeBucket[] = [
  { prefix: 'VIP', channel: 'import', count: 56 },
  { prefix: 'SPK', channel: 'import', count: 12 },
  { prefix: 'PRS', channel: 'import', count: 16 },
  { prefix: 'STF', channel: 'import', count: 50 },
  { prefix: 'INV', channel: 'rsvp', count: 233 },
  { prefix: 'PAY', channel: 'rsvp', count: 273 },
  { prefix: 'EMP', channel: 'rsvp', count: 45 },
  { prefix: 'ONS', channel: 'onsite', count: 18 },
]

/** RE:BUILD 27 — 리드 수집 착수 전 단계라 사전 컨택만 소규모로 진행 중 */
const REBUILD27_RSVP_BUCKETS: RsvpBucket[] = [
  { tag: '참석 예정', status: 'accepted', count: 12, memo: '데모 합성 데이터 — 사전 컨택 완료' },
  { tag: '참석 불가', status: 'declined', count: 3, memo: '데모 합성 데이터 — 일정 불가 회신' },
  { tag: '회신 대기', status: 'sent', count: 15, memo: '데모 합성 데이터 — 1차 안내 발송' },
]

// ── 마일스톤 (운영계획서 p2 업무추진일정) ──────────────────────────
const REBUILD26_MILESTONES: { title: string; area: 'design' | 'ops' | null; due: string; done: boolean }[] = [
  { title: '킥오프 · 실행 계획 확정', area: null, due: '2026-03-20', done: true },
  { title: '랜딩페이지 오픈 · RSVP 진행 개시', area: null, due: '2026-04-13', done: true },
  { title: '부스 및 디자인 스펙 확정', area: 'design', due: '2026-04-17', done: true },
  { title: '기념품 · 단체복 · 식음료 발주', area: 'ops', due: '2026-04-24', done: true },
  { title: '제작물 DB 1차 마감 · 부스 시안 마감', area: 'design', due: '2026-04-24', done: true },
  { title: '제작물 발주 · 시스템 발주', area: 'design', due: '2026-04-27', done: true },
  { title: '시나리오 최종 컨펌 · 참가자 최종 안내(eDM)', area: 'ops', due: '2026-04-30', done: true },
  { title: '사전등록 마감 · 명찰 DB 확정', area: null, due: '2026-05-04', done: true },
  { title: '행사 세팅 (D-1 18시) · 리마인드 문자', area: 'ops', due: '2026-05-06', done: true },
  { title: '행사 당일 운영', area: null, due: '2026-05-07', done: true },
  { title: '결과 보고서 작성 · 전달', area: 'ops', due: '2026-05-18', done: true },
]

const REBUILD27_MILESTONES: { title: string; area: 'design' | 'ops' | null; offset: number; done: boolean }[] = [
  { title: '베뉴 계약 확정', area: null, offset: -17, done: false },
  { title: '랜딩페이지 최종 컨펌 · URL 오픈', area: 'design', offset: -16, done: false },
  { title: '연사 라인업 확정', area: 'ops', offset: -15, done: false },
  { title: '제작물 DB 마감 · 발주', area: 'design', offset: -13, done: false },
  { title: '전체 리허설 · 테크니컬 체크', area: 'ops', offset: -1, done: false },
]

// ── 견적 (RE:BUILD 27 · 2버전) ─────────────────────────────────────
// 베뉴는 venuedb 실존 항목(pie_factory)을 선택한다. 계약 전이라 대관료는 0(미정)으로 두고,
// 금액은 전부 엔진(computeQuoteOutputs) 산출값만 저장한다 — 실제 정산 금액을 임의로 적지 않는다.
// ※ 엔진의 자동 견적 상한은 TARGET_MAX(500명)다. 총 참관 목표 800명은 이 상한을 넘으므로
//    견적 인원은 상한 안(v1 480 · v2 400)으로 잡고, 상한 초과분은 별도 협의로 남긴다(notes 참조).
const RB27_VENUE = {
  venue_id: 'pie_factory',
  name: '파이팩토리',
  hall: null,
  date: '2026-09-10',
  rental: 0,
}

const RB27_QUOTE_BASE: Omit<QuoteInput, 'headcount' | 'guarantee' | 'notes'> = {
  event_name: 'RE:BUILD 27',
  event_date: '2026-09-10',
  event_end_date: '2026-09-10',
  start_time: '10:30',
  end_time: '18:00',
  event_type: '컨퍼런스',
  include_leads: true,
  venues: [RB27_VENUE],
  selected_venue: { ...RB27_VENUE, index: 0 },
  options: { emcee: true, video: true, souvenir: true },
  display_type: 'led',
  targeting: REBUILD_TARGETING,
  client_company: '리멤버',
  contact: { name: '정담당' },
  manager: '김기획',
  adjustments: [],
  booth_count: 3,
}

// ── 조립 ───────────────────────────────────────────────────────────
const pad = (n: number, width = 3) => String(n).padStart(width, '0')

/** 파일명 규약 (§7.2) — {YYMMDD}_{CODE}_{category}_{title}_v{n}.{ext} */
function versionFileName(date: string, code: string, category: string, title: string, ext: string): string {
  return `${date.slice(2).replace(/-/g, '')}_${code}_${category}_${title}_v1.${ext}`
}

function buildProgram(projectId: string, prefix: string, rows: ProgramRow[]): ProgramSession[] {
  return rows.map((r, i) => ({
    id: `pgs-${prefix}-${pad(i + 1)}`,
    project_id: projectId,
    section: r.section,
    start_time: r.start,
    end_time: r.end,
    title: r.title,
    speaker_name: r.speaker,
    speaker_title: r.speakerTitle,
    speaker_org: r.speakerOrg,
    note: r.note,
    sort_order: i + 1,
  }))
}

function buildCues(deliverableId: string, prefix: string, rows: CueRow[]): Cue[] {
  return rows.map((c, i) => ({
    id: `cue-${prefix}-${pad(i + 1)}`,
    deliverable_id: deliverableId,
    cue_no: c.no,
    time_at: c.time,
    segment: c.segment,
    body: c.body,
    console_audio: c.audio,
    console_light: c.light,
    console_screen: c.screen,
    sort_order: i + 1,
  }))
}

function buildRsvps(projectId: string, prefix: string, buckets: RsvpBucket[], invitedAt: string): RsvpContact[] {
  const out: RsvpContact[] = []
  let n = 0
  for (const bucket of buckets) {
    for (let i = 0; i < bucket.count; i++) {
      n += 1
      out.push({
        id: `rsv-${prefix}-${pad(n, 4)}`,
        project_id: projectId,
        name: `컨택 ${pad(n, 4)}`,
        org: null,
        title: null,
        email: `lead${n}@example.com`,
        phone: null,
        group_tag: bucket.tag,
        invite_status: bucket.status,
        invited_at: `${invitedAt}T09:00:00.000Z`,
        responded_at: bucket.status === 'sent' ? null : `${invitedAt}T12:00:00.000Z`,
        memo: bucket.memo,
      })
    }
  }
  return out
}

function buildAttendees(projectId: string, prefix: string, buckets: AttendeeBucket[], eventDate: string): Attendee[] {
  const out: Attendee[] = []
  let n = 0
  for (const bucket of buckets) {
    for (let i = 0; i < bucket.count; i++) {
      n += 1
      const onsite = bucket.channel === 'onsite'
      out.push({
        id: `att-${prefix}-${pad(n, 4)}`,
        project_id: projectId,
        rsvp_contact_id: null,
        name: `참관객 ${pad(n, 4)}`,
        org: null,
        email: `guest${n}@example.com`,
        phone: null,
        channel: bucket.channel,
        registered_at: onsite ? `${eventDate}T01:00:00.000Z` : `${eventDate}T00:00:00.000Z`,
        // 703명 전원이 현장 참석(체크인) — 결과보고서 p38 '현장 참석자' 집계와 동일 기준
        checked_in_at: `${eventDate}T${onsite ? '02' : '01'}:00:00.000Z`,
        badge_no: `${bucket.prefix}-${pad(i + 1)}`,
      })
    }
  }
  return out
}

function buildWbs(projectId: string, prefix: string, eventDate: string): WbsTask[] {
  return RECRUITING_WBS_TEMPLATE.map((tpl, i) => ({
    id: `wbs-${prefix}-${pad(i + 1)}`,
    project_id: projectId,
    phase_no: tpl.phase_no,
    phase_name: tpl.phase_name,
    code: tpl.code,
    title: tpl.title,
    offset_start: tpl.offset_start,
    offset_end: tpl.offset_end,
    start_date: offsetToDate(eventDate, tpl.offset_start),
    end_date: offsetToDate(eventDate, tpl.offset_end),
    role: tpl.role,
    origin_role: tpl.origin_role,
    status: 'todo' as const,
    done_at: null,
    linked_deliverable_id: null,
    target: tpl.target,
    direction: 'internal' as const, // v2.4 §21 — 이 레포의 대행형 픽스처는 항상 내부 태스크
    partner_id: null,
    note: null,
    sort_order: i + 1,
  }))
}

function buildCharters(projectId: string, prefix: string): RoleCharter[] {
  return ROLE_CHARTER_TEMPLATES.recruiting.map((tpl, i) => ({
    id: `rrc-${prefix}-${pad(i + 1)}`,
    project_id: projectId,
    role: tpl.role,
    origin_role: tpl.origin_role,
    title: tpl.title,
    items: [...tpl.items],
  }))
}

function buildCompliance(projectId: string, prefix: string): ComplianceCard[] {
  return COMPLIANCE_CARD_TEMPLATES.map((tpl, i) => ({
    id: `cmp-${prefix}-${pad(i + 1, 2)}`,
    project_id: projectId,
    kind: tpl.kind,
    title: tpl.title,
    items: tpl.items.map((text) => ({ text, checked: false, checked_at: null })),
    sort_order: tpl.sort_order,
  }))
}

/** 기존 픽스처 상태에 RE:BUILD 26·27을 덧붙인다 (기존 데이터는 일절 수정하지 않는다) */
/** ⑤ 종료 행사 — 실제 진행된 내용으로 채워진 발행본 (결과보고서 기준) */
const REBUILD26_LANDING_SECTIONS: SectionSpec[] = [
  { type: 'hero', headline: null, body: null, autofill: true, items: [] },
  {
    type: 'lead',
    headline: 'AI 시대, 무엇을 다시 세울 것인가',
    body: '성장 공식이 흔들리는 시기입니다. 현장에서 실제로 작동한 B2B 성장 사례를 한자리에서 공유합니다.',
    autofill: false,
    items: [],
  },
  { type: 'speakers', headline: '연사 라인업', body: null, autofill: true, items: [] },
  { type: 'agenda', headline: 'SESSION TIME TABLE', body: null, autofill: true, items: [] },
  {
    type: 'tickets',
    headline: '참가 신청',
    body: '*좌석 한정 · 조기 마감될 수 있습니다',
    autofill: false,
    items: [
      ['일반 참가', '본 세션 · 다과 · 부대 프로그램', '유료'],
      ['참가 + 애프터파티', '정원 150명 한정', '유료'],
    ],
  },
  {
    type: 'pitch',
    headline: '현장에서만 얻을 수 있는 것',
    body: '발표로 끝나지 않습니다. 부스 상담과 네트워킹으로 바로 다음 액션을 만들어 가세요.',
    autofill: false,
    items: [],
  },
  {
    type: 'benefits',
    headline: '참가자 혜택',
    body: null,
    autofill: false,
    items: [
      ['네트워킹', '커넥트존 상담 테이블 운영', '🤝'],
      ['식음 제공', '다과 · 커피 브레이크 · 애프터파티', '🍱'],
      ['기념품', '전시존 체험 이벤트 참여', '🎁'],
      ['경품 추첨', '본 세션 종료 직전 진행', '🎉'],
    ],
  },
  { type: 'zones', headline: '행사장 존 안내', body: null, autofill: true, items: [] },
  {
    type: 'sponsors',
    headline: '함께하는 기업',
    body: null,
    autofill: false,
    items: [
      ['참여 기업', '부스 운영 및 세션 참여', null],
      ['협찬 문의', '사무국으로 문의해 주세요.', null],
    ],
  },
  { type: 'venue', headline: '오시는 길', body: null, autofill: true, items: [] },
  {
    type: 'faq',
    headline: '자주 묻는 질문',
    body: null,
    autofill: false,
    items: [
      ['신청하면 모두 참석할 수 있나요?', '좌석 한정으로 선착순 마감되며, 확정 여부는 별도 안내드립니다.', '참가신청'],
      ['몇 시부터 입장할 수 있나요?', '등록 데스크는 본 세션 시작 1시간 30분 전부터 운영합니다.', '참석관련'],
      ['주차 지원이 되나요?', '주차 지원이 어렵습니다. 대중교통 이용을 권장드립니다.', '참석관련'],
      ['애프터파티는 따로 신청해야 하나요?', '신청 시 함께 선택하셔야 하며, 현장에서 손목 띠지를 확인합니다.', '부대행사'],
    ],
  },
  { type: 'form', headline: '참가 신청', body: null, autofill: false, items: [] },
  {
    type: 'footer',
    headline: null,
    body: null,
    autofill: false,
    items: [
      ['주최', '행사 사무국', null],
      ['문의', 'event@example.com', null],
    ],
  },
]

/** ⑥ 준비 중 — 베뉴 계약 전이라 확정 문구가 비어 있는 작성 중 상태 */
const REBUILD27_LANDING_SECTIONS: SectionSpec[] = [
  { type: 'hero', headline: null, body: null, autofill: true, items: [] },
  {
    type: 'lead',
    headline: '(가안) 다시, 성장의 공식',
    body: '메인 카피 확정 전 — 기획 확정 후 교체합니다.',
    autofill: false,
    items: [],
  },
  { type: 'speakers', headline: '연사 라인업', body: null, autofill: true, items: [] },
  { type: 'agenda', headline: 'SESSION TIME TABLE', body: null, autofill: true, items: [] },
  {
    type: 'tickets',
    headline: '참가 신청',
    body: '*가격·정원 확정 전',
    autofill: false,
    items: [['일반 참가', '구성 확정 전', '미정']],
  },
  {
    type: 'pitch',
    headline: '',
    body: '얼리버드 운영 여부 검토 중.',
    autofill: false,
    items: [],
  },
  {
    type: 'benefits',
    headline: '참가자 혜택 (검토 중)',
    body: null,
    autofill: false,
    items: [
      ['네트워킹', '전년 구성 기준 검토', '🤝'],
      ['식음 제공', '케이터링 견적 대기', '🍱'],
    ],
  },
  { type: 'zones', headline: '행사장 존 안내', body: null, autofill: true, items: [] },
  { type: 'sponsors', headline: '함께하는 기업', body: '협찬사 모집 중', autofill: false, items: [] },
  { type: 'venue', headline: '오시는 길', body: null, autofill: true, items: [] },
  {
    type: 'faq',
    headline: '자주 묻는 질문',
    body: null,
    autofill: false,
    items: [['주차 지원이 되나요?', '베뉴 확정 후 안내드립니다.', '참석관련']],
  },
  { type: 'form', headline: '참가 신청', body: null, autofill: false, items: [] },
  {
    type: 'footer',
    headline: null,
    body: null,
    autofill: false,
    items: [['문의', 'event@example.com', null]],
  },
]

export function appendRebuildFixtures(state: MockState): void {
  const today = toIsoDate(new Date())
  state.projects.push(REBUILD26_PROJECT, REBUILD27_PROJECT)

  // 담당자 — 현행 가상 4인 그대로 (실제 팀원 이름은 넣지 않는다)
  for (const projectId of [RB26, RB27]) {
    state.members.push(
      { project_id: projectId, user_id: 'usr-pm', role: 'pm' },
      { project_id: projectId, user_id: 'usr-design', role: 'design' },
      { project_id: projectId, user_id: 'usr-ops', role: 'ops' },
      { project_id: projectId, user_id: 'usr-reg', role: 'reg' },
    )
    state.role_charters.push(...buildCharters(projectId, projectId === RB26 ? 'rb26' : 'rb27'))
    state.compliance_cards.push(...buildCompliance(projectId, projectId === RB26 ? 'rb26' : 'rb27'))
  }

  // ── RE:BUILD 26 ──────────────────────────────────────────────────
  state.program_sessions.push(...buildProgram(RB26, 'rb26', REBUILD26_PROGRAM))

  // 큐시트 2건 — getPlan()은 첫 큐시트 항목을 S9 ③에 싣는다. 개막 세션을 먼저 넣는다.
  const cuesheets: { id: string; title: string; content: string; rows: CueRow[]; prefix: string }[] = [
    {
      id: 'dlv-rb26-cue-01',
      title: '개막 세션 큐시트',
      content: '### 개막 세션 큐시트\n- 프로그램(②)과 인사이트존 사양(④)을 기준으로 작성 · 콘솔 3채널(음향·조명·스크린) 포함\n- 정형 큐 표는 항목 상세의 큐시트 에디터에서 관리',
      rows: REBUILD26_OPENING_CUES,
      prefix: 'rb26o',
    },
    {
      id: 'dlv-rb26-cue-02',
      title: '애프터파티 진행표',
      content: '### 애프터파티 진행표\n- 리프레시존(D+F) 18:30~20:30 · 150인분\n- 손목 띠지 확인 후 입장, 환영사·건배사 후 자유 네트워킹',
      rows: REBUILD26_AFTERPARTY_CUES,
      prefix: 'rb26a',
    },
  ]
  for (const sheet of cuesheets) {
    state.deliverables.push({
      id: sheet.id,
      project_id: RB26,
      area: 'ops',
      category: '큐시트',
      title: sheet.title,
      status: 'final',
      assignee_id: 'usr-ops',
      due_date: '2026-05-04',
      drive_folder_id: `drv-${sheet.id}`,
      requires_approval: true,
      ...NO_BRIEF,
      content: sheet.content,
      created_at: '2026-04-20T09:00:00.000Z',
      updated_at: '2026-05-06T09:00:00.000Z',
    })
    state.cues.push(...buildCues(sheet.id, sheet.prefix, sheet.rows))
    state.versions.push({
      id: `ver-${sheet.id}`,
      deliverable_id: sheet.id,
      version_no: 1,
      drive_file_id: `drv-f-${sheet.id}`,
      file_name: versionFileName('2026-05-04', 'RB26', '큐시트', sheet.title, 'pdf'),
      note: '컨펌 발송 스냅숏',
      uploaded_by: 'usr-ops',
      created_at: '2026-05-04T09:00:00.000Z',
    })
  }

  // 존별 운영
  REBUILD26_ZONES.forEach((zone, i) => {
    state.deliverables.push({
      id: `dlv-rb26-zone-${pad(i + 1, 2)}`,
      project_id: RB26,
      area: 'ops',
      category: '존운영',
      title: zone.title,
      status: 'final',
      assignee_id: 'usr-ops',
      due_date: '2026-04-30',
      drive_folder_id: null,
      requires_approval: true,
      ...NO_BRIEF,
      content: zone.content,
      created_at: '2026-04-01T09:00:00.000Z',
      updated_at: '2026-05-06T09:00:00.000Z',
    })
  })

  // 제작물 — 종료 행사이므로 전부 final + 버전 1건
  REBUILD26_PRODUCTION.forEach((item, i) => {
    const id = `dlv-rb26-prd-${pad(i + 1)}`
    state.deliverables.push({
      id,
      project_id: RB26,
      area: 'design',
      category: item.category,
      title: item.title,
      status: 'final',
      assignee_id: 'usr-design',
      due_date: item.due,
      drive_folder_id: null,
      requires_approval: true,
      ...NO_BRIEF,
      brief: item.note,
      spec_size: item.size,
      spec_qty: item.qty,
      spec_location: item.place,
      spec_type: item.kind,
      created_at: '2026-04-10T09:00:00.000Z',
      updated_at: '2026-05-01T09:00:00.000Z',
    })
    state.versions.push({
      id: `ver-rb26-prd-${pad(i + 1)}`,
      deliverable_id: id,
      version_no: 1,
      drive_file_id: `drv-f-rb26-prd-${pad(i + 1)}`,
      file_name: versionFileName(item.due ?? '2026-04-29', 'RB26', item.category, item.title, 'pdf'),
      note: '최종 발주본',
      uploaded_by: 'usr-design',
      created_at: `${item.due ?? '2026-04-29'}T06:00:00.000Z`,
    })
  })

  // 등록·모객
  state.rsvp_contacts.push(...buildRsvps(RB26, 'rb26', REBUILD26_RSVP_BUCKETS, '2026-04-20'))
  state.attendees.push(...buildAttendees(RB26, 'rb26', REBUILD26_ATTENDEE_BUCKETS, '2026-05-07'))

  // 마일스톤
  REBUILD26_MILESTONES.forEach((m, i) => {
    state.milestones.push({
      id: `mls-rb26-${pad(i + 1, 2)}`,
      project_id: RB26,
      title: m.title,
      area: m.area,
      due_date: m.due,
      done: m.done,
    })
  })

  // WBS — 종료 행사라 37건 전부 완료
  const rb26Tasks = buildWbs(RB26, 'rb26', '2026-05-07')
  for (const task of rb26Tasks) {
    task.status = 'done'
    task.done_at = `${task.end_date}T09:00:00.000Z`
  }
  state.wbs_tasks.push(...rb26Tasks)
  state.activity_log.push(
    { id: 101, project_id: RB26, actor: 'user:usr-ops', action: 'deliverable.finalized', target_type: 'deliverable', target_id: 'dlv-rb26-cue-01', meta: null, created_at: '2026-05-04T09:00:00.000Z' },
    { id: 102, project_id: RB26, actor: 'system', action: 'project.closed', target_type: 'project', target_id: RB26, meta: null, created_at: '2026-05-20T09:00:00.000Z' },
  )

  // ── RE:BUILD 27 ──────────────────────────────────────────────────
  const rb27Date = REBUILD27_PROJECT.event_date!
  state.program_sessions.push(...buildProgram(RB27, 'rb27', REBUILD27_PROGRAM))

  // 발주처(주최 마케팅팀) 연락처·토큰 — 데모 기본 행사에서도 컨펌 루프를 밟을 수 있게 한다
  const rb27Contact: ClientContact = {
    id: 'cct-rb27',
    project_id: RB27,
    name: '정담당',
    org: '리멤버 마케팅팀(발주)',
    email: 'client-rb27@example.com',
  }
  const rb27Token: ClientToken = {
    token: REBUILD27_TOKEN,
    project_id: RB27,
    contact_id: rb27Contact.id,
    expires_at: '2026-10-10T00:00:00.000Z', // 행사일 +30일 (§6.3 기본)
    revoked_at: null,
    last_seen_at: null,
    created_at: '2026-08-12T09:00:00.000Z',
  }
  state.client_contacts.push(rb27Contact)
  state.client_tokens.push(rb27Token)

  // 존 운영 (가안)
  REBUILD27_ZONES.forEach((zone, i) => {
    state.deliverables.push({
      id: `dlv-rb27-zone-${pad(i + 1, 2)}`,
      project_id: RB27,
      area: 'ops',
      category: '존운영',
      title: zone.title,
      status: 'draft',
      assignee_id: 'usr-ops',
      due_date: offsetToDate(rb27Date, -13),
      drive_folder_id: null,
      requires_approval: true,
      ...NO_BRIEF,
      content: zone.content,
      created_at: '2026-08-12T09:00:00.000Z',
      updated_at: '2026-08-18T09:00:00.000Z',
    })
  })

  // 큐시트 — 아직 가이드만 발행된 상태(requested)
  state.deliverables.push({
    id: 'dlv-rb27-cue-01',
    project_id: RB27,
    area: 'ops',
    category: '큐시트',
    title: '개막 세션 큐시트',
    status: 'requested',
    assignee_id: 'usr-ops',
    due_date: offsetToDate(rb27Date, -7),
    drive_folder_id: null,
    requires_approval: true,
    ...NO_BRIEF,
    brief:
      'RE:BUILD 26 개막 세션 큐시트를 기준으로 27년 프로그램에 맞춰 재작성. ' +
      '콘솔 3채널(음향·조명·스크린)은 베뉴 계약 확정 후 인사이트존 사양에 맞춰 채울 것.',
    created_at: '2026-08-18T09:00:00.000Z',
    updated_at: '2026-08-18T09:00:00.000Z',
  })

  // 제작물 — WBS 진행도에 맞춘 혼합 상태
  const rb27Approvals: { deliverableId: string; versionId: string; index: number }[] = []
  REBUILD27_PRODUCTION.forEach((item, i) => {
    const id = `dlv-rb27-prd-${pad(i + 1)}`
    const hasVersion = item.status !== 'requested'
    state.deliverables.push({
      id,
      project_id: RB27,
      area: 'design',
      category: item.category,
      title: item.title,
      status: item.status,
      assignee_id: 'usr-design',
      due_date: offsetToDate(rb27Date, item.dueOffset),
      drive_folder_id: null,
      requires_approval: true,
      ...NO_BRIEF,
      brief: item.note,
      spec_size: item.size,
      spec_qty: item.qty,
      spec_location: item.place,
      spec_type: item.kind,
      created_at: '2026-08-14T09:00:00.000Z',
      updated_at: '2026-08-20T09:00:00.000Z',
    })
    if (hasVersion) {
      const versionId = `ver-rb27-prd-${pad(i + 1)}`
      state.versions.push({
        id: versionId,
        deliverable_id: id,
        version_no: 1,
        drive_file_id: `drv-f-rb27-prd-${pad(i + 1)}`,
        file_name: versionFileName('2026-08-20', 'RB27', item.category, item.title, 'png'),
        note: '1차 시안',
        uploaded_by: 'usr-design',
        created_at: '2026-08-20T06:00:00.000Z',
      })
      if (item.status === 'pending_approval') rb27Approvals.push({ deliverableId: id, versionId, index: i + 1 })
    }
  })
  rb27Approvals.forEach((a, i) => {
    state.approvals.push({
      id: `apr-rb27-${pad(i + 1, 2)}`,
      deliverable_id: a.deliverableId,
      version_id: a.versionId,
      requested_by: 'usr-pm',
      requested_at: '2026-08-21T02:00:00.000Z',
      due_at: '2026-08-26T09:00:00.000Z',
      decided_at: null,
      decision: null,
      client_comment: null,
      decided_via_token: null,
    })
  })

  // 등록·모객 (리드 수집 착수 전 — 사전 컨택만)
  state.rsvp_contacts.push(...buildRsvps(RB27, 'rb27', REBUILD27_RSVP_BUCKETS, '2026-08-18'))

  // 마일스톤
  REBUILD27_MILESTONES.forEach((m, i) => {
    state.milestones.push({
      id: `mls-rb27-${pad(i + 1, 2)}`,
      project_id: RB27,
      title: m.title,
      area: m.area,
      due_date: offsetToDate(rb27Date, m.offset),
      done: m.done,
    })
  })

  // WBS 37건 — 고정 시드(사용자 확정 2026-08-22).
  // event_date=2026-09-10 기준으로 마감이 지난 태스크는 1.1~1.4 · 2.1~2.4 · 3.1 · 3.2 열 건뿐이고,
  // 그중 2.2(기초 자료 수령 리마인더)·2.3(기초 자료 수령)만 미완료로 남겨 **지연 2건**이 된다.
  // 상대 보정 규칙 없이 코드로 못박았으므로 조회 시점이 달라져도 지연 목록의 앞 2건은 늘 2.2·2.3이다.
  const rb27Tasks = buildWbs(RB27, 'rb27', rb27Date)
  const DONE_CODES = new Set(['1.1', '1.2', '1.3', '1.4', '2.1', '2.4', '3.1', '3.2'])
  const DOING_CODES = new Set(['2.5']) // 랜딩페이지 1차 — 마감 임박
  for (const task of rb27Tasks) {
    if (DONE_CODES.has(task.code)) {
      task.status = 'done'
      const at = task.end_date! < today ? task.end_date! : today
      task.done_at = `${at}T09:00:00.000Z`
    } else if (DOING_CODES.has(task.code)) {
      task.status = 'doing'
    }
  }
  // 2.8 제작물 ↔ 가이드 발행된 LED 키비주얼 연결 (산출물 연결 뱃지 시연)
  const task28 = rb27Tasks.find((t) => t.code === '2.8')
  if (task28) task28.linked_deliverable_id = 'dlv-rb27-prd-002'
  state.wbs_tasks.push(...rb27Tasks)

  // 인박스 — 직접 업로드 감지 시연
  state.unregistered_files.push({
    id: 'inb-rb27-001',
    project_id: RB27,
    drive_file_id: 'drv-f-rb27-inbox-001',
    file_name: 'RB27_키비주얼_컬러시안_v0.png',
    detected_folder: '05_산출물/디자인',
    detected_at: '2026-08-20T05:00:00.000Z',
    linked_deliverable_id: null,
    dismissed: false,
  })

  state.activity_log.push(
    { id: 111, project_id: RB27, actor: 'user:usr-pm', action: 'deliverable.requested', target_type: 'deliverable', target_id: 'dlv-rb27-prd-002', meta: { assignee_id: 'usr-design' }, created_at: '2026-08-14T09:00:00.000Z' },
    { id: 112, project_id: RB27, actor: 'user:usr-design', action: 'version.uploaded', target_type: 'version', target_id: 'ver-rb27-prd-007', meta: { deliverable_id: 'dlv-rb27-prd-007', version_no: 1 }, created_at: '2026-08-20T06:00:00.000Z' },
    { id: 113, project_id: RB27, actor: 'user:usr-pm', action: 'approval.requested', target_type: 'approval', target_id: 'apr-rb27-01', meta: { deliverable_id: 'dlv-rb27-prd-007' }, created_at: '2026-08-21T02:00:00.000Z' },
    { id: 114, project_id: RB27, actor: 'user:usr-pm', action: 'deliverable.requested', target_type: 'deliverable', target_id: 'dlv-rb27-cue-01', meta: { assignee_id: 'usr-ops' }, created_at: '2026-08-18T09:00:00.000Z' },
  )

  // ── v2.5 §23.4 — 시나리오 1건 + 운영가이드 1건 (RE:BUILD 27 데모 픽스처) ────────
  // 실측: RE:BUILD 27 프로그램은 4세션(등록·오프닝·트랙·애프터파티) — §23.4가 요구하는
  // "3개 그룹"에는 등록·웰컴을 제외한 3세션(오프닝·트랙·애프터파티)을 쓴다. 큐시트는 RB27에
  // 1건(개막 세션 큐시트)뿐이라 "기존 큐시트 2건"에는 못 미친다 — 임의로 늘리지 않고
  // 체크아웃 보고에 실측으로 남긴다(브리프 지시).
  const RB27_SCENARIO_ID = 'dlv-rb27-scenario-01'
  const RB27_GUIDE_ID = 'dlv-rb27-guide-01'
  state.deliverables.push(
    {
      id: RB27_SCENARIO_ID,
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '진행 시나리오 (가안)',
      status: 'draft',
      assignee_id: 'usr-ops',
      due_date: offsetToDate(rb27Date, -7),
      drive_folder_id: null,
      requires_approval: true,
      ...NO_BRIEF,
      created_at: '2026-08-20T09:00:00.000Z',
      updated_at: '2026-08-20T09:00:00.000Z',
    },
    {
      id: RB27_GUIDE_ID,
      project_id: RB27,
      area: 'ops',
      category: '운영가이드',
      title: '현장 운영가이드 (가안)',
      status: 'draft',
      assignee_id: 'usr-ops',
      due_date: offsetToDate(rb27Date, -5),
      drive_folder_id: null,
      requires_approval: true,
      ...NO_BRIEF,
      created_at: '2026-08-20T09:00:00.000Z',
      updated_at: '2026-08-20T09:00:00.000Z',
    },
  )

  // 진행 블록 8행 · 세션 3개 그룹(②오프닝 키노트·③트랙 세션·④애프터파티) — video·transition
  // 블록에 M-XX/C-XX/V-XX 큐 표기를 심어 "큐시트로 내보내기" 데모가 바로 동작하게 한다(§23.3).
  const rb27ScenarioBlocks: ScenarioBlock[] = [
    { id: 'scb-rb27-01', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-02', time: '10:30', kind: 'custom', script: null, note: '세션: 오프닝 키노트 (연사 섭외 중)', sort_order: 1 },
    { id: 'scb-rb27-02', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-02', time: '10:30', kind: 'mc', script: 'MC 무대 인사 및 오프닝 키노트 세션 소개 — 연사 확정 후 소개 멘트 보완 예정', note: null, sort_order: 2 },
    { id: 'scb-rb27-03', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-02', time: '10:35', kind: 'video', script: '오프닝 인트로 영상 재생 — LED 키비주얼 루핑 종료 후 영상 사운드 온(M-02), 무대 암전(C-11) 후 스크린 전환', note: null, sort_order: 3 },
    { id: 'scb-rb27-04', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-03', time: '13:00', kind: 'custom', script: null, note: '세션: 트랙 세션 (연사 섭외 중, 25~30분 × 8세션)', sort_order: 4 },
    { id: 'scb-rb27-05', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-03', time: '13:00', kind: 'protocol', script: '세션 좌장 소개 및 귀빈 의전 — 참석 임원진 착석 확인 후 진행', note: null, sort_order: 5 },
    { id: 'scb-rb27-06', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-03', time: '16:25', kind: 'transition', script: '트랙 세션 종료 전환 — 무대 조명 전환(C-05), 브릿지 음악 온(M-01), 다음 순서 안내', note: null, sort_order: 6 },
    { id: 'scb-rb27-07', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-04', time: '18:30', kind: 'custom', script: null, note: '세션: 애프터파티 (네트워킹, 가안)', sort_order: 7 },
    { id: 'scb-rb27-08', deliverable_id: RB27_SCENARIO_ID, session_id: 'pgs-rb27-04', time: '19:50', kind: 'video', script: '애프터파티 하이라이트 영상 송출(V-01), 배경음악 페이드(M-03)', note: null, sort_order: 8 },
  ]
  state.scenario_blocks.push(...rb27ScenarioBlocks)

  // 운영가이드 4섹션 — zone·role은 lib/guideAssembly.ts의 조립 함수를 그대로 호출해
  // provider·픽스처가 같은 결과를 내도록 한다(로직 중복 방지). zone 섹션은 **stale 데모**로
  // 한 줄 앞선(구) 스냅숏을 저장해 둔다 — 존운영 원본("존 구성 (가안)")에 검토 항목 한 줄이
  // 나중에 추가된 것으로 시연(R-O4: 자동 반영 금지, 사람이 차이를 확인해야 함).
  const rb27OpsItemsSoFar = state.deliverables.filter((d) => d.project_id === RB27 && d.area === 'ops')
  const rb27Charters = state.role_charters.filter((c) => c.project_id === RB27)
  const zoneContentNow = assembleZoneSectionContent(rb27OpsItemsSoFar)
  const zoneSnapshotContent = zoneContentNow.replace(/\n- 애프터파티 정원 150명 유지 여부$/, '')
  const rb27GuideSections: GuideSection[] = [
    {
      id: 'gds-rb27-01',
      deliverable_id: RB27_GUIDE_ID,
      kind: 'zone',
      title: '존별 운영',
      content: zoneSnapshotContent,
      source_ref: 'zone_items',
      source_stale: true,
      sort_order: 1,
    },
    {
      id: 'gds-rb27-02',
      deliverable_id: RB27_GUIDE_ID,
      kind: 'role',
      title: '역할별 체크리스트',
      content: assembleRoleSectionContent(rb27Charters),
      source_ref: 'role_charters',
      source_stale: false,
      sort_order: 2,
    },
    {
      id: 'gds-rb27-03',
      deliverable_id: RB27_GUIDE_ID,
      kind: 'emergency',
      title: '비상 대응',
      content: EMERGENCY_SECTION_PLACEHOLDER,
      source_ref: null,
      source_stale: false,
      sort_order: 3,
    },
    {
      id: 'gds-rb27-04',
      deliverable_id: RB27_GUIDE_ID,
      kind: 'contacts',
      title: '연락망/비품',
      content: CONTACTS_SECTION_PLACEHOLDER,
      source_ref: null,
      source_stale: false,
      sort_order: 4,
    },
  ]
  state.guide_sections.push(...rb27GuideSections)

  // 견적 2버전 — 금액은 엔진 산출값만 저장한다
  const quotes: Quote[] = [
    buildQuote('quo-020', 1, 'proposed', {
      ...RB27_QUOTE_BASE,
      headcount: 480,
      guarantee: 420,
      notes:
        '1안 — RE:BUILD 26(참석 703명) 실적 기준 확대안. 모객(리드젠) 포함. ' +
        '베뉴는 파이팩토리 후보(계약 전이라 대관료 미정). ' +
        '자동 견적 상한 500명 — 총 참관 800명 규모는 별도 협의.',
    }, '2026-08-12'),
    buildQuote('quo-021', 2, 'draft', {
      ...RB27_QUOTE_BASE,
      headcount: 400,
      guarantee: 350,
      notes:
        '2안 — 1안 대비 축소한 대안. 베뉴는 파이팩토리 후보(계약 전이라 대관료 미정). ' +
        '자동 견적 상한 500명 — 총 참관 800명 규모는 별도 협의.',
    }, '2026-08-18'),
  ]
  state.quotes.push(...quotes)

  // ── 랜딩 (v2.1 §4-21) — 행사마다 자기 랜딩을 갖는다 ────────────────
  // ⑤는 종료 행사라 발행 완료본이 남아 있고, ⑥은 준비 중이라 초안이다.
  // slug는 (project_id, slug) 복합 유일이라 두 행사가 같은 slug를 써도 정상이다(R-L4).
  // **섹션 내용도 행사마다 다르다** — 빈 기본 템플릿을 두 행사에 그대로 깔면 랜딩보드가
  // 행사별로 달라 보이지 않는다. hero·연사·타임테이블·존·오시는 길은 autofill이 각 행사의
  // 세션·존·개요에서 조립하고, 나머지 카피는 아래 스펙이 행사 단계에 맞게 채운다.
  appendLanding(
    state,
    buildLanding({
      id: LANDING_ID_REBUILD26,
      projectId: RB26,
      title: 'RE:BUILD 26 참가 신청',
      slug: 'rebuild',
      publicUrl: 'https://example.com/ads/rebuild26/',
      gaMeasurementId: 'G-RB26DEMO01',
      createdAt: '2026-03-25T09:00:00.000Z',
      updatedAt: '2026-05-07T09:00:00.000Z',
      sections: REBUILD26_LANDING_SECTIONS,
    }),
    today,
  )
  appendLanding(
    state,
    buildLanding({
      id: LANDING_ID_REBUILD27,
      projectId: RB27,
      title: 'RE:BUILD 27 참가 신청',
      slug: 'rebuild',
      publicUrl: null,
      gaMeasurementId: 'G-RB27DEMO01',
      createdAt: '2026-08-05T09:00:00.000Z',
      updatedAt: '2026-08-20T09:00:00.000Z',
      sections: REBUILD27_LANDING_SECTIONS,
    }),
    today,
  )
}

function buildQuote(
  id: string,
  version: number,
  status: Quote['status'],
  input: QuoteInput,
  date: string,
): Quote {
  const { breakdown, total_amount } = computeQuoteOutputs(input)
  return {
    id,
    project_id: RB27,
    title: input.event_name,
    version,
    status,
    is_final: false,
    locked_at: null,
    superseded_by: null,
    input,
    breakdown,
    total_amount,
    source: 'engine',
    created_by: 'usr-pm',
    created_at: `${date}T09:00:00.000Z`,
    updated_at: `${date}T09:00:00.000Z`,
  }
}
