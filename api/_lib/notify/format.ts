// Slack 알림 문구 — 설계서 v2.10.1 §9 · Phase 6. 순수 함수만(테스트가 DB·네트워크 없이 문구·링크·금액 비노출을 본다).
// 형식(§9 · v2.17.1): `[행사명] [태그] 항목명 — 사건 (링크)`. 태그 = 운영 커뮤니케이션 프로토콜 v1.0 댓글 태그(Phase 6.3 [B2]):
//   디자인 영역 = [의뢰] [시안] [검토요청] [피드백] [확정] [납품] [일정] · 운영·공통 영역 = [제작] [결정] [WBS] · 운영 스레드의 디자인 소식 = [키비주얼].
// 한 번 보낼 때 같은 채널로 가는 줄을 한 메시지로 묶는다(줄 상한 — 넘치면 '…외 N건').
// 보낼 곳(v2.17.1): design 영역 행은 디자인 스레드(design_thread — 있을 때) → 없으면 운영 스레드. 컨펌 기한 D-1(발주처 재촉 = PM 몫)·
// 수동 리마인드·미등록 파일은 늘 운영 스레드. 디자인 스레드가 따로 있으면 운영 스레드에 `[키비주얼]` 확정·납품 한 줄을 더 남긴다(threadOnly).
// 금액은 싣지 않는다(§19.7) — 입력 행에 무엇이 더 붙어 와도 아래 화이트리스트 필드만 읽는다.
// v2.12(Phase 6.1): 봇 경로에서는 할 일이 생긴 사람을 멘션하고(mentions), 의뢰(제작 요청·검토 요청·파트너 제출)는 카드(card)로 보낸다.
// 줄(line)은 그대로 남아 웹훅 경로·카드 실패 대비의 본문이 된다 — 멘션은 보낼 때 붙인다(handler.renderLine).
import { normalizeBasePath } from '../../../src/lib/basePath.js'
import { parseSlackThreadLink, slackMessageLink } from '../../../src/lib/slackThread.js'
import { isSlackWebhookUrl } from '../../../src/lib/slackWebhook.js'
import type { CardSpec, Recipient, WorkCardItem } from './cards.js'

export { isSlackWebhookUrl }
export const MAX_LINES_PER_MESSAGE = 20

export type NotifyAction =
  | 'version.uploaded'
  | 'approval.requested'
  | 'approval.decided'
  | 'partner.submitted'
  | 'deliverable.requested'
  | 'status.transitioned'
  | 'drive.snapshot_copied'

/** notify_claim_events 한 행 */
export interface EventRow {
  key: string
  action: NotifyAction | string
  at?: string
  project_id: string
  project_code: string
  project_name: string
  webhook: string | null
  deliverable_id: string | null
  title: string | null
  area?: string | null
  version_no?: number | null
  decision?: string | null
  due_at?: string | null
  actor_name?: string | null
  assignee_name?: string | null
  partner_name?: string | null
  // v2.12 — 행사 스레드 · 멘션 대상 · 카드 필드
  thread?: string | null
  /** v2.17.1 [B2] — 디자인 채널의 행사 스레드(있으면 design 영역 행이 여기로) */
  design_thread?: string | null
  recipients?: Recipient[] | null
  category?: string | null
  due_date?: string | null
  brief?: string | null
  brief_ref_count?: number | null
  spec_size?: string | null
  spec_qty?: number | null
  spec_type?: string | null
  spec_location?: string | null
  file_name?: string | null
  version_note?: string | null
  client_comment?: string | null
}

export type ReminderKind = 'approval_due' | 'milestone_due' | 'partner_due' | 'inbox_digest' | 'deliverable_due' | 'unacked'

/** notify_claim_reminders 한 행 */
export interface ReminderRow {
  key: string
  kind: ReminderKind | string
  project_id: string
  project_code: string
  project_name: string
  webhook: string | null
  deliverable_id?: string | null
  title?: string | null
  due_at?: string | null
  due_date?: string | null
  partner_name?: string | null
  count?: number | null
  // v2.12
  thread?: string | null
  recipients?: Recipient[] | null
  // v2.17.1 [B2] — 행의 영역(design이면 디자인 스레드) · 디자인 스레드
  area?: string | null
  design_thread?: string | null
  request_kind?: 'work' | 'review' | string | null
  channel_id?: string | null
  message_ts?: string | null
  thread_ts?: string | null
}

