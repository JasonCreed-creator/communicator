// v2.4 §21.3 — 주최형(파트너) 데모 픽스처. #RULE-NO-COMPANY: 파트너명은 전부 가상 명칭.
// 기존 대행형 픽스처(샘플 테크 컨퍼런스·파트너 데이·리더십 포럼·AI 서밋·RE:BUILD 26·27)는
// 이 파일이 손대지 않는다 — 이 파일은 행사·파트너·WBS·inbound 산출물을 **추가**만 한다.
// 주의: 'prj-partner-day'(파트너 데이 2026)는 이름이 비슷하지만 **대행형**이라 이 픽스처와 무관하다.
import type { Comment, Deliverable, Partner, PartnerTier, PartnerToken, Version, WbsTask } from '../types/entities'
import type { DeliverableArea, MemberRole } from '../types/enums'
import type { MockState } from './sampleProject'
import { offsetToDate } from '../lib/wbs'
import { HOST_TEMPLATE } from './wbsTemplates'

export const PROJECT_ID_HOST = 'prj-virtual-summit'
/** 데모 파트너 포털 토큰(§21.3) — 다이아 등급 파트너(가상다이아텍) 소유, `/p/demo-partner` */
export const PARTNER_DEMO_TOKEN = 'demo-partner'
/** 회수된 파트너 토큰 (410 검증) */
export const PARTNER_REVOKED_TOKEN = 'demo-partner-revoked'
/** 만료된 파트너 토큰 (410 검증) */
export const PARTNER_EXPIRED_TOKEN = 'demo-partner-expired'

const EVENT_DATE = '2026-10-15' // §21.3: ≈D-49
const SEEDED_AT = '2026-08-20T09:00:00.000Z'

const TIERS: Omit<PartnerTier, 'project_id'>[] = [
  { id: 'tier-diamond', code: 'diamond', name: 'DIAMOND', description: '메인 무대 단독 스폰서 등급', capacity: 1, sort: 1 },
  { id: 'tier-gold', code: 'gold', name: 'GOLD', description: '트랙 스폰서 등급', capacity: 3, sort: 2 },
  { id: 'tier-silver', code: 'silver', name: 'SILVER', description: '부스 참가 등급', capacity: null, sort: 3 },
]

interface PartnerSeed {
  id: string
  name: string
  tier: string
  contract_amount: number
  note: string | null
}

/** 다이아 1·골드 1·실버 3 — 전부 가상 명칭 */
const PARTNERS: PartnerSeed[] = [
  { id: 'ptn-001', name: '가상다이아텍', tier: 'tier-diamond', contract_amount: 80_000_000, note: '메인 스폰서' },
  { id: 'ptn-002', name: '가상골드플랫폼', tier: 'tier-gold', contract_amount: 40_000_000, note: null },
  { id: 'ptn-003', name: '가상실버클라우드', tier: 'tier-silver', contract_amount: 15_000_000, note: null },
  { id: 'ptn-004', name: '가상실버네트웍스', tier: 'tier-silver', contract_amount: 15_000_000, note: null },
  { id: 'ptn-005', name: '가상실버랩스', tier: 'tier-silver', contract_amount: 15_000_000, note: null },
]

/**
 * HT-1(D-45, 파트너 기본 자료 제출)의 파트너별 제출 상태 분포 — §21.3 "제출 상태 분포:
 * 승인(final) 2 · 검토중(pending_approval) 1 · 수정요청(changes_requested) 1 · 미제출(requested) 1"
 * 를 그대로 배치한다. 다른 HT 코드는 전부 requested(아직 마감 전) 그대로 둔다.
 */
const HT1_STATUS: Record<string, Deliverable['status']> = {
  'ptn-001': 'final',
  'ptn-002': 'final',
  'ptn-003': 'pending_approval',
  'ptn-004': 'changes_requested',
  'ptn-005': 'requested',
}

const AREA_BY_ROLE: Record<MemberRole, DeliverableArea> = {
  design: 'design',
  ops: 'ops',
  pm: 'common',
  reg: 'common',
}

