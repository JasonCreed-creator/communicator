// Slack 봇 메시지 — 멘션 · 의뢰 카드(Block Kit) · 확인 표시 (설계서 v2.12 §9 · Phase 6.1). 순수 함수만 — 테스트가 네트워크 없이 본다.
// 시안(2026-09-26 승인 — 채널·멘션 v2): 할 일이 생긴 사람만 멘션하고, 의뢰(제작 요청·검토 요청)는 카드 + '확인했어요' 버튼 하나.
// 금액은 싣지 않는다(§19.7) — 카드 입력은 아래 타입의 필드뿐(제목·규격·가이드 앞부분·버전 메모·파일 이름·날짜·사람 이름).
import { slackEscape } from './format.js'

export interface Recipient {
  id: string
  name: string
  email?: string | null
  slack_user_id?: string | null
}

export interface WorkCardItem {
  deliverable_id: string
  notify_key: string
  title: string
  url: string | null
  due_date?: string | null
  spec_size?: string | null
  spec_qty?: number | null
  spec_type?: string | null
  spec_location?: string | null
  brief?: string | null
  brief_ref_count?: number | null
}

export type CardSpec =
  | {
      kind: 'work'
      project_code: string
      area: string | null
      requester: string | null
      items: WorkCardItem[]
      board_url: string | null
    }
  | {
      kind: 'review'
      project_code: string
      area: string | null
      sender: string | null
      partner: string | null
      deliverable_id: string
      notify_key: string
      title: string
      url: string | null
      version_no: number | null
      note: string | null
      file_name: string | null
      due_date: string | null
    }

const AREA_LABEL: Record<string, string> = { design: '디자인', ops: '운영', common: '공통' }
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const DAY = 86_400_000

function kstDate(value: string): { y: number; m: number; d: number; w: number } | null {
  const t = Date.parse(value.length === 10 ? `${value}T00:00:00+09:00` : value)
  if (!Number.isFinite(t)) return null
  const k = new Date(t + 9 * 3600 * 1000)
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), w: k.getUTCDay() }
}

/** '10/2 (금)' */
export function dayLabel(value: string | null | undefined): string | null {
  const k = value ? kstDate(value) : null
  return k ? `${k.m}/${k.d} (${WEEKDAY[k.w]})` : null
}

/** '10/2 (금) · 7일 남음' / '· 오늘' / '· 2일 지남' — 기준 = 오늘(KST) */
export function dueText(value: string | null | undefined, now: number): string | null {
  const label = dayLabel(value)
  const k = value ? kstDate(value) : null
  if (!label || !k) return null
  const today = new Date(now + 9 * 3600 * 1000)
  const diff = Math.round((Date.UTC(k.y, k.m - 1, k.d) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / DAY)
  const rel = diff === 0 ? '오늘' : diff > 0 ? `${diff}일 남음` : `${-diff}일 지남`
  return `${label} · ${rel}`
}

/**
 * 멘션 글자. Slack ID가 있으면 `<@U…>`(푸시), 없으면 봇 경로에서는 `이름(Slack 미연결)` — 누가 받을 차례인지는 글자로라도 남긴다.
 * 웹훅 경로(names=false)는 아는 ID만 멘션하고 이름은 적지 않는다(Phase 6 줄 모양 유지).
 */
export function mentionText(people: readonly Recipient[] | undefined, names = true): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of people ?? []) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    if (p.slack_user_id) out.push(`<@${p.slack_user_id}>`)
    else if (names) out.push(`${slackEscape(p.name)}(Slack 미연결)`)
  }
  return out.join(' ')
}

function link(url: string | null, label: string): string {
  return url ? `<${url}|${slackEscape(label)}>` : slackEscape(label)
}

function quote(text: string | null | undefined, max = 150): string | null {
  const t = (text ?? '').replace(/\r/g, '').trim()
  if (!t) return null
  const body = t.length >= max ? `${t.slice(0, max).trimEnd()} …` : t
  return body
    .split('\n')
    .map((line) => `>${slackEscape(line)}`)
    .join('\n')
}

const section = (text: string, fields?: string[]) =>
  fields && fields.length
    ? { type: 'section', text: { type: 'mrkdwn', text }, fields: fields.slice(0, 10).map((f) => ({ type: 'mrkdwn', text: f })) }
    : { type: 'section', text: { type: 'mrkdwn', text } }
const context = (text: string) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] })
const plain = (text: string) => ({ type: 'plain_text', text, emoji: false })

