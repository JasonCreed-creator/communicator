/**
 * 보기 전환 토글(목록 ↔ 갤러리 등) — 디자인지시서 v1.4 §7-2.6.
 * track 면 위 버튼 묶음, 고른 쪽 = card 면 + 600 + 그림자 1단계. 같은 데이터를 다르게 보여 줄 뿐이라
 * 필터 칩(ink 면)과 재질을 나눈다. 버튼마다 aria-pressed — 묶음 이름은 label(aria-label)로 준다.
 */
export default function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 gap-0.5 rounded-lg bg-track p-[3px]">
      {options.map((o) => {
        const pressed = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-[30px] items-center whitespace-nowrap rounded-md px-2.5 text-[13px] transition-colors ${
              pressed ? 'bg-card font-semibold text-ink shadow-sm' : 'text-ink-sub hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
