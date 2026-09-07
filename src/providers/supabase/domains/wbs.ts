// SupabaseProvider · 온보딩 완료 — WBS 전개(대행형·주최형) — 태스크 — R&R — 컴플라이언스 도메인.
// 동작 정본은 MockProvider(같은 메서드)다: 검증 순서·ProviderError code·한국어 메시지·activity_log action을 그대로 옮겼다.
// 전개는 "행 집합을 앱에서 만들고 한 RPC로 치환"한다 — 재전개 보존(code 매칭·code+partner_id 매칭)·inbound 항목 자동 생성·
// R&R/컴플라이언스 시드 판단은 여기(앱)의 몫이고, 원자적 치환·onboarded_at 기록·pm 단언 이중화는 RPC의 몫이다.
import type { DataProvider } from '../../DataProvider'
import { SupabaseCtx, newId, nowIso } from '../ctx'
import { ProviderError } from '../../../lib/errors'
import { offsetToDate } from '../../../lib/wbs'
import {
  HOST_ROLE_CHARTER_TEMPLATE,
  HOST_SUBMIT_CATEGORY,
  ROLE_CHARTER_TEMPLATES,
  hostTemplateFor,
  wbsTemplateFor,
} from '../../../fixtures/wbsTemplates'
import { COMPLIANCE_CARD_TEMPLATES, HOST_COMPLIANCE_CARD_TEMPLATES } from '../../../fixtures/complianceTemplates'
import type {
  ComplianceCard,
  IsoDate,
  Partner,
  Project,
  RoleCharter,
  UUID,
  WbsTask,
} from '../../../types/entities'
import type { DeliverableArea, MemberRole } from '../../../types/enums'

type WbsMethods =
  | 'completeOnboarding'
  | 'expandWbs'
  | 'expandHostWbs'
  | 'listWbsTasks'
  | 'updateWbsTask'
  | 'listRoleCharters'
  | 'listComplianceCards'
  | 'updateComplianceCard'

/** §5.1 — partner_submit 인스턴스와 함께 자동 생성되는 inbound 항목(status='requested') 행. RPC의
 *  jsonb_populate_recordset(null::deliverables)가 읽는 열만 담는다 */
interface InboundDeliverableRow {
  id: UUID
  project_id: UUID
  area: DeliverableArea
  category: string
  title: string
  status: 'requested'
  assignee_id: null
  due_date: IsoDate | null
  requires_approval: true
  partner_id: UUID
}

/** 새로 만든 inbound 항목 + 그 항목을 낳은 WBS 코드('deliverable.requested' 로그 meta) */
interface NewInbound {
  deliverable: InboundDeliverableRow
  wbs_code: string
}

/** 태스크 역할 → inbound 항목 영역 (mock expandHostWbs의 areaByRole) */
const AREA_BY_ROLE: Record<MemberRole, DeliverableArea> = {
  design: 'design',
  ops: 'ops',
  pm: 'common',
  reg: 'common',
}

/** R&R 카드 표시 순서 — role_charters에는 정렬 열이 없어 템플릿 시드 순(pm→design→ops→reg)으로 맞춘다 */
const ROLE_ORDER: readonly MemberRole[] = ['pm', 'design', 'ops', 'reg']
function sortCharters(rows: RoleCharter[]): RoleCharter[] {
  return [...rows].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.title.localeCompare(b.title),
  )
}

function requireEventDate(project: Project): IsoDate {
  if (!project.event_date) {
    throw new ProviderError('validation', '행사일이 있어야 WBS를 전개할 수 있습니다.')
  }
  return project.event_date
}

// ── 행 빌더 (순수 함수 — completeOnboarding·expandWbs·expandHostWbs가 같은 행을 만든다) ──────────

/**
 * 대행형(모객형·일반형) 전개. 재전개는 code 매칭으로 기존 id·status·done_at·linked_deliverable_id·note를
 * 보존한다(설계서 v1.4.1 §4-15). target은 템플릿 정본에서 재시드, direction은 항상 internal(v2.4 §21).
 */
