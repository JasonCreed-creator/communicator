// P6(3.15.1) S5 체크리스트 — 주최형 파트너 인스턴스(같은 code, partner_id 보유, 여러 행) 접기.
// 순수 함수만 — 렌더링은 WbsChecklist.tsx가 담당한다.
import type { Deliverable, WbsTask } from '../../types/entities'

export interface WbsPartnerGroup {
  code: string
  /** 인스턴스 title은 "{원제목} — {파트너명}" 접미가 붙어 있어(§21) ' — ' 앞부분만 그룹 제목으로 쓴다.
   *  접미가 없으면(방어적) 원본 title 그대로. */
  title: string
  direction: WbsTask['direction']
  phase_no: number
  phase_name: string
  end_date: WbsTask['end_date']
  offset_end: number
  instances: WbsTask[]
  /** isSubmitted() 기준 제출 완료 인스턴스 수 */
  submitted: number
  total: number
}

export type ChecklistRow = { type: 'task'; task: WbsTask } | { type: 'group'; group: WbsPartnerGroup }

/** 제출 판정 — 우선순위: ①연결 산출물이 있으면 그 status가 검토중 이상(pending_approval·approved·final)
 *  ②연결 산출물이 없으면 task.status==='done'. 파트너 제출 인스턴스는 전개 시 항상 linked_deliverable_id를
 *  갖지만(DoD31), 방어적으로 ②를 남겨둔다. */
const SUBMITTED_DELIVERABLE_STATUSES = new Set<Deliverable['status']>(['pending_approval', 'approved', 'final'])

export function isPartnerSubmitted(task: WbsTask, deliverableById: Map<string, Deliverable>): boolean {
  if (task.linked_deliverable_id) {
    const d = deliverableById.get(task.linked_deliverable_id)
    if (d) return SUBMITTED_DELIVERABLE_STATUSES.has(d.status)
  }
  return task.status === 'done'
}

/** 인스턴스 title은 "{원제목} — {파트너명}"으로 조립되는데, 원제목 자체에도 ' — '가 들어갈 수 있어
 *  (예: 'HT-1' "…제출 — 로고·회사소개…") 맨 마지막 ' — '만 파트너명 접미로 보고 잘라낸다. */
function groupTitle(instanceTitle: string): string {
  const idx = instanceTitle.lastIndexOf(' — ')
  return idx === -1 ? instanceTitle : instanceTitle.slice(0, idx)
}

/** direction='partner_submit'이고 partner_id를 가진 태스크가 같은 code로 2건 이상이면 그룹 행 1개로
 *  묶는다. 그 외(단일 인스턴스·host_notice·internal·대행형 태스크 — partner_id 없음)는 개별 행 그대로.
 *  행 순서는 입력 tasks 순서를 보존(그룹은 코드의 첫 등장 위치에 놓인다). */
export function buildChecklistRows(tasks: WbsTask[], deliverables: Deliverable[]): ChecklistRow[] {
  const deliverableById = new Map(deliverables.map((d) => [d.id, d]))

  const instancesByCode = new Map<string, WbsTask[]>()
  for (const t of tasks) {
    if (t.direction !== 'partner_submit' || !t.partner_id) continue
    const list = instancesByCode.get(t.code)
    if (list) list.push(t)
    else instancesByCode.set(t.code, [t])
  }

  const rows: ChecklistRow[] = []
  const codesRendered = new Set<string>()
  for (const t of tasks) {
    const instances = t.direction === 'partner_submit' && t.partner_id ? instancesByCode.get(t.code) : undefined
    if (instances && instances.length > 1) {
      if (codesRendered.has(t.code)) continue
      codesRendered.add(t.code)
      const first = instances[0]
      rows.push({
        type: 'group',
        group: {
          code: t.code,
          title: groupTitle(first.title),
          direction: first.direction,
          phase_no: first.phase_no,
          phase_name: first.phase_name,
          end_date: first.end_date,
          offset_end: first.offset_end,
          instances,
          submitted: instances.filter((x) => isPartnerSubmitted(x, deliverableById)).length,
          total: instances.length,
        },
      })
      continue
    }
    rows.push({ type: 'task', task: t })
  }
  return rows
}
