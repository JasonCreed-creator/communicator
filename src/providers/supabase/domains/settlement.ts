// SupabaseProvider · 정산보드 도메인 (S-10 · 설계서 §19 · 계약 §4-24 R-S1~R-S10).
// MockProvider(3838~4254행)의 검증 순서·오류 code·한국어 메시지·activity_log action을 그대로 옮긴다.
// 스코프는 인자로만 정한다(R-S1) — 버킷·항목의 가드는 항상 board.project_id로 판정한다.
// 마진 식·버킷 스냅숏 표는 src/lib/settlement가 정본이며 여기서는 호출만 한다(R-S10).
// 내부 한정 — 이 모듈의 어떤 값도 발주처(/c)·파트너(/p)·운영계획서·랜딩으로 흘러가지 않는다(R-S9).
import type { DataProvider, SettlementBucketInput, SettlementItemInput, VendorInput } from '../../DataProvider'
import { SupabaseCtx, nowIso } from '../ctx'
import { ProviderError } from '../../../lib/errors'
import type {
  Quote,
  SettlementBoard,
  SettlementBucket,
  SettlementItem,
  UUID,
  Vendor,
} from '../../../types/entities'
import type { SettlementBoardView } from '../../../types/views'
import {
  bucketActual,
  bucketMarkup,
  bucketMarkupRate,
  bucketOrdered,
  computeTotals,
  isOverBudget,
  quoteBucketSpec,
  toVatExcluded,
} from '../../../lib/settlement'
import { computeQuoteOutputs } from '../../../modules/quote/engine/quoteInput'

type SettlementDomain = Pick<
  DataProvider,
  | 'getSettlementBoard'
  | 'createSettlementBoard'
  | 'rebaseSettlementBoard'
  | 'createSettlementBucket'
  | 'updateSettlementBucket'
  | 'deleteSettlementBucket'
  | 'createSettlementItem'
  | 'updateSettlementItem'
  | 'deleteSettlementItem'
  | 'listVendors'
  | 'upsertVendor'
>

/** 버킷 insert 행 — id·created_at은 DB 기본값 */
type BucketInsert = Omit<SettlementBucket, 'id' | 'created_at'>

// ── 조회 도우미 (mock의 mustFind* 와 같은 메시지) ─────────────────────

async function findBoardByProject(ctx: SupabaseCtx, projectId: UUID): Promise<SettlementBoard | null> {
  const res = await ctx.sb.from('settlement_boards').select('*').eq('project_id', projectId).maybeSingle()
  ctx.ok(res)
  return res.data ? (ctx.q(res) as SettlementBoard) : null
}

async function mustFindBoard(ctx: SupabaseCtx, projectId: UUID): Promise<SettlementBoard> {
  const board = await findBoardByProject(ctx, projectId)
  if (!board) throw new ProviderError('not_found', '정산 보드가 없습니다.')
  return board
}

async function mustFindBoardById(ctx: SupabaseCtx, boardId: UUID): Promise<SettlementBoard> {
  return ctx.q(
    await ctx.sb.from('settlement_boards').select('*').eq('id', boardId).maybeSingle(),
    '정산 보드가 없습니다.',
  ) as SettlementBoard
}

async function mustFindBucket(ctx: SupabaseCtx, bucketId: UUID): Promise<SettlementBucket> {
  return ctx.q(
    await ctx.sb.from('settlement_buckets').select('*').eq('id', bucketId).maybeSingle(),
    '버킷을 찾을 수 없습니다.',
  ) as SettlementBucket
}

async function mustFindItem(ctx: SupabaseCtx, itemId: UUID): Promise<SettlementItem> {
  return ctx.q(
    await ctx.sb.from('settlement_items').select('*').eq('id', itemId).maybeSingle(),
    '발주 항목을 찾을 수 없습니다.',
  ) as SettlementItem
}

/** 버킷 → 그 버킷이 속한 행사. 가드는 항상 이 값으로 판정한다(R-S1) */
async function projectOfBucket(ctx: SupabaseCtx, bucket: SettlementBucket): Promise<UUID> {
  return (await mustFindBoardById(ctx, bucket.board_id)).project_id
}