/** notify_claim_manual 결과 */
export interface ManualRow {
  key: string
  kind: 'manual_delayed' | 'manual_approval' | string
  project_id: string
  project_code: string
  project_name: string
  webhook: string | null
  thread?: string | null
  design_thread?: string | null
  total: number
  items: { title: string; date: string | null; deliverable_id?: string | null }[]
}

/**
 * 한 줄 + 그 줄이 대표하는 선점 키들 + 보낼 곳. v2.12: 행사 스레드(thread — 봇) → 행사 웹훅 → 공용 웹훅 → 없음.
 * mentions = 줄 앞에 멘션할 사람 · quote = 줄 아래 인용 · card = 봇 경로에서 줄 대신 올릴 의뢰 카드.
 */
export interface MessageUnit {
  keys: string[]
  line: string | null
  webhook: string | null
  thread?: string | null
  project_id?: string
  mentions?: Recipient[]
  quote?: string | null
  card?: CardSpec | null
  /** v2.17.1 — 스레드에만 남기는 줄(운영 스레드 `[키비주얼]` 소식). 스레드로 못 보내면 웹훅으로 가지 않고 조용히 건너뛴다 */
  threadOnly?: boolean
}

/** 운영 커뮤니케이션 프로토콜 v1.0 댓글 태그(v2.17.1 [B2]) — 디자인 영역은 디자인 협업 태그, 그 밖은 운영 태그 */
export const TAG = {
  request: '[의뢰]',
  draft: '[시안]',
  review: '[검토요청]',
  feedback: '[피드백]',
  confirmed: '[확정]',
  delivered: '[납품]',
  schedule: '[일정]',
  production: '[제작]',
  decision: '[결정]',
  wbs: '[WBS]',
  keyVisual: '[키비주얼]',
} as const

export function isDesignArea(area: string | null | undefined): boolean {
  return area === 'design'
}

/**
 * 보낼 스레드 — design 영역이고 디자인 스레드가 있으면 디자인 스레드, 아니면 운영 스레드.
 * 디자인 스레드가 운영 스레드와 같은 스레드면(설정이 막지만 옛 데이터 대비) 운영 스레드 하나로 본다.
 */
export function routeThread(row: { thread?: string | null; design_thread?: string | null; area?: string | null }, forceOps = false): string | null {
  const ops = row.thread ?? null
  if (forceOps || !isDesignArea(row.area)) return ops
  const design = row.design_thread ?? null
  return design && parseSlackThreadLink(design) ? design : ops
}

/** 디자인 스레드가 운영 스레드와 별개로 있는가(→ 운영 스레드에 `[키비주얼]` 소식을 따로 남길 때) */
export function hasSeparateDesignThread(row: { thread?: string | null; design_thread?: string | null }): boolean {
  const ops = parseSlackThreadLink(row.thread)
  const design = parseSlackThreadLink(row.design_thread)
  return !!ops && !!design && !(ops.channel === design.channel && ops.thread_ts === design.thread_ts)
}

/** Slack mrkdwn — 사용자 글자 중 &·<·>만 바꾼다(Slack 규약) */
export function slackEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function link(url: string, label: string): string {
  return `<${url}|${slackEscape(label)}>`
}

/**
 * 링크의 앱 주소 — ① `APP_BASE_URL`(기본 경로까지 적은 공개 주소 — 회사 도메인 하위 경로처럼 요청 호스트가 다를 때)
 * ② 요청 출처(브라우저가 보낸 신호) ③ Vercel 운영 도메인(`VERCEL_PROJECT_PRODUCTION_URL` — 크론). 뒤 둘에는 `VITE_BASE_PATH`를 붙인다.
 */
export function appBaseUrl(
  env: { APP_BASE_URL?: string; VERCEL_PROJECT_PRODUCTION_URL?: string; VITE_BASE_PATH?: string },
  requestUrl?: string,
): string | null {
  const explicit = env.APP_BASE_URL?.trim()
  if (explicit && /^https?:\/\//.test(explicit)) return explicit.replace(/\/+$/, '') + '/'
  const base = normalizeBasePath(env.VITE_BASE_PATH)
  let origin: string | null = null
  if (requestUrl) {
    try {
      origin = new URL(requestUrl).origin
    } catch {
      origin = null
    }
  }
  if (!origin && env.VERCEL_PROJECT_PRODUCTION_URL?.trim()) origin = `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
  return origin ? `${origin}${base}` : null
}

/** 앱 안 경로 + 행사 전환(`?project=` — ProjectContext가 받아 그 행사로 연다) */
export function appLink(base: string | null, path: string, projectId: string): string | null {
  if (!base) return null
  return `${base}${path.replace(/^\/+/, '')}?project=${encodeURIComponent(projectId)}`
}

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00+09:00` : iso)
  if (!Number.isFinite(t)) return null
  const kst = new Date(t + 9 * 3600 * 1000)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}

