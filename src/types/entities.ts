// 설계서 v1.4 §4 테이블과 1:1 도메인 타입.
// 필드명은 DDL의 snake_case를 그대로 유지한다 — SupabaseProvider 이식 시 매핑 계층 없이 row를 그대로 쓰기 위함.
import type {
  AppRole,
  ApprovalDecision,
  AttendeeChannel,
  AttendeeSheetStatus,
  AudienceModel,
  EventFormat,
  SheetInvalidReason,
  CommentVisibility,
  ComplianceKind,
  DeliverableArea,
  DeliverableStatus,
  EventType,
  GuideSectionKind,
  InviteStatus,
  LandingFieldKind,
  LandingSectionType,
  LandingStatus,
  LandingSubmitTarget,
  MemberRole,
  PartnerStatus,
  ProjectKind,
  ProjectStatus,
  QuoteImportFormat,
  QuoteImportStatus,
  QuoteSource,
  QuoteStatus,
  ScenarioBlockKind,
  SheetConnectionState,
  SheetMappedField,
  WbsDirection,
  WbsStatus,
} from './enums'
import type { ParsedQuoteDoc, SectionMapping } from '../modules/quote/import/types'

/** uuid */
export type UUID = string
/** timestamptz — ISO 8601 문자열 */
export type IsoDateTime = string
/** date — YYYY-MM-DD 문자열 */
export type IsoDate = string

/** v1.2 — projects.overview_items jsonb: 자유 키-값 개요 불릿 (대상·주차 안내 등). 배열로 순서 보존 */
export interface OverviewItem {
  label: string
  value: string
}

/** v2.0 — projects.targeting jsonb: 타겟팅 5축 (§4-1, leadTargeting 상수 키) */
export interface Targeting {
  company_size: string[]
  title: string[]
  industry: string[]
  job: string[]
  region: string[]
}

// §4-1 projects
export interface Project {
  id: UUID
  name: string
  /** 행사 약칭 — 파일명 규약에 사용, 전역 유일 */
  code: string
  /** v2.4 §21 — 'agency'(대행형, 기본) | 'host'(주최형). event_type과 직교하는 축이며
   *  전환은 표시 계층만 바꾼다 — 어떤 행도 삭제되지 않는다(R-H1) */
  kind: ProjectKind
  /** 시작일 (WBS 전개·D-day 기준) */
  event_date: IsoDate | null
  /** v1.5 — 종료일 (null=당일 행사) */
  event_end_date: IsoDate | null
  /** v1.5 — 운영 시간 (HH:MM) */
  start_time: string | null
  end_time: string | null
  /** v1.5 — 예상 인원 */
  expected_headcount: number | null
  /** v1.5 — 좌석 형태 (극장식·라운드·교실식·스탠딩·혼합 — 자유 텍스트, enum 아님) */
  seating: string | null
  /** v1.5 — 주최·주관 */
  organizer: string | null
  /** v1.5 — 참가 대상 */
  target_audience: string | null
  /** v1.5 — active|closed. 종료 행사는 읽기 전용·목록 접힘 */
  status: ProjectStatus
  closed_at: IsoDateTime | null
  // v2.0 모객형 전용 (§4-1 — Configurator events·타겟팅 흡수). 일반형이면 null·UI 숨김(데이터 보존)
  /** 보장 인원 */
  guarantee_pax: number | null
  /** 쇼업 KPI % */
  kpi_show_rate: number | null
  /** 타겟팅 5축 */
  targeting: Targeting | null
  /** v2.0 — 확정 견적 링크 (quotes.id, 핸드오프 시 기록) */
  quote_id: UUID | null
  drive_root_folder_id: string | null
  slack_webhook_url: string | null
  /** v1.3 — S0 온보딩에서 선택. general이면 등록 모듈 경량 모드(표시 계층 토글) */
  event_type: EventType
  /** v2.6 §25 — 행사 유형 4분류. 시드이지 잠금이 아니다(이후 kind·event_type 독립 변경 가능) */
  format: EventFormat
  /** v2.6 §25 — 비즈매칭(PSA) 옵션. 모듈 자체는 3.18c 미착수 */
  psa_enabled: boolean
  /** v2.6 §25 — 'invite'|'open'. dms 기본 'invite'. 초청제 게이트는 §25.6 열린 질문(미구현) */
  audience_model: AudienceModel | null
  // v1.2 행사개요 (운영계획서 §행사개요 소스)
  theme: string | null
  venue: string | null
  mc_name: string | null
  overview_items: OverviewItem[] | null
  /** v1.4.1 — S0 온보딩 완료 시각. null=미완료(본체 라우트 차단 기준). 완료 처리 시 기록, 이후 불변 */
  onboarded_at: IsoDateTime | null
  /** v2.4.1 §21.1 — 파트너 참가 가이드 링크. `/p` 포털 상단 버튼. 대행형은 null(행사 설정 ③ 주최형 블록에서 pm 편집) */
  partner_guide_url: string | null
  /** v2.4.1 §21.1 — 파트너 문의 창구 이메일. `/p` 포털 하단 안내. 대행형은 null */
  partner_contact_email: string | null
  created_by: UUID | null
  created_at: IsoDateTime
}

