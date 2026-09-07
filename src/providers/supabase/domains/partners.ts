// SupabaseProvider · 주최형(파트너) 도메인 (S-11 · /p 포털 · 설계서 §21 · §5.1 · §6.2 R-H1~R-H6).
// MockProvider(2438~2886행)의 검증 순서·오류 code·한국어 메시지·activity_log action을 그대로 옮긴다.
// 등급·파트너·토큰 CRUD는 pm, 열람은 멤버 전원. 토큰 경로(/p)는 RPC(partner_portal·partner_submit)가
// 자기 partner_id 행만 골라 PartnerPortalData 형태로 돌려주므로 contract_amount·tier.price 같은
// 금액 키는 구조적으로 이 모듈의 포털 출력에 들어올 수 없다(R-H2·R-H3).
import type { DataProvider } from '../../DataProvider'
import { SupabaseCtx, nowIso } from '../ctx'
import { ProviderError } from '../../../lib/errors'
import { toIsoDate } from '../../../lib/wbs'
import type { Deliverable, Partner, PartnerTier, PartnerToken, UUID } from '../../../types/entities'
import type { DeliverableStatus } from '../../../types/enums'
import type {
  PartnerInput,
  PartnerNextDeadline,
  PartnerPortalData,
  PartnerReviewInput,
  PartnerSubmissionCounts,
  PartnerSubmissionInput,
  PartnerTierInput,
  PartnerTokenIssueInput,
  PartnerWithProgress,
} from '../../../types/views'

type PartnersDomain = Pick<
  DataProvider,
  | 'listPartnerTiers'
  | 'upsertPartnerTier'
  | 'deletePartnerTier'
  | 'listPartners'
  | 'createPartner'
  | 'updatePartner'
  | 'removePartner'
  | 'issuePartnerToken'
  | 'revokePartnerToken'
  | 'getPartnerPortal'
  | 'submitPartnerItem'
  | 'reviewPartnerSubmission'
>

/** 토큰 문자열이 uuid 형식이 아니면 RPC 호출 전에 404 — 픽스처 문자열 토큰('demo-partner' 등)은 존재하지 않는다 */
const UUID_RE = /^[0-9a-f-]{36}$/i

/** listPartners 집계에 필요한 wbs_tasks 열만 */
interface PartnerTaskRow {
  id: UUID
  code: string
  title: string
  end_date: string | null
  status: string
  partner_id: UUID | null
  linked_deliverable_id: UUID | null
}

async function mustFindPartner(ctx: SupabaseCtx, partnerId: UUID): Promise<Partner> {
  return ctx.q(
    await ctx.sb.from('partners').select('*').eq('id', partnerId).maybeSingle(),
    '파트너를 찾을 수 없습니다.',
  ) as Partner
}

async function mustFindTier(ctx: SupabaseCtx, tierId: UUID): Promise<PartnerTier> {
  return ctx.q(
    await ctx.sb.from('partner_tiers').select('*').eq('id', tierId).maybeSingle(),
    '등급을 찾을 수 없습니다.',
  ) as PartnerTier
}

/** 등급이 그 행사의 것인지 — createPartner·updatePartner의 tier_id 검증(mock과 같은 메시지) */
async function assertTierOfProject(ctx: SupabaseCtx, tierId: UUID, projectId: UUID): Promise<void> {
  const res = await ctx.sb
    .from('partner_tiers')
    .select('id')
    .eq('id', tierId)
    .eq('project_id', projectId)
    .maybeSingle()
  ctx.ok(res)
  if (!res.data) throw new ProviderError('validation', '이 행사의 등급이 아닙니다.')
}

/** 오늘 이후 미완료 partner_submit 태스크 중 가장 가까운 마감 — S-11 카드용 */
function partnerNextDeadline(tasks: PartnerTaskRow[], partnerId: UUID, today: string): PartnerNextDeadline | null {
  const next = tasks
    .filter((t) => t.partner_id === partnerId && t.status !== 'done' && t.end_date && t.end_date >= today)
    .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))[0]
  return next ? { code: next.code, title: next.title, end_date: next.end_date } : null
}

