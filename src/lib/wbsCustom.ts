// v2.21 §27.4 (Phase 6.11 PR-C) — 행사별 태스크·사람 배정의 순수 규칙. mock·supabase 공급자와 화면이 같은 값을 읽는다.
//   · 코드 = `C-{n}` — 그 행사의 custom 태스크 순번(빠진 번호를 되쓰지 않는다 — 가장 큰 번호 + 1)
//   · 단계 이름 = 이미 전개된 태스크의 phase_name → 없으면 유형별 템플릿의 단계 이름 → 없으면 null(호출자가 422)
//   · 오프셋 = 실날짜 − 행사일(UTC 자정 산술 — lib/wbs.ts addDays와 같은 규칙)
//   · 재전개 보존 = template 행은 code 매칭으로 배정·묶음을 잇고, custom 행은 건드리지 않는다(날짜·상태 불변)
import { hostTemplateFor, wbsTemplateFor } from '../fixtures/wbsTemplates'
import type { IsoDate, Project, WbsTask } from '../types/entities'

export const CUSTOM_CODE_PREFIX = 'C-'
const CUSTOM_CODE_RE = /^C-(\d+)$/

/** 다음 행사별 태스크 코드 — 그 행사 태스크 가운데 `C-{n}`의 최댓값 + 1 (없으면 C-1) */
export function nextCustomCode(tasks: readonly Pick<WbsTask, 'code'>[]): string {
  let max = 0
  for (const t of tasks) {
    const m = CUSTOM_CODE_RE.exec(t.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${CUSTOM_CODE_PREFIX}${max + 1}`
}

export function isCustomCode(code: string): boolean {
  return CUSTOM_CODE_RE.test(code)
}

/** 단계 번호 → 이름. 전개된 태스크가 먼저(사람이 보는 이름과 같게), 없으면 그 행사 유형의 템플릿에서 */
export function phaseNameFor(
  project: Pick<Project, 'kind' | 'event_type' | 'format'>,
  tasks: readonly Pick<WbsTask, 'phase_no' | 'phase_name' | 'sort_order'>[],
  phaseNo: number,
): string | null {
  const existing = [...tasks].filter((t) => t.phase_no === phaseNo).sort((a, b) => a.sort_order - b.sort_order)[0]
  if (existing) return existing.phase_name
  const templates = project.kind === 'host' ? hostTemplateFor(project.format) : wbsTemplateFor(project.event_type)
  return templates.find((t) => t.phase_no === phaseNo)?.phase_name ?? null
}

/** 단계 선택지 — 전개된 태스크와 템플릿의 합집합(번호 순) */
export function phaseChoices(
  project: Pick<Project, 'kind' | 'event_type' | 'format'>,
  tasks: readonly Pick<WbsTask, 'phase_no' | 'phase_name' | 'sort_order'>[],
): { phase_no: number; phase_name: string }[] {
  const map = new Map<number, string>()
  const templates = project.kind === 'host' ? hostTemplateFor(project.format) : wbsTemplateFor(project.event_type)
  for (const t of templates) if (!map.has(t.phase_no)) map.set(t.phase_no, t.phase_name)
  for (const t of [...tasks].sort((a, b) => a.sort_order - b.sort_order)) map.set(t.phase_no, t.phase_name)
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([phase_no, phase_name]) => ({ phase_no, phase_name }))
}

/** 실날짜 − 행사일(일수) — 행사일 기준 오프셋(음수 = D-) */
export function dateOffset(date: IsoDate, eventDate: IsoDate): number {
  const a = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  const b = Date.UTC(Number(eventDate.slice(0, 4)), Number(eventDate.slice(5, 7)) - 1, Number(eventDate.slice(8, 10)))
  return Math.round((a - b) / 86_400_000)
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 묶음 이름 정리 — 공백만이면 null */
export function normalizeGroupName(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : null
}

/** Lv2 묶음 — 단계 안에서 group_name으로 묶는다(없는 행은 '묶음 없음'으로 뒤에). 순서 = 첫 등장 순 */
export interface WbsGroupBucket {
  group_name: string | null
  tasks: WbsTask[]
}

export function groupTasksByGroupName(tasks: readonly WbsTask[]): WbsGroupBucket[] {
  const map = new Map<string, WbsGroupBucket>()
  const loose: WbsTask[] = []
  for (const t of tasks) {
    const name = normalizeGroupName(t.group_name)
    if (!name) {
      loose.push(t)
      continue
    }
    const bucket = map.get(name)
    if (bucket) bucket.tasks.push(t)
    else map.set(name, { group_name: name, tasks: [t] })
  }
  const out = [...map.values()]
  if (loose.length) out.push({ group_name: null, tasks: loose })
  return out
}

/** 이 행사에서 쓰인 묶음 이름(첫 등장 순) — 태스크 추가·편집 폼의 자동완성 */
export function groupNamesOf(tasks: readonly Pick<WbsTask, 'group_name'>[]): string[] {
  const seen = new Set<string>()
  for (const t of tasks) {
    const name = normalizeGroupName(t.group_name)
    if (name && !seen.has(name)) seen.add(name)
  }
  return [...seen]
}
