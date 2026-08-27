// S-11 파트너 보드 (v2.4 §21·§10.1) — 화면이 공유하는 순수 파생 로직.
// provider가 이미 계산해 주는 것(PartnerWithProgress.submission_counts·next_deadline)은 그대로
// 쓰고, provider 인터페이스에 없는 "코드 단위 그룹 뷰"(마감 타임라인용)만 여기서 파생한다.
// 금액 키(계약액 등)는 이 파일이 다루는 어떤 값에도 없다(§21.2 R-H3).
import { HOST_TEMPLATE } from '../../fixtures/wbsTemplates'
import { toIsoDate } from '../../lib/wbs'
import type { Deliverable, PartnerToken, WbsTask } from '../../types/entities'
import type { WbsDirection } from '../../types/enums'

/** HT 코드 → 템플릿 원제목 (파트너별 인스턴스 제목은 " — 파트너명" 접미가 붙어 있어 그룹 라벨로는
 *  원제목을 쓴다). 코드가 템플릿에 없으면(방어적으로) 첫 인스턴스 제목을 그대로 쓴다. */
const TEMPLATE_TITLE_BY_CODE = new Map(HOST_TEMPLATE.map((t) => [t.code, t.title]))

export interface HostTaskGroup {
  code: string
  title: string
  direction: WbsDirection
  end_date: string | null
  instances: WbsTask[]
  /** partner_submit만 의미 — status!=='requested'(제출 이상 진행)인 인스턴스 수 */
  submitted: number
  total: number
  /** 인스턴스 전부 status==='done' */
  done: boolean
}

/** wbs_tasks(한 행사분)를 code 단위로 묶어 마감 타임라인 1행 = 1그룹으로 만든다. end_date 오름차순. */
export function groupHostTasks(
  tasks: WbsTask[],
  deliverables: Deliverable[],
): HostTaskGroup[] {
  const deliverableById = new Map(deliverables.map((d) => [d.id, d]))
  const byCode = new Map<string, WbsTask[]>()
  for (const t of tasks) {
    const list = byCode.get(t.code)
    if (list) list.push(t)
    else byCode.set(t.code, [t])
  }
  const groups: HostTaskGroup[] = []
  for (const [code, instances] of byCode) {
    const first = instances[0]
    const submitted = instances.filter((t) => {
      if (!t.linked_deliverable_id) return false
      const d = deliverableById.get(t.linked_deliverable_id)
      return !!d && d.status !== 'requested'
    }).length
    groups.push({
      code,
      title: TEMPLATE_TITLE_BY_CODE.get(code) ?? first.title,
      direction: first.direction,
      end_date: first.end_date,
      instances,
      submitted,
      total: instances.length,
      done: instances.every((t) => t.status === 'done'),
    })
  }
  return groups.sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
}

/** 오늘 이후(포함) 가장 가까운 partner_submit 그룹 — 없으면 가장 최근에 지난 그룹(둘 다 없으면 null).
 *  이것이 KPI "이번 마감 제출"과 타임라인의 강조 대상이다. */
export function currentSubmitGroup(groups: HostTaskGroup[], today = toIsoDate(new Date())): HostTaskGroup | null {
  const submitGroups = groups.filter((g) => g.direction === 'partner_submit')
  const upcoming = submitGroups.find((g) => (g.end_date ?? '9999') >= today)
  if (upcoming) return upcoming
  return submitGroups.length > 0 ? submitGroups[submitGroups.length - 1] : null
}

export type DeadlineTiming = 'past' | 'current' | 'upcoming'

export function deadlineTiming(group: HostTaskGroup, current: HostTaskGroup | null, today = toIsoDate(new Date())): DeadlineTiming {
  if (current && group.code === current.code) return 'current'
  if ((group.end_date ?? '9999') < today) return 'past'
  return 'upcoming'
}

export type PartnerLinkStatus = '발급됨' | '만료됨' | '회수됨' | '미발급'

/** listPartners()가 돌려주는 token은 "회수되지 않은 것 중 최신"이라 회수 이력 자체는 구조적으로
 *  들어오지 않는다 — revoked_at은 방어적으로만 확인한다. 실질 3상태는 발급됨/만료됨/미발급. */
export function partnerLinkStatus(token: PartnerToken | null): PartnerLinkStatus {
  if (!token) return '미발급'
  if (token.revoked_at) return '회수됨'
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) return '만료됨'
  return '발급됨'
}

export const PARTNER_LINK_STATUS_CLASSES: Record<PartnerLinkStatus, string> = {
  발급됨: 'bg-positive-tint text-positive',
  만료됨: 'bg-negative-tint text-negative',
  회수됨: 'bg-track text-ink-sub',
  미발급: 'bg-track text-ink-sub',
}

/** activityLabels.ts(components/internal, 이 스킬 범위 밖)의 매핑에 없는 파트너 전용 action 코드.
 *  없는 코드는 그대로(activityActionLabel 폴백과 동일한 원칙) 노출한다. */
export const PARTNER_ACTIVITY_LABELS: Record<string, string> = {
  'partner.created': '파트너가 등록되었습니다',
  'partner.removed': '파트너가 삭제되었습니다',
  'partner.submitted': '파트너가 제출했습니다',
  'partner.reviewed': '제출물이 검토되었습니다',
  'partner_token.issued': '제출 링크가 발급되었습니다',
  'partner_token.revoked': '제출 링크가 회수되었습니다',
}

export function partnerActivityLabel(action: string): string {
  return PARTNER_ACTIVITY_LABELS[action] ?? action
}
