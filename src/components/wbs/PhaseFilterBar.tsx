import type { PhaseOption } from './wbsFormat'

function chipClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm ${
    active ? 'bg-dark text-white' : 'border border-border bg-card text-ink-sub hover:bg-track'
  }`
}

/** S5 상단 단계 필터 칩 — '전체' + 태스크 데이터에 등장하는 단계(phase_name 포함) */
export default function PhaseFilterBar({
  phases,
  value,
  onChange,
}: {
  phases: PhaseOption[]
  value: number | 'all'
  onChange: (next: number | 'all') => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange('all')} className={chipClass(value === 'all')}>
        전체
      </button>
      {phases.map((p) => (
        <button
          key={p.phase_no}
          type="button"
          onClick={() => onChange(p.phase_no)}
          className={chipClass(value === p.phase_no)}
        >
          {p.phase_no}. {p.phase_name}
        </button>
      ))}
    </div>
  )
}
