import PlanSection from './PlanSection'
import { type SectionProgressData } from './planSections'
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
    <PlanSection sectionKey="production" progress={progress}>
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
                <th className="ui-th ui-num">수량</th>
                <th className="ui-th">위치</th>
                <th className="ui-th">종류</th>
                <th className="ui-th">최신 시안</th>
                <th className="ui-th">상태</th>
              </tr>
            </thead>
            {/* 문서형 표 — 긴 본문 칸(품명·규격·위치·종류)만 접히고 짧은 라벨 칸은 한 줄을 지킨다.
                셀은 상단 정렬(02 프로그램 표와 동일)이라 두 줄 행에서도 라벨·배지가 첫 줄에 붙는다 */}
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.deliverable_id}>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-ink-cap">{item.category}</td>
                  <td className="px-3 py-2 align-top font-medium text-ink">{item.title}</td>
                  <td className="px-3 py-2 align-top text-ink-sub">{item.spec_size ?? '—'}</td>
                  <td className="ui-num whitespace-nowrap px-3 py-2 align-top text-ink-sub">{item.spec_qty ?? '—'}</td>
                  <td className="px-3 py-2 align-top text-ink-sub">{item.spec_location ?? '—'}</td>
                  <td className="px-3 py-2 align-top text-ink-sub">{item.spec_type ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-ink-sub">
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
                  <td className="whitespace-nowrap px-3 py-2 align-top">
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
