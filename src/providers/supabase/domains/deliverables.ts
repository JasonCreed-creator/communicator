// SupabaseProvider · 산출물 도메인 — 홈 대시보드(S1) · 활동 로그 · 산출물 CRUD/상태 전이/버전 업로드(S2·S3) ·
// 코멘트 · 마일스톤(S5) · 미등록 파일 인박스.
// 동작 정본 = MockProvider의 같은 메서드(검증 순서·오류 code·한국어 메시지·activity_log action 이름 동일).
// 상태 전이·버전 업로드·인박스 연결은 "상태 갱신 + 버전/코멘트 insert + 로그"가 한 트랜잭션이어야 해서 RPC
// (transition_deliverable·upload_version·link_inbox_file)를 탄다 — RPC는 mock의 규칙을 같은 메시지로 재판정하고,
// 이 파일은 그 앞에 mock과 같은 순서로 앱 계층 단언을 둔다. requestApproval은 program 도메인 담당(이 파일 아님).
// 파일 원본: Phase 4는 Drive 없음 — 업로드 blob은 files.rememberUpload로 세션 메모리에만(§2.1 2단계).
import type { DataProvider } from '../../DataProvider'
import type { SupabaseCtx } from '../ctx'
import { fileUrlFor, rememberUpload } from '../files'
import { ProviderError } from '../../../lib/errors'
import { assertTransition, buildVersionFileName } from '../../../lib/statusMachine'
import { isDelayed, isImminent, toIsoDate } from '../../../lib/wbs'
import { isStructuredDocCategory, type DeliverableArea, type DeliverableStatus } from '../../../types/enums'
import type {
  ActivityLogEntry,
  Approval,
  Comment,
  Deliverable,
  Milestone,
  UnregisteredFile,
  UUID,
  Version,
  WbsTask,
} from '../../../types/entities'
import type { DashboardData, PendingApprovalItem } from '../../../types/views'

type DeliverablesDomain = Pick<
  DataProvider,
  | 'getDashboard'
  | 'listActivity'
  | 'listDeliverables'
  | 'getDeliverable'
  | 'createDeliverable'
  | 'transitionStatus'
  | 'uploadVersion'
  | 'getFileUrl'
  | 'addComment'
  | 'listMilestones'
  | 'createMilestone'
  | 'updateMilestone'
  | 'deleteMilestone'
  | 'listInbox'
  | 'linkInboxFile'
  | 'dismissInboxFile'
>

const UPLOADABLE_STATUSES: readonly DeliverableStatus[] = [
  'requested', // v1.2: 첫 버전 업로드 시 draft 자동 전이
  'draft',
  'internal_review',
  'changes_requested',
]

const AREAS: readonly DeliverableArea[] = ['design', 'ops', 'common']

/** 정렬 키 — null 마감은 뒤로(mock의 `?? '9999'`) */
const LAST = '9999'

