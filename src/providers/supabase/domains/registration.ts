// SupabaseProvider · 등록 도메인 (S4·S-12 — 설계서 §4-9·§4-10·§24) — 17메서드.
// RSVP·참관객 CRUD 7 + 구글 시트 연동 10. MockProvider(정본)와 같은 검증 순서·오류 code·한국어 메시지.
//
// 시트 → 앱 **단방향**(§24.6): 이 파일에 시트로 쓰는 코드는 없고 앞으로도 두지 않는다.
// 원본 행 읽기는 Vercel Function `${apiBase}/sheets`(op probe|preview|rows — 서비스 계정 자격증명은
// 서버에만)가 맡고, 연결·감지·반영은 RPC(connect_sheet·check_sheet_updates·refresh_sheet_source·
// apply_sheet_diff)가 한 트랜잭션으로 처리한다. 차이 계산은 mock의 순수 함수 computeSheetDiffRows를
// 그대로 재사용한다(SQL app.sheet_diff와 1:1 규칙).
import type { DataProvider } from '../../DataProvider'
import { SupabaseCtx, nowIso } from '../ctx'
import { ProviderError, type ErrorCode } from '../../../lib/errors'
import type {
  Attendee,
  RsvpContact,
  SheetColumnMapping,
  SheetConnection,
  SheetSourceRow,
  UUID,
} from '../../../types/entities'
import type {
  AttendeeWithRsvp,
  CsvImportResult,
  CsvImportRow,
  RegistrationStats,
  RsvpContactPatch,
  SheetApplyResult,
  SheetColumnPreview,
  SheetConnectInput,
  SheetDiff,
  SheetProbe,
  SheetRegistrationStats,
} from '../../../types/views'
import { SHEET_FIELD_LABELS, SHEET_REQUIRED_FIELDS, type SheetInvalidReason } from '../../../types/enums'
import { computeSheetDiffRows, mappedFields } from '../../mock/sheetSync'

type RegistrationMethods = Pick<
  DataProvider,
  | 'listRsvpContacts'
  | 'updateRsvpContact'
  | 'listAttendees'
  | 'importRegistrationCsv'
  | 'toggleCheckin'
  | 'convertRsvpToAttendee'
  | 'getRegistrationStats'
  | 'getSheetConnection'
  | 'probeSheet'
  | 'previewSheetColumns'
  | 'connectSheet'
  | 'disconnectSheet'
  | 'reauthorizeSheet'
  | 'checkSheetUpdates'
  | 'getSheetDiff'
  | 'applySheetDiff'
  | 'getSheetRegistrationStats'
>

const SHEET_URL_RE = /^https?:\/\/\S+$/
const ERROR_CODES: readonly ErrorCode[] = ['validation', 'forbidden', 'not_found', 'conflict', 'gone']

/** `${apiBase}/sheets` 응답 계약 (메인이 작성하는 서버 함수 — 자격증명 없으면 mock과 같은 데모 값) */
interface SheetsProbeResponse {
  probe: SheetProbe
}
interface SheetsPreviewResponse {
  columns: SheetColumnPreview[]
}
interface SheetsRowsResponse {
  /** sheet_source_rows 행 형태(SheetSourceRow와 동형) — RPC p_rows에 그대로 넘긴다 */
  rows: Record<string, unknown>[]
  source_modified_at: string | null
}
interface SheetsErrorBody {
  error?: { code?: string; message?: string }
}

/** DB 행(sheet_source_rows) = mock SheetSourceRow + 서버 적재 열(row_number) */
type SourceRowRecord = SheetSourceRow & { row_number: number | null }

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}

function codeFromStatus(status: number): ErrorCode {
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 410) return 'gone'
  return 'validation'
}

/**
 * attendees 행 → Attendee. 시트 확장 열은 TS에서 optional(undefined)이고 DB는 null이라
 * `sheet_row_id`·`sheet_status`만 undefined로 맞춘다(title·group_tag·note는 타입이 `| null`).
 */
