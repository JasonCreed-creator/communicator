// SupabaseProvider · 프로그램표 — 큐시트 — 정형 문서(시나리오·운영가이드) — 스냅숏 — 컨펌 발송 — 운영계획서(S9) 도메인.
// 동작 정본은 MockProvider(같은 메서드)다: 검증 순서·ProviderError code·한국어 메시지·activity_log action을 그대로 옮겼다.
// 단 하나 다른 점 — mock은 현재 행사 역할을 먼저 보고 항목을 찾지만, 여기서는 항목의 project_id를 알아야 역할을
// 판정할 수 있어 항목 조회(404)가 권한 단언(403)보다 먼저 온다. 그 뒤 순서(카테고리 409 → 종료 행사 409)는 같다.
import type { DataProvider } from '../../DataProvider'
import { SupabaseCtx, newId, normalizeRow, type Me } from '../ctx'
import { ProviderError } from '../../../lib/errors'
import { assertTransition, buildVersionFileName, isPreviewFileName } from '../../../lib/statusMachine'
import { buildCuesFromScenario, scenarioCueCandidates } from '../../../lib/scenario'
import { buildGuideSeedSections } from '../../../lib/guideAssembly'
import { SCENARIO_KIND_LABELS } from '../../../lib/labels'
import { FORMAT_PRESETS, presetCardOf } from '../../../fixtures/formatPresets'
import { escapeHtml, fileUrlFor, rememberText } from '../files'
import type {
  Approval,
  Cue,
  Deliverable,
  GuideSection,
  Milestone,
  ProgramSession,
  RoleCharter,
  ScenarioBlock,
  UUID,
  Version,
} from '../../../types/entities'
import type { MemberRole } from '../../../types/enums'
import type {
  PlanData,
  PlanVersionRef,
  RegistrationStats,
  ScenarioBlockInput,
} from '../../../types/views'

type ProgramMethods =
  | 'listProgramSessions'
  | 'createProgramSession'
  | 'updateProgramSession'
  | 'deleteProgramSession'
  | 'listCues'
  | 'createCue'
  | 'updateCue'
  | 'deleteCue'
  | 'createCueSnapshot'
  | 'createDocSnapshot'
  | 'requestApproval'
  | 'listScenarioBlocks'
  | 'saveScenarioBlocks'
  | 'seedScenarioFromProgram'
  | 'exportScenarioToCues'
  | 'listGuideSections'
  | 'saveGuideSections'
  | 'seedGuideFromSources'
  | 'getPlan'

// ── 인쇄용 스냅숏 렌더 — mock의 render*SnapshotHtml과 같은 출력(PDF 실생성은 Phase 5) ──────────

/** 큐시트 스냅숏 본문 */
function renderCueSnapshotHtml(deliverable: Deliverable, cues: Cue[]): string {
  const rows = cues
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.cue_no ?? '')}</td><td>${escapeHtml(c.time_at ?? '')}</td>` +
        `<td>${escapeHtml(c.segment ?? '')}</td><td>${escapeHtml(c.body ?? '')}</td>` +
        `<td>${escapeHtml(c.console_audio ?? '')}</td><td>${escapeHtml(c.console_light ?? '')}</td>` +
        `<td>${escapeHtml(c.console_screen ?? '')}</td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(deliverable.title)}</title>` +
    `<table border="1" cellspacing="0" cellpadding="6">` +
    `<tr><th>큐</th><th>시간</th><th>구분</th><th>내용·대본</th><th>음향</th><th>조명</th><th>스크린</th></tr>` +
    `${rows}</table>`
  )
}

/** v2.5 §23 — 시나리오 스냅숏 본문(doc-snapshot 정형 3종 공통 규약, R-O2) */
function renderScenarioSnapshotHtml(deliverable: Deliverable, blocks: ScenarioBlock[]): string {
  const rows = blocks
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.time ?? '')}</td><td>${escapeHtml(SCENARIO_KIND_LABELS[b.kind])}</td>` +
        `<td>${escapeHtml(b.script ?? '')}</td><td>${escapeHtml(b.note ?? '')}</td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(deliverable.title)}</title>` +
    `<table border="1" cellspacing="0" cellpadding="6">` +
    `<tr><th>시각</th><th>구분</th><th>대본</th><th>비고</th></tr>${rows}</table>`
  )
}

