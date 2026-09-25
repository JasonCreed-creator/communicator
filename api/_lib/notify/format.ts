// Slack 알림 문구 — 설계서 v2.10.1 §9 · Phase 6. 순수 함수만(테스트가 DB·네트워크 없이 문구·링크·금액 비노출을 본다).
// 형식(§9): `[행사코드] 사건 — 항목명 (링크)`. 한 번 보낼 때 같은 채널로 가는 줄을 한 메시지로 묶는다(줄 상한 — 넘치면 '…외 N건').
// 금액은 싣지 않는다(§19.7) — 입력 행에 무엇이 더 붙어 와도 아래 화이트리스트 필드만 읽는다.
import { normalizeBasePath } from '../../../src/lib/basePath.js'
import { isSlackWebhookUrl } from '../../../src/lib/slackWebhook.js'

export { isSlackWebhookUrl }
export const MAX_LINES_PER_MESSAGE = 20

export type NotifyAction =
  | 'version.uploaded'
  | 'approval.requested'
  | 'approval.decided'
  | 'partner.submitted'
  | 'deliverable.requested'

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
}

export type ReminderKind = 'approval_due' | 'milestone_due' | 'partner_due' | 'inbox_digest'

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
}

/** notify_claim_manual 결과 */
export interface ManualRow {
  key: string
  kind: 'manual_delayed' | 'manual_approval' | string
  project_id: string
  project_code: string
  project_name: string
  webhook: string | null
  total: number
  items: { title: string; date: string | null; deliverable_id?: string | null }[]
}

