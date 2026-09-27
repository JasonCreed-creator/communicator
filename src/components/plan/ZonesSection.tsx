import { renderLiteMarkdown } from './markdown'
import PlanSection from './PlanSection'
import { type SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanGuideZone, PlanZoneItem } from '../../types/views'
import { formatDate } from '../../lib/labels'
import type { PlanFloorplanFigure, PlanSurveyFinding } from './planGuideExtras'

/**
 * 04 존별 운영 — ops 항목의 content(마크다운)+최신 도면 미리보기.
 * v2.5 §23 + 3.16.3 T3① — 운영가이드의 zone 섹션이 있으면 **그것만 정본으로 단일 표시**한다
 * (가이드 존 섹션은 존운영 항목에서 시드되므로 같이 그리면 같은 내용이 이중 렌더된다).
 * guideZone이 null이면 기존 존운영 항목 렌더와 완전히 동일 — 회귀 없음.
 */
export default function ZonesSection({
  zones,
  progress,
  guideZone,
  floorplans = [],
  survey = { visited_on: null, rows: [] },
}: {
  zones: PlanZoneItem[]
  progress: SectionProgressData
  guideZone: PlanGuideZone | null
  /** v2.21 §27.2 — 운영가이드 설치 도면이 연결한 항목의 최신 버전(이미지면 그림 · 아니면 파일 이름) */
  floorplans?: PlanFloorplanFigure[]
  /** v2.21 §27.2 — 답사 체크리스트 가운데 확인내용이 있는 줄만 */
  survey?: { visited_on: string | null; rows: PlanSurveyFinding[] }
}) {
  return (
    <PlanSection sectionKey="zones" progress={progress}>
      {floorplans.length > 0 && (
        <div className="mb-5" data-testid="plan-floorplans">
          <h3 className="mb-2 text-sm font-semibold text-ink">설치 도면</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {floorplans.map((f, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-ink">{f.title}</p>
                {f.note && <p className="text-xs text-ink-sub">{f.note}</p>}
                {f.image_url ? (
                  <img src={f.image_url} alt={`${f.title} 도면`} className="mt-2 max-h-56 rounded-md border border-border object-contain" />
                ) : f.version ? (
                  <p className="mt-2 text-xs text-ink-cap">
                    최신 v{f.version.version_no} · {f.version.file_name} (이미지가 아니라 파일 이름만)
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink-cap">{f.item_title ? '아직 올린 버전 없음' : '연결한 항목 없음'}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {survey.rows.length > 0 && (
        <div className="mb-5" data-testid="plan-survey">
          <h3 className="mb-2 text-sm font-semibold text-ink">
            답사 확인 사항
            {survey.visited_on && <span className="t-caption ml-2">답사일 {formatDate(survey.visited_on)}</span>}
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="ui-th w-[64px]">구분</th>
                <th className="ui-th w-[120px]">항목</th>
                <th className="ui-th">확인내용</th>
                <th className="ui-th w-[110px]">담당</th>
              </tr>
            </thead>
            <tbody>
              {survey.rows.map((r, i) => (
                <tr key={i} className="border-b border-track">
                  <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-ink-sub">{r.scope_label}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-sm font-semibold text-ink">{r.item || '—'}</td>
                  <td className="px-3 py-2 align-top text-sm text-ink">{r.finding}</td>
                  <td className="px-3 py-2 align-top text-sm text-ink-sub">{r.owner || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {guideZone ? (
        <div className="rounded-lg border border-border bg-canvas p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">운영가이드 존 섹션</h3>
            {guideZone.source_stale && (
              <span className="inline-flex items-center rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
                갱신 있음
              </span>
            )}
          </div>
          {guideZone.content?.trim() ? (
            <div className="text-sm text-ink-sub">{renderLiteMarkdown(guideZone.content)}</div>
          ) : (
            <p className="text-xs text-ink-cap">본문 미작성</p>
          )}
        </div>
      ) : (
        <>
          {zones.length === 0 && <p className="text-xs text-ink-cap">등록된 운영 항목이 없습니다.</p>}
          <div className="space-y-5">
            {zones.map((z) => (
              <article key={z.deliverable_id} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">{z.title}</h3>
                  <span className="text-xs text-ink-cap">{z.category}</span>
                  <StatusPill status={z.status} />
                </div>
                {z.content ? (
                  <div className="text-sm text-ink-sub">{renderLiteMarkdown(z.content)}</div>
                ) : (
                  <p className="text-xs text-ink-cap">본문 미작성</p>
                )}
                {z.latest_version && (
                  <div className="mt-3">
                    {z.latest_version.preview_url ? (
                      <>
                        <p className="mb-1 text-xs text-ink-cap">최신 도면 (v{z.latest_version.version_no})</p>
                        <img
                          src={z.latest_version.preview_url}
                          alt={`${z.title} 최신 도면 미리보기`}
                          className="max-h-48 rounded-md border border-border object-contain"
                        />
                      </>
                    ) : (
                      <p className="text-xs text-ink-cap">
                        최신 버전 v{z.latest_version.version_no} · {z.latest_version.file_name} (미리보기 불가)
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </PlanSection>
  )
}