function toAttendee(row: Record<string, unknown>): Attendee {
  const a = row as unknown as Attendee & {
    sheet_row_id: string | null
    sheet_status: Attendee['sheet_status'] | null
  }
  return {
    ...a,
    sheet_row_id: a.sheet_row_id ?? undefined,
    sheet_status: a.sheet_status ?? undefined,
  }
}

function toSourceRow(row: Record<string, unknown>): SourceRowRecord {
  const r = row as unknown as SourceRowRecord & {
    invalid_reason: SheetInvalidReason | null
    previously_confirmed: boolean | null
  }
  return {
    ...r,
    invalid_reason: r.invalid_reason ?? undefined,
    previously_confirmed: r.previously_confirmed ?? false,
  }
}

/**
 * 차이 비교에 넘길 매핑. DB 매핑은 Phase 4 확장으로 'sheet_status'(신청 상태 컬럼)를 허용하지만
 * TS SheetMappedField 7종에는 없다 — SQL app.sheet_diff도 이 필드를 비교 대상에서 빼므로 같은 규칙으로 걷어낸다
 * (상태는 mappedFields와 무관하게 항상 함께 비교된다).
 */
function diffMapping(mapping: SheetColumnMapping[]): SheetColumnMapping[] {
  return mapping.filter((m) => (m.field as string | null) !== 'sheet_status')
}

/**
 * 연결 행의 first_row_is_header(0500 열)를 우선 쓰고, 없는 옛 행만 매핑 열 이름으로 추정한다.
 * 매핑 컬럼이 전부 열 문자(A·B·AA)면 헤더 없는 시트였다고 본다.
 */
function inferFirstRowIsHeader(mapping: SheetColumnMapping[]): boolean {
  if (mapping.length === 0) return true
  return !mapping.every((m) => /^[A-Z]{1,3}$/.test(m.column))
}

