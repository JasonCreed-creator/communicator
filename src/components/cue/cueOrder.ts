// 큐시트 순서·번호 — 순수 함수(디자인지시서 v1.4 §7-2.8). 끌어 옮기기·⋯ 메뉴의 위/아래가 같은 계산을 쓴다.
import type { Cue } from '../../types/entities'

/**
 * from 큐를 to 큐의 앞(before) 또는 뒤(after)로 옮긴 뒤, sort_order가 바뀌는 큐만 {id, sort_order}로 돌려준다.
 * 새 순서는 1부터 차례로 매긴다(바뀌지 않는 큐는 쓰지 않는다 — 요청 수를 줄인다). 옮길 것이 없으면 빈 배열.
 */
export function reorderUpdates(
  list: readonly Pick<Cue, 'id' | 'sort_order'>[],
  fromId: string,
  toId: string,
  position: 'before' | 'after',
): { id: string; sort_order: number }[] {
  if (fromId === toId) return []
  const ids = list.map((c) => c.id)
  const from = ids.indexOf(fromId)
  if (from < 0 || !ids.includes(toId)) return []
  ids.splice(from, 1)
  const to = ids.indexOf(toId)
  ids.splice(position === 'before' ? to : to + 1, 0, fromId)
  const before = new Map(list.map((c) => [c.id, c.sort_order]))
  return ids
    .map((id, i) => ({ id, sort_order: i + 1 }))
    .filter((u) => before.get(u.id) !== u.sort_order)
}

/** 한 칸 위(-1)·아래(+1)로 — 끝이면 빈 배열 */
export function moveByOne(
  list: readonly Pick<Cue, 'id' | 'sort_order'>[],
  id: string,
  dir: -1 | 1,
): { id: string; sort_order: number }[] {
  const i = list.findIndex((c) => c.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return []
  return reorderUpdates(list, id, list[j].id, dir < 0 ? 'before' : 'after')
}

/**
 * 다음 큐 번호 — 마지막 'C04'·'Q12' 같은 번호의 숫자를 하나 올리고 자릿수를 맞춘다. 번호가 없거나 숫자가 아니면 'C' + 행 수.
 * 예: C01..C04 → C05 · Q9 → Q10 · (없음) → C01
 */
export function nextCueNo(list: readonly Pick<Cue, 'cue_no'>[]): string {
  let prefix = 'C'
  let width = 2
  let max = 0
  for (const c of list) {
    const m = /^([A-Za-z]*)(\d+)$/.exec(c.cue_no?.trim() ?? '')
    if (!m) continue
    const n = Number(m[2])
    if (n >= max) {
      max = n
      prefix = m[1] || prefix
      width = m[2].length
    }
  }
  if (max === 0) return `${prefix}${String(list.length + 1).padStart(width, '0')}`
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}
