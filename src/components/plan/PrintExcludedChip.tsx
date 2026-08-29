/** '인쇄 제외' 칩 — 인쇄에서 빠지는 요소를 화면에서 밝힌다(시안: 지금은 아무 표시 없이 사라진다).
 *  칩 자신도 인쇄 대상이 아니므로 print-hidden을 함께 단다. */
export default function PrintExcludedChip({ className = '' }: { className?: string }) {
  return (
    <span
      className={`print-hidden inline-flex shrink-0 items-center rounded-full bg-track px-[7px] py-0.5 text-[11px] font-medium text-ink-sub ${className}`}
    >
      인쇄 제외
    </span>
  )
}