/** 줄머리 = [행사명] — v2.16부터 행사 코드는 내부 식별자라 사람 눈에 보이지 않는다 */
function head(row: { project_name: string }): string {
  return `[${slackEscape(row.project_name || '행사')}]`
}

function withLink(text: string, url: string | null, label = '열기'): string {
  return url ? `${text} (${link(url, label)})` : text
}

/**
 * 즉시 알림 행 → 메시지 단위. 지워진 항목(deliverable 없음)은 줄 없이 키만(→ skipped).
 * 새 지시(deliverable.requested)는 행사·담당자마다 한 단위로 묶는다 — 주최형 WBS 전개가 한 번에 수십 건을 만든다.
 * v2.12: 새 지시 = 담당자 제작 요청 카드 · 내부검토 요청·파트너 제출 = PM 검토 카드 · 발주처 결정 = 담당자+PM 멘션 · 시안 올림·컨펌 발송 = 멘션 없음.
 */
export function eventUnits(rows: readonly EventRow[], base: string | null): MessageUnit[] {
  const units: MessageUnit[] = []
  const requested = new Map<string, EventRow[]>()
  const dest = (r: EventRow) => ({ webhook: r.webhook, thread: routeThread(r), project_id: r.project_id })
  /** 운영 스레드에 남기는 `[키비주얼]` 소식 — 디자인 스레드가 따로 있을 때만(아니면 같은 스레드에 같은 소식이 두 번) */
  const keyVisualNews = (r: EventRow, what: string) => {
    if (!isDesignArea(r.area) || !hasSeparateDesignThread(r)) return
    units.push({ keys: [], line: `${head(r)} ${TAG.keyVisual} ${what}`, webhook: null, thread: r.thread ?? null, project_id: r.project_id, threadOnly: true })
  }
  for (const r of rows) {
    if (!r.deliverable_id || !r.title) {
      units.push({ keys: [r.key], line: null, ...dest(r) })
      continue
    }
    if (r.action === 'deliverable.requested') {
      const assignee = r.recipients?.[0]?.id ?? ''
      const groupKey = `${r.project_id}:${assignee}`
      const list = requested.get(groupKey) ?? []
      list.push(r)
      requested.set(groupKey, list)
      continue
    }
    const title = slackEscape(r.title)
    const item = appLink(base, `items/${r.deliverable_id}`, r.project_id)
    const design = isDesignArea(r.area)
    const v = r.version_no ? ` v${r.version_no}` : ''
    let text: string | null = null
    let unit: Partial<MessageUnit> = {}
    switch (r.action) {
      case 'version.uploaded':
        text = `${head(r)} ${design ? TAG.draft : TAG.production} ${title}${v}${design ? '' : ' 새 버전'}${r.actor_name ? ` · ${slackEscape(r.actor_name)}` : ''}`
        break
      case 'approval.requested': {
        const due = shortDate(r.due_at)
        text = `${head(r)} ${design ? TAG.review : TAG.production} ${title}${v} — 발주처 컨펌 발송${due ? ` · 기한 ${due}` : ''}`
        break
      }
      case 'approval.decided':
        text =
          r.decision === 'approved'
            ? `${head(r)} ${design ? TAG.confirmed : TAG.decision} ${title}${v} — 발주처 승인`
            : r.decision === 'changes_requested'
              ? `${head(r)} ${design ? TAG.feedback : TAG.decision} ${title}${v} — 발주처 수정요청`
              : null
        unit = { mentions: r.recipients ?? [], quote: r.decision === 'changes_requested' ? r.client_comment ?? null : null }
        if (r.decision === 'approved') keyVisualNews(r, `확정 — ${title}${v} · 발주처 승인`)
        break
      case 'drive.snapshot_copied':
        // 납품 = 확정본 사본이 03_제작·키비주얼/납품에 놓인 때(Drive 연결 시). Drive 없이 확정된 항목은 확정 줄로 끝난다
        text = `${head(r)} ${design ? TAG.delivered : TAG.production} ${title}${v} — 확정본 저장(납품 폴더)`
        keyVisualNews(r, `납품 — ${title}${v} · 확정본 납품 폴더`)
        break
      case 'partner.submitted':
      case 'status.transitioned': {
        const partner = r.action === 'partner.submitted'
        text = partner
          ? `${head(r)} ${TAG.production} ${title}${v} — 파트너 제출${r.partner_name ? ` · ${slackEscape(r.partner_name)}` : ''}`
          : `${head(r)} ${design ? TAG.review : TAG.production} ${title}${v} — 내부검토 요청${r.actor_name ? ` · ${slackEscape(r.actor_name)}` : ''}`
        unit = {
          mentions: r.recipients ?? [],
          card: {
            kind: 'review',
            project_code: r.project_code,
            project_name: r.project_name,
            area: r.area ?? null,
            sender: partner ? null : r.actor_name ?? null,
            partner: partner ? r.partner_name ?? '파트너' : null,
            deliverable_id: r.deliverable_id,
            notify_key: r.key,
            title: r.title,
            url: item,
            version_no: r.version_no ?? null,
            note: r.version_note ?? null,
            file_name: r.file_name ?? null,
            due_date: r.due_date ?? null,
          },
        }
        break
      }
      default:
        text = null
    }
    units.push({ keys: [r.key], line: text ? withLink(text, item) : null, ...dest(r), ...(text ? unit : {}) })
  }
  for (const list of requested.values()) {
    const first = list[0]
    const keys = list.map((r) => r.key)
    const area = first.area === 'design' || first.area === 'ops' ? first.area : null
    const card: CardSpec = {
      kind: 'work',
      project_code: first.project_code,
      project_name: first.project_name,
      area: first.area ?? null,
      requester: first.actor_name ?? null,
      board_url: appLink(base, area ? `board/${area}` : 'home', first.project_id),
      items: list.map(
        (r): WorkCardItem => ({
          deliverable_id: r.deliverable_id!,
          notify_key: r.key,
          title: r.title!,
          url: appLink(base, `items/${r.deliverable_id}`, r.project_id),
          due_date: r.due_date ?? null,
          spec_size: r.spec_size ?? null,
          spec_qty: r.spec_qty ?? null,
          spec_type: r.spec_type ?? null,
          spec_location: r.spec_location ?? null,
          brief: r.brief ?? null,
          brief_ref_count: r.brief_ref_count ?? null,
        }),
      ),
    }
    const extra = { ...dest(first), card, mentions: first.recipients ?? [] }
    const tag = isDesignArea(first.area) ? TAG.request : TAG.production
    if (list.length === 1) {
      const text = `${head(first)} ${tag} ${slackEscape(first.title!)} — 제작 요청${first.assignee_name ? ` → ${slackEscape(first.assignee_name)}` : ''}`
      units.push({ keys, line: withLink(text, appLink(base, `items/${first.deliverable_id}`, first.project_id)), ...extra })
      continue
    }
    const names = list.slice(0, 3).map((r) => slackEscape(r.title!))
    const more = list.length > 3 ? ` 외 ${list.length - 3}건` : ''
    const who = first.assignee_name ? ` → ${slackEscape(first.assignee_name)}` : ''
    const text = `${head(first)} ${tag} 제작 요청 ${list.length}건 — ${names.join(', ')}${more}${who}`
    units.push({ keys, line: withLink(text, appLink(base, area ? `board/${area}` : 'home', first.project_id), area ? '보드' : '홈'), ...extra })
  }
  return units
}

