// S9 표지(1쪽) — 제목 44/600 + 행사 + 주최·주관 · 작성 · 문서 버전 · 출력일시 4칸.
// 문서 버전은 컨펌 스냅숏 버전과 같은 값이다(스냅숏 전에는 '초안' — planDocMeta.planVersionLabel).
import { ddayLabel, formatDate } from '../../lib/labels'
import type { Project } from '../../types/entities'
import { PLAN_TOTAL_PAGES } from './planDocMeta'

function eventLine(project: Project): string | null {
  const parts: string[] = []
  if (project.event_date) {
    const range =
      project.event_end_date && project.event_end_date !== project.event_date
        ? `${formatDate(project.event_date)} ~ ${formatDate(project.event_end_date)}`
        : formatDate(project.event_date)
    parts.push(`${range} (${ddayLabel(project.event_date)})`)
  }
  if (project.start_time && project.end_time) parts.push(`${project.start_time}~${project.end_time}`)
  if (project.venue) parts.push(project.venue)
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function PlanCover({
  project,
  versionLabel,
  printedAt,
  authorLabel,
}: {
  project: Project
  versionLabel: string
  printedAt: string
  authorLabel: string
}) {
  const line = eventLine(project)

  return (
    // 520은 A4 표지가 한 쪽을 채우기 위한 높이다 — **인쇄에서만** 준다.
    // 화면에서도 강제하면 제목과 메타 줄 사이에 빈 띠가 생겨 다음 섹션이 저 아래로 밀린다.
    <div className="flex flex-col justify-between gap-10 pb-2 print:min-h-[520px] print:gap-0">
      <div>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-[2.5px] w-[26px] rounded-sm bg-accent" />
          <span className="text-[11px] font-semibold tracking-[.14em] text-ink-cap">OPERATION PLAN</span>
        </div>
        <h1 className="mt-5 text-[44px] font-semibold leading-[1.2] tracking-[-.02em] text-ink">
          운영계획서
        </h1>
        <p className="mt-2.5 text-xl font-semibold leading-[1.35] text-brown">{project.name}</p>
        {line && <p className="mt-2 text-sm leading-relaxed text-ink-sub">{line}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
        <CoverField label="주최 · 주관" value={project.organizer ?? '—'} />
        <CoverField label="작성" value={authorLabel} />
        <CoverField label="문서 버전" value={versionLabel} note="컨펌 스냅숏 기준" />
        <CoverField label="출력" value={printedAt} note={`전 ${PLAN_TOTAL_PAGES}쪽`} />
      </dl>
    </div>
  )
}

function CoverField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[.04em] text-ink-cap">{label}</dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-ink">
        {value}
        {note && <span className="block text-xs text-ink-cap">{note}</span>}
      </dd>
    </div>
  )
}