async function mustFindFinalQuote(ctx: SupabaseCtx, quoteId: UUID): Promise<Quote> {
  const res = await ctx.sb.from('quotes').select('*').eq('id', quoteId).maybeSingle()
  ctx.ok(res)
  if (!res.data) throw new ProviderError('not_found', '견적을 찾을 수 없습니다.')
  const quote = ctx.q(res) as Quote
  if (!quote.is_final) {
    throw new ProviderError('validation', '확정된 견적만 정산 기준으로 쓸 수 있습니다.')
  }
  return quote
}

async function bucketsOfBoard(ctx: SupabaseCtx, boardId: UUID): Promise<SettlementBucket[]> {
  return ctx.q(
    await ctx.sb.from('settlement_buckets').select('*').eq('board_id', boardId).order('sort_order'),
  ) as SettlementBucket[]
}

async function itemsOfBoard(ctx: SupabaseCtx, boardId: UUID): Promise<SettlementItem[]> {
  return ctx.q(await ctx.sb.from('settlement_items').select('*').eq('board_id', boardId)) as SettlementItem[]
}

async function itemsOfBucket(ctx: SupabaseCtx, bucketId: UUID): Promise<SettlementItem[]> {
  return ctx.q(await ctx.sb.from('settlement_items').select('*').eq('bucket_id', bucketId)) as SettlementItem[]
}

// ── 스냅숏·뷰 (mock snapshotBuckets / buildBoardView 와 동일 산식) ───────

/**
 * 확정 견적 breakdown → 버킷 9종 스냅숏 (§19.2).
 * `recruit`를 rc/ld로 쪼개는 것이 유일한 비자명 매핑이며, 값은 견적 input에서
 * 재유도하지 않고 **엔진 산출값(rsvpPkg·showup)을 그대로** 쓴다.
 */
function snapshotBuckets(boardId: UUID, quote: Quote): BucketInsert[] {
  const engine = computeQuoteOutputs(quote.input).result
  return quoteBucketSpec(quote.breakdown, engine).map((row, i) => ({
    board_id: boardId,
    code: row.code,
    label: row.label,
    quote_amount: row.quote_amount,
    has_cost: row.has_cost,
    is_margin_base: row.is_margin_base,
    source: 'quote' as const,
    sort_order: i + 1,
  }))
}