/** 매일 리마인드 행 → 메시지 단위. v2.12: 할 일이 있는 사람(recipients)을 멘션 — 미등록 파일 묶음은 멘션 없음 */
export function reminderUnits(rows: readonly ReminderRow[], base: string | null): MessageUnit[] {
  return rows.map((r) => {
    let line: string | null = null
    const design = isDesignArea(r.area)
    // 컨펌 기한 D-1은 발주처를 재촉하는 PM의 일 — 디자인 항목이어도 운영 스레드(디자인 스레드는 디자인 일만)
    let forceOps = false
    switch (r.kind) {
      case 'approval_due':
        forceOps = true
        line = r.title
          ? withLink(`${head(r)} ${TAG.decision} ${slackEscape(r.title)} — 컨펌 기한 D-1 · 발주처 응답 없음`, r.deliverable_id ? appLink(base, `items/${r.deliverable_id}`, r.project_id) : null)
          : null
        break
      case 'milestone_due':
        line = r.title ? withLink(`${head(r)} ${design ? TAG.schedule : TAG.wbs} ${slackEscape(r.title)} — 마일스톤 D-1`, appLink(base, 'schedule', r.project_id), '일정') : null
        break
      case 'partner_due':
        line = r.title
          ? withLink(
              `${head(r)} ${TAG.production} ${slackEscape(r.title)} — 파트너 마감 D-1${r.partner_name ? ` · ${slackEscape(r.partner_name)}` : ''} 미제출`,
              appLink(base, 'partners', r.project_id),
              '파트너 보드',
            )
          : null
        break
      case 'deliverable_due':
        line = r.title
          ? withLink(`${head(r)} ${design ? TAG.schedule : TAG.production} ${slackEscape(r.title)} — 마감 D-1`, r.deliverable_id ? appLink(base, `items/${r.deliverable_id}`, r.project_id) : null)
          : null
        break
      case 'unacked': {
        if (!r.title) break
        const threadLink = routeThread(r)
        const card = r.channel_id && r.message_ts ? slackMessageLink(threadLink, r.channel_id, r.message_ts, r.thread_ts) : null
        const review = r.request_kind === 'review'
        const tag = design ? (review ? TAG.review : TAG.request) : TAG.production
        const what = review ? '검토 요청' : '제작 요청'
        const many = r.count && r.count > 1 ? ` 외 ${r.count - 1}건` : ''
        const text = `${head(r)} ${tag} ${slackEscape(r.title)}${many} — 어제 ${what}을 아직 확인하지 않았어요`
        line = card ? `${text} (<${card}|요청 카드>)` : withLink(text, r.deliverable_id ? appLink(base, `items/${r.deliverable_id}`, r.project_id) : null)
        break
      }
      case 'inbox_digest':
        forceOps = true
        line =
          r.count && r.count > 0
            ? withLink(`${head(r)} 미등록 파일 ${r.count}건 — 홈 인박스에서 항목에 연결하거나 무시하세요`, appLink(base, 'home', r.project_id), '홈')
            : null
        break
    }
    return { keys: [r.key], line, webhook: r.webhook, thread: routeThread(r, forceOps), project_id: r.project_id, mentions: line ? r.recipients ?? [] : [] }
  })
}

