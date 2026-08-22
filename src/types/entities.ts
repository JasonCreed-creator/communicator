// 설계서 v1.4 §4 테이블과 1:1 도메인 타입.
// 필드명은 DDL의 snake_case를 그대로 유지한다 — SupabaseProvider 이식 시 매핑 계층 없이 row를 그대로 쓰기 위함.
import type {
  AppRole,
  ApprovalDecision,
  AttendeeChannel,
  CommentVisibility,
  ComplianceKind,
  DeliverableArea,
  DeliverableStatus,
  EventType,
  InviteStatus,
  LandingFieldKind,
  LandingSectionType,
  LandingStatus,
  LandingSubmitTarget,
  MemberRole,
  ProjectStatus,
  QuoteStatus,
  WbsStatus,
} from './enums'

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
  // v1.2 행사개요 (운영계획서 §행사개요 소스)
  theme: string | null
  venue: string | null
  mc_name: string | null
  overview_items: OverviewItem[] | null
  /** v1.4.1 — S0 온보딩 완료 시각. null=미완료(본체 라우트 차단 기준). 완료 처리 시 기록, 이후 불변 */
  onboarded_at: IsoDateTime | null
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
