import { summaryLine } from '../cue/cueFormValues'
import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanCuesheet } from '../../types/views'

/**
 * ③큐시트 — 첫 큐시트 항목의 큐 표(시간·큐·구분·내용·콘솔 3채널), 설계서 §10 S9대로 프로그램 다음 배치.
 * 편집 UI 없음(읽기 전용 조립 뷰) — 편집은 S3 CuesheetEditor(src/components/cue/)에서 한다.
 */
export default function CuesheetSection({
  cuesheet,
  progress,
}: {
  cuesheet: PlanCuesheet | null
  progress: SectionProgressData
}) {
  return (
    <PlanSection number={PLAN_SECTION_META.cuesheet.number} title={PLAN_SECTION_META.cuesheet.title} progress={progress}>
      {!cuesheet ? (
        <p className="text-xs text-gray-400">등록된 큐시트 항목이 없습니다.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{cuesheet.title}</h3>
            <StatusPill status={cuesheet.status} />
          </div>
          {cuesheet.cues.length === 0 ? (
            <p className="text-xs text-gray-400">작성된 큐가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="py-1.5 pr-3 font-medium">시간</th>
                    <th className="py-1.5 pr-3 font-medium">큐</th>
                    <th className="py-1.5 pr-3 font-medium">구분</th>
                    <th className="py-1.5 pr-3 font-medium">내용</th>
                    <th className="py-1.5 pr-3 font-medium">음향</th>
                    <th className="py-1.5 pr-3 font-medium">조명</th>
                    <th className="py-1.5 font-medium">스크린</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cuesheet.cues.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 text-gray-700">{c.time_at ?? '—'}</td>
                      <td className="py-2 pr-3 font-medium text-gray-900">{c.cue_no ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-700">{c.segment ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-700">{summaryLine(c.body)}</td>
                      <td className="py-2 pr-3 text-gray-500">{c.console_audio ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-500">{c.console_light ?? '—'}</td>
                      <td className="py-2 text-gray-500">{c.console_screen ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </PlanSection>
  )
}