function buildAgencyTasks(project: Project, eventDate: IsoDate, existing: readonly WbsTask[]): WbsTask[] {
  const prev = new Map(existing.map((task) => [task.code, task]))
  return wbsTemplateFor(project.event_type).map((tpl, i) => {
    const old = prev.get(tpl.code)
    return {
      id: old?.id ?? newId(),
      project_id: project.id,
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
      status: old?.status ?? 'todo',
      done_at: old?.done_at ?? null,
      linked_deliverable_id: old?.linked_deliverable_id ?? null,
      target: tpl.target,
      direction: 'internal',
      partner_id: null,
      note: old?.note ?? null,
      sort_order: i + 1,
    }
  })
}

/**
 * v2.4 §21·§15.3 — 주최형 전개. partner_submit 방향은 활성 파트너 수만큼 인스턴스(파트너별 상태 독립),
 * host_notice·internal은 단일 인스턴스. partner_submit 인스턴스에 연결 항목이 없으면 inbound deliverable
 * (status='requested')을 함께 만들어 linked_deliverable_id로 연결한다(§5.1). 재전개는 code+partner_id
 * 매칭으로 기존 상태·연결·메모를 보존한다(R-H5). 어느 템플릿(HT/EX)을 쓸지는 format이 고른다(§25.1 권한 ①).
 */
function buildHostTasks(
  project: Project,
  eventDate: IsoDate,
  existing: readonly WbsTask[],
  activePartners: readonly Partner[],
): { tasks: WbsTask[]; inbound: NewInbound[] } {
  const prevByKey = new Map(existing.map((task) => [`${task.code}:${task.partner_id ?? ''}`, task]))
  const tasks: WbsTask[] = []
  const inbound: NewInbound[] = []
  let sortOrder = 1
  for (const tpl of hostTemplateFor(project.format)) {
    const direction = tpl.direction ?? 'internal'
    const instances: (Partner | null)[] = direction === 'partner_submit' ? [...activePartners] : [null]
    for (const partner of instances) {
      const old = prevByKey.get(`${tpl.code}:${partner?.id ?? ''}`)
      const task: WbsTask = {
        id: old?.id ?? newId(),
        project_id: project.id,
        phase_no: tpl.phase_no,
        phase_name: tpl.phase_name,
        code: tpl.code,
        title: partner ? `${tpl.title} — ${partner.name}` : tpl.title,
        offset_start: tpl.offset_start,
        offset_end: tpl.offset_end,
        start_date: offsetToDate(eventDate, tpl.offset_start),
        end_date: offsetToDate(eventDate, tpl.offset_end),
        role: tpl.role,
        origin_role: null,
        status: old?.status ?? 'todo',
        done_at: old?.done_at ?? null,
        linked_deliverable_id: old?.linked_deliverable_id ?? null,
        // 3.15.1 P6-① — partner_submit 인스턴스는 파트너명을 target으로 시드(host_notice·internal은 null)
        target: partner ? partner.name : null,
        direction,
        partner_id: partner?.id ?? null,
        note: old?.note ?? null,
        sort_order: sortOrder++,
      }
      tasks.push(task)

      if (direction === 'partner_submit' && partner && !task.linked_deliverable_id) {
        const deliverable: InboundDeliverableRow = {
          id: newId(),
          project_id: project.id,
          area: AREA_BY_ROLE[tpl.role],
          category: HOST_SUBMIT_CATEGORY[tpl.code] ?? '파트너 제출',
          title: `${tpl.title} — ${partner.name}`,
          status: 'requested',
          assignee_id: null,
          due_date: task.end_date,
          requires_approval: true,
          partner_id: partner.id,
        }
        task.linked_deliverable_id = deliverable.id
        inbound.push({ deliverable, wbs_code: tpl.code })
      }
    }
  }
  return { tasks, inbound }
}

