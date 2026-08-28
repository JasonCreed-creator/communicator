import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanProductionItem } from '../../types/views'

/** 05 제작물 리스트 — design 항목의 가이드 스펙 표 + 최신 시안·상태. 가이드 스펙에서 자동 생성된다(DoD-8) */
export default function ProductionSection({
  items,
  progress,
}: {
  items: PlanProductionItem[]
  progress: SectionProgressData
}) {
  return (
    <PlanSection number={PLAN_SECTION_META.production.number} title={PLAN_SECTION_META.production.title} progress={progress}>
      {items.length === 0 ? (
        <p className="text-xs text-ink-cap">등록된 제작물이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="ui-th">카테고리</th>
                <th className="ui-th">품명</th>
                <th className="ui-th">규격</th>
                <th className="ui-th">수량</th>
                <th className="ui-th">위치</th>
                <th className="ui-th">종류</th>
                <th className="ui-th">최신 시안</th>
                <th className="ui-th">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.deliverable_id}>
                  <td className="py-2 pr-3 text-ink-cap">{item.category}</td>
                  <td className="py-2 pr-3 font-medium text-ink">{item.title}</td>
                  <td className="py-2 pr-3 text-ink-sub">{item.spec_size ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-sub">{item.spec_qty ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-sub">{item.spec_location ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-sub">{item.spec_type ?? '—'}</td>
                  <td className="py-2 pr-3 text-ink-sub">
                    {item.latest_version ? (
                      item.latest_version.preview_url ? (
                        <a
                          href={item.latest_version.preview_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-steel underline"
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
