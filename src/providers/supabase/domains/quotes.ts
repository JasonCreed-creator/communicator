// SupabaseProvider · 견적 도메인 (S-2 · 설계서 §8 /quotes · §16 핸드오프 · §22 견적서 임포트).
// MockProvider(2888~3421행)의 검증 순서·오류 code·한국어 메시지·activity_log action을 그대로 옮긴다.
// 금액(input·breakdown·total_amount)은 이 경로(quotes·quote_imports)에만 있다 — 행사·보드 시드·로그로는
// 어떤 키로도 넘기지 않는다(#RULE-NO-PRICE-TO-CLIENT · §12).
// 견적 생성·새 버전은 **서버 재계산**(Vercel Function /api/quote-recalc)만 거친다 — 클라이언트 산출값은 저장되지 않는다.
import type { DataProvider } from '../../DataProvider'
import { SupabaseCtx, normalizeRow, nowIso } from '../ctx'
import { ProviderError, type ErrorCode } from '../../../lib/errors'
import { toVatExcluded } from '../../../lib/settlement'
import type {
  Deliverable,
  Project,
  Quote,
  QuoteBreakdown,
  QuoteImport,
  QuoteInput,
  UUID,
} from '../../../types/entities'
import type { DeliverableArea } from '../../../types/enums'
import type {
  QuoteExportResult,
  QuoteImportConfirmInput,
  QuoteImportDistributeInput,
  QuoteImportDistributeResult,
} from '../../../types/views'
import { adjustmentDeltas, toEngineConfig } from '../../../modules/quote/engine/quoteInput'
import { effectiveAdjust } from '../../../modules/quote/engine/quoteMode'
import { calcEstimate } from '../../../modules/quote/engine/calcEstimate'
import { exportEstimate } from '../../../modules/quote/export/exportEstimate'
import { quoteToProjectDraft } from '../../../modules/quote/handoff'
import { parseQuoteWorkbook } from '../../../modules/quote/import/parser'
import type { ParsedQuoteDoc, SectionMapping } from '../../../modules/quote/import/types'
import { createSettlementBoardCore } from './settlement'

type QuotesDomain = Pick<
  DataProvider,
  | 'listQuotes'
  | 'getQuote'
  | 'createQuote'
  | 'saveQuoteVersion'
  | 'finalizeQuote'
  | 'createProjectFromQuote'
  | 'exportQuoteXlsx'
  | 'importQuoteFile'
  | 'confirmQuoteImport'
  | 'distributeQuoteImport'
>

const ERROR_CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']
function asErrorCode(value: unknown): ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
    ? (value as ErrorCode)
    : 'validation'
}

/** projects.code 유일 위반(23505) — 코드 제안 뒤에 접미사를 붙여 재시도할 때만 잡는다 */
const UNIQUE_VIOLATION = '23505'
const MAX_CODE_ATTEMPTS = 50

// ── 조회 도우미 ─────────────────────────────────────────────────────────

async function mustFindQuote(ctx: SupabaseCtx, quoteId: UUID): Promise<Quote> {
  return ctx.q(
    await ctx.sb.from('quotes').select('*').eq('id', quoteId).maybeSingle(),
    '견적을 찾을 수 없습니다.',
  ) as Quote
}

async function mustFindQuoteImport(ctx: SupabaseCtx, importId: UUID): Promise<QuoteImport> {
  return ctx.q(
    await ctx.sb.from('quote_imports').select('*').eq('id', importId).maybeSingle(),
    '임포트를 찾을 수 없습니다.',
  ) as QuoteImport
}

// ── 서버 재계산 (설계서 §8 · 브리프 "견적 createQuote/saveQuoteVersion은 서버 재계산") ────────

interface RecalcBody {
  op: 'create' | 'version'
  input: QuoteInput
  quote_id?: UUID
}

/**
 * POST {apiBase}/quote-recalc — 서버가 엔진으로 breakdown·total_amount를 재계산해 저장한다.
 * 200 `{quote}` / 그 외 `{error:{code,message}}` → ProviderError. 세션 토큰이 없으면 403.
 */
