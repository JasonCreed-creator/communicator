// v2.6 §25.7 — 전시회(EX) 데모 픽스처 **[전부 가정]**.
//
// 근거 행사가 0건인 프리셋이라, 이 픽스처는 "이렇게 돌아갈 것이다"라는 가정을 눈으로 확인하기
// 위한 것이지 실물 재현이 아니다. 첫 실전 전에 확정 게이트를 거쳐야 한다.
//
// 전제: **무료입장**(등록 모듈에 결제 없음 — 유료화는 2차). 참가업체 = partners 일반화,
// 등급은 부스 규격 중심이다.
//
// #RULE-NO-COMPANY: 행사명·참가업체명은 전부 가상 명칭이다. 금액은 데모용 임의값이다.
// 기존 픽스처(대행형 6행사 + 주최형 가상 서밋)는 손대지 않고 **추가**만 한다.
import type {
  ComplianceCard,
  Deliverable,
  Partner,
  PartnerTier,
  RoleCharter,
  WbsTask,
} from '../types/entities'
import type { DeliverableArea, MemberRole } from '../types/enums'
import type { MockState } from './sampleProject'
import { offsetToDate } from '../lib/wbs'
import { HOST_COMPLIANCE_CARD_TEMPLATES } from './complianceTemplates'
import { EXHIBITION_TEMPLATE, HOST_ROLE_CHARTER_TEMPLATE, HOST_SUBMIT_CATEGORY } from './wbsTemplates'

export const PROJECT_ID_EXPO = 'prj-virtual-expo'

const EVENT_DATE = '2026-11-20' // ≈D-83 — 모집(D-90)은 지났고 부스 판매 마감(D-45)이 남은 시점
const SEEDED_AT = '2026-08-25T09:00:00.000Z'

/** 부스 규격 중심 등급 — 발표 세션은 팔지 않는다(전시회는 부스가 상품이다) */
const TIERS: Omit<PartnerTier, 'project_id'>[] = [
  { id: 'tier-expo-lg', code: 'expo_large', name: '대형 부스', description: '3부스 연결 · 코너', capacity: 4, sort: 1, session_slots: 0, booth_included: true, staff_cap: 6, price: 12_000_000 },
  { id: 'tier-expo-std', code: 'expo_standard', name: '표준 부스', description: '1부스', capacity: 20, sort: 2, session_slots: 0, booth_included: true, staff_cap: 3, price: 4_500_000 },
  { id: 'tier-expo-startup', code: 'expo_startup', name: '스타트업 존', description: '테이블형 · 공동 운영', capacity: 12, sort: 3, session_slots: 0, booth_included: true, staff_cap: 2, price: 1_200_000 },
]

interface ExhibitorSeed {
  id: string
  name: string
  tier: string
  booth_no: string | null
}

const EXHIBITORS: ExhibitorSeed[] = [
  { id: 'ptn-expo-01', name: '가상머티리얼', tier: 'tier-expo-lg', booth_no: 'A-01' },
  { id: 'ptn-expo-02', name: '가상로보틱스', tier: 'tier-expo-std', booth_no: 'B-04' },
  { id: 'ptn-expo-03', name: '가상센서웍스', tier: 'tier-expo-std', booth_no: 'B-05' },
  { id: 'ptn-expo-04', name: '가상그린랩', tier: 'tier-expo-startup', booth_no: null },
]

const AREA_BY_ROLE: Record<MemberRole, DeliverableArea> = {
  design: 'design',
  ops: 'ops',
  pm: 'common',
  reg: 'common',
}

