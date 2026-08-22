import type { SectionProgressData } from './planSections'

/** 섹션 진행률 바 — §5: 트랙 bg-track·필 bg-accent·h-1.5·r3, 수치 라벨은 항상 바 아래 줄(겹침 금지).
 *  total=0이면 0%로 표기(가드) */
export default function SectionProgressBar({ done, total }: SectionProgressData) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="w-24 shrink-0">
      <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
        <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="t-caption mt-1 text-right">
        {done}/{total} ({pct}%)
      </p>
    </div>
  )
}