/** 카드 → { text(푸시 한 줄), blocks }. cardId = 버튼 값(확인 기록의 열쇠) */
export function cardMessage(card: CardSpec, mentions: readonly Recipient[], cardId: string, now: number): { text: string; blocks: unknown[] } {
  const who = mentionText(mentions)
  const lead = who ? `${who} ` : ''
  const head = `[${slackEscape(card.project_code || '행사')}]`
  const area = card.area ? AREA_LABEL[card.area] ?? null : null
  const blocks: unknown[] = []

  if (card.kind === 'work') {
    const items = [...card.items].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.title.localeCompare(b.title, 'ko'))
    const by = card.requester ? ` · 요청 ${slackEscape(card.requester)}` : ''
    if (items.length === 1) {
      const it = items[0]
      const due = dueText(it.due_date, now)
      blocks.push(section(`${lead}새 제작 요청이에요${by}`))
      const spec = [it.spec_size, it.spec_qty ? `${it.spec_qty}개` : null].filter(Boolean).join(' · ')
      const fields = [
        due ? `*마감*\n${due}` : null,
        spec ? `*규격*\n${slackEscape(spec)}` : null,
        it.spec_type ? `*종류*\n${slackEscape(it.spec_type)}` : null,
        it.spec_location ? `*위치*\n${slackEscape(it.spec_location)}` : null,
      ].filter((f): f is string => Boolean(f))
      blocks.push(section(`*${link(it.url, it.title)}*${area ? ` · ${area}` : ''}`, fields))
      const q = quote(it.brief)
      if (q) blocks.push(section(q))
      const refs = it.brief_ref_count ?? 0
      if (refs > 0 || q) blocks.push(context(refs > 0 ? `참고 자료 ${refs}개 · 전문은 앱에서` : '가이드 전문은 앱에서'))
      blocks.push({
        type: 'actions',
        block_id: 'ack',
        elements: [
          { type: 'button', action_id: 'ack', style: 'primary', text: plain('확인했어요'), value: cardId },
          ...(it.url ? [{ type: 'button', action_id: 'open', text: plain('앱에서 열기'), url: it.url }] : []),
        ],
      })
      return { text: `${lead}${head} 새 제작 요청 — ${slackEscape(it.title)}${due ? ` · 마감 ${dayLabel(it.due_date)}` : ''}`, blocks }
    }
    blocks.push(section(`${lead}새 제작 요청 ${items.length}건이에요${by}`))
    const shown = items.slice(0, 15)
    const lines = shown.map((it) => {
      const d = dayLabel(it.due_date)
      return `• ${link(it.url, it.title)}${d ? ` · ${d}` : ''}`
    })
    if (items.length > shown.length) lines.push(`…외 ${items.length - shown.length}건`)
    blocks.push(section(lines.join('\n')))
    blocks.push(context('마감 이른 순 · 규격·가이드는 항목마다 앱에서'))
    blocks.push({
      type: 'actions',
      block_id: 'ack',
      elements: [
        { type: 'button', action_id: 'ack', style: 'primary', text: plain(`${items.length}건 모두 확인했어요`), value: cardId },
        ...(card.board_url ? [{ type: 'button', action_id: 'open', text: plain(`${area ?? ''} 보드 열기`.trim()), url: card.board_url }] : []),
      ],
    })
    return { text: `${lead}${head} 새 제작 요청 ${items.length}건 — ${items.slice(0, 3).map((i) => slackEscape(i.title)).join(', ')}${items.length > 3 ? ` 외 ${items.length - 3}건` : ''}`, blocks }
  }

  // 검토 요청(내부검토) · 파트너 제출 → PM
  const v = card.version_no ? ` *v${card.version_no}*` : ''
  blocks.push(
    section(
      card.partner
        ? `${lead}파트너 제출물이 왔어요 · ${slackEscape(card.partner)}`
        : `${lead}검토 요청이에요${card.sender ? ` · 보낸 사람 ${slackEscape(card.sender)}` : ''}`,
    ),
  )
  blocks.push(section(`*${link(card.url, card.title)}*${v}${area && !card.partner ? ` · ${area}` : ''}`))
  const q = quote(card.note)
  if (q) blocks.push(section(q))
  const due = dueText(card.due_date, now)
  const fields = [
    card.file_name ? `*파일*\n\`${card.file_name.replace(/`/g, "'")}\`` : null,
    due ? `*${card.partner ? '제출 마감' : '마감'}*\n${due}` : null,
  ].filter((f): f is string => Boolean(f))
  if (fields.length) blocks.push({ type: 'section', fields: fields.map((f) => ({ type: 'mrkdwn', text: f })) })
  blocks.push({
    type: 'actions',
    block_id: 'ack',
    elements: [
      { type: 'button', action_id: 'ack', style: 'primary', text: plain('확인했어요'), value: cardId },
      ...(card.url ? [{ type: 'button', action_id: 'open', text: plain('검토하러 가기'), url: card.url }] : []),
    ],
  })
  const label = card.partner ? '파트너 제출' : '검토 요청'
  const tail = card.partner ? ` · ${slackEscape(card.partner)}` : card.sender ? ` · ${slackEscape(card.sender)}` : ''
  return { text: `${lead}${head} ${label} — ${slackEscape(card.title)}${card.version_no ? ` v${card.version_no}` : ''}${tail}`, blocks }
}

/** 'KST 9/26 오후 2:34' 모양의 시각 */
export function kstTime(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso)
  const k = new Date(t + 9 * 3600 * 1000)
  const h = k.getUTCHours()
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${ampm} ${h12}:${String(k.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * 확인한 뒤의 카드 — 원래 블록에서 '확인했어요' 버튼만 빼고 그 자리 위에 "✓ 이름 확인함 · 시각"을 둔다(채널의 모두가 본다).
 * 다른 블록은 손대지 않는다(Slack이 돌려준 블록 그대로 — 링크·필드 보존).
 */
export function ackedBlocks(blocks: readonly unknown[] | undefined, name: string, at: string | number): unknown[] {
  const out: unknown[] = []
  const done = context(`✓ ${slackEscape(name)} 확인함 · ${kstTime(at)}`)
  let placed = false
  for (const b of blocks ?? []) {
    const block = b as { type?: string; block_id?: string; elements?: { action_id?: string }[] }
    if (block.type === 'actions' && block.block_id === 'ack') {
      out.push(done)
      placed = true
      const rest = (block.elements ?? []).filter((e) => e.action_id !== 'ack')
      if (rest.length) out.push({ ...block, elements: rest })
      continue
    }
    out.push(b)
  }
  if (!placed) out.push(done)
  return out
}