export function partnersDomain(ctx: SupabaseCtx): PartnersDomain {
  return {
    async listPartnerTiers(projectId: UUID): Promise<PartnerTier[]> {
      await ctx.me()
      await ctx.project(projectId)
      return ctx.q(
        await ctx.sb.from('partner_tiers').select('*').eq('project_id', projectId).order('sort'),
      ) as PartnerTier[]
    },

    async upsertPartnerTier(projectId: UUID, input: PartnerTierInput): Promise<PartnerTier> {
      await ctx.assertPm(projectId)
      await ctx.assertWritable(projectId)
      const code = input.code?.trim()
      if (!code) throw new ProviderError('validation', '등급 코드는 필수입니다.')
      if (!input.name?.trim()) throw new ProviderError('validation', '등급명은 필수입니다.')
      const found = await ctx.sb
        .from('partner_tiers')
        .select('*')
        .eq('project_id', projectId)
        .eq('code', code)
        .maybeSingle()
      ctx.ok(found)
      const existing = found.data ? (ctx.q(found) as PartnerTier) : null
      if (existing) {
        const update: Partial<PartnerTier> = {
          name: input.name.trim(),
          description: input.description ?? null,
          capacity: input.capacity ?? null,
        }
        if (input.sort !== undefined) update.sort = input.sort
        // v2.6 §25.4 — 판매 상품 4필드는 부분 수정을 허용한다(판매 플래너 ①이 단가만 고치는 흐름).
        // 등급명·설명·정원과 달리 undefined면 기존 값을 지우지 않는다.
        if (input.session_slots !== undefined) update.session_slots = input.session_slots
        if (input.booth_included !== undefined) update.booth_included = input.booth_included
        if (input.staff_cap !== undefined) update.staff_cap = input.staff_cap
        if (input.price !== undefined) {
          if (input.price !== null && (!Number.isFinite(input.price) || input.price < 0)) {
            throw new ProviderError('validation', '판매 단가는 0 이상이어야 합니다.')
          }
          update.price = input.price
        }
        return ctx.q(
          await ctx.sb.from('partner_tiers').update(update).eq('id', existing.id).select('*').single(),
        ) as PartnerTier
      }
      let sort = input.sort
      if (sort === undefined) {
        const rows = ctx.q(
          await ctx.sb.from('partner_tiers').select('id').eq('project_id', projectId),
        ) as { id: UUID }[]
        sort = rows.length + 1
      }
      const row: Omit<PartnerTier, 'id'> = {
        project_id: projectId,
        code,
        name: input.name.trim(),
        description: input.description ?? null,
        capacity: input.capacity ?? null,
        sort,
        // v2.6 §25.4 — 신규 등급은 '판매 상품 미정의' 상태로 시작한다(0·false·null)
        session_slots: input.session_slots ?? 0,
        booth_included: input.booth_included ?? false,
        staff_cap: input.staff_cap ?? null,
        price: input.price ?? null,
      }
      return ctx.q(await ctx.sb.from('partner_tiers').insert(row).select('*').single()) as PartnerTier
    },

    async deletePartnerTier(tierId: UUID): Promise<void> {
      // mock은 assertPm()을 먼저 부르지만 행사 스코프 없는 pm 판정이 없으므로 등급을 먼저 찾아 그 행사로 판정한다
      const tier = await mustFindTier(ctx, tierId)
      await ctx.assertPm(tier.project_id)
      await ctx.assertWritable(tier.project_id)
      const used = ctx.q(
        await ctx.sb.from('partners').select('id').eq('tier_id', tierId).limit(1),
      ) as { id: UUID }[]
      if (used.length > 0) {
        throw new ProviderError('conflict', '이 등급을 쓰는 파트너가 있어 삭제할 수 없습니다.')
      }
      ctx.ok(await ctx.sb.from('partner_tiers').delete().eq('id', tierId))
    },

    async listPartners(projectId: UUID): Promise<PartnerWithProgress[]> {
      await ctx.me()
      await ctx.project(projectId)
      const today = toIsoDate(new Date())
      const partners = ctx.q(
        await ctx.sb.from('partners').select('*').eq('project_id', projectId).order('created_at'),
      ) as Partner[]
      const tiers = ctx.q(
        await ctx.sb.from('partner_tiers').select('*').eq('project_id', projectId),
      ) as PartnerTier[]
      const tasks = ctx.q(
        await ctx.sb
          .from('wbs_tasks')
          .select('id, code, title, end_date, status, partner_id, linked_deliverable_id')
          .eq('project_id', projectId)
          .eq('direction', 'partner_submit'),
      ) as PartnerTaskRow[]
      const partnerIds = partners.map((p) => p.id)
      const tokens: PartnerToken[] =
        partnerIds.length === 0
          ? []
          : (ctx.q(
              await ctx.sb
                .from('partner_tokens')
                .select('*')
                .in('partner_id', partnerIds)
                .is('revoked_at', null),
            ) as PartnerToken[])
      const linkedIds = tasks.map((t) => t.linked_deliverable_id).filter((id): id is UUID => !!id)
      const deliverables: { id: UUID; status: DeliverableStatus }[] =
        linkedIds.length === 0
          ? []
          : (ctx.q(
              await ctx.sb.from('deliverables').select('id, status').in('id', linkedIds),
            ) as { id: UUID; status: DeliverableStatus }[])
      const statusById = new Map(deliverables.map((d) => [d.id, d.status]))

      return partners.map((partner) => {
        const tier = partner.tier_id ? tiers.find((t) => t.id === partner.tier_id) ?? null : null
        const token =
          tokens
            .filter((t) => t.partner_id === partner.id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
        const counts: PartnerSubmissionCounts = {
          requested: 0,
          pending_approval: 0,
          changes_requested: 0,
          approved_or_final: 0,
        }
        for (const task of tasks) {
          if (task.partner_id !== partner.id || !task.linked_deliverable_id) continue
          const status = statusById.get(task.linked_deliverable_id)
          if (status === 'requested') counts.requested++
          else if (status === 'pending_approval') counts.pending_approval++
          else if (status === 'changes_requested') counts.changes_requested++
          else if (status === 'approved' || status === 'final') counts.approved_or_final++
        }
        return {
          ...partner,
          tier,
          token,
          submission_counts: counts,
          next_deadline: partnerNextDeadline(tasks, partner.id, today),
        }
      })
    },

    async createPartner(projectId: UUID, input: PartnerInput): Promise<Partner> {
      await ctx.assertPm(projectId)
      await ctx.assertWritable(projectId)
      const name = input.name?.trim()
      if (!name) throw new ProviderError('validation', '파트너명은 필수입니다.')
      if (input.tier_id) await assertTierOfProject(ctx, input.tier_id, projectId)
      const row: Omit<Partner, 'id'> = {
        project_id: projectId,
        name,
        tier_id: input.tier_id ?? null,
        status: input.status ?? 'active',
        contract_amount: input.contract_amount ?? null,
        note: input.note ?? null,
        // v2.6 §25.4 — 부스는 등급 확정 뒤에 배정되므로 생성 시점엔 대개 비어 있다
        booth_no: input.booth_no ?? null,
        booth_size: input.booth_size ?? null,
        booth_power: input.booth_power ?? null,
        booth_internet: input.booth_internet ?? null,
        created_at: nowIso(),
      }
      const partner = ctx.q(await ctx.sb.from('partners').insert(row).select('*').single()) as Partner
      await ctx.log(projectId, 'partner.created', 'partner', partner.id)
      return partner
    },

    async updatePartner(partnerId: UUID, patch: Partial<PartnerInput>): Promise<Partner> {
      const partner = await mustFindPartner(ctx, partnerId)
      await ctx.assertPm(partner.project_id)
      await ctx.assertWritable(partner.project_id)
      const update: Partial<Partner> = {}
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new ProviderError('validation', '파트너명은 필수입니다.')
        update.name = patch.name.trim()
      }
      if (patch.tier_id !== undefined) {
        if (patch.tier_id) await assertTierOfProject(ctx, patch.tier_id, partner.project_id)
        update.tier_id = patch.tier_id
      }
      if (patch.status !== undefined) update.status = patch.status
      if (patch.contract_amount !== undefined) update.contract_amount = patch.contract_amount
      if (patch.note !== undefined) update.note = patch.note
      // v2.6 §25.4 — 부스 배정(HT-2 통지 · HT-4/HT-7 신청 취합의 기록면)
      if (patch.booth_no !== undefined) update.booth_no = patch.booth_no
      if (patch.booth_size !== undefined) update.booth_size = patch.booth_size
      if (patch.booth_power !== undefined) update.booth_power = patch.booth_power
      if (patch.booth_internet !== undefined) update.booth_internet = patch.booth_internet
      if (Object.keys(update).length === 0) return partner
      return ctx.q(
        await ctx.sb.from('partners').update(update).eq('id', partnerId).select('*').single(),
      ) as Partner
    },

    async removePartner(partnerId: UUID): Promise<void> {
      const partner = await mustFindPartner(ctx, partnerId)
      await ctx.assertPm(partner.project_id)
      await ctx.assertWritable(partner.project_id)
      // 이미 제출 이력(WBS 인스턴스·inbound 산출물)이 있는 파트너는 하드 삭제하지 않는다 —
      // 재전개 매칭(code+partner_id)이 깨지고 이력이 사라진다. status='withdrawn'으로 대신한다.
      const tasks = ctx.q(
        await ctx.sb.from('wbs_tasks').select('id').eq('partner_id', partnerId).limit(1),
      ) as { id: UUID }[]
      const deliverables = ctx.q(
        await ctx.sb.from('deliverables').select('id').eq('partner_id', partnerId).limit(1),
      ) as { id: UUID }[]
      if (tasks.length > 0 || deliverables.length > 0) {
        throw new ProviderError(
          'conflict',
          '이미 제출 이력이 있는 파트너는 삭제할 수 없습니다 — 상태를 철회로 변경하세요.',
        )
      }
      // 토큰은 FK on delete cascade가 함께 지운다(partner_tokens에는 delete 정책이 없다)
      ctx.ok(await ctx.sb.from('partners').delete().eq('id', partnerId))
      await ctx.log(partner.project_id, 'partner.removed', 'partner', partnerId)
    },

    async issuePartnerToken(partnerId: UUID, input: PartnerTokenIssueInput): Promise<PartnerToken> {
      const partner = await mustFindPartner(ctx, partnerId)
      await ctx.assertPm(partner.project_id)
      const project = await ctx.assertWritable(partner.project_id)
      const name = input.contact_name?.trim()
      const email = input.contact_email?.trim()
      if (!name || !email) throw new ProviderError('validation', '담당자명과 이메일은 필수입니다.')
      let expires = input.expires_at ?? null
      if (!expires && project.event_date) {
        // §6.3과 동일 원칙 — 기본 만료 = 행사일+30일
        const d = new Date(`${project.event_date}T00:00:00.000Z`)
        d.setUTCDate(d.getUTCDate() + 30)
        expires = d.toISOString()
      }
      // token 값은 DB 기본값(gen_random_uuid)이 만든다 — 클라이언트가 고르지 않는다
      const token = ctx.q(
        await ctx.sb
          .from('partner_tokens')
          .insert({
            partner_id: partnerId,
            contact_name: name,
            contact_email: email,
            expires_at: expires,
            revoked_at: null,
            last_seen_at: null,
            created_at: nowIso(),
          })
          .select('*')
          .single(),
      ) as PartnerToken
      await ctx.log(partner.project_id, 'partner_token.issued', 'partner_token', token.id)
      return token
    },

    async revokePartnerToken(token: string): Promise<PartnerToken> {
      if (!UUID_RE.test(token)) throw new ProviderError('not_found', '토큰을 찾을 수 없습니다.')
      const t = ctx.q(
        await ctx.sb.from('partner_tokens').select('*').eq('token', token).maybeSingle(),
        '토큰을 찾을 수 없습니다.',
      ) as PartnerToken
      const partner = await mustFindPartner(ctx, t.partner_id)
      await ctx.assertPm(partner.project_id)
      let revoked = t
      if (!t.revoked_at) {
        revoked = ctx.q(
          await ctx.sb
            .from('partner_tokens')
            .update({ revoked_at: nowIso() })
            .eq('id', t.id)
            .select('*')
            .single(),
        ) as PartnerToken
      }
      await ctx.log(partner.project_id, 'partner_token.revoked', 'partner_token', t.id)
      return revoked
    },

    /**
     * `/p/{token}` — RPC partner_portal이 토큰 검증(404/410·last_seen_at 갱신)과 R-H2·R-H3·R-H6 격리를
     * 서버에서 수행한다. 앱은 uuid 형식만 먼저 거른다(픽스처 문자열 토큰은 존재하지 않는다).
     */
    async getPartnerPortal(token: string): Promise<PartnerPortalData> {
      if (!UUID_RE.test(token)) throw new ProviderError('not_found', '유효하지 않은 링크입니다.')
      return ctx.rpc<PartnerPortalData>('partner_portal', { p_token: token })
    },

    /**
     * 파트너 제출 — RPC partner_submit이 파일·텍스트를 versions 이력으로 통일하고
     * requested→pending_approval(partner_submit) / changes_requested→pending_approval(version_upload)
     * 전이·파일명 규약·activity_log(actor 'partner:{token}')를 처리한다(§5.1 R-H4).
     * 파일 본문은 Phase 4에서 저장소가 없어 세션 메모리에 남기지 않는다(RPC가 version id를 돌려주지 않는다).
     */
    async submitPartnerItem(
      token: string,
      deliverableId: UUID,
      input: PartnerSubmissionInput,
    ): Promise<Deliverable> {
      if (!UUID_RE.test(token)) throw new ProviderError('not_found', '유효하지 않은 링크입니다.')
      const payload: Record<string, unknown> =
        'text' in input ? { text: input.text } : { file_name: input.file_name, note: input.note ?? null }
      return ctx.rpc<Deliverable>('partner_submit', {
        p_token: token,
        p_deliverable: deliverableId,
        p_payload: payload,
      })
    },

    /**
     * 내부 검토 — RPC review_partner_submission이 mock과 같은 순서로 판정한다:
     * 항목 404 → 파트너 항목 아님 409 → 멤버·쓰기 가능 → 역할-영역 일치 → 전이(pending_approval만) →
     * approved면 final까지·WBS auto-done / changes_requested면 코멘트 필수(422)·shared 코멘트 기록.
     */
    async reviewPartnerSubmission(deliverableId: UUID, input: PartnerReviewInput): Promise<Deliverable> {
      return ctx.rpc<Deliverable>('review_partner_submission', {
        p_deliverable: deliverableId,
        p_decision: input.decision,
        p_comment: input.comment ?? null,
      })
    },
  }
}