/** v2.5 §23 — 운영가이드 스냅숏 본문. contacts 섹션 포함 여부는 호출부가 걸러 넘긴다(R-O6) */
function renderGuideSnapshotHtml(deliverable: Deliverable, sections: GuideSection[]): string {
  const body = sections
    .map((s) => `<h2>${escapeHtml(s.title)}</h2><pre>${escapeHtml(s.content ?? '')}</pre>`)
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(deliverable.title)}</title>${body}`
}

/** R&R 카드 표시 순서 — role_charters에는 정렬 열이 없어 템플릿 시드 순(pm→design→ops→reg)으로 맞춘다 */
const ROLE_ORDER: readonly MemberRole[] = ['pm', 'design', 'ops', 'reg']
function sortCharters(rows: RoleCharter[]): RoleCharter[] {
  return [...rows].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.title.localeCompare(b.title),
  )
}

function assertScenarioCategory(d: Deliverable): void {
  if (d.category !== '시나리오') throw new ProviderError('conflict', '시나리오 항목이 아닙니다.')
}

function assertGuideCategory(d: Deliverable): void {
  if (d.category !== '운영가이드') throw new ProviderError('conflict', '운영가이드 항목이 아닙니다.')
}

/** 등록 통계 산식 — mock getRegistrationStats와 동일(S9 ⑥ 등록 통계·진행률 소스) */
function computeRegistrationStats(
  rsvps: readonly { invite_status: string }[],
  attendees: readonly { checked_in_at: string | null }[],
): RegistrationStats {
  const sent = rsvps.filter((r) => r.invite_status !== 'none').length
  const accepted = rsvps.filter((r) => r.invite_status === 'accepted').length
  const declined = rsvps.filter((r) => r.invite_status === 'declined').length
  const checkedIn = attendees.filter((a) => a.checked_in_at).length
  return {
    rsvp_total: rsvps.length,
    rsvp_sent: sent,
    rsvp_accepted: accepted,
    rsvp_declined: declined,
    response_rate: sent === 0 ? 0 : (accepted + declined) / sent,
    attendee_total: attendees.length,
    checked_in: checkedIn,
    checkin_rate: attendees.length === 0 ? 0 : checkedIn / attendees.length,
  }
}

function groupByDeliverable<T extends { deliverable_id: UUID }>(rows: readonly T[]): Map<UUID, T[]> {
  const out = new Map<UUID, T[]>()
  for (const row of rows) {
    const list = out.get(row.deliverable_id)
    if (list) list.push(row)
    else out.set(row.deliverable_id, [row])
  }
  return out
}

export function programDomain(ctx: SupabaseCtx): Pick<DataProvider, ProgramMethods> {
  // ── 조회 도우미 ──────────────────────────────────────────────────
  async function sessionsOf(projectId: UUID): Promise<ProgramSession[]> {
    return ctx.q(
      await ctx.sb.from('program_sessions').select('*').eq('project_id', projectId).order('sort_order'),
    ) as ProgramSession[]
  }

  async function mustSession(sessionId: UUID): Promise<ProgramSession> {
    return ctx.q(
      await ctx.sb.from('program_sessions').select('*').eq('id', sessionId).maybeSingle(),
      '프로그램 세션을 찾을 수 없습니다.',
    ) as ProgramSession
  }

  async function cuesOf(deliverableId: UUID): Promise<Cue[]> {
    return ctx.q(
      await ctx.sb.from('cues').select('*').eq('deliverable_id', deliverableId).order('sort_order'),
    ) as Cue[]
  }

  async function mustCue(cueId: UUID): Promise<Cue> {
    return ctx.q(
      await ctx.sb.from('cues').select('*').eq('id', cueId).maybeSingle(),
      '큐를 찾을 수 없습니다.',
    ) as Cue
  }

  async function blocksOf(deliverableId: UUID): Promise<ScenarioBlock[]> {
    return ctx.q(
      await ctx.sb.from('scenario_blocks').select('*').eq('deliverable_id', deliverableId).order('sort_order'),
    ) as ScenarioBlock[]
  }

  async function sectionsOf(deliverableId: UUID): Promise<GuideSection[]> {
    return ctx.q(
      await ctx.sb.from('guide_sections').select('*').eq('deliverable_id', deliverableId).order('sort_order'),
    ) as GuideSection[]
  }

  /** 빌더 데이터 존재 여부(행 수만) — mock hasScenarioBuilderData·hasGuideBuilderData의 DB판 */
  async function hasRows(table: 'scenario_blocks' | 'guide_sections', deliverableId: UUID): Promise<boolean> {
    const res = await ctx.sb
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('deliverable_id', deliverableId)
    ctx.ok(res)
    return (res.count ?? 0) > 0
  }

  /** 항목 내 최대 sort_order(없으면 0) — 새 행은 max+1 */
  async function maxSortOrder(table: 'program_sessions' | 'cues', column: string, value: UUID): Promise<number> {
    const rows = ctx.q(
      await ctx.sb.from(table).select('sort_order').eq(column, value).order('sort_order', { ascending: false }).limit(1),
    ) as { sort_order: number }[]
    return Math.max(0, rows[0]?.sort_order ?? 0)
  }

  // ── 스냅숏 공용 ─────────────────────────────────────────────────
  /**
   * 정형 문서 스냅숏 → 버전 등록. 파일명은 .pdf 규약(§5 발송 조건)이고 내용물은 인쇄용 HTML(세션 메모리),
   * 실제 PDF·Drive는 Phase 5. version_no는 DB 트리거(assign_version_no)가 채우므로 보내지 않는다 —
   * 파일명에 쓸 번호만 현재 최대값+1로 미리 계산한다.
   */
  async function insertSnapshotVersion(d: Deliverable, me: Me, note: string, html: string): Promise<Version> {
    const project = await ctx.project(d.project_id)
    const latest = ctx.q(
      await ctx.sb
        .from('versions')
        .select('version_no')
        .eq('deliverable_id', d.id)
        .order('version_no', { ascending: false })
        .limit(1),
    ) as { version_no: number }[]
    const versionNo = (latest[0]?.version_no ?? 0) + 1
    const version = ctx.q(
      await ctx.sb
        .from('versions')
        .insert({
          deliverable_id: d.id,
          drive_file_id: `pending:${newId()}`,
          file_name: buildVersionFileName({
            date: new Date(),
            project_code: project.code,
            category: d.category,
            title: d.title,
            version_no: versionNo,
            original_file_name: '스냅숏.pdf',
          }),
          note,
          uploaded_by: me.id,
        })
        .select('*')
        .single(),
    ) as Version
    rememberText(version.id, html)
    return version
  }

  /** §8 doc-snapshot 본체 — 호출부가 항목 조회·pm 단언을 마친 뒤 넘긴다(requestApproval·createCueSnapshot 재사용) */
  async function docSnapshotFor(d: Deliverable, me: Me, opts?: { include_contacts?: boolean }): Promise<Version> {
    if (d.category === '큐시트') {
      const cues = await cuesOf(d.id)
      if (cues.length === 0) {
        throw new ProviderError('validation', '스냅숏을 만들 큐가 없습니다.')
      }
      const version = await insertSnapshotVersion(
        d,
        me,
        '큐시트 스냅숏 — 컨펌 발송용 자동 생성',
        renderCueSnapshotHtml(d, cues),
      )
      await ctx.log(d.project_id, 'cue.snapshot', 'version', version.id, { deliverable_id: d.id })
      return version
    }

    if (d.category === '시나리오') {
      const blocks = await blocksOf(d.id)
      if (blocks.length === 0) {
        throw new ProviderError('validation', '스냅숏을 만들 진행 블록이 없습니다.')
      }
      const version = await insertSnapshotVersion(
        d,
        me,
        '시나리오 스냅숏 — 컨펌 발송용 자동 생성',
        renderScenarioSnapshotHtml(d, blocks),
      )
      await ctx.log(d.project_id, 'doc.snapshot', 'version', version.id, {
        deliverable_id: d.id,
        category: d.category,
      })
      return version
    }

    if (d.category === '운영가이드') {
      const sections = await sectionsOf(d.id)
      if (sections.length === 0) {
        throw new ProviderError('validation', '스냅숏을 만들 섹션이 없습니다.')
      }
      // R-O6 — 개인 연락처(contacts 섹션)는 명시 옵션일 때만 인쇄에 포함, 기본은 제외
      const includeContacts = opts?.include_contacts === true
      const visible = includeContacts ? sections : sections.filter((s) => s.kind !== 'contacts')
      const version = await insertSnapshotVersion(
        d,
        me,
        '운영가이드 스냅숏 — 컨펌 발송용 자동 생성',
        renderGuideSnapshotHtml(d, visible),
      )
      await ctx.log(d.project_id, 'doc.snapshot', 'version', version.id, {
        deliverable_id: d.id,
        category: d.category,
        include_contacts: includeContacts,
      })
      return version
    }

    throw new ProviderError('conflict', '정형 문서(큐시트·시나리오·운영가이드) 항목이 아닙니다.')
  }

  /** 최신 버전 참조 — 미리보기 포맷일 때만 preview_url 세팅 */
  function planVersionRef(latest: Version | undefined): PlanVersionRef | null {
    if (!latest) return null
    return {
      id: latest.id,
      version_no: latest.version_no,
      file_name: latest.file_name,
      preview_url: isPreviewFileName(latest.file_name) ? fileUrlFor(latest.id, latest.file_name) : null,
    }
  }

  const api: Pick<DataProvider, ProgramMethods> = {
    // ── v1.2 프로그램표 (§8 /program-sessions, pm·ops) ────────────────
    async listProgramSessions(projectId) {
      await ctx.project(projectId)
      return sessionsOf(projectId)
    },

    async createProgramSession(projectId, input) {
      await ctx.assertPmOps(projectId)
      await ctx.assertWritable(projectId)
      if (!input.title.trim()) throw new ProviderError('validation', '세션 제목은 필수입니다.')
      const maxOrder = await maxSortOrder('program_sessions', 'project_id', projectId)
      return ctx.q(
        await ctx.sb
          .from('program_sessions')
          .insert({
            project_id: projectId,
            section: input.section?.trim() || null,
            start_time: input.start_time || null,
            end_time: input.end_time || null,
            title: input.title,
            speaker_name: input.speaker_name?.trim() || null,
            speaker_title: input.speaker_title?.trim() || null,
            speaker_org: input.speaker_org?.trim() || null,
            note: input.note?.trim() || null,
            // v2.6 §25.4 — 트랙은 판매 플래너 ③에서 편성한다. 빈 문자열은 '미편성'과 같으므로 null로 눕힌다
            track: input.track?.trim() || null,
            sort_order: input.sort_order ?? maxOrder + 1,
          })
          .select('*')
          .single(),
      ) as ProgramSession
    },

    async updateProgramSession(sessionId, patch) {
      const s = await mustSession(sessionId)
      await ctx.assertPmOps(s.project_id)
      await ctx.assertWritable(s.project_id)
      const row: Record<string, unknown> = {}
      if (patch.title !== undefined) {
        if (!patch.title.trim()) throw new ProviderError('validation', '세션 제목은 필수입니다.')
        row.title = patch.title
      }
      if (patch.section !== undefined) row.section = patch.section.trim() || null
      if (patch.start_time !== undefined) row.start_time = patch.start_time || null
      if (patch.end_time !== undefined) row.end_time = patch.end_time || null
      if (patch.speaker_name !== undefined) row.speaker_name = patch.speaker_name.trim() || null
      if (patch.speaker_title !== undefined) row.speaker_title = patch.speaker_title.trim() || null
      if (patch.speaker_org !== undefined) row.speaker_org = patch.speaker_org.trim() || null
      if (patch.note !== undefined) row.note = patch.note.trim() || null
      if (patch.track !== undefined) row.track = patch.track?.trim() || null
      if (patch.sort_order !== undefined) row.sort_order = patch.sort_order
      if (Object.keys(row).length === 0) return s
      return ctx.q(
        await ctx.sb.from('program_sessions').update(row).eq('id', sessionId).select('*').single(),
      ) as ProgramSession
    },

    async deleteProgramSession(sessionId) {
      const s = await mustSession(sessionId)
      await ctx.assertPmOps(s.project_id)
      await ctx.assertWritable(s.project_id)
      ctx.ok(await ctx.sb.from('program_sessions').delete().eq('id', sessionId))
    },

    // ── v1.3 큐시트 (pm·ops — §8 /cues) ───────────────────────────────
    async listCues(deliverableId) {
      await ctx.deliverable(deliverableId)
      return cuesOf(deliverableId)
    },

    async createCue(deliverableId, input) {
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertPmOps(d.project_id)
      await ctx.assertWritable(d.project_id)
      const maxOrder = await maxSortOrder('cues', 'deliverable_id', deliverableId)
      return ctx.q(
        await ctx.sb
          .from('cues')
          .insert({
            deliverable_id: deliverableId,
            cue_no: input.cue_no?.trim() || null,
            time_at: input.time_at || null,
            segment: input.segment?.trim() || null,
            body: input.body ?? null,
            console_audio: input.console_audio?.trim() || null,
            console_light: input.console_light?.trim() || null,
            console_screen: input.console_screen?.trim() || null,
            sort_order: input.sort_order ?? maxOrder + 1,
          })
          .select('*')
          .single(),
      ) as Cue
    },

    async updateCue(cueId, patch) {
      const cue = await mustCue(cueId)
      const d = await ctx.deliverable(cue.deliverable_id)
      await ctx.assertPmOps(d.project_id)
      await ctx.assertWritable(d.project_id)
      const row: Record<string, unknown> = {}
      if (patch.cue_no !== undefined) row.cue_no = patch.cue_no.trim() || null
      if (patch.time_at !== undefined) row.time_at = patch.time_at || null
      if (patch.segment !== undefined) row.segment = patch.segment.trim() || null
      if (patch.body !== undefined) row.body = patch.body || null
      if (patch.console_audio !== undefined) row.console_audio = patch.console_audio.trim() || null
      if (patch.console_light !== undefined) row.console_light = patch.console_light.trim() || null
      if (patch.console_screen !== undefined) row.console_screen = patch.console_screen.trim() || null
      if (patch.sort_order !== undefined) row.sort_order = patch.sort_order
      if (Object.keys(row).length === 0) return cue
      return ctx.q(await ctx.sb.from('cues').update(row).eq('id', cueId).select('*').single()) as Cue
    },

    async deleteCue(cueId) {
      const cue = await mustCue(cueId)
      const d = await ctx.deliverable(cue.deliverable_id)
      await ctx.assertPmOps(d.project_id)
      await ctx.assertWritable(d.project_id)
      ctx.ok(await ctx.sb.from('cues').delete().eq('id', cueId))
    },

    /**
     * §8 cue-snapshot — 큐시트 검증 후 doc-snapshot에 위임(R-O2 — 새 스냅숏 규약을 만들지 않는다).
     * 오류 우선순위(pm→카테고리)는 mock과 같다.
     */
    async createCueSnapshot(deliverableId) {
      const d = await ctx.deliverable(deliverableId)
      const me = await ctx.assertPm(d.project_id)
      if (d.category !== '큐시트') {
        throw new ProviderError('conflict', '큐시트 항목이 아닙니다.')
      }
      return docSnapshotFor(d, me)
    },

    /** §8 doc-snapshot(pm) — 정형 문서(큐시트·시나리오·운영가이드) 공통 인쇄 스냅숏 → 버전 등록 */
    async createDocSnapshot(deliverableId, opts) {
      const d = await ctx.deliverable(deliverableId)
      const me = await ctx.assertPm(d.project_id)
      return docSnapshotFor(d, me, opts)
    },

    // ── 컨펌 발송 (pm 전용, §5) ──────────────────────────────────────
    async requestApproval(deliverableId, input) {
      const d = await ctx.deliverable(deliverableId)
      const role = await ctx.roleIn(d.project_id)
      if (role !== 'pm') {
        throw new ProviderError('forbidden', '컨펌 발송은 PM만 할 수 있습니다.')
      }
      const me = await ctx.me()
      await ctx.assertWritable(d.project_id)
      if (!d.requires_approval) {
        throw new ProviderError('conflict', '컨펌 루프를 사용하지 않는 항목입니다.')
      }
      assertTransition(d.status, 'pending_approval', 'approval_request')
      // v1.3→v2.5: 정형 문서(큐시트·시나리오·운영가이드) 항목은 발송 시 스냅숏 버전이 자동 등록되어
      // 발송 조건을 충족한다(§5, §23.2 R-O2). 시나리오·운영가이드는 실제 빌더 데이터가 있을 때만
      // (레거시 자유 카테고리 충돌 방지, DoD-1 dlv-005 참조) 자동 스냅숏 경로를 탄다.
      const isAutoSnapshotDoc =
        d.category === '큐시트' ||
        (d.category === '시나리오' && (await hasRows('scenario_blocks', d.id))) ||
        (d.category === '운영가이드' && (await hasRows('guide_sections', d.id)))
      const version = isAutoSnapshotDoc
        ? await docSnapshotFor(d, me)
        : (ctx.q(
            await ctx.sb
              .from('versions')
              .select('*')
              .eq('id', input.version_id)
              .eq('deliverable_id', deliverableId)
              .maybeSingle(),
            '해당 항목의 버전이 아닙니다.',
          ) as Version)
      // §5 발송 조건: 미리보기 포맷(PDF·PNG·JPG) 버전만
      if (!isPreviewFileName(version.file_name)) {
        throw new ProviderError(
          'validation',
          '컨펌 발송은 미리보기 포맷(PDF·PNG·JPG) 버전만 가능합니다.',
        )
      }
      // approvals 행 생성 + internal_review→pending_approval 전이 + 'approval.requested' 로그를 한 트랜잭션으로
      return ctx.rpc<Approval>('request_approval', {
        p_deliverable: deliverableId,
        p_version: version.id,
        p_due_at: input.due_at ?? null,
      })
    },

    // ── v2.5 §23 시나리오 (pm·ops 쓰기 / 멤버 읽기 — category='시나리오' 항목만) ──
    async listScenarioBlocks(deliverableId) {
      const d = await ctx.deliverable(deliverableId)
      assertScenarioCategory(d)
      return blocksOf(deliverableId)
    },

    async saveScenarioBlocks(deliverableId, blocks) {
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertPmOps(d.project_id)
      assertScenarioCategory(d)
      await ctx.assertWritable(d.project_id)
      // 벌크 전체 교체(정렬 = 배열 순서, id는 매번 새로 발급) + 'scenario.saved' 로그 — RPC가 한 트랜잭션으로
      return ctx.rpc<ScenarioBlock[]>('save_scenario_blocks', {
        p_deliverable: deliverableId,
        p_blocks: blocks.map((b) => ({
          session_id: b.session_id ?? null,
          time: b.time ?? null,
          kind: b.kind,
          script: b.script ?? null,
          note: b.note ?? null,
        })),
      })
    },

    /** §8.2 scenario-seed — 프로그램표 세션당 그룹 헤더 + 기본 진행 블록. 빈 문서에서만(R-O3) */
    async seedScenarioFromProgram(deliverableId) {
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertPmOps(d.project_id)
      assertScenarioCategory(d)
      await ctx.assertWritable(d.project_id)
      if (await hasRows('scenario_blocks', deliverableId)) {
        throw new ProviderError(
          'conflict',
          '이미 진행 블록이 있는 문서입니다 — 빈 문서에서만 시드할 수 있습니다.',
        )
      }
      const sessions = await sessionsOf(d.project_id)
      const seed: ScenarioBlockInput[] = []
      for (const s of sessions) {
        seed.push({ session_id: s.id, time: s.start_time, kind: 'custom', script: null, note: `세션: ${s.title}` })
        seed.push({ session_id: s.id, time: s.start_time, kind: 'mc', script: '', note: null })
      }
      // 빈 문서이므로 전체 교체 = 삽입. RPC가 'scenario.saved'를 함께 남기고, 시드 의미는 아래 로그가 표시한다
      const built = await ctx.rpc<ScenarioBlock[]>('save_scenario_blocks', {
        p_deliverable: deliverableId,
        p_blocks: seed,
      })
      await ctx.log(d.project_id, 'scenario.seed', 'deliverable', deliverableId, {
        session_count: sessions.length,
      })
      return built
    },

    /**
     * §8.2 scenario-export-cues — 큐 후보(kind video·transition + 큐 표기 토큰)만 변환해 대상 큐시트에
     * 추가한다. 기존 큐 보존·후미 삽입(R-O5), 대본 전문은 복사하지 않는다(§23.3).
     */
    async exportScenarioToCues(deliverableId, targetDeliverableId) {
      const scenario = await ctx.deliverable(deliverableId)
      await ctx.assertPmOps(scenario.project_id)
      assertScenarioCategory(scenario)
      const target = await ctx.deliverable(targetDeliverableId)
      if (target.category !== '큐시트') {
        throw new ProviderError('conflict', '대상이 큐시트 항목이 아닙니다.')
      }
      await ctx.assertWritable(scenario.project_id)
      const blocks = await blocksOf(deliverableId)
      const candidates = scenarioCueCandidates(blocks)
      if (candidates.length === 0) return []
      const existingCues = await cuesOf(targetDeliverableId)
      const maxOrder = existingCues.reduce((m, c) => Math.max(m, c.sort_order), 0)
      const newCues = buildCuesFromScenario({
        candidates,
        targetDeliverableId,
        existingCueNos: existingCues.map((c) => c.cue_no),
        startSortOrder: maxOrder,
        scenarioTitle: scenario.title,
        makeId: newId,
      })
      const inserted = (ctx.q(await ctx.sb.from('cues').insert(newCues).select('*')) as Cue[]).sort(
        (a, b) => a.sort_order - b.sort_order,
      )
      await ctx.log(scenario.project_id, 'scenario.export_cues', 'deliverable', deliverableId, {
        target_deliverable_id: targetDeliverableId,
        count: inserted.length,
      })
      return inserted
    },

    // ── v2.5 §23 운영가이드 (pm·ops 쓰기 / 멤버 읽기 — category='운영가이드' 항목만) ──
    async listGuideSections(deliverableId) {
      const d = await ctx.deliverable(deliverableId)
      assertGuideCategory(d)
      return sectionsOf(deliverableId)
    },

    async saveGuideSections(deliverableId, sections) {
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertPmOps(d.project_id)
      assertGuideCategory(d)
      await ctx.assertWritable(d.project_id)
      // id를 넘긴 섹션은 identity 유지(연동 stale 판정용), 없으면 RPC가 새로 발급. 사람이 직접 저장하면
      // 반영 완료 — source_stale는 입력에 명시하지 않으면 false
      return ctx.rpc<GuideSection[]>('save_guide_sections', {
        p_deliverable: deliverableId,
        p_sections: sections.map((s) => ({
          id: s.id ?? null,
          kind: s.kind,
          title: s.title,
          content: s.content ?? null,
          source_ref: s.source_ref ?? null,
          source_stale: s.source_stale ?? false,
        })),
      })
    },

    /** §8.2 guide-seed — 존별 운영·R&R에서 4섹션 초기 로드(+포맷 운영 프리셋 '진행 원칙'). 빈 문서에서만(R-O3) */
    async seedGuideFromSources(deliverableId) {
      const d = await ctx.deliverable(deliverableId)
      await ctx.assertPmOps(d.project_id)
      assertGuideCategory(d)
      await ctx.assertWritable(d.project_id)
      if (await hasRows('guide_sections', deliverableId)) {
        throw new ProviderError(
          'conflict',
          '이미 섹션이 있는 문서입니다 — 빈 문서에서만 시드할 수 있습니다.',
        )
      }
      const opsItems = ctx.q(
        await ctx.sb
          .from('deliverables')
          .select('*')
          .eq('project_id', d.project_id)
          .eq('area', 'ops')
          .order('created_at')
          .order('id'),
      ) as Deliverable[]
      const charters = sortCharters(
        ctx.q(await ctx.sb.from('role_charters').select('*').eq('project_id', d.project_id)) as RoleCharter[],
      )
      // v2.6 §25.4 — 포맷 운영 프리셋(DMS: Q&A 미운영·발표 40분 등)을 '진행 원칙' 섹션으로 함께 시드한다.
      // 프리셋이 빈 포맷(컨퍼런스)은 기존 4섹션 그대로다.
      const project = await ctx.project(d.project_id)
      const preset = FORMAT_PRESETS[presetCardOf(project.format, project.event_type)]
      const seeds = buildGuideSeedSections(opsItems, charters, preset.opsNotes)
      const built = await ctx.rpc<GuideSection[]>('save_guide_sections', {
        p_deliverable: deliverableId,
        p_sections: seeds.map((s) => ({
          kind: s.kind,
          title: s.title,
          content: s.content,
          source_ref: s.source_ref,
          source_stale: false,
        })),
      })
      await ctx.log(d.project_id, 'guide.seed', 'deliverable', deliverableId, {})
      return built
    },

    /**
     * S9 운영계획서 조립 (§8 GET /projects/{id}/plan). 섹션별 진행률 산정 기준은 MockProvider.getPlan 주석이
     * 정본이다 — 같은 산식을 SQL 조회 결과에 적용한다:
     *   overview 개요 슬롯 5개 중 채워진 수 / program start_time 있는 세션 수 / cuesheet 구분·본문 채워진 큐 수 /
     *   zones content 있는 ops 항목 수(빌더 데이터를 가진 시나리오·운영가이드 제외) / production 스펙 4필드 완비
     *   design 항목 수 / registration 등록 데이터 존재(0/1) / emergency 비상 대응 내용 존재(0/1) / schedule 완료 마일스톤 수
     */
    async getPlan(projectId) {
      await ctx.me()
      const project = await ctx.project(projectId)
      const sessions = await sessionsOf(projectId)
      const deliverables = ctx.q(
        await ctx.sb.from('deliverables').select('*').eq('project_id', projectId).order('created_at').order('id'),
      ) as Deliverable[]
      const deliverableIds = deliverables.map((d) => d.id)

      // 항목별 최신 버전(version_no 최대) — 한 번에 읽어 매핑
      const latestByDeliverable = new Map<UUID, Version>()
      if (deliverableIds.length > 0) {
        const versions = ctx.q(
          await ctx.sb
            .from('versions')
            .select('*')
            .in('deliverable_id', deliverableIds)
            .order('version_no', { ascending: false }),
        ) as Version[]
        for (const v of versions) {
          if (!latestByDeliverable.has(v.deliverable_id)) latestByDeliverable.set(v.deliverable_id, v)
        }
      }

      // v2.5 §23 — "실제로 빌더 데이터를 가진" 시나리오·운영가이드만 정형 취급(레거시 자유 카테고리 충돌 방지, dlv-005)
      const scenarioIds = deliverables.filter((d) => d.category === '시나리오').map((d) => d.id)
      const guideIds = deliverables.filter((d) => d.category === '운영가이드').map((d) => d.id)
      const blocksByDeliverable = groupByDeliverable(
        scenarioIds.length > 0
          ? (ctx.q(
              await ctx.sb.from('scenario_blocks').select('*').in('deliverable_id', scenarioIds).order('sort_order'),
            ) as ScenarioBlock[])
          : [],
      )
      const sectionsByDeliverable = groupByDeliverable(
        guideIds.length > 0
          ? (ctx.q(
              await ctx.sb.from('guide_sections').select('*').in('deliverable_id', guideIds).order('sort_order'),
            ) as GuideSection[])
          : [],
      )
      const hasScenarioBuilderData = (d: Deliverable) =>
        d.category === '시나리오' && (blocksByDeliverable.get(d.id)?.length ?? 0) > 0
      const hasGuideBuilderData = (d: Deliverable) =>
        d.category === '운영가이드' && (sectionsByDeliverable.get(d.id)?.length ?? 0) > 0

      // v1.3 ⑦큐시트 — 첫 큐시트 항목의 큐 표 (프로그램 다음 배치)
      const cueDeliverable = deliverables.find((d) => d.category === '큐시트')
      const cues = cueDeliverable ? await cuesOf(cueDeliverable.id) : []
      const cuesheet = cueDeliverable
        ? {
            deliverable_id: cueDeliverable.id,
            title: cueDeliverable.title,
            status: cueDeliverable.status,
            cues,
          }
        : null

      const opsItems = deliverables.filter(
        (d) => d.area === 'ops' && !hasScenarioBuilderData(d) && !hasGuideBuilderData(d),
      )
      const designItems = deliverables.filter((d) => d.area === 'design')

      const zones = opsItems.map((d) => ({
        deliverable_id: d.id,
        category: d.category,
        title: d.title,
        status: d.status,
        content: d.content,
        latest_version: planVersionRef(latestByDeliverable.get(d.id)),
      }))
      const production = designItems.map((d) => ({
        deliverable_id: d.id,
        category: d.category,
        title: d.title,
        status: d.status,
        spec_size: d.spec_size,
        spec_qty: d.spec_qty,
        spec_location: d.spec_location,
        spec_type: d.spec_type,
        latest_version: planVersionRef(latestByDeliverable.get(d.id)),
      }))

      const rsvps = ctx.q(
        await ctx.sb.from('rsvp_contacts').select('invite_status').eq('project_id', projectId),
      ) as { invite_status: string }[]
      const attendees = ctx.q(
        await ctx.sb.from('attendees').select('checked_in_at').eq('project_id', projectId),
      ) as { checked_in_at: string | null }[]
      const stats = computeRegistrationStats(rsvps, attendees)
      const milestones = ctx.q(
        await ctx.sb.from('milestones').select('*').eq('project_id', projectId).order('due_date'),
      ) as Milestone[]

      // v2.5 §23 — ② 세션별 시나리오 펼침 소스(빌더 데이터를 가진 첫 시나리오 항목)
      const scenarioDeliverable = deliverables.find(hasScenarioBuilderData)
      const scenario = scenarioDeliverable
        ? {
            deliverable_id: scenarioDeliverable.id,
            title: scenarioDeliverable.title,
            status: scenarioDeliverable.status,
            blocks: blocksByDeliverable.get(scenarioDeliverable.id) ?? [],
          }
        : null

      // v2.5 §23 — ③존운영 확장·⑦비상 대응 소스(빌더 데이터를 가진 첫 운영가이드 항목). R-O6: contacts는 담지 않는다.
      const guideDeliverable = deliverables.find(hasGuideBuilderData)
      const guideSections = guideDeliverable ? sectionsByDeliverable.get(guideDeliverable.id) ?? [] : []
      const zoneSection = guideSections.find((s) => s.kind === 'zone') ?? null
      const guide_zone = zoneSection
        ? { content: zoneSection.content, source_stale: zoneSection.source_stale }
        : null
      const emergencySection = guideSections.find((s) => s.kind === 'emergency') ?? null
      const emergency =
        guideDeliverable && emergencySection
          ? {
              deliverable_id: guideDeliverable.id,
              title: emergencySection.title,
              content: emergencySection.content,
              status: guideDeliverable.status,
            }
          : null

      // 3.17.1 T4 — 등록 수치가 시트에서 온 것이면 그 기준 시각을 지면에 밝힌다(§4-22 준용)
      const sheetRes = await ctx.sb
        .from('sheet_connections')
        .select('snapshot_at')
        .eq('project_id', projectId)
        .maybeSingle()
      ctx.ok(sheetRes)
      const sheet_snapshot_at = sheetRes.data
        ? (normalizeRow(sheetRes.data as { snapshot_at: string | null }).snapshot_at ?? null)
        : null

      const overviewSlots = [
        project.event_date,
        project.theme,
        project.venue,
        project.mc_name,
        project.overview_items?.length ? 'y' : null,
      ]
      const specComplete = (d: Deliverable) =>
        !!(d.spec_size && d.spec_qty != null && d.spec_location && d.spec_type)

      const plan: PlanData = {
        project,
        sheet_snapshot_at,
        program_sessions: sessions,
        cuesheet,
        zones,
        production_items: production,
        registration_stats: stats,
        milestones,
        scenario,
        guide_zone,
        emergency,
        section_progress: [
          { key: 'overview', done: overviewSlots.filter(Boolean).length, total: overviewSlots.length },
          { key: 'program', done: sessions.filter((s) => s.start_time).length, total: sessions.length },
          { key: 'cuesheet', done: cues.filter((c) => c.segment && c.body).length, total: cues.length },
          { key: 'zones', done: opsItems.filter((d) => d.content?.trim()).length, total: opsItems.length },
          { key: 'production', done: designItems.filter(specComplete).length, total: designItems.length },
          { key: 'registration', done: stats.rsvp_total + stats.attendee_total > 0 ? 1 : 0, total: 1 },
          { key: 'emergency', done: emergency?.content?.trim() ? 1 : 0, total: 1 },
          { key: 'schedule', done: milestones.filter((m) => m.done).length, total: milestones.length },
        ],
      }
      return plan
    },
  }

  return api
}