/** 한 줄 + 그 줄이 대표하는 선점 키들 + 보낼 곳(행사 채널 · 없으면 공용) */
export interface MessageUnit {
  keys: string[]
  line: string | null
  webhook: string | null
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

function head(row: { project_code: string }): string {
  return `[${slackEscape(row.project_code || '행사')}]`
}

function withLink(text: string, url: string | null, label = '열기'): string {
  return url ? `${text} (${link(url, label)})` : text
}

/**
 * 즉시 알림 행 → 메시지 단위. 지워진 항목(deliverable 없음)은 줄 없이 키만(→ skipped).
 * 새 지시(deliverable.requested)는 행사마다 한 줄로 묶는다 — 주최형 WBS 전개가 한 번에 수십 건을 만든다.
 */
export function eventUnits(rows: readonly EventRow[], base: string | null): MessageUnit[] {
  const units: MessageUnit[] = []
  const requested = new Map<string, EventRow[]>()
  for (const r of rows) {
    if (!r.deliverable_id || !r.title) {
      units.push({ keys: [r.key], line: null, webhook: r.webhook })
      continue
    }
    if (r.action === 'deliverable.requested') {
      const list = requested.get(r.project_id) ?? []
      list.push(r)
      requested.set(r.project_id, list)
      continue
    }
    const title = slackEscape(r.title)
    const item = appLink(base, `items/${r.deliverable_id}`, r.project_id)
    let text: string | null = null
    switch (r.action) {
      case 'version.uploaded':
        text = `${head(r)} 새 버전 — ${title}${r.version_no ? ` v${r.version_no}` : ''}${r.actor_name ? ` · ${slackEscape(r.actor_name)}` : ''}`
        break
      case 'approval.requested': {
        const due = shortDate(r.due_at)
        text = `${head(r)} 컨펌 발송 — ${title}${due ? ` · 기한 ${due}` : ''}`
        break
      }
      case 'approval.decided':
        text =
          r.decision === 'approved'
            ? `${head(r)} 발주처 승인 — ${title}`
            : r.decision === 'changes_requested'
              ? `${head(r)} 발주처 수정요청 — ${title}`
              : null
        break
      case 'partner.submitted':
        text = `${head(r)} 파트너 제출 — ${title}${r.partner_name ? ` · ${slackEscape(r.partner_name)}` : ''}${r.version_no ? ` v${r.version_no}` : ''}`
        break
      default:
        text = null
    }
    units.push({ keys: [r.key], line: text ? withLink(text, item) : null, webhook: r.webhook })
  }
  for (const list of requested.values()) {
    const first = list[0]
    const keys = list.map((r) => r.key)
    if (list.length === 1) {
      const text = `${head(first)} 새 지시 — ${slackEscape(first.title!)}${first.assignee_name ? ` → ${slackEscape(first.assignee_name)}` : ''}`
      units.push({ keys, line: withLink(text, appLink(base, `items/${first.deliverable_id}`, first.project_id)), webhook: first.webhook })
      continue
    }
    const names = list.slice(0, 3).map((r) => slackEscape(r.title!))
    const more = list.length > 3 ? ` 외 ${list.length - 3}건` : ''
    const area = first.area === 'design' || first.area === 'ops' ? first.area : null
    const text = `${head(first)} 새 지시 ${list.length}건 — ${names.join(', ')}${more}`
    units.push({ keys, line: withLink(text, appLink(base, area ? `board/${area}` : 'home', first.project_id), area ? '보드' : '홈'), webhook: first.webhook })
  }
  return units
}

/** 매일 리마인드 행 → 메시지 단위 */
export function reminderUnits(rows: readonly ReminderRow[], base: string | null): MessageUnit[] {
  return rows.map((r) => {
    let line: string | null = null
    switch (r.kind) {
      case 'approval_due':
        line = r.title
          ? withLink(`${head(r)} 컨펌 기한 D-1 — ${slackEscape(r.title)} · 발주처 응답 없음`, r.deliverable_id ? appLink(base, `items/${r.deliverable_id}`, r.project_id) : null)
          : null
        break
      case 'milestone_due':
        line = r.title ? withLink(`${head(r)} 마일스톤 D-1 — ${slackEscape(r.title)}`, appLink(base, 'schedule', r.project_id), '일정') : null
        break
      case 'partner_due':
        line = r.title
          ? withLink(
              `${head(r)} 파트너 마감 D-1 — ${r.partner_name ? `${slackEscape(r.partner_name)} · ` : ''}${slackEscape(r.title)} 미제출`,
              appLink(base, 'partners', r.project_id),
              '파트너 보드',
            )
          : null
        break
      case 'inbox_digest':
        line =
          r.count && r.count > 0
            ? withLink(`${head(r)} 미등록 파일 ${r.count}건 — 홈 인박스에서 항목에 연결하거나 무시하세요`, appLink(base, 'home', r.project_id), '홈')
            : null
        break
    }
    return { keys: [r.key], line, webhook: r.webhook }
  })
}

/** 수동 리마인드(홈 버튼) → 한 줄. 목록이 비면 줄 없음 */
export function manualUnit(row: ManualRow, base: string | null): MessageUnit {
  if (!row.total) return { keys: [row.key], line: null, webhook: row.webhook }
  const delayed = row.kind === 'manual_delayed'
  const items = row.items.slice(0, 5).map((i) => {
    const d = shortDate(i.date)
    return `${slackEscape(i.title)}${d ? `(${delayed ? '' : '기한 '}${d})` : ''}`
  })
  const more = row.total > items.length ? ` 외 ${row.total - items.length}건` : ''
  const text = `${head(row)} 리마인드 — ${delayed ? '지연 태스크' : '컨펌 대기'} ${row.total}건: ${items.join(', ')}${more}`
  return { keys: [row.key], line: withLink(text, appLink(base, delayed ? 'schedule' : 'home', row.project_id), delayed ? '일정' : '홈'), webhook: row.webhook }
}

/** 설정 화면 '테스트 보내기' 한 줄 */
export function testLine(project: { project_code: string; project_name: string }): string {
  return `[${slackEscape(project.project_code || '행사')}] 알림 테스트 — ${slackEscape(project.project_name)}의 알림이 이 채널로 옵니다.`
}

/** Slack Incoming Webhook 본문 — text 한 칸만(미리보기 펼침 끔). 금액 키가 들어갈 자리가 없다 */
export function slackPayload(lines: readonly string[]): { text: string; unfurl_links: false; unfurl_media: false } {
  const shown = lines.slice(0, MAX_LINES_PER_MESSAGE)
  const rest = lines.length - shown.length
  return { text: rest > 0 ? `${shown.join('\n')}\n…외 ${rest}건` : shown.join('\n'), unfurl_links: false, unfurl_media: false }
}
