// S0 위저드 상단 스텝 표시 — 접근성: 목록(ol) + aria-current="step"으로 현재 단계 명시.
export interface WizardStep {
  id: number
  label: string
}

export default function StepIndicator({ steps, current }: { steps: readonly WizardStep[]; current: number }) {
  return (
    <ol className="flex items-center" aria-label="온보딩 단계">
      {steps.map((s, i) => {
        const isCurrent = s.id === current
        const isDone = s.id < current
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isDone
                  ? 'bg-gray-900 text-white'
                  : isCurrent
                    ? 'border-2 border-gray-900 text-gray-900'
                    : 'border border-gray-300 text-gray-400'
              }`}
            >
              {isDone ? '✓' : s.id}
            </span>
            <span className={`whitespace-nowrap text-sm ${isCurrent ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="mx-2 h-px flex-1 bg-gray-200" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}
