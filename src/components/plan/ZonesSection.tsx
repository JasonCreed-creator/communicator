import { renderLiteMarkdown } from './markdown'
import PlanSection from './PlanSection'
import type { SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanZoneItem } from '../../types/views'

/** ③존별 운영 — ops 항목의 content(마크다운)+최신 도면 미리보기 */
export default function ZonesSection({
  zones,
  progress,
}: {
  zones: PlanZoneItem[]
  progress: SectionProgressData
}) {
  return (
    <PlanSection number="③" title="존별 운영" progress={progress}>
      {zones.length === 0 && <p className="text-xs text-gray-400">등록된 운영 항목이 없습니다.</p>}
      <div className="space-y-5">
        {zones.map((z) => (
          <article key={z.deliverable_id} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{z.title}</h3>
              <span className="text-xs text-gray-400">{z.category}</span>
              <StatusPill status={z.status} />
            </div>
            {z.content ? (
              <div className="text-sm text-gray-700">{renderLiteMarkdown(z.content)}</div>
            ) : (
              <p className="text-xs text-gray-400">본문 미작성</p>
            )}
            {z.latest_version && (
              <div className="mt-3">
                {z.latest_version.preview_url ? (
                  <>
                    <p className="mb-1 text-xs text-gray-500">최신 도면 (v{z.latest_version.version_no})</p>
                    <img
                      src={z.latest_version.preview_url}
                      alt={`${z.title} 최신 도면 미리보기`}
                      className="max-h-48 rounded-md border border-gray-200 object-contain"
                    />
                  </>
                ) : (
                  <p className="text-xs text-gray-400">
                    최신 버전 v{z.latest_version.version_no} · {z.latest_version.file_name} (미리보기 불가)
                  </p>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </PlanSection>
  )
}
