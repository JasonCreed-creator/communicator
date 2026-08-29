// P11(3.16.2) 보드 필터 한 줄 — 상태·담당·제목 검색.
// 유형이 선택된 운영보드에서는 통합 카드 헤더 우측에(compact), 그 외에는 목록 위 한 줄로 놓인다.
// 라벨 문구("상태"·"담당"·"제목 검색")는 기존 계약 그대로 — 접근성 이름으로 쓰인다.
import { STATUS_LABELS } from '../../lib/labels'
import type { DeliverableStatus } from '../../types/enums'
import type { MemberWithProfile } from '../../types/views'

export default function BoardFilterBar({
  statusFilter,
  onStatusChange,
  assigneeFilter,
  onAssigneeChange,
  titleQuery,
  onTitleQueryChange,
  members,
  compact = false,
}: {
  statusFilter: DeliverableStatus | ''
  onStatusChange: (v: DeliverableStatus | '') => void
  assigneeFilter: string
  onAssigneeChange: (v: string) => void
  titleQuery: string
  onTitleQueryChange: (v: string) => void
  members: MemberWithProfile[]
  /** 통합 카드 헤더에 얹을 때 — 라벨·입력을 한 단계 줄여 한 줄에 들어가게 한다 */
  compact?: boolean
}) {
  const labelClass = `flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} text-ink-sub`
  const inputClass = `ui-input ${compact ? 'h-8 py-0 text-xs' : ''}`
  // 셰브론(.ui-select)은 셀렉트에만 — 같은 재질을 쓰는 제목 검색 input과 클래스를 나눈다
  const selectClass = `${inputClass} ui-select`

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-2' : 'gap-3'}`}>
      <label className={labelClass}>
        상태
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as DeliverableStatus | '')}
          className={selectClass}
        >
          <option value="">전체</option>
          {(Object.keys(STATUS_LABELS) as DeliverableStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        담당
        <select
          value={assigneeFilter}
          onChange={(e) => onAssigneeChange(e.target.value)}
          className={selectClass}
        >
          <option value="">전체</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.profile.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        제목 검색
        <input
          type="search"
          value={titleQuery}
          onChange={(e) => onTitleQueryChange(e.target.value)}
          placeholder="제목으로 찾기"
          className={`${inputClass} ${compact ? 'w-36' : 'w-48'}`}
        />
      </label>
    </div>
  )
}