export function seedExhibitionFixtures(state: MockState): void {
  state.projects.push({
    id: PROJECT_ID_EXPO,
    name: '가상산업박람회 2026',
    code: 'VXP26',
    kind: 'host',
    event_date: EVENT_DATE,
    event_end_date: '2026-11-22',
    start_time: '10:00',
    end_time: '17:00',
    expected_headcount: 3000,
    seating: '스탠딩',
    organizer: '가상산업박람회 조직위',
    target_audience: '업계 참관객 · 바이어 (무료 입장)',
    status: 'active',
    closed_at: null,
    guarantee_pax: null,
    kpi_show_rate: null,
    targeting: null,
    quote_id: null,
    drive_root_folder_id: null,
    slack_webhook_url: null,
    // v2.6 §25.7 — 전시회 프리셋. 참관객은 공개 모집(무료입장)이라 audience_model='open'
    format: 'exhibition',
    psa_enabled: false,
    audience_model: 'open',
    event_type: 'recruiting',
    theme: '산업의 다음 표준',
    venue: '가상엑스포센터 1~3홀',
    mc_name: null,
    overview_items: [{ label: '입장', value: '무료 (사전 등록 권장)' }],
    onboarded_at: SEEDED_AT,
    partner_guide_url: 'https://example.com/vxp26-guide',
    partner_contact_email: 'exhibitors@example.com',
    created_by: 'usr-pm',
    created_at: '2026-08-20T09:00:00.000Z',
  })
  state.members.push(
    { project_id: PROJECT_ID_EXPO, user_id: 'usr-pm', role: 'pm' },
    { project_id: PROJECT_ID_EXPO, user_id: 'usr-design', role: 'design' },
    { project_id: PROJECT_ID_EXPO, user_id: 'usr-ops', role: 'ops' },
    { project_id: PROJECT_ID_EXPO, user_id: 'usr-reg', role: 'reg' },
  )

  state.partner_tiers.push(...TIERS.map((t) => ({ ...t, project_id: PROJECT_ID_EXPO })))

  const partners: Partner[] = EXHIBITORS.map((e) => ({
    id: e.id,
    project_id: PROJECT_ID_EXPO,
    name: e.name,
    tier_id: e.tier,
    status: 'active',
    // 계약액은 등급 단가로 갈음한다 — 데모라 별도 협상값을 두지 않는다
    contract_amount: TIERS.find((t) => t.id === e.tier)?.price ?? null,
    note: null,
    booth_no: e.booth_no,
    booth_size: e.booth_no ? '3m x 3m' : null,
    booth_power: e.booth_no ? '단상 220V 1구' : null,
    booth_internet: e.booth_no ? true : null,
    created_at: SEEDED_AT,
  }))
  state.partners.push(...partners)

  // ── EX-1~12 전개 (hostFixtures의 HT 전개와 같은 규칙의 정적 버전) ──
  // 진행 상태는 D-83 시점에 맞춘다: 모집 오픈(D-90)만 done, 나머지는 아직 앞이라 todo·requested.
  const wbsTasks: WbsTask[] = []
  const deliverables: Deliverable[] = []
  let sortOrder = 1
  let dlvSeq = 1

  EXHIBITION_TEMPLATE.forEach((tpl, tplIdx) => {
    const direction = tpl.direction ?? 'internal'
    const instances: (Partner | null)[] = direction === 'partner_submit' ? partners : [null]
    instances.forEach((partner, instIdx) => {
      const task: WbsTask = {
        id: `wbs-vxp-${String(tplIdx + 1).padStart(2, '0')}-${String(instIdx + 1).padStart(2, '0')}`,
        project_id: PROJECT_ID_EXPO,
        phase_no: tpl.phase_no,
        phase_name: tpl.phase_name,
        code: tpl.code,
        title: partner ? `${tpl.title} — ${partner.name}` : tpl.title,
        offset_start: tpl.offset_start,
        offset_end: tpl.offset_end,
        start_date: offsetToDate(EVENT_DATE, tpl.offset_start),
        end_date: offsetToDate(EVENT_DATE, tpl.offset_end),
        role: tpl.role,
        origin_role: null,
        status: tpl.code === 'EX-1' ? 'done' : 'todo',
        done_at: tpl.code === 'EX-1' ? SEEDED_AT : null,
        linked_deliverable_id: null,
        target: partner ? partner.name : null,
        direction,
        partner_id: partner?.id ?? null,
        note: null,
        sort_order: sortOrder++,
      }

      if (direction === 'partner_submit' && partner) {
        const deliverableId = `dlv-vxp-${String(dlvSeq++).padStart(3, '0')}`
        deliverables.push({
          id: deliverableId,
          project_id: PROJECT_ID_EXPO,
          area: AREA_BY_ROLE[tpl.role],
          category: HOST_SUBMIT_CATEGORY[tpl.code] ?? '파트너 제출',
          title: `${tpl.title} — ${partner.name}`,
          status: 'requested',
          assignee_id: null,
          due_date: task.end_date,
          drive_folder_id: null,
          requires_approval: true,
          brief: null,
          brief_refs: null,
          spec_size: null,
          spec_qty: null,
          spec_location: null,
          spec_type: null,
          content: null,
          partner_id: partner.id,
          created_at: SEEDED_AT,
          updated_at: SEEDED_AT,
        })
        task.linked_deliverable_id = deliverableId
      }
      wbsTasks.push(task)
    })
  })

  state.wbs_tasks.push(...wbsTasks)
  state.deliverables.push(...deliverables)

  // R&R·컴플라이언스는 주최형 세트를 그대로 쓴다 — 전시회 전용 카드(시공 감리 등)는
  // 근거가 없어 만들지 않는다(§25.3 "[가정]" 행의 '주최형 4역할+시공 감리'는 미확정).
  const roleCharters: RoleCharter[] = HOST_ROLE_CHARTER_TEMPLATE.map((tpl, i) => ({
    id: `rrc-vxp-${String(i + 1).padStart(2, '0')}`,
    project_id: PROJECT_ID_EXPO,
    role: tpl.role,
    origin_role: tpl.origin_role,
    title: tpl.title,
    items: [...tpl.items],
  }))
  state.role_charters.push(...roleCharters)

  const complianceCards: ComplianceCard[] = HOST_COMPLIANCE_CARD_TEMPLATES.map((tpl, i) => ({
    id: `cmp-vxp-${String(i + 1).padStart(2, '0')}`,
    project_id: PROJECT_ID_EXPO,
    kind: tpl.kind,
    title: tpl.title,
    items: tpl.items.map((text) => ({ text, checked: false, checked_at: null })),
    sort_order: tpl.sort_order,
  }))
  state.compliance_cards.push(...complianceCards)
}