export function seedHostFixtures(state: MockState): void {
  state.projects.push({
    id: PROJECT_ID_HOST,
    name: '가상 서밋 2026',
    code: 'VST26',
    kind: 'host',
    event_date: EVENT_DATE,
    event_end_date: EVENT_DATE,
    start_time: '10:00',
    end_time: '18:00',
    expected_headcount: 400,
    seating: '극장식',
    organizer: '가상 서밋 사무국',
    target_audience: '파트너사 실무진·참관객',
    status: 'active',
    closed_at: null,
    guarantee_pax: 300,
    kpi_show_rate: 90,
    targeting: {
      company_size: ['대기업', '중견기업'],
      title: ['임원', '팀장'],
      industry: ['IT/통신'],
      job: ['마케팅/광고'],
      region: ['서울특별시'],
    },
    quote_id: null,
    drive_root_folder_id: null,
    slack_webhook_url: null,
    event_type: 'recruiting', // §21.3: 주최형 × 모객형
    theme: '파트너와 함께 여는 다음 시장',
    venue: '가상엑스포센터 2홀',
    mc_name: null,
    overview_items: null,
    onboarded_at: SEEDED_AT,
    created_by: 'usr-pm',
    created_at: '2026-08-15T09:00:00.000Z',
  })
  state.members.push(
    { project_id: PROJECT_ID_HOST, user_id: 'usr-pm', role: 'pm' },
    { project_id: PROJECT_ID_HOST, user_id: 'usr-design', role: 'design' },
    { project_id: PROJECT_ID_HOST, user_id: 'usr-ops', role: 'ops' },
    { project_id: PROJECT_ID_HOST, user_id: 'usr-reg', role: 'reg' },
  )

  state.partner_tiers.push(
    ...TIERS.map((t) => ({ ...t, project_id: PROJECT_ID_HOST })),
  )

  const partners: Partner[] = PARTNERS.map((p) => ({
    id: p.id,
    project_id: PROJECT_ID_HOST,
    name: p.name,
    tier_id: p.tier,
    status: 'active',
    contract_amount: p.contract_amount,
    note: p.note,
    created_at: SEEDED_AT,
  }))
  state.partners.push(...partners)

  const tokens: PartnerToken[] = [
    {
      id: 'ptok-001',
      partner_id: 'ptn-001',
      contact_name: '한파트너',
      contact_email: 'partner@example.com',
      token: PARTNER_DEMO_TOKEN,
      expires_at: '2026-11-14T00:00:00.000Z', // 행사일(§6.3 기본) +30일
      revoked_at: null,
      last_seen_at: null,
      created_at: SEEDED_AT,
    },
    {
      id: 'ptok-002',
      partner_id: 'ptn-002',
      contact_name: '오회수',
      contact_email: 'partner-revoked@example.com',
      token: PARTNER_REVOKED_TOKEN,
      expires_at: '2026-11-14T00:00:00.000Z',
      revoked_at: '2026-08-22T09:00:00.000Z',
      last_seen_at: null,
      created_at: SEEDED_AT,
    },
    {
      id: 'ptok-003',
      partner_id: 'ptn-003',
      contact_name: '민만료',
      contact_email: 'partner-expired@example.com',
      token: PARTNER_EXPIRED_TOKEN,
      expires_at: '2026-08-01T00:00:00.000Z',
      revoked_at: null,
      last_seen_at: null,
      created_at: SEEDED_AT,
    },
  ]
  state.partner_tokens.push(...tokens)

  // ── HT-1~12 전개 — partner_submit은 파트너 5인분 인스턴스 + 자동 inbound deliverable ──
  // (MockProvider.expandHostWbs와 같은 규칙의 정적 버전 — 픽스처는 provider를 거치지 않고
  // 직접 조립하는 기존 관례를 따른다: sampleProject.ts의 RECRUITING 37태스크 전개와 동일 패턴)
  const wbsTasks: WbsTask[] = []
  const deliverables: Deliverable[] = []
  const versions: Version[] = []
  const comments: Comment[] = []
  let sortOrder = 1
  let dlvSeq = 1
  let verSeq = 1

  HOST_TEMPLATE.forEach((tpl, tplIdx) => {
    const direction = tpl.direction ?? 'internal'
    const instances: (Partner | null)[] = direction === 'partner_submit' ? partners : [null]
    instances.forEach((partner, instIdx) => {
      const taskId = `wbs-vst-${String(tplIdx + 1).padStart(2, '0')}-${String(instIdx + 1).padStart(2, '0')}`
      const task: WbsTask = {
        id: taskId,
        project_id: PROJECT_ID_HOST,
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
        status: 'todo',
        done_at: null,
        linked_deliverable_id: null,
        target: null,
        direction,
        partner_id: partner?.id ?? null,
        note: null,
        sort_order: sortOrder++,
      }

      if (direction === 'partner_submit' && partner) {
        // §5.1: partner_submit 태스크 전개 시 inbound deliverable(status='requested')을
        // 자동 생성하고 linked_deliverable_id로 연결한다. HT-1만 데모 상태 분포로 미리 진행시킨다.
        const status = tpl.code === 'HT-1' ? HT1_STATUS[partner.id] : 'requested'
        const deliverableId = `dlv-vst-${String(dlvSeq++).padStart(3, '0')}`
        const deliverable: Deliverable = {
          id: deliverableId,
          project_id: PROJECT_ID_HOST,
          area: AREA_BY_ROLE[tpl.role],
          category: '파트너 제출',
          title: `${tpl.title} — ${partner.name}`,
          status,
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
        }
        deliverables.push(deliverable)
        task.linked_deliverable_id = deliverableId
        if (status === 'final') task.status = 'done'
        else if (status !== 'requested') task.status = 'doing'

        if (status !== 'requested') {
          const versionId = `ver-vst-${String(verSeq++).padStart(3, '0')}`
          versions.push({
            id: versionId,
            deliverable_id: deliverableId,
            version_no: 1,
            drive_file_id: `drv-f-${versionId}`,
            file_name: `260820_VST26_파트너제출_${deliverable.title}_v1.pdf`,
            note: '파트너 제출',
            uploaded_by: null,
            created_at: SEEDED_AT,
          })
          if (status === 'changes_requested') {
            // 파트너가 봐야 하는 검토 코멘트이므로 shared로 기록 (R-H6)
            comments.push({
              id: `cmt-${deliverableId}`,
              deliverable_id: deliverableId,
              author_user_id: 'usr-pm',
              author_token: null,
              visibility: 'shared',
              body: '발표자 프로필 사진 해상도가 낮습니다 — 300dpi 이상으로 다시 올려주세요.',
              created_at: SEEDED_AT,
            })
          }
        }
      }

      wbsTasks.push(task)
    })
  })

  state.wbs_tasks.push(...wbsTasks)
  state.deliverables.push(...deliverables)
  state.versions.push(...versions)
  state.comments.push(...comments)
}