/** §15.3b — kind='host'는 event_type과 무관하게 주최형 4카드로 고정(직교 축), 대행형은 유형별 */
function charterRows(project: Project): RoleCharter[] {
  const templates = project.kind === 'host' ? HOST_ROLE_CHARTER_TEMPLATE : ROLE_CHARTER_TEMPLATES[project.event_type]
  return templates.map((tpl) => ({
    id: newId(),
    project_id: project.id,
    role: tpl.role,
    origin_role: tpl.origin_role,
    title: tpl.title,
    items: [...tpl.items],
  }))
}

/** §4-17·§15.3c — kind='host'는 주최형 3카드(C-H1~C-H3), 대행형은 내부·고객사 2카드 */
function cardRows(project: Project): ComplianceCard[] {
  const templates = project.kind === 'host' ? HOST_COMPLIANCE_CARD_TEMPLATES : COMPLIANCE_CARD_TEMPLATES
  return templates.map((tpl) => ({
    id: newId(),
    project_id: project.id,
    kind: tpl.kind,
    title: tpl.title,
    items: tpl.items.map((text) => ({ text, checked: false, checked_at: null })),
    sort_order: tpl.sort_order,
  }))
}

export function wbsDomain(ctx: SupabaseCtx): Pick<DataProvider, WbsMethods> {
  // ── 조회 도우미 ──────────────────────────────────────────────────
  async function tasksOf(projectId: UUID): Promise<WbsTask[]> {
    return ctx.q(
      await ctx.sb.from('wbs_tasks').select('*').eq('project_id', projectId).order('sort_order'),
    ) as WbsTask[]
  }

  async function activePartnersOf(projectId: UUID): Promise<Partner[]> {
    return ctx.q(
      await ctx.sb
        .from('partners')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'active')
        .order('created_at'),
    ) as Partner[]
  }

  /** 행사에 그 표의 행이 하나도 없는지(백필 시드 판단 — "비어 있으면 시드") */
  async function isEmptyFor(table: 'role_charters' | 'compliance_cards', projectId: UUID): Promise<boolean> {
    const res = await ctx.sb.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    ctx.ok(res)
    return (res.count ?? 0) === 0
  }

  /**
   * inbound 항목 자동 생성 로그 — mock은 expandHostWbs 안에서 항목마다 'deliverable.requested'를 남긴다.
   * replace_wbs_tasks_impl은 항목만 넣고 이 로그를 쓰지 않으므로 RPC 성공 뒤 앱에서 같은 meta로 남긴다.
   */
  async function logInbound(projectId: UUID, inbound: readonly NewInbound[]): Promise<void> {
    await Promise.all(
      inbound.map((x) =>
        ctx.log(projectId, 'deliverable.requested', 'deliverable', x.deliverable.id, {
          partner_id: x.deliverable.partner_id,
          wbs_code: x.wbs_code,
        }),
      ),
    )
  }

  const api: Pick<DataProvider, WbsMethods> = {
    // ── v1.3 S0 온보딩 완료 ───────────────────────────────────────────
    /**
     * v1.4.1: onboarded_at=now 기록(이미 완료면 409) + 부수 효과(WBS 전개·R&R·컴플라이언스 시드)를 RPC 한 번으로.
     * v2.4 §21 — kind='host'면 파트너별 WBS(HT/EX 템플릿+inbound 자동 생성)로 분기하고, R&R·컴플라이언스는
     * expandHostWbs의 백필 가드와 같은 규칙("비어 있으면 시드")을 따른다. 대행형은 유형별 템플릿 전체 치환.
     */
    async completeOnboarding(projectId) {
      await ctx.assertPm(projectId)
      const project = await ctx.assertWritable(projectId)
      if (project.onboarded_at !== null) {
        throw new ProviderError('conflict', '이미 온보딩이 완료된 프로젝트입니다.')
      }
      const eventDate = requireEventDate(project)
      const existing = await tasksOf(projectId)
      if (project.kind === 'host') {
        const partners = await activePartnersOf(projectId)
        const { tasks, inbound } = buildHostTasks(project, eventDate, existing, partners)
        const [chartersEmpty, cardsEmpty] = await Promise.all([
          isEmptyFor('role_charters', projectId),
          isEmptyFor('compliance_cards', projectId),
        ])
        await ctx.rpc('complete_onboarding', {
          p_project: projectId,
          p_tasks: tasks,
          p_deliverables: inbound.map((x) => x.deliverable),
          p_charters: chartersEmpty ? charterRows(project) : null,
          p_cards: cardsEmpty ? cardRows(project) : null,
        })
        await logInbound(projectId, inbound)
        return
      }
      const tasks = buildAgencyTasks(project, eventDate, existing)
      await ctx.rpc('complete_onboarding', {
        p_project: projectId,
        p_tasks: tasks,
        p_deliverables: [],
        p_charters: charterRows(project),
        p_cards: cardRows(project),
      })
    },

    // ── v1.4 WBS·R&R ──────────────────────────────────────────────────
    async expandWbs(projectId) {
      await ctx.assertPm(projectId)
      const project = await ctx.assertWritable(projectId)
      const eventDate = requireEventDate(project)
      const existing = await tasksOf(projectId)
      const tasks = buildAgencyTasks(project, eventDate, existing)
      // 프로젝트 단위 치환(다른 행사 태스크 무접촉) + 'wbs.expanded' 로그 — 한 트랜잭션
      return ctx.rpc<WbsTask[]>('replace_wbs_tasks', {
        p_project: projectId,
        p_tasks: tasks,
        p_deliverables: [],
        p_action: 'wbs.expanded',
        p_meta: { event_type: project.event_type, count: tasks.length },
      })
    },

    /**
     * v2.4 §21·§15.3 — 주최형 WBS 전개(pm). completeOnboarding(신규)과 S5 '템플릿 재전개'(기존 host 행사)
     * 양쪽의 유일한 진입점이라, 여기서 R&R·컴플라이언스 유무를 확인해 없을 때만 §15.3b·§15.3c 세트를 멱등
     * 시드한다(이미 있으면 손대지 않는다 — 체크 상태 보존, 중복 생성 금지). 3.15.1 폴리시 P4.
     */
    async expandHostWbs(projectId) {
      await ctx.assertPm(projectId)
      const project = await ctx.assertWritable(projectId)
      const eventDate = requireEventDate(project)
      const partners = await activePartnersOf(projectId)
      const existing = await tasksOf(projectId)
      const { tasks, inbound } = buildHostTasks(project, eventDate, existing, partners)
      const expanded = await ctx.rpc<WbsTask[]>('replace_wbs_tasks', {
        p_project: projectId,
        p_tasks: tasks,
        p_deliverables: inbound.map((x) => x.deliverable),
        p_action: 'wbs.expanded_host',
        p_meta: { count: tasks.length, partners: partners.length },
      })
      await logInbound(projectId, inbound)
      // 백필 — 표가 비어 있을 때만 시드(p_only_if_empty), 이미 있으면 RPC가 건너뛴다
      await ctx.rpc('seed_project_sets', {
        p_project: projectId,
        p_charters: charterRows(project),
        p_cards: cardRows(project),
        p_only_if_empty: true,
      })
      return expanded
    },

    async listWbsTasks(projectId, filter) {
      await ctx.project(projectId)
      let query = ctx.sb.from('wbs_tasks').select('*').eq('project_id', projectId)
      if (filter?.phase_no !== undefined) query = query.eq('phase_no', filter.phase_no)
      if (filter?.role !== undefined) query = query.eq('role', filter.role)
      if (filter?.status !== undefined) query = query.eq('status', filter.status)
      return ctx.q(await query.order('sort_order')) as WbsTask[]
    },

    /** §6.1·S5: status 체크 = 담당 역할+pm / 그 외 필드 편집 = pm 전용 */
    async updateWbsTask(taskId, patch) {
      const task = ctx.q(
        await ctx.sb.from('wbs_tasks').select('*').eq('id', taskId).maybeSingle(),
        'WBS 태스크를 찾을 수 없습니다.',
      ) as WbsTask
      await ctx.assertWritable(task.project_id)
      const role = await ctx.roleIn(task.project_id)
      const editKeys = Object.keys(patch).filter((k) => k !== 'status')
      if (editKeys.length > 0 && role !== 'pm') {
        throw new ProviderError('forbidden', '태스크 편집은 PM만 할 수 있습니다.')
      }
      if (patch.status !== undefined && role !== 'pm' && role !== task.role) {
        throw new ProviderError('forbidden', '태스크 체크는 담당 역할과 PM만 할 수 있습니다.')
      }
      const row: Record<string, unknown> = {}
      const statusChanged = patch.status !== undefined && patch.status !== task.status
      if (statusChanged) {
        row.status = patch.status
        row.done_at = patch.status === 'done' ? nowIso() : null
      }
      if (patch.title !== undefined) {
        if (!patch.title.trim()) throw new ProviderError('validation', '태스크 제목은 필수입니다.')
        row.title = patch.title
      }
      if (patch.start_date !== undefined) row.start_date = patch.start_date
      if (patch.end_date !== undefined) row.end_date = patch.end_date
      if (patch.role !== undefined) row.role = patch.role
      if (patch.note !== undefined) row.note = patch.note
      if (patch.linked_deliverable_id !== undefined) {
        if (patch.linked_deliverable_id) await ctx.deliverable(patch.linked_deliverable_id)
        row.linked_deliverable_id = patch.linked_deliverable_id
      }
      if (Object.keys(row).length === 0) return task
      const updated = ctx.q(
        await ctx.sb.from('wbs_tasks').update(row).eq('id', taskId).select('*').single(),
      ) as WbsTask
      if (statusChanged) {
        await ctx.log(task.project_id, 'wbs.status_changed', 'wbs_task', task.id, { status: patch.status })
      }
      return updated
    },

    async listRoleCharters(projectId) {
      await ctx.project(projectId)
      return sortCharters(
        ctx.q(await ctx.sb.from('role_charters').select('*').eq('project_id', projectId)) as RoleCharter[],
      )
    },

    // ── v2.0 컴플라이언스 카드 (§8 /compliance-cards — 체크 멤버·편집 pm) ──
    async listComplianceCards(projectId) {
      await ctx.me()
      await ctx.project(projectId)
      return ctx.q(
        await ctx.sb.from('compliance_cards').select('*').eq('project_id', projectId).order('sort_order'),
      ) as ComplianceCard[]
    },

    async updateComplianceCard(cardId, patch) {
      const card = ctx.q(
        await ctx.sb.from('compliance_cards').select('*').eq('id', cardId).maybeSingle(),
        '컴플라이언스 카드를 찾을 수 없습니다.',
      ) as ComplianceCard
      await ctx.assertWritable(card.project_id)
      const role = await ctx.roleIn(card.project_id)
      const row: Record<string, unknown> = {}
      if (patch.title !== undefined) {
        if (role !== 'pm') {
          throw new ProviderError('forbidden', '카드 편집은 PM만 할 수 있습니다.')
        }
        if (!patch.title.trim()) throw new ProviderError('validation', '카드 제목은 필수입니다.')
        row.title = patch.title
      }
      if (patch.items !== undefined) {
        // §6.1: 체크는 멤버 전원 — checked 전환 시 checked_at 자동 기록/해제
        row.items = patch.items.map((item, i) => {
          const prev = card.items[i]
          const checked = !!item.checked
          return {
            text: item.text ?? prev?.text ?? '',
            checked,
            checked_at: checked ? (prev?.checked && prev.checked_at ? prev.checked_at : nowIso()) : null,
          }
        })
      }
      if (Object.keys(row).length === 0) return card
      return ctx.q(
        await ctx.sb.from('compliance_cards').update(row).eq('id', cardId).select('*').single(),
      ) as ComplianceCard
    },
  }

  return api
}
