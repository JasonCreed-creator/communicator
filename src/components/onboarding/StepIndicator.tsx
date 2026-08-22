// S0 위저드 스텝 표시 — 접근성: 목록(ol) + aria-current="step"으로 현재 단계 명시.
// 데스크톱(sm 이상)은 카드 좌측 세로 레일, 모바일은 상단 가로 폴백(디자인지시서 v1 §6 S0).
export interface WizardStep {
  id: number
  label: string
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-white">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
    </svg>
  )
}

export default function StepIndicator({ steps, current }: { steps: readonly WizardStep[]; current: number }) {
  return (
    <ol className="flex flex-row gap-2 sm:flex-col sm:gap-0" aria-label="온보딩 단계">
      {steps.map((s, i) => {
        const isCurrent = s.id === current
        const isDone = s.id < current
        const isLast = i === steps.length - 1
        return (
          <li
            key={s.id}
            className="flex flex-1 flex-col items-center gap-1.5 sm:flex-none sm:flex-row sm:items-start sm:gap-3 sm:pb-6 last:sm:pb-0"
          >
            <span className="flex flex-col items-center sm:shrink-0">
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isDone
                    ? 'bg-accent text-white'
                    : isCurrent
                      ? 'border-2 border-accent text-ink'
                      : 'border border-border text-ink-cap'
                }`}
              >
                {isDone ? <CheckIcon /> : s.id}
              </span>
              {!isLast && <span aria-hidden="true" className="hidden sm:mt-1 sm:block sm:h-6 sm:w-px sm:bg-border" />}
            </span>
            <span
              className={`whitespace-nowrap text-sm sm:mt-0.5 ${isCurrent ? 'font-semibold text-ink' : 'text-ink-cap'}`}
            >
              {s.label}
            </span>
            {!isLast && <span aria-hidden="true" className="mx-1 h-px flex-1 bg-border sm:hidden" />}
          </li>
        )
      })}
    </ol>
  )
}