async function buildBoardView(ctx: SupabaseCtx, board: SettlementBoard): Promise<SettlementBoardView> {
  const [buckets, items] = await Promise.all([bucketsOfBoard(ctx, board.id), itemsOfBoard(ctx, board.id)])
  // 기준 견적은 **버전·제목만** 노출한다 — 금액은 버킷 스냅숏이 이미 갖고 있다.
  // (RLS로 견적 행이 보이지 않는 멤버에게는 라벨만 비운다 — 보드 자체는 그대로 그린다)
  let quoteLabel: string | null = null
  if (board.quote_id) {
    const res = await ctx.sb.from('quotes').select('id, title, version').eq('id', board.quote_id).maybeSingle()
    ctx.ok(res)
    const q = res.data as { title: string; version: number } | null
    quoteLabel = q ? `${q.title} v${q.version}` : null
  }
  return {
    board,
    quote_label: quoteLabel,
    buckets: buckets.map((bucket) => ({
      bucket,
      items: items
        .filter((i) => i.bucket_id === bucket.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      ordered: bucketOrdered(bucket, items),
      actual: bucketActual(bucket, items),
      markup: bucketMarkup(bucket, items),
      markup_rate: bucketMarkupRate(bucket, items),
      over_budget: isOverBudget(bucket, items),
    })),
    totals: computeTotals(buckets, items),
  }
}

/** 그 버킷에 금액이 실제로 들어간 항목이 있는가 (취소 항목은 제외 — 집계에서 빠지므로) */
function hasEnteredAmounts(bucketId: UUID, items: SettlementItem[]): boolean {
  return items.some(
    (i) =>
      i.bucket_id === bucketId &&
      i.status !== 'cancelled' &&
      (i.ordered_amount !== null || i.actual_amount !== null),
  )
}

/**
 * 원가 없는 버킷에 금액이 얹히는 것을 막는다 — 422 (R-S4).
 * 판정 대상은 **patch가 아니라 patch를 적용한 뒤 항목의 최종 상태**다(이동도 잡는다 — mock 주석 참조).
 */
function assertCostAllowed(
  bucket: SettlementBucket,
  input: Partial<SettlementItemInput>,
  existing?: SettlementItem,
): void {
  if (bucket.has_cost) return

  const pick = <K extends 'ordered_amount' | 'actual_amount'>(key: K): number | null =>
    input[key] !== undefined ? (input[key] ?? null) : (existing?.[key] ?? null)
  const status = input.status ?? existing?.status ?? 'planned'
  if (status === 'cancelled') return
  if (pick('ordered_amount') === null && pick('actual_amount') === null) return

  const isMove =
    existing !== undefined && input.bucket_id !== undefined && input.bucket_id !== existing.bucket_id
  throw new ProviderError(
    'validation',
    isMove
      ? `'${bucket.label}'은 원가가 없는 항목이라 금액이 든 발주 항목을 옮길 수 없습니다. 금액을 지우거나 다른 버킷으로 옮기세요.`
      : `'${bucket.label}'은 원가가 없는 항목이라 발주·실비를 넣을 수 없습니다.`,
  )
}

/** 금액 입력 권한 — pm 또는 그 항목의 담당자 본인 (§6.1). RLS(settlement_items_update)와 같은 규칙 */
async function assertItemWritable(ctx: SupabaseCtx, projectId: UUID, item: SettlementItem): Promise<void> {
  const role = await ctx.roleIn(projectId)
  if (role === 'pm') return
  const me = await ctx.me()
  if (item.assignee_id && item.assignee_id === me.id) return
  throw new ProviderError('forbidden', '본인이 담당한 발주 항목만 입력할 수 있습니다.')
}

// ── 보드 생성 코어 — quotes 도메인(distributeQuoteImport settlement_base)이 재사용한다 ──

/**
 * 확정 견적 breakdown을 버킷 9종으로 **스냅숏**해 보드를 만든다(R-S2).
 * mock createSettlementBoard와 같은 순서: 쓰기 가능 → pm → 보드 중복(409) → 견적(404/422) → 생성 → 로그.
 */
export async function createSettlementBoardCore(
  ctx: SupabaseCtx,
  projectId: UUID,
  quoteId: UUID,
): Promise<SettlementBoardView> {
  await ctx.assertWritable(projectId)
  await ctx.assertPm(projectId)
  if (await findBoardByProject(ctx, projectId)) {
    throw new ProviderError('conflict', '이미 정산 보드가 있습니다.')
  }
  const quote = await mustFindFinalQuote(ctx, quoteId)
  const now = nowIso()
  const board = ctx.q(
    await ctx.sb
      .from('settlement_boards')
      .insert({
        project_id: projectId,
        quote_id: quote.id,
        quote_version: quote.version,
        baselined_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single(),
  ) as SettlementBoard
  ctx.q(await ctx.sb.from('settlement_buckets').insert(snapshotBuckets(board.id, quote)).select('id'))
  await ctx.log(projectId, 'settlement.baselined', 'settlement', board.id, { quote_version: quote.version })
  return buildBoardView(ctx, board)
}

export function settlementDomain(ctx: SupabaseCtx): SettlementDomain {
  return {
    async getSettlementBoard(projectId: UUID): Promise<SettlementBoardView | null> {
      await ctx.project(projectId)
      const board = await findBoardByProject(ctx, projectId)
      return board ? buildBoardView(ctx, board) : null
    },

    async createSettlementBoard(projectId: UUID, quoteId: UUID): Promise<SettlementBoardView> {
      return createSettlementBoardCore(ctx, projectId, quoteId)
    },

    /**
     * 기준 견적 갱신 (R-S2). 버킷의 quote_amount만 새 스냅숏으로 갈고 **항목은 그대로 둔다**.
     * quote 버킷은 code 매칭으로 금액만 교체하고, custom 버킷은 손대지 않는다.
     */
    async rebaseSettlementBoard(projectId: UUID, quoteId: UUID): Promise<SettlementBoardView> {
      await ctx.assertWritable(projectId)
      await ctx.assertPm(projectId)
      const board = await mustFindBoard(ctx, projectId)
      const quote = await mustFindFinalQuote(ctx, quoteId)
      const fresh = snapshotBuckets(board.id, quote)
      const [current, items] = await Promise.all([bucketsOfBoard(ctx, board.id), itemsOfBoard(ctx, board.id)])

      // 스냅숏은 code마다 has_cost를 고정값으로 되돌린다. 원가를 켜 두고 금액을 입력한 버킷이
      // 원가 없음으로 되돌아가면 실집행이 통째로 빠지고 마진이 같은 크기로 올라 항등식이 조용히
      // 통과한다 — 그래서 갱신 자체를 막는다(mock과 동일).
      const wouldSilenceCost = fresh
        .filter((next) => !next.has_cost)
        .map((next) => current.find((b) => b.code === next.code))
        .filter((cur): cur is SettlementBucket => !!cur && cur.has_cost && hasEnteredAmounts(cur.id, items))
      if (wouldSilenceCost.length > 0) {
        throw new ProviderError(
          'conflict',
          `기준을 갱신하면 ${wouldSilenceCost
            .map((b) => `'${b.label}'`)
            .join('·')}이(가) 원가 없음으로 되돌아가 이미 입력된 금액이 집계에서 빠집니다. 항목을 먼저 정리하세요.`,
        )
      }

      const prevVersion = board.quote_version
      const toInsert: BucketInsert[] = []
      for (const next of fresh) {
        const cur = current.find((b) => b.code === next.code)
        if (cur) {
          ctx.ok(
            await ctx.sb
              .from('settlement_buckets')
              .update({
                quote_amount: next.quote_amount,
                has_cost: next.has_cost,
                is_margin_base: next.is_margin_base,
              })
              .eq('id', cur.id),
          )
        } else {
          toInsert.push(next)
        }
      }
      if (toInsert.length > 0) {
        ctx.q(await ctx.sb.from('settlement_buckets').insert(toInsert).select('id'))
      }
      const now = nowIso()
      const updated = ctx.q(
        await ctx.sb
          .from('settlement_boards')
          .update({ quote_id: quote.id, quote_version: quote.version, baselined_at: now, updated_at: now })
          .eq('id', board.id)
          .select('*')
          .single(),
      ) as SettlementBoard
      await ctx.log(projectId, 'settlement.rebased', 'settlement', board.id, {
        from_version: prevVersion,
        to_version: quote.version,
      })
      return buildBoardView(ctx, updated)
    },

    async createSettlementBucket(projectId: UUID, input: SettlementBucketInput): Promise<SettlementBucket> {
      await ctx.assertWritable(projectId)
      await ctx.assertPm(projectId)
      const board = await mustFindBoard(ctx, projectId)
      const code = input.code?.trim()
      if (!code) throw new ProviderError('validation', '버킷 코드는 필수입니다.')
      if (!input.label?.trim()) throw new ProviderError('validation', '버킷 이름은 필수입니다.')
      const existing = await bucketsOfBoard(ctx, board.id)
      if (existing.some((b) => b.code === code)) {
        throw new ProviderError('conflict', '이미 있는 버킷 코드입니다.')
      }
      const row: BucketInsert = {
        board_id: board.id,
        code,
        label: input.label.trim(),
        // 행사별 추가 버킷은 견적에 없던 비용이다 — 0원에서 시작해 마크업이 음수로 잡히는 게 맞다(§19.2)
        quote_amount: input.quote_amount ?? 0,
        has_cost: input.has_cost ?? true,
        is_margin_base: input.is_margin_base ?? true,
        source: 'custom',
        sort_order: input.sort_order ?? existing.length + 1,
      }
      return ctx.q(
        await ctx.sb.from('settlement_buckets').insert(row).select('*').single(),
      ) as SettlementBucket
    },

    async updateSettlementBucket(
      bucketId: UUID,
      patch: Partial<SettlementBucketInput>,
    ): Promise<SettlementBucket> {
      const bucket = await mustFindBucket(ctx, bucketId)
      const projectId = await projectOfBucket(ctx, bucket)
      await ctx.assertWritable(projectId)
      await ctx.assertPm(projectId)
      const update: Partial<SettlementBucket> = {}
      if (patch.label !== undefined) {
        if (!patch.label.trim()) throw new ProviderError('validation', '버킷 이름은 필수입니다.')
        update.label = patch.label.trim()
      }
      if (patch.quote_amount !== undefined) update.quote_amount = patch.quote_amount
      // R-S4 역방향: 원가를 **끄는** 것도 막는다 — 항등식은 이 조작을 구조적으로 못 잡으므로 입력 경로에서 검사
      if (patch.has_cost === false && hasEnteredAmounts(bucket.id, await itemsOfBucket(ctx, bucket.id))) {
        throw new ProviderError(
          'conflict',
          '이미 발주·실비가 입력된 버킷은 원가 없음으로 바꿀 수 없습니다. 항목을 먼저 정리하세요.',
        )
      }
      if (patch.has_cost !== undefined) update.has_cost = patch.has_cost
      if (patch.is_margin_base !== undefined) update.is_margin_base = patch.is_margin_base
      if (patch.sort_order !== undefined) update.sort_order = patch.sort_order
      if (Object.keys(update).length === 0) return bucket
      return ctx.q(
        await ctx.sb.from('settlement_buckets').update(update).eq('id', bucketId).select('*').single(),
      ) as SettlementBucket
    },

    async deleteSettlementBucket(bucketId: UUID): Promise<void> {
      const bucket = await mustFindBucket(ctx, bucketId)
      const projectId = await projectOfBucket(ctx, bucket)
      await ctx.assertWritable(projectId)
      await ctx.assertPm(projectId)
      if (bucket.source === 'quote') {
        throw new ProviderError('conflict', '견적에서 온 버킷은 삭제할 수 없습니다.')
      }
      const items = ctx.q(
        await ctx.sb.from('settlement_items').select('id').eq('bucket_id', bucketId).limit(1),
      ) as { id: UUID }[]
      if (items.length > 0) {
        throw new ProviderError('conflict', '발주 항목이 있는 버킷은 삭제할 수 없습니다.')
      }
      ctx.ok(await ctx.sb.from('settlement_buckets').delete().eq('id', bucketId))
    },

    async createSettlementItem(
      projectId: UUID,
      bucketId: UUID,
      input: SettlementItemInput,
    ): Promise<SettlementItem> {
      await ctx.assertWritable(projectId)
      await ctx.assertPm(projectId)
      const bucket = await mustFindBucket(ctx, bucketId)
      if ((await projectOfBucket(ctx, bucket)) !== projectId) {
        throw new ProviderError('validation', '다른 행사의 버킷입니다.')
      }
      if (!input.title?.trim()) throw new ProviderError('validation', '항목명은 필수입니다.')
      assertCostAllowed(bucket, input)

      const vatIncluded = input.vat_included_input ?? false
      const raw = input.actual_amount ?? input.ordered_amount ?? null
      const now = nowIso()
      const row: Omit<SettlementItem, 'id'> = {
        board_id: bucket.board_id,
        bucket_id: bucketId,
        title: input.title.trim(),
        spec: input.spec ?? null,
        vendor_id: input.vendor_id ?? null,
        assignee_id: input.assignee_id ?? null,
        ordered_amount:
          input.ordered_amount == null ? null : toVatExcluded(input.ordered_amount, vatIncluded),
        actual_amount:
          input.actual_amount == null ? null : toVatExcluded(input.actual_amount, vatIncluded),
        input_amount_raw: vatIncluded ? raw : null,
        vat_included_input: vatIncluded,
        status: input.status ?? 'planned',
        evidence: input.evidence ?? null,
        import_id: null,
        note: input.note ?? null,
        created_at: now,
        updated_at: now,
      }
      return ctx.q(await ctx.sb.from('settlement_items').insert(row).select('*').single()) as SettlementItem
    },

    async updateSettlementItem(itemId: UUID, patch: Partial<SettlementItemInput>): Promise<SettlementItem> {
      const item = await mustFindItem(ctx, itemId)
      const bucket = await mustFindBucket(ctx, patch.bucket_id ?? item.bucket_id)
      const projectId = await projectOfBucket(ctx, bucket)
      await ctx.assertWritable(projectId)
      await assertItemWritable(ctx, projectId, item)
      assertCostAllowed(bucket, patch, item)

      const update: Partial<SettlementItem> = {}
      if (patch.bucket_id !== undefined) update.bucket_id = patch.bucket_id
      if (patch.title !== undefined) {
        if (!patch.title.trim()) throw new ProviderError('validation', '항목명은 필수입니다.')
        update.title = patch.title.trim()
      }
      if (patch.spec !== undefined) update.spec = patch.spec
      if (patch.vendor_id !== undefined) update.vendor_id = patch.vendor_id
      if (patch.assignee_id !== undefined) update.assignee_id = patch.assignee_id
      if (patch.status !== undefined) update.status = patch.status
      if (patch.evidence !== undefined) update.evidence = patch.evidence
      if (patch.note !== undefined) update.note = patch.note

      // 부가세 처리 — 이번 patch가 금액을 건드릴 때만 재계산한다(§19.4)
      const touchesAmount = patch.ordered_amount !== undefined || patch.actual_amount !== undefined
      if (touchesAmount) {
        const vatIncluded = patch.vat_included_input ?? false
        if (patch.ordered_amount !== undefined) {
          update.ordered_amount =
            patch.ordered_amount == null ? null : toVatExcluded(patch.ordered_amount, vatIncluded)
        }
        if (patch.actual_amount !== undefined) {
          update.actual_amount =
            patch.actual_amount == null ? null : toVatExcluded(patch.actual_amount, vatIncluded)
        }
        const raw = patch.actual_amount ?? patch.ordered_amount ?? null
        update.vat_included_input = vatIncluded
        update.input_amount_raw = vatIncluded ? raw : null
      }
      update.updated_at = nowIso()
      return ctx.q(
        await ctx.sb.from('settlement_items').update(update).eq('id', itemId).select('*').single(),
      ) as SettlementItem
    },

    async deleteSettlementItem(itemId: UUID): Promise<void> {
      const item = await mustFindItem(ctx, itemId)
      const bucket = await mustFindBucket(ctx, item.bucket_id)
      const projectId = await projectOfBucket(ctx, bucket)
      await ctx.assertWritable(projectId)
      await assertItemWritable(ctx, projectId, item)
      // RLS(settlement_items_delete)는 pm만 허용한다 — 걸러진 행은 오류 없이 0건 삭제되므로
      // 반환 행으로 확인해 조용한 no-op을 403으로 드러낸다.
      const deleted = ctx.q(
        await ctx.sb.from('settlement_items').delete().eq('id', itemId).select('id'),
      ) as { id: UUID }[]
      if (deleted.length === 0) {
        throw new ProviderError('forbidden', '이 작업을 수행할 권한이 없습니다.')
      }
    },

    async listVendors(): Promise<Vendor[]> {
      // 협력사는 프로젝트 비종속 조직 마스터다(§19.6) — projectId를 받지 않는 것이 맞다
      const rows = ctx.q(
        await ctx.sb.from('vendors').select('*').is('archived_at', null),
      ) as Vendor[]
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    },

    async upsertVendor(input: VendorInput): Promise<Vendor> {
      await ctx.me()
      const name = input.name?.trim()
      if (!name) throw new ProviderError('validation', '협력사명은 필수입니다.')
      let existing: Vendor | null = null
      if (input.id) {
        const res = await ctx.sb.from('vendors').select('*').eq('id', input.id).maybeSingle()
        ctx.ok(res)
        existing = res.data ? (ctx.q(res) as Vendor) : null
      } else {
        const res = await ctx.sb
          .from('vendors')
          .select('*')
          .eq('name', name)
          .is('archived_at', null)
          .maybeSingle()
        ctx.ok(res)
        existing = res.data ? (ctx.q(res) as Vendor) : null
      }
      if (existing) {
        const update: Partial<Vendor> = { name }
        if (input.biz_no !== undefined) update.biz_no = input.biz_no
        if (input.note !== undefined) update.note = input.note
        return ctx.q(
          await ctx.sb.from('vendors').update(update).eq('id', existing.id).select('*').single(),
        ) as Vendor
      }
      return ctx.q(
        await ctx.sb
          .from('vendors')
          .insert({ name, biz_no: input.biz_no ?? null, note: input.note ?? null, archived_at: null })
          .select('*')
          .single(),
      ) as Vendor
    },
  }
}