async function recalcQuote(ctx: SupabaseCtx, body: RecalcBody): Promise<Quote> {
  const accessToken = (await ctx.sb.auth.getSession()).data.session?.access_token
  if (!accessToken) throw new ProviderError('forbidden', '로그인이 필요합니다.')

  let res: Response
  try {
    res = await fetch(`${ctx.env.apiBase}/quote-recalc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ProviderError('validation', '견적 서버에 연결할 수 없습니다 — 잠시 후 다시 시도하세요.')
  }
  const json = (await res.json().catch(() => null)) as
    | { quote?: Quote; error?: { code?: string; message?: string } }
    | null
  if (!res.ok) {
    throw new ProviderError(
      asErrorCode(json?.error?.code),
      json?.error?.message || `견적 서버 오류가 발생했습니다 (${res.status}).`,
    )
  }
  if (!json?.quote) throw new ProviderError('validation', '견적 서버 응답 형식이 올바르지 않습니다.')
  return normalizeRow(json.quote)
}

// ── §16 핸드오프 — 견적을 행사로 굳힌다 ────────────────────────────────

/**
 * §16 매핑 실행(금액·섹션 산출은 어떤 키로도 넘기지 않는다). is_final 여부는 호출자가 판정한다:
 * createProjectFromQuote는 확정 견적만, distributeQuoteImport의 project_prefill은 임포트 견적에
 * 그 제약을 적용하지 않는다(§22.4). 생성자는 DB 트리거(projects_after_insert)가 pm으로 올린다.
 */
async function materializeProjectFromQuote(ctx: SupabaseCtx, quote: Quote, meId: UUID): Promise<Project> {
  if (quote.project_id) {
    throw new ProviderError('conflict', '이미 행사가 연결된 견적입니다.')
  }
  const draft = quoteToProjectDraft(quote)

  // 행사 코드는 전역 유일이지만 RLS 때문에 남의 행사 코드는 보이지 않는다 — 보이는 코드로 시작점을 잡고,
  // 유일 제약 위반(23505)이 나면 접미사를 올려 재시도한다(mock의 while 루프와 같은 결과).
  const visible = ctx.q(await ctx.sb.from('projects').select('code')) as { code: string }[]
  const taken = new Set(visible.map((p) => p.code))
  let code = draft.code_suggestion
  let suffix = 2
  while (taken.has(code)) code = `${draft.code_suggestion}-${suffix++}`

  const baseRow = {
    // §16 핸드오프는 conference 경로만 해당한다(§25.2) — 스냅샷의 format은 'conference' 고정
    format: 'conference',
    psa_enabled: false,
    audience_model: null,
    name: draft.name,
    kind: 'agency', // v2.4 §21 — 핸드오프로 만든 행사는 기본 대행형(행사 설정에서 전환 가능)
    event_date: draft.event_date,
    event_end_date: draft.event_end_date,
    start_time: draft.start_time,
    end_time: draft.end_time,
    expected_headcount: draft.expected_headcount,
    seating: draft.seating,
    organizer: draft.organizer,
    target_audience: draft.target_audience,
    status: 'active',
    closed_at: null,
    guarantee_pax: draft.guarantee_pax,
    kpi_show_rate: draft.kpi_show_rate,
    targeting: draft.targeting,
    quote_id: quote.id,
    drive_root_folder_id: null,
    slack_webhook_url: null,
    event_type: draft.event_type,
    theme: null,
    venue: draft.venue,
    mc_name: null,
    overview_items: draft.overview_items,
    onboarded_at: null, // §8: S0 ① 프리필 상태로 진입 — 완료는 S0 위저드에서
    partner_guide_url: null, // v2.4.1 §21.1
    partner_contact_email: null,
    created_by: meId,
    created_at: nowIso(),
  }

  let project: Project | null = null
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !project; attempt++) {
    const res = await ctx.sb.from('projects').insert({ ...baseRow, code }).select('*').single()
    if (res.error?.code === UNIQUE_VIOLATION) {
      code = `${draft.code_suggestion}-${suffix++}`
      continue
    }
    project = ctx.q(res) as Project
  }
  if (!project) throw new ProviderError('conflict', '행사 코드를 배정할 수 없습니다 — 다시 시도하세요.')
  ctx.invalidateRoles()

  // 상호 링크 (§16). 확정본 잠금 트리거는 input·breakdown·total_amount만 보므로 project_id 갱신은 통과한다
  ctx.ok(
    await ctx.sb.from('quotes').update({ project_id: project.id, updated_at: nowIso() }).eq('id', quote.id),
  )
  quote.project_id = project.id
  return project
}

// ── §22 견적서 임포트 도우미 (mock defaultSectionMapping · buildImportedBreakdown · buildImportedQuoteInput) ──

/**
 * §22.2-6 기본 매핑표 — 신뢰도 낮은 항목(키워드 무매칭·복수매칭)만 확인 필요로 표시한다.
 * `recruit`는 매핑 결과에서 곧바로 breakdown 필드명으로 쓴다(mock과 같은 설계 결정, 3.15a).
 */
function defaultSectionMapping(parsed: ParsedQuoteDoc): SectionMapping[] {
  const RULES: { bucket: string; keywords: string[] }[] = [
    { bucket: 's1', keywords: ['베뉴', '대관', '장소'] },
    { bucket: 's2', keywords: ['무대', '시스템', 'av', 'led', '음향', '조명', '중계', '전기', '부스'] },
    { bucket: 's3', keywords: ['디자인', '브랜딩', '콘텐츠', '사인'] },
    { bucket: 's4', keywords: ['인력', '운영', '보험', 'mc'] },
    { bucket: 's5', keywords: ['대행료', '기획료'] },
    { bucket: 'recruit', keywords: ['등록', 'rsvp', '모객'] },
    { bucket: 'custom', keywords: ['기념품', '경품', 'f&b', '웰컴', '애드온'] },
  ]
  return parsed.sections.map((section) => {
    const name = section.name.toLowerCase()
    const matched = RULES.filter((r) => r.keywords.some((k) => name.includes(k.toLowerCase())))
    // 무매칭·복수매칭은 custom으로 잠정 배정 + 확인 필요(낮은 신뢰도) — §22.2-6 말미
    if (matched.length === 1) {
      return { section: section.name, bucket: matched[0].bucket, confidence: 'high' as const }
    }
    return { section: section.name, bucket: 'custom', confidence: 'low' as const }
  })
}

/**
 * 확인된 매핑으로 버킷별 합산 — engine-shape 8키(s1~s5·options·recruit·attendee) +
 * custom_sections(§22.4). 부가세 별도 총액은 grand_total에서 vat를 뺀 값을 우선하고,
 * vat 자체가 없으면 §19.4와 동일한 round(v/1.1)로 역산한다.
 */
function buildImportedBreakdown(
  parsed: ParsedQuoteDoc,
  mapping: SectionMapping[],
): { breakdown: QuoteBreakdown; total_amount: number } {
  const STANDARD = ['s1', 's2', 's3', 's4', 's5', 'options', 'recruit', 'attendee'] as const
  const sums: Record<(typeof STANDARD)[number], number> = {
    s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, options: 0, recruit: 0, attendee: 0,
  }
  const customByCode = new Map<string, { code: string; label: string; amount: number }>()

  for (const row of mapping) {
    const section = parsed.sections.find((s) => s.name === row.section)
    if (!section) continue
    const amount = section.subtotal ?? section.items.reduce((s, it) => s + (it.amount || 0), 0)
    if ((STANDARD as readonly string[]).includes(row.bucket)) {
      sums[row.bucket as (typeof STANDARD)[number]] += amount
    } else {
      // 'custom' 자체는 여러 섹션이 공유하는 잠정 배정일 수 있어 섹션별로 분리 보존한다
      const code = row.bucket === 'custom' ? `custom:${section.name}` : row.bucket
      const prev = customByCode.get(code)
      customByCode.set(code, { code, label: section.name, amount: (prev?.amount ?? 0) + amount })
    }
  }

  const mappedTotal =
    Object.values(sums).reduce((s, v) => s + v, 0) +
    [...customByCode.values()].reduce((s, v) => s + v.amount, 0)
  const totals = parsed.totals
  const subtotal =
    totals.grand_total != null
      ? totals.vat != null
        ? totals.grand_total - totals.vat
        : toVatExcluded(totals.grand_total, true)
      : totals.items_sum ?? mappedTotal
  const vat = Math.round(subtotal * 0.1)

  const breakdown: QuoteBreakdown = {
    s1: sums.s1,
    s2: sums.s2,
    s3: sums.s3,
    s4: sums.s4,
    s5: sums.s5,
    options: sums.options,
    recruit: sums.recruit,
    attendee: sums.attendee,
    subtotal,
    vat,
    total: subtotal + vat,
    custom_sections: [...customByCode.values()],
  }
  return { breakdown, total_amount: subtotal }
}

/** 파싱 헤더 요약을 QuoteInput 형태로 옮긴다 — §16 핸드오프가 그대로 읽을 수 있게 하기 위함 */
function buildImportedQuoteInput(imp: QuoteImport): QuoteInput {
  const header = imp.parsed.header
  const venueName = header.venue?.trim() || null
  return {
    event_name: header.event_name?.trim() || imp.file_name,
    event_date: null, // date_range는 자유 텍스트 — 이 단계에서 파싱하지 않는다(확인 큐 영역)
    event_end_date: null,
    start_time: null,
    end_time: null,
    event_type: null,
    include_leads: false,
    headcount: 0,
    guarantee: 0,
    venues: venueName ? [{ venue_id: null, name: venueName, hall: null, date: null, rental: 0 }] : [],
    selected_venue: venueName
      ? { venue_id: null, name: venueName, hall: null, date: null, rental: 0, index: 0 }
      : null,
    options: {},
    display_type: 'led',
    targeting: null,
    client_company: header.client?.trim() || null,
    contact: null,
    manager: header.manager?.trim() || null,
    notes: `임포트(${imp.format}형) — ${imp.file_name}`,
    adjustments: [],
  }
}

/**
 * board_seed(§22.4) — s3 매핑은 design 보드, s2·s4 매핑은 ops 보드에 항목 단위로 시드한다.
 * **금액 키는 절대 넣지 않는다** — 품목(title)·규격(spec)·수량(qty)만 brief/spec_* 필드로 옮긴다.
 */
async function seedBoardFromImport(ctx: SupabaseCtx, projectId: UUID, imp: QuoteImport): Promise<number> {
  const areaByBucket: Record<string, DeliverableArea> = { s3: 'design', s2: 'ops', s4: 'ops' }
  const now = nowIso()
  const rows: Omit<Deliverable, 'id'>[] = []
  for (const row of imp.mapping) {
    const area = areaByBucket[row.bucket]
    if (!area) continue
    const section = imp.parsed.sections.find((s) => s.name === row.section)
    if (!section) continue
    for (const item of section.items) {
      rows.push({
        project_id: projectId,
        area,
        category: '견적 임포트',
        title: item.title,
        status: 'draft',
        assignee_id: null,
        due_date: null,
        drive_folder_id: null,
        requires_approval: true,
        brief: `임포트(${imp.file_name}) — ${section.name}`,
        brief_refs: null,
        spec_size: item.spec ?? null,
        spec_qty: item.qty ?? null,
        spec_location: null,
        spec_type: null,
        content: null,
        partner_id: null,
        created_at: now,
        updated_at: now,
      })
    }
  }
  if (rows.length === 0) return 0
  ctx.q(await ctx.sb.from('deliverables').insert(rows).select('id'))
  return rows.length
}

export function quotesDomain(ctx: SupabaseCtx): QuotesDomain {
  return {
    async listQuotes(): Promise<Quote[]> {
      await ctx.assertQuoteRole()
      return ctx.q(
        await ctx.sb
          .from('quotes')
          .select('*')
          .order('created_at', { ascending: true })
          .order('version', { ascending: true }),
      ) as Quote[]
    },

    /** §6.1: admin·sales, 또는 연결 행사의 pm(요약 열람) — pm 열람은 RLS(quotes_select)가 허용한다 */
    async getQuote(quoteId: UUID): Promise<Quote> {
      const me = await ctx.me()
      const res = await ctx.sb.from('quotes').select('*').eq('id', quoteId).maybeSingle()
      ctx.ok(res)
      if (!res.data) {
        // RLS가 걸러낸 행과 없는 행을 클라이언트는 구분할 수 없다 — 권한 없는 사용자에게는 mock과 같은 403
        if (me.app_role !== 'admin' && me.app_role !== 'sales') {
          throw new ProviderError('forbidden', '견적 메뉴는 영업·관리자 권한이 필요합니다.')
        }
        throw new ProviderError('not_found', '견적을 찾을 수 없습니다.')
      }
      return ctx.q(res) as Quote
    },

    /** §8: breakdown·total_amount는 서버가 엔진으로 재계산해 저장 (클라이언트 값 불신) */
    async createQuote(input: QuoteInput): Promise<Quote> {
      await ctx.assertQuoteRole()
      return recalcQuote(ctx, { op: 'create', input })
    },

    /** §4-18: 이전 버전은 superseded 체인(서버가 연결) — 확정본은 잠금 유지, 미확정은 superseded */
    async saveQuoteVersion(quoteId: UUID, input: QuoteInput): Promise<Quote> {
      await ctx.assertQuoteRole()
      const prev = await mustFindQuote(ctx, quoteId)
      if (prev.superseded_by) {
        throw new ProviderError('conflict', '이미 새 버전이 있는 견적입니다 — 최신 버전에서 수정하세요.')
      }
      return recalcQuote(ctx, { op: 'version', input, quote_id: quoteId })
    },

    /** RPC finalize_quote — 409(이미 확정·새 버전 있음)·같은 행사 다른 final archived·상호 링크·quote.finalized 로그 */
    async finalizeQuote(quoteId: UUID): Promise<Quote> {
      await ctx.assertQuoteRole()
      return ctx.rpc<Quote>('finalize_quote', { p_quote: quoteId })
    },

    async createProjectFromQuote(quoteId: UUID): Promise<Project> {
      const me = await ctx.assertQuoteRole()
      const quote = await mustFindQuote(ctx, quoteId)
      if (!quote.is_final) {
        throw new ProviderError('conflict', '확정된 견적에서만 행사를 만들 수 있습니다.')
      }
      const project = await materializeProjectFromQuote(ctx, quote, me.id)
      await ctx.log(project.id, 'project.created_from_quote', 'project', project.id, { quote_id: quote.id })
      return project
    },

    async exportQuoteXlsx(quoteId: UUID, lang: 'ko' | 'en' = 'ko'): Promise<QuoteExportResult> {
      await ctx.assertQuoteRole()
      const quote = await mustFindQuote(ctx, quoteId)
      const input = quote.input
      const cfg = toEngineConfig(input)
      const base = calcEstimate(input.include_leads ? cfg : { ...cfg, guarantee: 0 })
      const adjustments = effectiveAdjust(
        adjustmentDeltas(input.adjustments) as Record<string, number>,
        input.include_leads,
      )
      // 자동 외부 업로드 없음(§12 4중 차단 ③) — 저장 트리거는 UI가 modules/quote(saveQuoteFile)로 수행
      const { fn, blob } = await exportEstimate(cfg, base, {
        download: false,
        excludeLeads: !input.include_leads,
        lang,
        adjustments,
      })
      return { file_name: fn, blob }
    },

    // ── §22 견적서 임포트 (R-Q1~R-Q4) ────────────────────────────────

    /** 파싱·서식 감지 결과를 quote_imports에 저장한다. **quotes는 만들지 않는다**(R-Q1) */
    async importQuoteFile(fileName: string, data: ArrayBuffer): Promise<QuoteImport> {
      const me = await ctx.assertQuoteRole()
      const parsed = parseQuoteWorkbook(data, fileName)
      return ctx.q(
        await ctx.sb
          .from('quote_imports')
          .insert({
            project_id: null,
            file_name: fileName,
            format: parsed.format,
            parsed,
            mapping: defaultSectionMapping(parsed),
            status: 'detected',
            quote_id: null,
            created_by: me.id,
            created_at: nowIso(),
          })
          .select('*')
          .single(),
      ) as QuoteImport
    },

    /** R-Q1: confirm 경유 없이 quotes가 생기는 경로는 없다 — 임포트에서 quotes를 만드는 곳은 여기뿐 */
    async confirmQuoteImport(importId: UUID, input: QuoteImportConfirmInput): Promise<Quote> {
      const me = await ctx.assertQuoteRole()
      const imp = await mustFindQuoteImport(ctx, importId)
      if (imp.status !== 'detected') {
        throw new ProviderError('conflict', '이미 확정되었거나 배포된 임포트입니다.')
      }
      const mapping = input.mapping?.length ? input.mapping : imp.mapping
      const { breakdown, total_amount } = buildImportedBreakdown(imp.parsed, mapping)
      const now = nowIso()
      const quote = ctx.q(
        await ctx.sb
          .from('quotes')
          .insert({
            project_id: null,
            title: imp.parsed.header.event_name?.trim() || imp.file_name,
            version: 1,
            status: 'draft',
            is_final: false,
            locked_at: null,
            superseded_by: null,
            input: buildImportedQuoteInput(imp),
            breakdown,
            total_amount,
            source: 'imported',
            created_by: me.id,
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single(),
      ) as Quote
      ctx.ok(
        await ctx.sb
          .from('quote_imports')
          .update({ mapping, status: 'confirmed', quote_id: quote.id })
          .eq('id', imp.id),
      )
      return quote
    },

    /**
     * §22.4 분배 3종. project_prefill은 §16 매핑을 재사용하되 임포트 견적은 is_final을
     * 요구하지 않는다(프리필 목적). settlement_base·board_seed는 행사가 있어야 하고,
     * settlement_base는 확정 견적일 때만 허용한다(정산 스냅숏 규칙 §19.2 그대로).
     */
    async distributeQuoteImport(
      importId: UUID,
      input: QuoteImportDistributeInput,
    ): Promise<QuoteImportDistributeResult> {
      const me = await ctx.assertQuoteRole()
      const imp = await mustFindQuoteImport(ctx, importId)
      if (imp.status !== 'confirmed') {
        throw new ProviderError('conflict', '확인 큐를 거쳐 확정된 임포트만 배포할 수 있습니다.')
      }
      if (!imp.quote_id) throw new ProviderError('not_found', '연결된 견적이 없습니다.')
      const quote = await mustFindQuote(ctx, imp.quote_id)

      let project: Project | undefined = quote.project_id ? await ctx.project(quote.project_id) : undefined
      let prefilled = false

      if (input.project_prefill && !project) {
        project = await materializeProjectFromQuote(ctx, quote, me.id)
        prefilled = true
        await ctx.log(project.id, 'project.created_from_quote_import', 'project', project.id, {
          quote_id: quote.id,
          import_id: imp.id,
        })
      }

      let settlementCreated = false
      if (input.settlement_base) {
        if (!quote.is_final) {
          throw new ProviderError(
            'validation',
            '정산 기준은 확정된 견적만 가능합니다 — 먼저 이 견적을 확정하세요.',
          )
        }
        if (!project) {
          throw new ProviderError(
            'validation',
            '정산 기준을 적용할 행사가 없습니다 — 프리필을 함께 켜거나 먼저 행사를 연결하세요.',
          )
        }
        await createSettlementBoardCore(ctx, project.id, quote.id)
        settlementCreated = true
      }

      let seeded = 0
      if (input.board_seed) {
        if (!project) {
          throw new ProviderError(
            'validation',
            '보드 시드를 적용할 행사가 없습니다 — 프리필을 함께 켜거나 먼저 행사를 연결하세요.',
          )
        }
        seeded = await seedBoardFromImport(ctx, project.id, imp)
      }

      ctx.ok(
        await ctx.sb
          .from('quote_imports')
          .update(prefilled && project ? { status: 'distributed', project_id: project.id } : { status: 'distributed' })
          .eq('id', imp.id),
      )
      if (project) {
        await ctx.log(project.id, 'quote_import.distributed', 'quote_import', imp.id, {
          settlement_base: settlementCreated,
          board_seed: seeded,
        })
      }
      return {
        quote_id: quote.id,
        project_id: project?.id ?? null,
        settlement_created: settlementCreated,
        deliverables_seeded: seeded,
      }
    },
  }
}
