/** KPI 스탯 타일 — 큰 숫자 + 작은 회색 라벨, 장식 없음 */
export default function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  )
}