function emailOrNull(value: string | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

export function registrationDomain(ctx: SupabaseCtx): RegistrationMethods {
  // ── 행 조회 도우미 (mock의 mustFind* — 404 메시지 동일) ─────────────
  async function rsvpRow(rsvpId: UUID): Promise<RsvpContact> {
    return ctx.q(
      await ctx.sb.from('rsvp_contacts').select('*').eq('id', rsvpId).maybeSingle(),
      'RSVP 대상을 찾을 수 없습니다.',
    ) as RsvpContact
  }

  async function attendeeRow(attendeeId: UUID): Promise<Attendee> {
    return toAttendee(
      ctx.q(
        await ctx.sb.from('attendees').select('*').eq('id', attendeeId).maybeSingle(),
        '참관객을 찾을 수 없습니다.',
      ) as Record<string, unknown>,
    )
  }

  async function attendeesOf(projectId: UUID): Promise<Attendee[]> {
    const rows = ctx.q(
      await ctx.sb.from('attendees').select('*').eq('project_id', projectId).order('registered_at').order('id'),
    ) as Record<string, unknown>[]
    return rows.map(toAttendee)
  }

  async function sheetConnOf(projectId: UUID): Promise<SheetConnection | null> {
    const rows = ctx.q(
      await ctx.sb.from('sheet_connections').select('*').eq('project_id', projectId).limit(1),
    ) as SheetConnection[]
    return rows[0] ?? null
  }

  async function mustSheetConn(projectId: UUID): Promise<SheetConnection> {
    await ctx.project(projectId)
    const conn = await sheetConnOf(projectId)
    if (!conn) throw new ProviderError('not_found', '연결된 시트가 없습니다.')
    return conn
  }

  async function sourceRowsOf(projectId: UUID): Promise<SourceRowRecord[]> {
    const rows = ctx.q(
      await ctx.sb
        .from('sheet_source_rows')
        .select('*')
        .eq('project_id', projectId)
        .order('row_number', { nullsFirst: false })
        .order('sheet_row_id'),
    ) as Record<string, unknown>[]
    return rows.map(toSourceRow)
  }

  // ── 시트 읽기 서버 함수 호출 ─────────────────────────────────────────
  async function accessToken(): Promise<string> {
    const token = (await ctx.sb.auth.getSession()).data.session?.access_token
    if (!token) throw new ProviderError('forbidden', '로그인이 필요합니다.')
    return token
  }

  async function sheetsApi<T>(token: string, body: Record<string, unknown>): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${ctx.env.apiBase}/sheets`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ProviderError('validation', '시트 읽기 서버에 연결할 수 없습니다 — 잠시 후 다시 시도해 주세요.')
    }
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      const err = (json as SheetsErrorBody | null)?.error
      const code = isErrorCode(err?.code) ? err.code : codeFromStatus(res.status)
      throw new ProviderError(code, err?.message || `시트 읽기 요청이 실패했습니다 (HTTP ${res.status}).`)
    }
    if (json === null || typeof json !== 'object') {
      throw new ProviderError('validation', '시트 읽기 서버의 응답을 해석할 수 없습니다.')
    }
    return json as T
  }

  /** mock probeSheet와 같은 순서 — 행사 404 → URL 형식 → 서버 확인 */
  async function probe(projectId: UUID, url: string): Promise<SheetProbe> {
    await ctx.project(projectId)
    const trimmed = url.trim()
    if (!SHEET_URL_RE.test(trimmed)) {
      throw new ProviderError('validation', '시트 URL을 확인해 주세요 — http로 시작하는 주소여야 합니다.')
    }
    const token = await accessToken()
    const { probe } = await sheetsApi<SheetsProbeResponse>(token, { op: 'probe', project_id: projectId, url: trimmed })
    return probe
  }

  /**
   * 읽기 권한이 끊긴 것을 서버가 403/410으로 알리면 연결을 revoked로 내린다(§24 상태 4종의 '권한 끊김').
   * 스냅숏·참관객은 그대로 — 실패 시각만 최근 5건 쌓는다(mock check의 revoked 분기와 같은 모양).
   * mock에는 simulateSheetRevoke(테스트 스위치)만 있고 실제 전이 경로가 없어 여기서 채운다.
   */
  async function markRevoked(conn: SheetConnection): Promise<SheetConnection> {
    const now = nowIso()
    const failure_times = [...conn.failure_times, now].slice(-5)
    return ctx.q(
      await ctx.sb
        .from('sheet_connections')
        .update({ state: 'revoked', checked_at: now, failure_times })
        .eq('id', conn.id)
        .select('*')
        .single(),
    ) as SheetConnection
  }

  return {
    // ── 등록 (pm·reg — §6.1 등록 데이터 CRUD) ─────────────────────────
    async listRsvpContacts(projectId: UUID): Promise<RsvpContact[]> {
      await ctx.project(projectId)
      return ctx.q(await ctx.sb.from('rsvp_contacts').select('*').eq('project_id', projectId)) as RsvpContact[]
    },

    async updateRsvpContact(rsvpId: UUID, patch: RsvpContactPatch): Promise<RsvpContact> {
      // 행에서 project_id를 알아야 역할을 판정할 수 있어 404 → 403 순서다(mock은 403 → 404)
      const r = await rsvpRow(rsvpId)
      await ctx.assertReg(r.project_id)
      await ctx.assertWritable(r.project_id)
      const upd: Record<string, unknown> = {}
      if (patch.invite_status !== undefined) {
        upd.invite_status = patch.invite_status
        if (patch.invite_status === 'sent' && !r.invited_at) upd.invited_at = nowIso()
        if ((patch.invite_status === 'accepted' || patch.invite_status === 'declined') && !r.responded_at) {
          upd.responded_at = nowIso()
        }
      }
      if (patch.invited_at !== undefined) upd.invited_at = patch.invited_at
      if (patch.responded_at !== undefined) upd.responded_at = patch.responded_at
      if (patch.group_tag !== undefined) upd.group_tag = patch.group_tag
      if (patch.memo !== undefined) upd.memo = patch.memo
      if (Object.keys(upd).length === 0) return r
      return ctx.q(
        await ctx.sb.from('rsvp_contacts').update(upd).eq('id', rsvpId).select('*').single(),
      ) as RsvpContact
    },

    async listAttendees(projectId: UUID): Promise<AttendeeWithRsvp[]> {
      await ctx.project(projectId)
      const [attendees, rsvps] = await Promise.all([
        attendeesOf(projectId),
        ctx.sb.from('rsvp_contacts').select('id, group_tag').eq('project_id', projectId),
      ])
      const groupTagByRsvp = new Map(
        (ctx.q(rsvps) as { id: UUID; group_tag: string | null }[]).map((r) => [r.id, r.group_tag]),
      )
      return attendees.map((a) => ({
        ...a,
        rsvp_group_tag: a.rsvp_contact_id ? (groupTagByRsvp.get(a.rsvp_contact_id) ?? null) : null,
      }))
    },

    async importRegistrationCsv(
      projectId: UUID,
      target: 'rsvp' | 'attendees',
      rows: CsvImportRow[],
    ): Promise<CsvImportResult> {
      await ctx.assertReg(projectId)
      await ctx.assertWritable(projectId)
      const table = target === 'rsvp' ? 'rsvp_contacts' : 'attendees'
      const existing = ctx.q(
        await ctx.sb.from(table).select('id, email').eq('project_id', projectId),
      ) as { id: UUID; email: string | null }[]

      // email(소문자) 기준 upsert(§11). 같은 CSV 안의 중복 email은 mock처럼 첫 행 삽입 · 이후 행 갱신으로 센다
      const byEmail = new Map<string, { id: UUID | null; insert?: Record<string, unknown> }>()
      for (const e of existing) {
        const key = e.email?.trim().toLowerCase()
        if (key && !byEmail.has(key)) byEmail.set(key, { id: e.id })
      }
      const inserts: Record<string, unknown>[] = []
      const updates = new Map<UUID, Record<string, unknown>>()
      let inserted = 0
      let updated = 0

      for (const row of rows) {
        if (!row.name?.trim()) continue
        const emailKey = row.email?.trim().toLowerCase() || null
        const hit = emailKey ? byEmail.get(emailKey) : undefined
        if (hit) {
          // 갱신은 mock과 같은 필드만: rsvp = name·org·title·phone·group_tag·memo / attendees = name·org·phone
          const patch: Record<string, unknown> = { name: row.name }
          if (row.org !== undefined) patch.org = row.org
          if (row.phone !== undefined) patch.phone = row.phone
          if (target === 'rsvp') {
            if (row.title !== undefined) patch.title = row.title
            if (row.group_tag !== undefined) patch.group_tag = row.group_tag
            if (row.memo !== undefined) patch.memo = row.memo
          }
          if (hit.id) updates.set(hit.id, { ...(updates.get(hit.id) ?? {}), ...patch })
          else if (hit.insert) Object.assign(hit.insert, patch)
          updated++
          continue
        }
        // 빈 문자열 email은 null로 — 부분 유일 인덱스 (project_id, lower(email))가 ''끼리 충돌하지 않도록
        const ins: Record<string, unknown> =
          target === 'rsvp'
            ? {
                project_id: projectId,
                name: row.name,
                org: row.org ?? null,
                title: row.title ?? null,
                email: emailOrNull(row.email),
                phone: row.phone ?? null,
                group_tag: row.group_tag ?? null,
                invite_status: 'none',
                invited_at: null,
                responded_at: null,
                memo: row.memo ?? null,
              }
            : {
                project_id: projectId,
                rsvp_contact_id: null,
                name: row.name,
                org: row.org ?? null,
                email: emailOrNull(row.email),
                phone: row.phone ?? null,
                channel: 'import',
                registered_at: nowIso(),
                checked_in_at: null,
                badge_no: null,
              }
        inserts.push(ins)
        if (emailKey) byEmail.set(emailKey, { id: null, insert: ins })
        inserted++
      }

      if (inserts.length > 0) ctx.ok(await ctx.sb.from(table).insert(inserts))
      for (const [id, upd] of updates) ctx.ok(await ctx.sb.from(table).update(upd).eq('id', id))
      return { inserted, updated }
    },

    async toggleCheckin(attendeeId: UUID): Promise<Attendee> {
      const a = await attendeeRow(attendeeId)
      await ctx.assertReg(a.project_id)
      await ctx.assertWritable(a.project_id)
      return toAttendee(
        ctx.q(
          await ctx.sb
            .from('attendees')
            .update({ checked_in_at: a.checked_in_at ? null : nowIso() })
            .eq('id', attendeeId)
            .select('*')
            .single(),
        ) as Record<string, unknown>,
      )
    },

    async convertRsvpToAttendee(rsvpId: UUID): Promise<Attendee> {
      const r = await rsvpRow(rsvpId)
      await ctx.assertReg(r.project_id)
      await ctx.assertWritable(r.project_id)
      const dup = ctx.q(
        await ctx.sb.from('attendees').select('id').eq('rsvp_contact_id', rsvpId).limit(1),
      ) as { id: UUID }[]
      if (dup.length > 0) throw new ProviderError('conflict', '이미 참관객으로 전환된 대상입니다.')
      return toAttendee(
        ctx.q(
          await ctx.sb
            .from('attendees')
            .insert({
              project_id: r.project_id,
              rsvp_contact_id: r.id,
              name: r.name,
              org: r.org,
              email: r.email,
              phone: r.phone,
              channel: 'rsvp',
              registered_at: nowIso(),
              checked_in_at: null,
              badge_no: null,
            })
            .select('*')
            .single(),
        ) as Record<string, unknown>,
      )
    },

    async getRegistrationStats(projectId: UUID): Promise<RegistrationStats> {
      await ctx.project(projectId)
      const [rsvpRes, attRes] = await Promise.all([
        ctx.sb.from('rsvp_contacts').select('invite_status').eq('project_id', projectId),
        ctx.sb.from('attendees').select('checked_in_at').eq('project_id', projectId),
      ])
      const rsvps = ctx.q(rsvpRes) as { invite_status: RsvpContact['invite_status'] }[]
      const attendees = ctx.q(attRes) as { checked_in_at: string | null }[]
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
    },

    // ── 등록 · 구글 시트 연동 (S4, v2.6 §24) — 시트로 쓰는 메서드는 없다(§24.6) ───────
    async getSheetConnection(projectId: UUID): Promise<SheetConnection | null> {
      await ctx.project(projectId)
      return sheetConnOf(projectId)
    },

    async probeSheet(projectId: UUID, url: string): Promise<SheetProbe> {
      return probe(projectId, url)
    },

    async previewSheetColumns(projectId: UUID, url: string, tabName: string): Promise<SheetColumnPreview[]> {
      // 탭 존재('해당 이름의 탭을 찾을 수 없습니다.')·표 형태('표 형태가 아닌 탭입니다 — …') 판정은 서버가
      // 같은 code·문구로 낸다 — probe를 한 번 더 왕복하지 않는다. 행사 404·URL 형식만 앱에서 먼저 본다
      await ctx.project(projectId)
      const trimmed = url.trim()
      if (!SHEET_URL_RE.test(trimmed)) {
        throw new ProviderError('validation', '시트 URL을 확인해 주세요 — http로 시작하는 주소여야 합니다.')
      }
      const token = await accessToken()
      const { columns } = await sheetsApi<SheetsPreviewResponse>(token, {
        op: 'preview',
        project_id: projectId,
        url: trimmed,
        tab_name: tabName,
      })
      return columns
    },

    async connectSheet(projectId: UUID, input: SheetConnectInput): Promise<SheetConnection> {
      await ctx.assertReg(projectId)
      await ctx.assertWritable(projectId)
      if (await sheetConnOf(projectId)) {
        throw new ProviderError('conflict', '이미 연결된 시트가 있습니다 — 연결을 해제한 뒤 다시 연결해 주세요.')
      }
      const probed = await probe(projectId, input.url)
      const tab = probed.tabs.find((t) => t.name === input.tab_name)
      if (!tab || !tab.selectable) {
        throw new ProviderError('validation', '명단으로 쓸 수 있는 탭을 선택해 주세요.')
      }
      const mapped = mappedFields(input.mapping)
      const missing = SHEET_REQUIRED_FIELDS.filter((f) => !mapped.includes(f))
      if (missing.length > 0) {
        const labels = missing.map((f) => SHEET_FIELD_LABELS[f]).join('·')
        throw new ProviderError('validation', `필수 매핑이 없습니다 — ${labels} 컬럼을 지정해 주세요.`)
      }
      // 최초 적재는 사람이 위저드로 명시한 행동이라 그 자리에서 읽어 온다(§24.1-2 — RPC는 **추가만** 한다)
      const token = await accessToken()
      const fetched = await sheetsApi<SheetsRowsResponse>(token, {
        op: 'rows',
        project_id: projectId,
        url: input.url.trim(),
        tab_name: input.tab_name,
        mapping: input.mapping,
        first_row_is_header: input.first_row_is_header,
      })
      // snapshot_at의 근거는 실제로 적재한 행의 원본 수정 시각(R-S3) — rows가 준 값을 probe 값보다 우선한다
      const probeForRpc: SheetProbe = {
        ...probed,
        source_modified_at: fetched.source_modified_at ?? probed.source_modified_at,
      }
      // 로그('sheet.connected', tab_name·seeded)는 RPC가 남긴다
      return ctx.rpc<SheetConnection>('connect_sheet', {
        p_project: projectId,
        p_input: input,
        p_probe: probeForRpc,
        p_rows: fetched.rows,
      })
    },

    async disconnectSheet(projectId: UUID): Promise<void> {
      await ctx.assertReg(projectId)
      await ctx.assertWritable(projectId)
      const conn = await mustSheetConn(projectId)
      // 참관객 행은 남긴다(이력 보존) — 시트 소유 필드도 마지막 스냅숏 그대로 둔다
      ctx.ok(await ctx.sb.from('sheet_connections').delete().eq('id', conn.id))
      await ctx.log(projectId, 'sheet.disconnected', 'sheet_connection', conn.id)
    },

    async reauthorizeSheet(projectId: UUID): Promise<SheetConnection> {
      await ctx.assertReg(projectId)
      await ctx.assertWritable(projectId)
      const conn = await mustSheetConn(projectId)
      const now = nowIso()
      // state를 먼저 connected로 돌려야 check_sheet_updates가 revoked 분기(실패 시각 적재)로 가지 않는다
      ctx.ok(
        await ctx.sb
          .from('sheet_connections')
          .update({ state: 'connected', failure_times: [], checked_at: now, last_success_at: now })
          .eq('id', conn.id),
      )
      const refreshed = await ctx.rpc<SheetConnection>('check_sheet_updates', { p_project: projectId })
      await ctx.log(projectId, 'sheet.reauthorized', 'sheet_connection', conn.id)
      return refreshed
    },

    async checkSheetUpdates(projectId: UUID): Promise<SheetConnection> {
      const conn = await mustSheetConn(projectId)
      if (conn.state === 'revoked') {
        // 권한이 끊긴 동안에는 읽기 자체가 실패한다 — RPC가 실패 시각만 쌓고 스냅숏은 그대로 둔다
        return ctx.rpc<SheetConnection>('check_sheet_updates', { p_project: projectId })
      }
      const token = await accessToken()
      let fetched: SheetsRowsResponse
      try {
        fetched = await sheetsApi<SheetsRowsResponse>(token, {
          op: 'rows',
          project_id: projectId,
          url: conn.url,
          tab_name: conn.tab_name,
          mapping: conn.mapping,
          first_row_is_header: (conn as SheetConnection & { first_row_is_header?: boolean }).first_row_is_header ?? inferFirstRowIsHeader(conn.mapping),
        })
      } catch (e) {
        if (e instanceof ProviderError && (e.code === 'forbidden' || e.code === 'gone')) return markRevoked(conn)
        throw e
      }
      // 원본 행 교체 → 감지(pending·state·checked_at)까지 RPC 한 번. 참관객 데이터는 건드리지 않는다(R-S2)
      return ctx.rpc<SheetConnection>('refresh_sheet_source', {
        p_project: projectId,
        p_rows: fetched.rows,
        p_source_modified_at: fetched.source_modified_at ?? null,
      })
    },

    async getSheetDiff(projectId: UUID): Promise<SheetDiff> {
      const conn = await mustSheetConn(projectId)
      const [sourceRows, attendees] = await Promise.all([sourceRowsOf(projectId), attendeesOf(projectId)])
      const rows = computeSheetDiffRows({ mapping: diffMapping(conn.mapping), sourceRows, attendees })
      return {
        snapshot_at: conn.snapshot_at,
        snapshot_version: conn.snapshot_version,
        source_modified_at: conn.source_modified_at,
        rows,
        added: rows.filter((r) => r.kind === 'added').length,
        changed: rows.filter((r) => r.kind === 'changed').length,
        removed: rows.filter((r) => r.kind === 'removed').length,
      }
    },

    async applySheetDiff(projectId: UUID, snapshotVersion: number): Promise<SheetApplyResult> {
      // 앱 계층 단언은 mock과 같은 메시지를 먼저 내기 위한 것 — RPC가 같은 규칙(revoked 403·버전 409·
      // 앱 소유 필드 보존·removed 이력)을 트랜잭션으로 다시 강제하고 'sheet.applied' 로그를 남긴다
      await ctx.assertReg(projectId)
      await ctx.assertWritable(projectId)
      return ctx.rpc<SheetApplyResult>('apply_sheet_diff', {
        p_project: projectId,
        p_snapshot_version: snapshotVersion,
      })
    },

    async getSheetRegistrationStats(projectId: UUID): Promise<SheetRegistrationStats | null> {
      await ctx.project(projectId)
      const conn = await sheetConnOf(projectId)
      if (!conn) return null // 미연결 — 화면은 기존 getRegistrationStats로 폴백한다
      const [linkedRes, rows] = await Promise.all([
        ctx.sb.from('attendees').select('*').eq('project_id', projectId).not('sheet_row_id', 'is', null),
        sourceRowsOf(projectId),
      ])
      const linked = (ctx.q(linkedRes) as Record<string, unknown>[])
        .map(toAttendee)
        .filter((a) => a.sheet_row_id && a.sheet_status !== 'removed')
      const bySourceRow = new Map(rows.map((r) => [r.sheet_row_id, r]))
      const confirmed = linked.filter((a) => a.sheet_status === 'confirmed').length
      const cancelled = linked.filter((a) => a.sheet_status === 'cancelled')
      const checkedIn = linked.filter((a) => a.checked_in_at).length
      const applied = linked.length
      // 3.17.1 T3 — 적재되지 못한 행은 목록으로. row_number는 서버가 적재한 원본 위치(없으면 순서)
      const excludedRows = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.invalid_reason)
        .map(({ row, index }) => ({
          sheet_row_id: row.sheet_row_id,
          row_number: row.row_number ?? index + 1,
          reason: row.invalid_reason as SheetInvalidReason,
          name: row.name,
          org: row.org,
          email: row.email,
          phone: row.phone,
        }))
      return {
        applied,
        confirmed,
        cancelled: cancelled.length,
        checked_in: checkedIn,
        source_rows: rows.length,
        excluded: excludedRows.length,
        confirm_rate: applied === 0 ? 0 : confirmed / applied,
        checkin_rate: confirmed === 0 ? 0 : checkedIn / confirmed,
        cancelled_after_confirm: cancelled.filter(
          (a) => bySourceRow.get(a.sheet_row_id as string)?.previously_confirmed,
        ).length,
        snapshot_at: conn.snapshot_at,
        pending_added: conn.pending_added,
        pending_removed: conn.pending_removed,
        excluded_rows: excludedRows,
      }
    },
  }
}
