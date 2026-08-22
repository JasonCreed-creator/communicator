// S9 ①행사개요 — 읽기 조립 전용(설계서 v1.5 §10 S9). 인라인 편집 UI는 제거되었고, 수정은
// 행사 설정(S6) ①탭의 ProjectOverviewForm으로 일원화되었다 — 우측 상단 링크로 안내한다.
import { Link } from 'react-router-dom'
import { ddayLabel, formatDate } from '../../lib/labels'
import type { Project } from '../../types/entities'
import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'

interface OverviewSectionProps {
  project: Project
  progress: SectionProgressData
  /**
   * v1.5 — 읽기 조립 전환으로 더 이상 쓰지 않는다(편집은 행사 설정 S6로 일원화).
   * 호출부(PlanDocPage, 별도 담당)의 기존 호출과의 타입 호환을 위해 옵션으로만 계속 수용한다.
   */
  canEdit?: boolean
  onSaved?: () => void
}

export default function OverviewSection({ project, progress }: OverviewSectionProps) {
  return (
    <PlanSection
      number={PLAN_SECTION_META.overview.number}
      title={PLAN_SECTION_META.overview.title}
      progress={progress}
      action={
        <Link to="/settings" className="plan-print-hidden text-xs text-steel underline">
          행사 설정에서 편집
        </Link>
      }
    >
      <OverviewReadOnly project={project} />
    </PlanSection>
  )
}

/** YYYY-MM-DD 범위 표시 — 종료일이 없거나 시작일과 같으면 단일 일자만 보여준다 */
function dateRangeLabel(project: Project): string | null {
  if (!project.event_date) return null
  const start = formatDate(project.event_date)
  if (!project.event_end_date || project.event_end_date === project.event_date) return start
  return `${start} ~ ${formatDate(project.event_end_date)}`
}

function timeRangeLabel(project: Project): string | null {
  if (!project.start_time && !project.end_time) return null
  if (project.start_time && project.end_time) return `${project.start_time} ~ ${project.end_time}`
  return project.start_time ?? project.end_time
}

function OverviewReadOnly({ project }: { project: Project }) {
  const dateRange = dateRangeLabel(project)
  const timeRange = timeRangeLabel(project)

  return (
    <div className="space-y-3 text-sm text-ink">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p>
          <span className="text-ink-cap">행사명 </span>
          <span className="font-semibold text-ink">{project.name}</span>
        </p>
        {dateRange && (
          <p className="flex items-center gap-2">
            <span className="text-ink-cap">일자 </span>
            <span>{dateRange}</span>
            {project.event_date && (
              <span className="rounded-full bg-track px-2 py-0.5 text-xs text-ink-sub">
                {ddayLabel(project.event_date)}
              </span>
            )}
          </p>
        )}
        {timeRange && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">시간</span>
            <span>{timeRange}</span>
          </p>
        )}
        {project.venue && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">장소</span>
            <span>{project.venue}</span>
          </p>
        )}
        {project.expected_headcount != null && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">예상 인원</span>
            <span>{project.expected_headcount}명</span>
          </p>
        )}
        {project.seating && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">좌석 형태</span>
            <span>{project.seating}</span>
          </p>
        )}
        {project.theme && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">주제</span>
            <span>{project.theme}</span>
          </p>
        )}
        {project.organizer && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">주최·주관</span>
            <span>{project.organizer}</span>
          </p>
        )}
        {project.mc_name && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">사회</span>
            <span>{project.mc_name}</span>
          </p>
        )}
        {project.target_audience && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">참가 대상</span>
            <span>{project.target_audience}</span>
          </p>
        )}
      </div>
      {project.overview_items && project.overview_items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {project.overview_items.map((item, i) => (
            <li key={i}>
              <span className="font-medium text-ink">{item.label}</span> — {item.value}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-cap">등록된 개요 항목이 없습니다.</p>
      )}
    </div>
  )
}
