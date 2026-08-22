import PlanSection from './PlanSection'
import type { SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanProductionItem } from '../../types/views'

/** ④제작물 리스트 — design 항목의 지시 스펙 표 + 최신 시안·상태. 지시 스펙에서 자동 생성된다(DoD-8) */
export default function ProductionSection({
  items,
  progress,
}: {
  items: PlanProductionItem[]
  progress: SectionProgressData
}) {
  return (
    <PlanSection number="④" title="제작물 리스트" progress={progress}>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 제작물이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-1.5 pr-3 font-medium">카테고리</th>
                <th className="py-1.5 pr-3 font-medium">품명</th>
                <th className="py-1.5 pr-3 font-medium">규격</th>
                <th className="py-1.5 pr-3 font-medium">수량</th>
                <th className="py-1.5 pr-3 font-medium">위치</th>
                <th className="py-1.5 pr-3 font-medium">종류</th>
                <th className="py-1.5 pr-3 font-medium">최신 시안</th>
                <th className="py-1.5 pr-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.deliverable_id}>
                  <td className="py-2 pr-3 text-gray-500">{item.category}</td>
                  <td className="py-2 pr-3 font-medium text-gray-900">{item.title}</td>
                  <td className="py-2 pr-3 text-gray-700">{item.spec_size ?? '—'}</td>
                  <td className="py-2 pr-3 text-gray-700">{item.spec_qty ?? '—'}</td>
                  <td className="py-2 pr-3 text-gray-700">{item.spec_location ?? '—'}</td>
                  <td className="py-2 pr-3 text-gray-700">{item.spec_type ?? '—'}</td>
                  <td className="py-2 pr-3 text-gray-700">
                    {item.latest_version ? (
                      item.latest_version.preview_url ? (
                        <a
                          href={item.latest_version.preview_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 underline"
                        >
                          v{item.latest_version.version_no} 미리보기
                        </a>
                      ) : (
                        <span>v{item.latest_version.version_no}</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <StatusPill status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PlanSection>
  )
}