export function deliverablesDomain(ctx: SupabaseCtx): DeliverablesDomain {
  /** 활동 로그 최신순 — 행사 존재 검사는 호출부가 한다(대시보드는 이미 project를 읽었다) */
  async function activityOf(projectId: UUID, limit: number): Promise<ActivityLogEntry[]> {
    return ctx.q(
      await ctx.sb
        .from('activity_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit),
    ) as ActivityLogEntry[]
  }

  async function milestoneOf(milestoneId: UUID): Promise<Milestone> {
    return ctx.q(
      await ctx.sb.from('milestones').select('*').eq('id', milestoneId).maybeSingle(),
      '마일스톤을 찾을 수 없습니다.',
    ) as Milestone
  }

  async function inboxOf(inboxId: UUID): Promise<UnregisteredFile> {
    return ctx.q(
      await ctx.sb.from('unregistered_files').select('*').eq('id', inboxId).maybeSingle(),
      '인박스 파일을 찾을 수 없습니다.',
    ) as UnregisteredFile
  }

  /**
   * v2.5 §23 R-O4 — 존별 운영 원본(ops 비정형 항목) 추가는 이 행사 운영가이드 문서(들)의 zone 섹션을
   * stale 표시한다. 자동 반영은 하지 않는다 — 사람이 차이를 확인하고 saveGuideSections로 반영.
   */
  async function markGuideZoneStale(projectId: UUID): Promise<void> {
    const guides = ctx.q(
      await ctx.sb.from('deliverables').select('id').eq('project_id', projectId).eq('category', '운영가이드'),
    ) as { id: UUID }[]
    if (guides.length === 0) return
    ctx.ok(
      await ctx.sb
        .from('guide_sections')
        .update({ source_stale: true })
        .eq('kind', 'zone')
        .in(
          'deliverable_id',
          guides.map((g) => g.id),
        ),
    )
  }

  return {
    // ── 홈 대시보드 (S1 · §8 GET /projects/{id}/dashboard) ─────────────
    async getDashboard(projectId) {
      const me = await ctx.me()
      const project = await ctx.project(projectId)
      const [deliverableRes, milestoneRes, inboxRes, taskRes, recent_activity] = await Promise.all([
        ctx.sb.from('deliverables').select('*').eq('project_id', projectId),
        ctx.sb.from('milestones').select('*').eq('project_id', projectId).eq('done', false).order('due_date'),
        ctx.sb
          .from('unregistered_files')
          .select('id')
          .eq('project_id', projectId)
          .eq('dismissed', false)
          .is('linked_deliverable_id', null),
        ctx.sb.from('wbs_tasks').select('*').eq('project_id', projectId),
        activityOf(projectId, 10),
      ])
      const deliverables = ctx.q(deliverableRes) as Deliverable[]
      const upcoming_milestones = ctx.q(milestoneRes) as Milestone[]
      const inbox = ctx.q(inboxRes) as { id: UUID }[]
      const tasks = ctx.q(taskRes) as WbsTask[]

      // 미결 컨펌 — pending_approval 항목의 미결정 approvals + 대상 버전, 기한순
      const pendingDeliverables = deliverables.filter((d) => d.status === 'pending_approval')
      let pending_approvals: PendingApprovalItem[] = []
      if (pendingDeliverables.length > 0) {
        const approvals = ctx.q(
          await ctx.sb
            .from('approvals')
            .select('*')
            .in(
              'deliverable_id',
              pendingDeliverables.map((d) => d.id),
            )
            .is('decided_at', null),
        ) as Approval[]
        const versionIds = approvals.map((a) => a.version_id).filter((id): id is UUID => !!id)
        const versions =
          versionIds.length > 0
            ? (ctx.q(await ctx.sb.from('versions').select('*').in('id', versionIds)) as Version[])
            : []
        const byId = new Map(pendingDeliverables.map((d) => [d.id, d]))
        pending_approvals = approvals
          .map((approval) => {
            const deliverable = byId.get(approval.deliverable_id)
            const version = versions.find((v) => v.id === approval.version_id)
            if (!deliverable) throw new ProviderError('not_found', '항목을 찾을 수 없습니다.')
            if (!version) throw new ProviderError('not_found', '컨펌 대상 버전이 없습니다.')
            return { approval, deliverable, version }
          })
          .sort((a, b) => (a.approval.due_at ?? LAST).localeCompare(b.approval.due_at ?? LAST))
      }

      const today = toIsoDate(new Date())
      const byEndDate = (a: WbsTask, b: WbsTask) => (a.end_date ?? LAST).localeCompare(b.end_date ?? LAST)

      return {
        project,
        pending_approvals,
        upcoming_milestones,
        inbox_count: inbox.length,
        area_progress: AREAS.map((area) => {
          const items = deliverables.filter((d) => d.area === area)
          return { area, total: items.length, done: items.filter((d) => d.status === 'final').length }
        }),
        recent_activity,
        // v1.2: 받은 가이드 — 내가 담당자인 requested 항목, 마감순
        my_requested: deliverables
          .filter((d) => d.status === 'requested' && d.assignee_id === me.id)
          .sort((a, b) => (a.due_date ?? LAST).localeCompare(b.due_date ?? LAST)),
        // v1.4: 지연/임박 WBS 집계 (lib/wbs 정본 산식, 지연·임박 배타)
        wbs_delayed: tasks.filter((t) => isDelayed(t, today)).sort(byEndDate),
        wbs_imminent: tasks.filter((t) => isImminent(t, today)).sort(byEndDate),
      } satisfies DashboardData
    },

    async listActivity(projectId, limit = 20) {
      await ctx.project(projectId)
      return activityOf(projectId, limit)
    },

    // ── 산출물 (S2·S3) ────────────────────────────────────────────────
    async listDeliverables(projectId, filter) {
      await ctx.project(projectId)
      let q = ctx.sb.from('deliverables').select('*').eq('project_id', projectId)
      if (filter?.area) q = q.eq('area', filter.area)
      if (filter?.status) q = q.eq('status', filter.status)
      if (filter?.assignee_id) q = q.eq('assignee_id', filter.assignee_id)
      return ctx.q(await q.order('created_at')) as Deliverable[]
    },

    async getDeliverable(deliverableId) {
      const d = await ctx.deliverable(deliverableId)
      const [versionRes, commentRes, approvalRes] = await Promise.all([
        ctx.sb.from('versions').select('*').eq('deliverable_id', deliverableId).order('version_no', { ascending: false }),
        ctx.sb.from('comments').select('*').eq('deliverable_id', deliverableId).order('created_at'),
        ctx.sb.from('approvals').select('*').eq('deliverable_id', deliverableId).order('requested_at'),
      ])
      return {
        ...d,
        versions: ctx.q(versionRes) as Version[],
        // 내부 화면은 전체(internal·shared) — 발주처 노출은 clientPortal 도메인이 shared만 돌려준다
        comments: ctx.q(commentRes) as Comment[],
        approvals: ctx.q(approvalRes) as Approval[],
      }
    },

    async createDeliverable(input) {
      await ctx.assertWritable(input.project_id)
      const me = await ctx.assertAreaRole(input.project_id, input.area)
      const role = await ctx.roleIn(input.project_id)
      if (!input.title.trim() || !input.category.trim()) {
        throw new ProviderError('validation', '카테고리와 제목은 필수입니다.')
      }
      // v1.2 §8: brief·스펙 포함 시 가이드 발행 — pm 전용, status='requested', 담당자 필수
      const isBriefIssue =
        !!input.brief?.trim() ||
        input.spec_size !== undefined ||
        input.spec_qty !== undefined ||
        input.spec_location !== undefined ||
        input.spec_type !== undefined
      if (isBriefIssue) {
        if (role !== 'pm') {
          throw new ProviderError('forbidden', '가이드 발행은 PM만 할 수 있습니다.')
        }
        if (!input.assignee_id) {
          throw new ProviderError('validation', '가이드에는 담당자 지정이 필요합니다.')
        }
      }
      const deliverable = ctx.q(
        await ctx.sb
          .from('deliverables')
          .insert({
            project_id: input.project_id,
            area: input.area,
            category: input.category,
            title: input.title,
            status: isBriefIssue ? 'requested' : 'draft',
            assignee_id: input.assignee_id ?? me.id,
            due_date: input.due_date ?? null,
            drive_folder_id: null, // Drive 폴더 생성은 Phase 5
            requires_approval: input.requires_approval ?? input.area !== 'common',
            brief: input.brief ?? null,
            brief_refs: input.brief_refs ?? null,
            spec_size: input.spec_size ?? null,
            spec_qty: input.spec_qty ?? null,
            spec_location: input.spec_location ?? null,
            spec_type: input.spec_type ?? null,
            content: input.content ?? null,
            partner_id: null, // v2.4 §21 — 이 경로(내부 수동 생성)는 파트너 제출물을 만들지 않는다(전개 전용)
          })
          .select('*')
          .single(),
      ) as Deliverable
      if (isBriefIssue) {
        // §5 부수 효과: 가이드 문서 작성 + 담당자 알림 (Slack 실연동은 Phase 6)
        await ctx.log(deliverable.project_id, 'deliverable.requested', 'deliverable', deliverable.id, {
          assignee_id: deliverable.assignee_id,
        })
      } else {
        await ctx.log(deliverable.project_id, 'deliverable.created', 'deliverable', deliverable.id)
      }
      if (deliverable.area === 'ops' && !isStructuredDocCategory(deliverable.category)) {
        await markGuideZoneStale(deliverable.project_id)
      }
      return deliverable
    },

    async transitionStatus(deliverableId, to, opts) {
      // §5 status_patch 경로 — 규칙·주체·코멘트 필수를 mock과 같은 순서로 먼저 판정하고(같은 메시지),
      // 상태 갱신 + 반려 코멘트 insert + 로그는 RPC가 한 트랜잭션으로 수행한다(RPC도 같은 규칙을 재검사).
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertWritable(d.project_id)
      const role = await ctx.assertMember(d.project_id)
      const rule = assertTransition(d.status, to, 'status_patch')
      if (rule.roles && !rule.roles.includes(role)) {
        throw new ProviderError('forbidden', '이 전이를 수행할 권한이 없습니다.')
      }
      // draft→internal_review는 '영역 담당 또는 PM' (§5)
      if (rule.from === 'draft') await ctx.assertAreaRole(d.project_id, d.area)
      if (rule.requires_comment && !opts?.comment?.trim()) {
        throw new ProviderError('validation', '반려 사유 코멘트가 필요합니다.')
      }
      return ctx.rpc<Deliverable>('transition_deliverable', {
        p_deliverable: deliverableId,
        p_to: to,
        p_comment: opts?.comment ?? null,
      })
    },

    async uploadVersion(deliverableId, input) {
      const d = await ctx.deliverable(deliverableId)
      const project = await ctx.assertWritable(d.project_id)
      await ctx.assertAreaRole(d.project_id, d.area)
      if (!UPLOADABLE_STATUSES.includes(d.status)) {
        throw new ProviderError('conflict', `현재 상태(${d.status})에서는 업로드할 수 없습니다.`)
      }
      // v2.4 §5.1: 주최형 inbound(partner_id 보유) 항목은 아직 제출 전(requested)이면 파트너 제출 경로만 있다
      if (d.partner_id !== null && d.status === 'requested') {
        throw new ProviderError('conflict', '파트너 제출 항목은 파트너가 제출 링크로 첫 제출을 해야 합니다.')
      }
      // 파일명 규약(§7.2)은 호출자가 만들어 넘긴다 — version_no는 DB 트리거(max+1)와 같은 산식으로 미리 계산
      const latest = ctx.q(
        await ctx.sb
          .from('versions')
          .select('version_no')
          .eq('deliverable_id', deliverableId)
          .order('version_no', { ascending: false })
          .limit(1),
      ) as { version_no: number }[]
      const versionNo = (latest[0]?.version_no ?? 0) + 1
      const version = await ctx.rpc<Version>('upload_version', {
        p_deliverable: deliverableId,
        p_file_name: buildVersionFileName({
          date: new Date(),
          project_code: project.code,
          category: d.category,
          title: d.title,
          version_no: versionNo,
          original_file_name: input.file_name,
        }),
        p_note: input.note ?? null,
        p_original_file_name: input.file_name,
      })
      // Phase 4 파일 저장: 세션 메모리 blob URL(새로고침 시 소실 허용) — Drive 업로드는 Phase 5
      rememberUpload(version.id, input.file)
      return version
    },

    async getFileUrl(versionId) {
      const version = ctx.q(
        await ctx.sb.from('versions').select('id, file_name').eq('id', versionId).maybeSingle(),
        '버전을 찾을 수 없습니다.',
      ) as { id: UUID; file_name: string }
      return fileUrlFor(version.id, version.file_name)
    },

    // ── 코멘트 (내부 작성 경로 — 발주처 작성은 clientPortal.submitClientDecision 경유) ──
    async addComment(deliverableId, input) {
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertWritable(d.project_id)
      if (!input.body.trim()) throw new ProviderError('validation', '코멘트 내용이 비어 있습니다.')
      const me = await ctx.me()
      return ctx.q(
        await ctx.sb
          .from('comments')
          .insert({
            deliverable_id: deliverableId,
            author_user_id: me.id,
            author_token: null,
            visibility: input.visibility ?? 'internal', // 기본 internal (CLAUDE.md §6)
            body: input.body,
          })
          .select('*')
          .single(),
      ) as Comment
    },

    // ── 일정·마일스톤 (S5) ────────────────────────────────────────────
    async listMilestones(projectId) {
      await ctx.project(projectId)
      return ctx.q(
        await ctx.sb.from('milestones').select('*').eq('project_id', projectId).order('due_date'),
      ) as Milestone[]
    },

    async createMilestone(projectId, input) {
      await ctx.me()
      await ctx.assertWritable(projectId)
      return ctx.q(
        await ctx.sb
          .from('milestones')
          .insert({ project_id: projectId, title: input.title, area: input.area ?? null, due_date: input.due_date, done: false })
          .select('*')
          .single(),
      ) as Milestone
    },

    async updateMilestone(milestoneId, patch) {
      await ctx.me()
      const m = await milestoneOf(milestoneId)
      await ctx.assertWritable(m.project_id)
      const row: Record<string, unknown> = {}
      if (patch.title !== undefined) row.title = patch.title
      if (patch.area !== undefined) row.area = patch.area ?? null
      if (patch.due_date !== undefined) row.due_date = patch.due_date
      if (patch.done !== undefined) row.done = patch.done
      if (Object.keys(row).length === 0) return m
      return ctx.q(
        await ctx.sb.from('milestones').update(row).eq('id', milestoneId).select('*').single(),
        '마일스톤을 찾을 수 없습니다.',
      ) as Milestone
    },

    async deleteMilestone(milestoneId) {
      await ctx.me()
      const m = await milestoneOf(milestoneId)
      await ctx.assertWritable(m.project_id)
      ctx.ok(await ctx.sb.from('milestones').delete().eq('id', milestoneId))
    },

    // ── 미등록 파일 인박스 (S1) ───────────────────────────────────────
    async listInbox(projectId) {
      await ctx.project(projectId)
      return ctx.q(
        await ctx.sb
          .from('unregistered_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('dismissed', false)
          .is('linked_deliverable_id', null)
          .order('detected_at'),
      ) as UnregisteredFile[]
    },

    async linkInboxFile(inboxId, deliverableId) {
      // 404·처리됨 409·영역 권한·업로드 가능 상태·§5 자동 draft 전이·로그 — 전부 RPC가 mock과 같은 순서·메시지로 처리
      // (§7.3: 직접 업로드 파일의 rename은 기본 off — 파일명을 그대로 보존)
      return ctx.rpc<Version>('link_inbox_file', { p_inbox: inboxId, p_deliverable: deliverableId })
    },

    async dismissInboxFile(inboxId) {
      await ctx.me()
      const f = await inboxOf(inboxId)
      await ctx.assertWritable(f.project_id)
      ctx.ok(await ctx.sb.from('unregistered_files').update({ dismissed: true }).eq('id', inboxId))
      await ctx.log(f.project_id, 'inbox.dismissed', 'unregistered_file', f.id)
    },
  }
}
