// P5-① — RSVP·참관객 두 표가 공유하는 검색+상태 필터 행.
interface StatusOption<S extends string> {
  value: S
  label: string
}

interface RegistrationSearchBarProps<S extends string> {
  search: string
  onSearchChange: (value: string) => void
  statusValue: S
  onStatusChange: (value: S) => void
  statusOptions: StatusOption<S>[]
  statusLabel: string
}

export default function RegistrationSearchBar<S extends string>({
  search,
  onSearchChange,
  statusValue,
  onStatusChange,
  statusOptions,
  statusLabel,
}: RegistrationSearchBarProps<S>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="이름·이메일·소속 검색"
        aria-label="이름·이메일·소속 검색"
        className="ui-input w-56"
      />
      <select
        value={statusValue}
        onChange={(e) => onStatusChange(e.target.value as S)}
        aria-label={statusLabel}
        className="ui-input ui-select w-36"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
