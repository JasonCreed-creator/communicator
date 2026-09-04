import { summaryLine } from '../cue/cueFormValues'
import PlanSection from './PlanSection'
import { type SectionProgressData } from './planSections'
import StatusPill from './StatusPill'
import type { PlanCuesheet } from '../../types/views'

/**
 * 03 큐시트 — 첫 큐시트 항목의 큐 표(시간·큐·구분·내용·콘솔 3채널), 설계서 §10 S9대로 프로그램 다음 배치.
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
    <PlanSection sectionKey="cuesheet" progress={progress}>
      {!cuesheet ? (
        <p className="text-xs text-ink-cap">등록된 큐시트 항목이 없습니다.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{cuesheet.title}</h3>
            <StatusPill status={cuesheet.status} />
          </div>
          {cuesheet.cues.length === 0 ? (
            <p className="text-xs text-ink-cap">작성된 큐가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="ui-th">시간</th>
                    <th className="ui-th">큐</th>
                    <th className="ui-th">구분</th>
                    <th className="ui-th">내용</th>
                    <th className="ui-th">음향</th>
                    <th className="ui-th">조명</th>
                    <th className="ui-th">스크린</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cuesheet.cues.map((c) => (
                    <tr key={c.id}>
                      {/* 시간·큐·구분은 짧은 식별 칸 — 한 줄 고정. 내용·콘솔 3채널만 접힌다(상단 정렬) */}
                      <td className="whitespace-nowrap px-3 py-2 align-top text-ink-sub">{c.time_at ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-ink">{c.cue_no ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-ink-sub">{c.segment ?? '—'}</td>
                      <td className="px-3 py-2 align-top text-ink-sub">{summaryLine(c.body)}</td>
                      <td className="px-3 py-2 align-top text-ink-cap">{c.console_audio ?? '—'}</td>
                      <td className="px-3 py-2 align-top text-ink-cap">{c.console_light ?? '—'}</td>
                      <td className="px-3 py-2 align-top text-ink-cap">{c.console_screen ?? '—'}</td>
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
