// 마스터 시트 조립 입력 읽기 — **사용자 JWT로 RLS 아래**(설계서 v2.21 §27.5 · Phase 6.11 PR-G).
// 서버가 권한을 새로 발명하지 않는다: 행사가 안 보이면(비멤버) projects가 0행 → 404 · 표마다 RLS 정책이 거른다 · 견적·정산은
// 요청자가 pm·admin일 때만(R-M3 — 핸들러가 include_money를 정한다) 읽는다. 열 이름은 §4 스키마 = 타입 1:1(SupabaseProvider와 같은 select *).
// 명단(rsvp_contacts·attendees)은 **개수만** 세고 이름·연락처는 어디에도 담지 않는다(R-M2). 테스트는 이 인터페이스의 메모리 구현으로 돈다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { bucketActual, bucketMarkup, bucketMarkupRate, bucketOrdered, computeTotals, isOverBudget } from '../../../src/lib/settlement.js'
import type { MemberRole } from '../../../src/types/enums'
import type {
  Deliverable,
  GuideSection,
  LandingPage,
  Milestone,
  Project,
  RoleCharter,
  SettlementBoard,
  SettlementBucket,
  SettlementItem,
  SheetConnection,
  WbsTask,
} from '../../../src/types/entities'
import type { RegistrationStats, SheetRegistrationStats } from '../../../src/types/views'
import type { MasterSheetSource } from '../../../src/lib/masterSheet/types'
import { DriveError } from '../drive/errors.js'
import type { StoreEnv } from '../drive/store.js'

export interface MasterSheetReader {
  /** 행사가 안 보이면(RLS) null → 404 */
  read(projectId: string, opts: { include_money: boolean }): Promise<MasterSheetSource | null>
  /** activity_log `master_sheet.exported`(파일 이름·탭 이름만 — 금액 0) · best-effort */
  log(projectId: string, actor: string, meta: { file_name: string; tabs: string[] }): Promise<void>
}

type Res<T> = { data: T | null; error: { message: string } | null }

/** 목록 응답 — 오류면 502 · data가 없으면 [] */
function must<T>(res: Res<T>, what: string): T {
  if (res.error) throw new DriveError(502, 'validation', `${what} — ${res.error.message}`)
  return (res.data ?? ([] as unknown as T)) as T
}