/** 수동 리마인드(홈 버튼) → 한 줄. 목록이 비면 줄 없음 */
export function manualUnit(row: ManualRow, base: string | null): MessageUnit {
  if (!row.total) return { keys: [row.key], line: null, webhook: row.webhook, thread: row.thread ?? null, project_id: row.project_id }
  const delayed = row.kind === 'manual_delayed'
  const items = row.items.slice(0, 5).map((i) => {
    const d = shortDate(i.date)
    return `${slackEscape(i.title)}${d ? `(${delayed ? '' : '기한 '}${d})` : ''}`
  })
  const more = row.total > items.length ? ` 외 ${row.total - items.length}건` : ''
  const text = `${head(row)} 리마인드 — ${delayed ? '지연 태스크' : '컨펌 대기'} ${row.total}건: ${items.join(', ')}${more}`
  return {
    keys: [row.key],
    line: withLink(text, appLink(base, delayed ? 'schedule' : 'home', row.project_id), delayed ? '일정' : '홈'),
    webhook: row.webhook,
    thread: row.thread ?? null,
    project_id: row.project_id,
  }
}

/** 설정 화면 '테스트 보내기' 한 줄 — 스레드(봇)면 '이 스레드로', 웹훅이면 '이 채널로' */
export function testLine(project: { project_code: string; project_name: string }, where: 'channel' | 'thread' | 'design' = 'channel'): string {
  const name = slackEscape(project.project_name || '행사')
  if (where === 'design') return `[${name}] 알림 테스트 — 이 행사의 디자인 알림(의뢰·시안·검토요청·피드백·확정·납품)이 이 스레드로 옵니다.`
  return `[${name}] 알림 테스트 — 이 행사의 알림이 이 ${where === 'thread' ? '스레드' : '채널'}로 옵니다.`
}

/** Slack Incoming Webhook 본문 — text 한 칸만(미리보기 펼침 끔). 금액 키가 들어갈 자리가 없다 */
export function slackPayload(lines: readonly string[]): { text: string; unfurl_links: false; unfurl_media: false } {
  const shown = lines.slice(0, MAX_LINES_PER_MESSAGE)
  const rest = lines.length - shown.length
  return { text: rest > 0 ? `${shown.join('\n')}\n…외 ${rest}건` : shown.join('\n'), unfurl_links: false, unfurl_media: false }
}