// §4-2 project_members
export interface ProjectMember {
  project_id: UUID
  user_id: UUID
  role: MemberRole
}

// §4-2 project_invites (v1.5) — 행사 설정 ②의 담당자 '입력'.
// Phase 4 전(mock)은 추가 즉시 멤버로 취급하므로 mock 상태에는 저장하지 않지만,
// 타입은 §4 스키마와 1:1로 유지한다(SupabaseProvider 이식 대비).
export interface ProjectInvite {
  id: UUID
  project_id: UUID
  email: string
  display_name: string
  role: MemberRole
  invited_by: UUID | null
  invited_at: IsoDateTime
  accepted_at: IsoDateTime | null
  accepted_user_id: UUID | null
}

// §4-3 client_contacts / client_tokens
export interface ClientContact {
  id: UUID
  project_id: UUID
  name: string
  org: string | null
  email: string | null
}

export interface ClientToken {
  /** URL에 그대로 사용 */
  token: string
  project_id: UUID
  contact_id: UUID | null
  expires_at: IsoDateTime | null
  revoked_at: IsoDateTime | null
  last_seen_at: IsoDateTime | null
  created_at: IsoDateTime
}

// §4-4 deliverables
export interface Deliverable {
  id: UUID
  project_id: UUID
  area: DeliverableArea
  /** '키비주얼','큐시트','명찰' 등 자유 + 프리셋 */
  category: string
  title: string
  status: DeliverableStatus
  assignee_id: UUID | null
  due_date: IsoDate | null
  drive_folder_id: string | null
  /** common 문서는 false — draft ↔ internal_review만 사용 */
  requires_approval: boolean
  // v1.2 가이드 문서·스펙 (전부 선택적 — 가이드 없이 만든 항목은 null)
  /** 가이드 내용 */
  brief: string | null
  /** 참고자료 링크 배열 (첨부 테이블은 2차) */
  brief_refs: string[] | null
  /** 규격 표기 예: '23000×5000mm' */
  spec_size: string | null
  spec_qty: number | null
  /** 제작·설치 위치 */
  spec_location: string | null
  /** 종류 (현수막·합지·PET·이미지 등) */
  spec_type: string | null
  /** 항목 본문 (운영사항 등, 마크다운) — 운영계획서 렌더 소스 */
  content: string | null
  /** v2.4 §21 — inbound 제출물 소유 파트너. 대행형 항목·주최 자체 산출물은 null */
  partner_id: UUID | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

// §4-5 versions
export interface Version {
  id: UUID
  deliverable_id: UUID
  version_no: number
  drive_file_id: string
  /** 규약 적용된 최종 파일명 */
  file_name: string
  note: string | null
  uploaded_by: UUID | null
  created_at: IsoDateTime
}

// §4-6 approvals
export interface Approval {
  id: UUID
  deliverable_id: UUID
  version_id: UUID
  /** PM만 (앱 레벨 강제) */
  requested_by: UUID | null
  requested_at: IsoDateTime
  due_at: IsoDateTime | null
  decided_at: IsoDateTime | null
  decision: ApprovalDecision | null
  client_comment: string | null
  decided_via_token: string | null
}

// §4-7 comments (v1.1: 내부/공유 가시성 분리)
export interface Comment {
  id: UUID
  deliverable_id: UUID
  /** 내부 작성자면 세팅 */
  author_user_id: UUID | null
  /** 발주처 작성자면 세팅 — 이 경우 visibility='shared' 강제 */
  author_token: string | null
  visibility: CommentVisibility
  body: string
  created_at: IsoDateTime
}

// §4-8 milestones
export interface Milestone {
  id: UUID
  project_id: UUID
  title: string
  /** null = 전체 */
  area: DeliverableArea | null
  due_date: IsoDate
  done: boolean
}

// §4-9 rsvp_contacts
export interface RsvpContact {
  id: UUID
  project_id: UUID
  name: string
  org: string | null
  title: string | null
  email: string | null
  phone: string | null
  /** VIP/미디어/일반 등 */
  group_tag: string | null
  invite_status: InviteStatus
  invited_at: IsoDateTime | null
  responded_at: IsoDateTime | null
  memo: string | null
}

// §4-10 attendees
export interface Attendee {
  id: UUID
  project_id: UUID
  /** RSVP 전환 시 연결 */
  rsvp_contact_id: UUID | null
  name: string
  org: string | null
  email: string | null
  phone: string | null
  channel: AttendeeChannel
  registered_at: IsoDateTime
  checked_in_at: IsoDateTime | null
  badge_no: string | null
  // ── v2.6 §24 시트 연동 확장 — 전부 optional. 시트 연결 행사에서만 채워지고,
  //    CSV·RSVP·랜딩 등 기존 생성 경로는 하나도 바뀌지 않는다(값이 없으면 undefined).
  /** 원본 시트의 행 식별자 — 이 값이 있으면 '시트 소유' 행이다 */
  sheet_row_id?: string
  /** 시트 소유 — 직함 */
  title?: string | null
  /** 시트 소유 — 구분·그룹(VIP·연사·바이어 등) */
  group_tag?: string | null
  /** 시트 소유 — 신청 상태. 'removed'는 시트에서 사라진 행의 이력 보존 표시(§24.1-4) */
  sheet_status?: AttendeeSheetStatus
  /** 앱 소유 — 현장 비고. 시트를 덮어쓰지 않는다(§24.1-3) */
  note?: string | null
}

// §4-11 activity_log
export interface ActivityLogEntry {
  id: number
  project_id: UUID
  /** 'user:{id}' | 'client:{token}' | 'system' */
  actor: string
  /** 'version.uploaded','approval.requested' 등 */
  action: string
  target_type: string | null
  target_id: UUID | null
  meta: Record<string, unknown> | null
  created_at: IsoDateTime
}

// §4-13 program_sessions (v1.2 — 운영계획서 §프로그램 섹션의 정형 소스)
export interface ProgramSession {
  id: UUID
  project_id: UUID
  /** 블록 구분 (오전/오후/애프터파티 등) */
  section: string | null
  /** time — 'HH:MM' 문자열 */
  start_time: string | null
  end_time: string | null
  title: string
  speaker_name: string | null
  speaker_title: string | null
  speaker_org: string | null
  /** 비고 태그 (기조·파트너 연사 등) */
  note: string | null
  sort_order: number
}

// §4-14 cues (v1.3 — category='큐시트' 운영 항목에 귀속, 정형 에디터 소스)
export interface Cue {
  id: UUID
  deliverable_id: UUID
  /** 'C01' 등 표시 번호 */
  cue_no: string | null
  /** time — 'HH:MM' 문자열 */
  time_at: string | null
  /** 구분 (사전·오프닝·MC·세션·전환 등) */
  segment: string | null
  /** 내용·대본 (마크다운, 전문 포함) */
  body: string | null
  // 콘솔 3채널
  console_audio: string | null
  console_light: string | null
  console_screen: string | null
  sort_order: number
}

// §4-15 wbs_tasks (v1.4 — 유형별 템플릿을 온보딩 완료 시 행사일 기준으로 전개)
export interface WbsTask {
  id: UUID
  project_id: UUID
  /** 1 사전착수 ~ 6 사후관리 */
  phase_no: number
  phase_name: string
  /** '2.5' 등 — Configurator 코드 체계 호환 */
  code: string
  title: string
  /** D 기준(음수=D-), 원본 보존 */
  offset_start: number
  offset_end: number
  /** 전개 시 event_date로 계산 저장 */
  start_date: IsoDate | null
  end_date: IsoDate | null
  /** 커뮤니케이터 역할 매핑 */
  role: MemberRole
  /** 원본 역할 태그(RS·RO·MC-PM·MC-AT·공동) — Configurator 연동 대비 */
  origin_role: string | null
  status: WbsStatus
  done_at: IsoDateTime | null
  /** 연결 시 상태 뱃지 표시, final이면 자동 done */
  linked_deliverable_id: UUID | null
  /** v2.0 §4-15b — 소통 대상 (예: '고객사'·'협력사'·'내부', 복수는 '·' 결합). 템플릿 시드 포함 */
  target: string | null
  /** v2.4 §21 — 'partner_submit'(파트너별 인스턴스) | 'host_notice' | 'internal'(기본) */
  direction: WbsDirection
  /** v2.4 §21 — partner_submit 인스턴스만 사용(파트너별 상태 독립, 재전개는 code+partner_id 매칭) */
  partner_id: UUID | null
  note: string | null
  sort_order: number
}
// 지연 = (미완료 and end_date < today), 임박은 lib/wbs.ts 정본 참조 (지연과 배타)

// §4-16 role_charters (v1.4 — 유형별 템플릿, 온보딩 완료 시 부여)
export interface RoleCharter {
  id: UUID
  project_id: UUID
  role: MemberRole
  origin_role: string | null
  /** '총괄 PM' 등 */
  title: string
  /** 책임 불릿 배열 */
  items: string[]
}

// §4-1b profiles (v2.0 — 전역 역할. 견적 메뉴 접근은 admin·sales)
export interface Profile {
  id: UUID
  display_name: string
  email: string
  app_role: AppRole
  created_at: IsoDateTime
}

// ── v2.0 견적 (§4-18 quotes) ───────────────────────────────────────
/** quotes.input jsonb — 베뉴 후보 1건 (venuedb 연결 또는 직접 입력) */
export interface QuoteVenueCandidate {
  /** venuedb id — 직접 입력이면 null */
  venue_id?: string | null
  name: string
  hall?: string | null
  /** YYYY-MM-DD ('' = 미정) */
  date?: string | null
  rental: number
}

/** 선택된 베뉴 스냅숏 — §16 매핑(selected_venue.name·hall)과 엔진 택1 인덱스를 함께 보존 */
export interface QuoteSelectedVenue extends QuoteVenueCandidate {
  index: number
}

export interface QuoteContactInfo {
  name?: string | null
  email?: string | null
  phone?: string | null
}

/** 섹션별 수동 조정 — 엔진 applyAdjustments 델타의 저장 형태 (§4-18 adjustments[]) */
export interface QuoteAdjustment {
  key: 's1' | 's2' | 's3' | 's4' | 'ot' | 'leadPkg'
  delta: number
  memo?: string | null
}

/**
 * quotes.input jsonb — 입력 스냅샷 (§4-18, Configurator config 스키마 승계 + targeting).
 * 엔진 호출은 modules/quote/engine/quoteInput.ts(toEngineConfig)가 이 형태를 CalcConfig로 변환한다.
 */
export interface QuoteInput {
  event_name: string
  event_date: IsoDate | null
  event_end_date?: IsoDate | null
  start_time: string | null
  end_time: string | null
  /** 행사 성격 7종(한글, modules/quote/data/eventTypes) — communicator event_type과 별개 축 */
  event_type: string | null
  include_leads: boolean
  headcount: number
  guarantee: number
  venues: QuoteVenueCandidate[]
  selected_venue: QuoteSelectedVenue | null
  options: Record<string, boolean>
  display_type: 'led' | 'projector'
  targeting: Targeting | null
  client_company: string | null
  contact: QuoteContactInfo | null
  manager: string | null
  notes: string | null
  adjustments: QuoteAdjustment[]
  // Configurator config 승계 확장 (엔진 입력 — 옵션 수치)
  booth_count?: number
  booth_premium_count?: number
  booth_unit_price?: number | null
  booth_premium_unit_price?: number | null
  souvenir_price?: number | null
  souvenir_qty?: number | null
  gen_attendees?: number
}

/**
 * quotes.breakdown jsonb — 산출 스냅샷 (§4-18): 엔진 재계산과 일치해야 함(테스트).
 * subtotal = pk(VAT 별도) = quotes.total_amount. vat = round(subtotal×0.1). total = subtotal+vat.
 */
export interface QuoteBreakdown {
  s1: number
  s2: number
  s3: number
  s4: number
  s5: number
  /** = 엔진 ot (추가옵션) */
  options: number
  /** = 엔진 leadPkg (모객 — rsvpPkg+showup, 제외 모드면 0) */
  recruit: number
  /** = 엔진 genManage (일반 참관객 관리) */
  attendee: number
  subtotal: number
  vat: number
  total: number
  /**
   * v2.4 §22.4 — 임포트 견적 전용. 매핑에서 engine-shape 8키 어디에도 속하지 않는 섹션을
   * 원본 그대로 보존한다(원본 근거 추적 R-Q2). 엔진 견적(source='engine')은 항상 비어 있거나
   * 없다 — 골든 벡터 등가 테스트(DoD 21)가 보는 것은 위 8개 필드뿐이라 이 필드는 건드리지 않는다.
   */
  custom_sections?: { code: string; label: string; amount: number }[]
}

export interface Quote {
  id: UUID
  /** 견적만 있는 단계는 null, 핸드오프 시 연결 */
  project_id: UUID | null
  /** 행사명(가칭) */
  title: string
  version: number
  status: QuoteStatus
  is_final: boolean
  locked_at: IsoDateTime | null
  superseded_by: UUID | null
  input: QuoteInput
  breakdown: QuoteBreakdown
  /** 원 단위 (VAT 별도) */
  total_amount: number
  /** v2.4 §22 — 'engine'(Configurator 산식으로 만든 견적, 기본) | 'imported'(파일 임포트 확정) */
  source: QuoteSource
  created_by: UUID | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

// §4-17 compliance_cards (v2.0 — 온보딩 시 시드, 체크는 멤버)
export interface ComplianceItem {
  text: string
  checked: boolean
  checked_at: IsoDateTime | null
}

export interface ComplianceCard {
  id: UUID
  project_id: UUID
  kind: ComplianceKind
  title: string
  items: ComplianceItem[]
  sort_order: number
}

// §4-12 unregistered_files
export interface UnregisteredFile {
  id: UUID
  project_id: UUID
  drive_file_id: string
  file_name: string | null
  detected_folder: string | null
  detected_at: IsoDateTime
  /** 연결 시 세팅 후 versions 생성 */
  linked_deliverable_id: UUID | null
  dismissed: boolean
}

// ─────────────────────────────────────────────────────────────────────
// v2.1 랜딩보드 (§4-19 ~ §4-22)
// 행사 랜딩페이지를 섹션 블록으로 조립하고, GA를 심어 유입·전환을 추적한다.
// 발행은 "단일 HTML 내보내기" — 자가완결 .html 한 개를 기존 호스팅에 올리는 방식이라
// 앱은 파일을 만들어 줄 뿐 서빙하지 않는다(앱 내 공개 URL은 Phase 4.6 이후).
// ─────────────────────────────────────────────────────────────────────

/** 섹션 안의 반복 항목 — 연사·세션·티켓·혜택·존·로고·FAQ를 공통 표현으로 담는다 */
export interface LandingItem {
  id: UUID
  /** 주 텍스트 — 연사명 · 세션명 · 티켓 종류 · 질문 · 혜택명 · 존 이름 */
  label: string
  /** 부 텍스트 — 직함 · 세션 설명 · 답변 · 혜택 설명 */
  detail: string | null
  /** 보조값 — 소속 · 시간대 · 가격 · 분류 탭 */
  meta: string | null
  /** 이미지·로고 (data: URI 또는 절대 URL. mock 업로드는 blob URL 허용) */
  image_url: string | null
  sort_order: number
}

export interface LandingSection {
  id: UUID
  type: LandingSectionType
  /** 헤드라인 — null이면 타입별 기본 문구 */
  headline: string | null
  /** 보조 카피 (마크다운 아님 — 줄바꿈만 유지) */
  body: string | null
  /** 숨김 처리해도 내용은 보존한다 (유형 토글과 같은 원칙) */
  visible: boolean
  /**
   * 행사 데이터 자동 연동. true면 items를 저장값 대신 행사 데이터에서 조립한다
   * (agenda←ProgramSession, hero←Project 개요, zones←존 운영 항목).
   * 수동 편집이 필요하면 false로 내려 오버라이드한다.
   */
  autofill: boolean
  items: LandingItem[]
  sort_order: number
}

/** 신청 폼 입력 필드 (§4-21) */
export interface LandingFormField {
  id: UUID
  label: string
  kind: LandingFieldKind
  placeholder: string | null
  required: boolean
  /** select·rank 전용 선택지 */
  choices: string[]
  sort_order: number
}

/** 동의 항목 — 개인정보 수집·이용, 마케팅 수신 등 */
export interface LandingConsent {
  id: UUID
  title: string
  /** 펼침 본문 (전문) */
  body: string
  required: boolean
  sort_order: number
}

/** 측정 설정 (§4-22). 내보낸 HTML의 <head>에 그대로 주입된다 */
export interface LandingAnalytics {
  /** GA4 측정 ID — 'G-XXXXXXXXXX' */
  ga_measurement_id: string | null
  /** GTM 컨테이너 ID — 'GTM-XXXXXXX' (GA와 병행 가능) */
  gtm_container_id: string | null
  /** 폼 제출 시 발화할 전환 이벤트 이름 */
  conversion_event: string
}

/** 일자별 유입 지표 — mock에선 픽스처, Phase 4에서 GA Data API로 교체 */
export interface LandingDailyMetric {
  date: IsoDate
  views: number
  unique_visitors: number
  /** 폼을 연 횟수 */
  form_starts: number
  /** 제출 완료 */
  submits: number
}

export interface LandingPage {
  id: UUID
  project_id: UUID
  title: string
  /** URL 조각 — 내보낸 파일명·공개 주소에 쓰인다 */
  slug: string
  status: LandingStatus
  /** 공개 주소 — 내보낸 HTML을 올린 위치(수동 입력). 미발행이면 null */
  public_url: string | null
  /** 상단 고정 내비 노출 */
  sticky_nav: boolean
  /** CTA 라벨 — status가 closed면 이 값 대신 마감 문구가 렌더된다 */
  cta_label: string
  submit_target: LandingSubmitTarget
  /** submit_target='external'일 때 제출 대상 URL */
  external_submit_url: string | null
  analytics: LandingAnalytics
  sections: LandingSection[]
  form_fields: LandingFormField[]
  consents: LandingConsent[]
  created_at: IsoDateTime
  updated_at: IsoDateTime
  published_at: IsoDateTime | null
}

// ── 정산 (v2.2 §4-23) ─────────────────────────────────────────────────
// 금액은 전부 **부가세 별도**로 저장한다(§4-24 R-S3). 견적 breakdown이 별도 기준이라
// 비교축이 일치한다. 포함으로 받은 값은 저장 직전 분리하고 원본을 input_amount_raw에 남긴다.

/** 협력사 마스터 — 프로젝트에 종속되지 않는 조직 단위 (§19.6) */
export interface Vendor {
  id: UUID
  /** 실거래처명 — #RULE-NO-COMPANY 예외. 픽스처는 가상 명칭만 */
  name: string
  biz_no: string | null
  note: string | null
  archived_at: IsoDateTime | null
  created_at: IsoDateTime
}

/** 행사당 1개. 확정 견적 스냅숏을 보유한다(§4-24 R-S2) */
export interface SettlementBoard {
  id: UUID
  project_id: UUID
  /** 기준 견적 — 스냅숏 출처. 실시간 참조가 아니다 */
  quote_id: UUID | null
  quote_version: number | null
  baselined_at: IsoDateTime
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

/** 기본 9종 + 행사별 추가 (§19.2) */
export interface SettlementBucket {
  id: UUID
  board_id: UUID
  /** s1·s2·s3·s4·ot·at·s5·rc·ld 또는 custom 슬러그 */
  code: string
  label: string
  /** 부가세 별도. 스냅숏 시점에 고정 */
  quote_amount: number
  /** false = 원가 없음 — 발주·실비 입력 금지(R-S4). 견적액 전체가 마진 */
  has_cost: boolean
  /** false = 마진 기준 계약액에서 제외(R-S5). 현재 ld뿐 */
  is_margin_base: boolean
  source: 'quote' | 'custom'
  sort_order: number
  created_at: IsoDateTime
}

export type SettlementItemStatus = 'planned' | 'ordered' | 'settled' | 'cancelled'

/** 발주 단위 = 견적 항목 단위 (§19.3). 협력사 묶음 입력을 만들지 않는다 */
export interface SettlementItem {
  id: UUID
  board_id: UUID
  bucket_id: UUID
  title: string
  spec: string | null
  vendor_id: UUID | null
  assignee_id: UUID | null
  /** 발주(약정) · 부가세 별도 */
  ordered_amount: number | null
  /** 실비(집행) · 부가세 별도 */
  actual_amount: number | null
  /** 담당자가 실제로 받은 원본 금액(포함/별도 표기 그대로) */
  input_amount_raw: number | null
  vat_included_input: boolean
  status: SettlementItemStatus
  /** 세금계산서·카드전표 등 근거 표기 */
  evidence: string | null
  import_id: UUID | null
  note: string | null
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

/** 협력사 견적서 업로드 — Phase 4.7. v2.2는 스키마만 확정한다(§19.5) */
export interface SettlementImport {
  id: UUID
  board_id: UUID
  file_name: string
  drive_file_id: string | null
  vendor_id: UUID | null
  parsed: unknown
  questions: unknown
  status: 'parsed' | 'confirmed' | 'discarded'
  created_by: UUID | null
  created_at: IsoDateTime
}

// ── 주최형(파트너) 확장 (v2.4 §21.1) ──────────────────────────────────
// projects.kind='host'일 때만 의미 있는 부속 테이블. 대행형 행사에도 행은 존재할 수 있으나
// (스키마상 막지 않음) UI·픽스처는 host 행사에서만 채운다.

/** 등급 체계 — DIAMOND·GOLD·SILVER 등 행사별 자유 정의 (§8.1 등급 CRUD) */
export interface PartnerTier {
  id: UUID
  project_id: UUID
  /** 'diamond' 등 slug — 행사 안에서 유일 */
  code: string
  name: string
  description: string | null
  /** 정원 — null=무제한 */
  capacity: number | null
  sort: number
}

export interface Partner {
  id: UUID
  project_id: UUID
  name: string
  tier_id: UUID | null
  status: PartnerStatus
  /** ★ 내부 전용 — 절대 포털(`/p/*`) 응답 타입에 넣지 않는다(§21.2 R-H3) */
  contract_amount: number | null
  note: string | null
  created_at: IsoDateTime
}

/** client_tokens와 동형(연락처 단위) — 파트너 제출 포털(`/p/{token}`) 접근 토큰 */
export interface PartnerToken {
  id: UUID
  partner_id: UUID
  contact_name: string
  contact_email: string
  /** URL에 그대로 사용 */
  token: string
  expires_at: IsoDateTime | null
  revoked_at: IsoDateTime | null
  last_seen_at: IsoDateTime | null
  created_at: IsoDateTime
}

// ── 견적서 임포트 (v2.4 §22) ──────────────────────────────────────────

/** xlsx 업로드 → 확인 큐 → confirm 경유로만 quotes가 된다(R-Q1). parsed·mapping은 분리 보존(R-Q2) */
export interface QuoteImport {
  id: UUID
  /** distribute의 project_prefill이 채운다 — import 시점엔 항상 null */
  project_id: UUID | null
  file_name: string
  format: QuoteImportFormat
  /** 파서 원본 스냅숏 — 사람이 수정한 매핑과 분리 저장(R-Q2) */
  parsed: ParsedQuoteDoc
  /** 확인 큐에서 사람이 수정한 최종 매핑 */
  mapping: SectionMapping[]
  status: QuoteImportStatus
  /** confirm 시점에 세팅 */
  quote_id: UUID | null
  created_by: UUID | null
  created_at: IsoDateTime
}

// ── 운영보드 재구성 (v2.5 §23.1) — category='시나리오'|'운영가이드' 항목에만 귀속 ──────

/** scenario_blocks — 시나리오(사람이 읽는 진행 대본) 항목의 진행 블록 1행 */
export interface ScenarioBlock {
  id: UUID
  deliverable_id: UUID
  /** 프로그램표 세션 연결(세션 그룹 헤더) — 수동 블록·연결 없음은 null */
  session_id: UUID | null
  /** 'HH:MM' 문자열 */
  time: string | null
  kind: ScenarioBlockKind
  /** 대본 전문(마크다운) — 큐시트로 내보낼 때 이 전문은 복사하지 않는다(§23.3) */
  script: string | null
  note: string | null
  sort_order: number
}

/** guide_sections — 운영가이드 항목의 섹션 1개(존별 운영·역할별 체크리스트·비상 대응·연락망) */
export interface GuideSection {
  id: UUID
  deliverable_id: UUID
  kind: GuideSectionKind
  title: string
  /** 마크다운 — S9 초경량 렌더러 재사용 */
  content: string | null
  /** 연동 출처 — 없으면 수기 작성 섹션(비상 대응·연락망 등) */
  source_ref: 'zone_items' | 'role_charters' | null
  /** 원본 변경 감지 표시 — 자동 덮어쓰기 금지, 사람이 차이를 확인하고 반영(R-O4) */
  source_stale: boolean
  sort_order: number
}

// ── v2.6 §24 sheet_connections — 등록 명단 구글 시트 연동 (행사당 1개) ──────
// 대원칙(§24.1): 시트 → 앱 단방향(앱은 시트에 쓰지 않는다) · 자동 덮어쓰기 없음 ·
// 필드 소유 분리 · 하드 삭제 금지 · 연락처 기본 마스킹.

/** 시트 컬럼 1개 ↔ 등록 필드 매핑. field=null이면 '무시'(앱으로 가져오지 않음) */
export interface SheetColumnMapping {
  /** 시트 헤더 문자열 (첫 행을 헤더로 쓰지 않으면 'A'·'B' 같은 열 문자) */
  column: string
  field: SheetMappedField | null
}

export interface SheetConnection {
  id: UUID
  project_id: UUID
  state: SheetConnectionState
  /** 원본 시트 문서 제목 */
  title: string | null
  url: string | null
  /** 명단이 있는 탭 이름 */
  tab_name: string | null
  mapping: SheetColumnMapping[]
  connected_at: IsoDateTime | null
  /** 연결한 사람의 표시 이름 */
  connected_by: string | null
  /** 화면이 기준으로 삼는 마지막 성공 읽기 시각 — 명단·KPI는 전부 이 시점 기준이다 */
  snapshot_at: IsoDateTime | null
  /** 낙관적 잠금 키 (§24.3 R-S1) — applySheetDiff가 이 값과 대조해 409를 낸다 */
  snapshot_version: number
  /** 마지막 자동/수동 확인 시각 (반영과 무관 — R-S2) */
  checked_at: IsoDateTime | null
  /** 주기 자동 확인 간격(분). 0이면 수동만 (결정 B안) */
  auto_check_minutes: number
  /** 원본 시트 최종 수정 시각 — stale 판정 근거 */
  source_modified_at: IsoDateTime | null
  /** 미확인 차이 건수 — checkSheetUpdates·applySheetDiff가 갱신 */
  pending_added: number
  pending_changed: number
  pending_removed: number
  /** 최근 읽기 실패 시각들(권한 끊김 카드의 "실패 3회") */
  failure_times: IsoDateTime[]
  last_success_at: IsoDateTime | null
}

/**
 * mock 전용 — 원본 시트의 현재 행을 재현한다. **DataProvider 계약에는 나오지 않는다**
 * (Phase 4에서는 Sheets API 응답이 이 자리를 대신한다). 차이 계산은 항상
 * 이 행 집합 ↔ attendees(sheet_row_id 보유) 비교로 이뤄진다.
 */
export interface SheetSourceRow {
  project_id: UUID
  /** attendees.sheet_row_id와 짝을 이룬다 */
  sheet_row_id: string
  name: string
  org: string | null
  title: string | null
  email: string | null
  phone: string | null
  group_tag: string | null
  registered_at: IsoDateTime
  status: AttendeeSheetStatus
  /** 중복·형식 오류로 앱에 적재하지 않는 행(KPI의 '제외' 건수). 사유는 화면의 제외 목록에 그대로 뜬다(§24.5) */
  invalid_reason?: SheetInvalidReason
  /** mock 근사 — 취소 이전에 확정이었던 행(§24 KPI '확정 후 취소'). Phase 4는 상태 변경 이력에서 산출 */
  previously_confirmed?: boolean
}