/** 단건 응답(maybeSingle) — 오류면 502 · 없으면 null 그대로(RLS로 안 보이는 행사 = 404의 근거) */
function single<T>(res: Res<T>, what: string): T | null {
  if (res.error) throw new DriveError(502, 'validation', `${what} — ${res.error.message}`)
  return res.data ?? null
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/** RSVP 기준 통계 — SupabaseProvider.getRegistrationStats와 같은 식 */
export function rsvpStats(rsvps: readonly { invite_status: string }[], attendees: readonly { checked_in_at: string | null }[]): RegistrationStats {
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

export interface AttendeeStatRow {
  checked_in_at: string | null
  sheet_row_id: string | null
  sheet_status: string | null
}
export interface SourceStatRow {
  sheet_row_id: string
  invalid_reason: string | null
  previously_confirmed: boolean | null
}

/** 시트 기준 통계 — SupabaseProvider.getSheetRegistrationStats와 같은 식(제외 목록은 싣지 않는다 — 명단) */
export function sheetStats(
  conn: Pick<SheetConnection, 'snapshot_at' | 'pending_added' | 'pending_removed'>,
  attendees: readonly AttendeeStatRow[],
  rows: readonly SourceStatRow[],
): SheetRegistrationStats {
  const linked = attendees.filter((a) => a.sheet_row_id && a.sheet_status !== 'removed')
  const bySourceRow = new Map(rows.map((r) => [r.sheet_row_id, r]))
  const confirmed = linked.filter((a) => a.sheet_status === 'confirmed').length
  const cancelled = linked.filter((a) => a.sheet_status === 'cancelled')
  const checkedIn = linked.filter((a) => a.checked_in_at).length
  const applied = linked.length
  const excluded = rows.filter((r) => r.invalid_reason).length
  return {
    applied,
    confirmed,
    cancelled: cancelled.length,
    checked_in: checkedIn,
    source_rows: rows.length,
    excluded,
    confirm_rate: applied === 0 ? 0 : confirmed / applied,
    checkin_rate: confirmed === 0 ? 0 : checkedIn / confirmed,
    cancelled_after_confirm: cancelled.filter((a) => bySourceRow.get(a.sheet_row_id as string)?.previously_confirmed).length,
    snapshot_at: conn.snapshot_at,
    pending_added: conn.pending_added,
    pending_removed: conn.pending_removed,
    excluded_rows: [],
  }
}

/** 정산보드 화면과 같은 조립(SupabaseProvider.buildBoardView) — 마진 식은 lib/settlement 정본 */
export function settlementView(board: SettlementBoard, buckets: SettlementBucket[], items: SettlementItem[], quote: { title: string; version: number } | null) {
  return {
    board,
    quote_label: quote ? `${quote.title} v${quote.version}` : null,
    buckets: [...buckets]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((bucket) => ({
        bucket,
        items: items.filter((i) => i.bucket_id === bucket.id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
        ordered: bucketOrdered(bucket, items),
        actual: bucketActual(bucket, items),
        markup: bucketMarkup(bucket, items),
        markup_rate: bucketMarkupRate(bucket, items),
        over_budget: isOverBudget(bucket, items),
      })),
    totals: computeTotals(buckets, items),
  }
}

interface MemberRow {
  project_id: string
  user_id: string
  role: MemberRole
  profiles: { id: string; display_name: string; title: string | null } | { id: string; display_name: string; title: string | null }[] | null
}

export function supabaseMasterSheetReader(env: StoreEnv, jwt: string): MasterSheetReader {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishable) {
    throw new DriveError(500, 'validation', '서버 자격증명이 설정되지 않았습니다 (SUPABASE_URL·VITE_SUPABASE_PUBLISHABLE_KEY).')
  }
  const sb: SupabaseClient = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  return {
    async read(projectId, opts) {
      const project = single(await sb.from('projects').select('*').eq('id', projectId).maybeSingle(), '행사 읽기') as Project | null
      if (!project) return null

      const [memberRows, tasks, milestones, charters, deliverables, landings, rsvps, attendees, conns] = await Promise.all([
        sb.from('project_members').select('project_id, user_id, role, profiles(id, display_name, title)').eq('project_id', projectId),
        sb.from('wbs_tasks').select('*').eq('project_id', projectId).order('sort_order'),
        sb.from('milestones').select('*').eq('project_id', projectId).order('due_date'),
        sb.from('role_charters').select('*').eq('project_id', projectId),
        sb.from('deliverables').select('*').eq('project_id', projectId).order('created_at').order('id'),
        sb.from('landing_pages').select('title, status, public_url').eq('project_id', projectId).order('updated_at', { ascending: false }),
        sb.from('rsvp_contacts').select('invite_status').eq('project_id', projectId),
        sb.from('attendees').select('checked_in_at, sheet_row_id, sheet_status').eq('project_id', projectId),
        sb.from('sheet_connections').select('state, title, url, tab_name, snapshot_at, pending_added, pending_removed').eq('project_id', projectId).limit(1),
      ])
      const members = (must(memberRows as Res<MemberRow[]>, '담당자 읽기') as MemberRow[]).flatMap((m) => {
        const p = one(m.profiles)
        return p ? [{ user_id: m.user_id, role: m.role, name: p.display_name, title: p.title ?? null }] : []
      })
      const wbs = must(tasks as Res<WbsTask[]>, 'WBS 읽기') as WbsTask[]
      const ms = must(milestones as Res<Milestone[]>, '마일스톤 읽기') as Milestone[]
      const rc = must(charters as Res<RoleCharter[]>, 'R&R 읽기') as RoleCharter[]
      const dl = must(deliverables as Res<Deliverable[]>, '항목 읽기') as Deliverable[]
      const lp = must(landings as Res<Pick<LandingPage, 'title' | 'status' | 'public_url'>[]>, '랜딩 읽기') as Pick<LandingPage, 'title' | 'status' | 'public_url'>[]
      const rs = must(rsvps as Res<{ invite_status: string }[]>, '초대 읽기') as { invite_status: string }[]
      const at = must(attendees as Res<AttendeeStatRow[]>, '참관객 읽기') as AttendeeStatRow[]
      const conn = (must(conns as Res<Pick<SheetConnection, 'state' | 'title' | 'url' | 'tab_name' | 'snapshot_at' | 'pending_added' | 'pending_removed'>[]>, '등록 시트 읽기') as Pick<
        SheetConnection,
        'state' | 'title' | 'url' | 'tab_name' | 'snapshot_at' | 'pending_added' | 'pending_removed'
      >[])[0] ?? null

      // 최신 버전(항목마다 version_no 최대) + 담당자·R&R 사람 이름(주소록 — 이름만)
      const ids = dl.map((d) => d.id)
      const latest = new Map<string, { version_no: number; file_name: string; created_at: string }>()
      if (ids.length) {
        const vs = must(
          await sb.from('versions').select('deliverable_id, version_no, file_name, created_at').in('deliverable_id', ids).order('version_no', { ascending: false }),
          '버전 읽기',
        ) as { deliverable_id: string; version_no: number; file_name: string; created_at: string }[]
        for (const v of vs) if (!latest.has(v.deliverable_id)) latest.set(v.deliverable_id, { version_no: v.version_no, file_name: v.file_name, created_at: v.created_at })
      }
      const personIds = [...new Set([...dl.map((d) => d.assignee_id), ...rc.flatMap((c) => (c.people ?? []).map((p) => p.person_id))].filter((x): x is string => !!x))]
      const names = new Map<string, string>()
      if (personIds.length) {
        const ps = must(await sb.from('profiles').select('id, display_name').in('id', personIds), '주소록 읽기') as { id: string; display_name: string }[]
        for (const p of ps) names.set(p.id, p.display_name)
      }

      // 빌더 데이터를 가진 첫 운영가이드(getPlan과 같은 규칙) — 연락망 제외
      const guideIds = dl.filter((d) => d.category === '운영가이드').map((d) => d.id)
      let guide: GuideSection[] = []
      if (guideIds.length) {
        const sections = must(await sb.from('guide_sections').select('*').in('deliverable_id', guideIds).order('sort_order'), '운영가이드 읽기') as GuideSection[]
        const first = guideIds.find((id) => sections.some((s) => s.deliverable_id === id))
        guide = first ? sections.filter((s) => s.deliverable_id === first && s.kind !== 'contacts') : []
      }

      let sheet: SheetRegistrationStats | null = null
      if (conn) {
        const rows = must(await sb.from('sheet_source_rows').select('sheet_row_id, invalid_reason, previously_confirmed').eq('project_id', projectId), '시트 원본 읽기') as SourceStatRow[]
        sheet = sheetStats(conn, at, rows)
      }

      let settlement: MasterSheetSource['settlement'] = null
      if (opts.include_money) {
        const board = single(await sb.from('settlement_boards').select('*').eq('project_id', projectId).maybeSingle(), '정산보드 읽기') as SettlementBoard | null
        if (board) {
          const [bk, it] = await Promise.all([
            sb.from('settlement_buckets').select('*').eq('board_id', board.id).order('sort_order'),
            sb.from('settlement_items').select('*').eq('board_id', board.id),
          ])
          let quote: { title: string; version: number } | null = null
          if (board.quote_id) {
            // 견적 행은 RLS(영업·관리자·그 행사 pm)로 안 보일 수 있다 — 라벨만 비운다(보드는 그대로)
            const q = await sb.from('quotes').select('title, version').eq('id', board.quote_id).maybeSingle()
            quote = q.error ? null : ((q.data as { title: string; version: number } | null) ?? null)
          }
          settlement = settlementView(board, must(bk as Res<SettlementBucket[]>, '버킷 읽기') as SettlementBucket[], must(it as Res<SettlementItem[]>, '발주 항목 읽기') as SettlementItem[], quote)
        }
      }

      return {
        project,
        members,
        wbs_tasks: wbs,
        milestones: ms,
        role_charters: rc.map((c) => ({
          charter: c,
          people: (c.people ?? []).flatMap((p) => {
            const name = names.get(p.person_id)
            return name ? [{ name, display_role: p.display_role }] : []
          }),
        })),
        deliverables: dl.map((d) => ({ deliverable: d, latest_version: latest.get(d.id) ?? null, assignee_name: d.assignee_id ? names.get(d.assignee_id) ?? null : null })),
        guide_sections: guide,
        landing_pages: lp.map((l) => ({ title: l.title, status: l.status, public_url: l.public_url ?? null })),
        registration: {
          rsvp: rsvpStats(rs, at),
          sheet,
          sheet_link: conn ? { state: conn.state, title: conn.title, url: conn.url, tab_name: conn.tab_name, snapshot_at: conn.snapshot_at } : null,
        },
        settlement,
      }
    },

    async log(projectId, actor, meta) {
      const { error } = await sb.from('activity_log').insert({
        project_id: projectId,
        actor,
        action: 'master_sheet.exported',
        target_type: 'project',
        target_id: projectId,
        meta,
      })
      if (error) console.warn('[master-sheet] activity_log 기록 실패:', error.message)
    },
  }
}
