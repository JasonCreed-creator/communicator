import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useMutation } from '../../hooks/useAsync'
import { ddayLabel, formatDate } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { OverviewItem, Project } from '../../types/entities'
import type { ProjectOverviewPatch } from '../../types/views'
import PlanSection from './PlanSection'
import { PLAN_SECTION_META, type SectionProgressData } from './planSections'

const provider = getDataProvider()

interface OverviewSectionProps {
  project: Project
  progress: SectionProgressData
  /** pm·ops만 true — §6.1 행사개요 편집 권한 */
  canEdit: boolean
  onSaved: () => void
}

export default function OverviewSection({ project, progress, canEdit, onSaved }: OverviewSectionProps) {
  const [editing, setEditing] = useState(false)

  return (
    <PlanSection
      number={PLAN_SECTION_META.overview.number} title={PLAN_SECTION_META.overview.title}
      progress={progress}
      action={
        canEdit && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm plan-print-hidden">
            편집
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <OverviewForm
          project={project}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onSaved()
          }}
        />
      ) : (
        <OverviewReadOnly project={project} />
      )}
    </PlanSection>
  )
}

function OverviewReadOnly({ project }: { project: Project }) {
  return (
    <div className="space-y-3 text-sm text-ink">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p>
          <span className="text-ink-cap">행사명 </span>
          <span className="font-semibold text-ink">{project.name}</span>
        </p>
        {project.event_date && (
          <p className="flex items-center gap-2">
            <span className="text-ink-cap">일자 </span>
            <span>{formatDate(project.event_date)}</span>
            <span className="rounded-full bg-track px-2 py-0.5 text-xs text-ink-sub">
              {ddayLabel(project.event_date)}
            </span>
          </p>
        )}
        {project.venue && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">장소</span>
            <span>{project.venue}</span>
          </p>
        )}
        {project.theme && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">주제</span>
            <span>{project.theme}</span>
          </p>
        )}
        {project.mc_name && (
          <p className="flex items-center gap-1">
            <span className="text-ink-cap">사회</span>
            <span>{project.mc_name}</span>
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

function OverviewForm({
  project,
  onCancel,
  onSaved,
}: {
  project: Project
  onCancel: () => void
  onSaved: () => void
}) {
  const [eventDate, setEventDate] = useState(project.event_date ?? '')
  const [theme, setTheme] = useState(project.theme ?? '')
  const [venue, setVenue] = useState(project.venue ?? '')
  const [mcName, setMcName] = useState(project.mc_name ?? '')
  const [items, setItems] = useState<OverviewItem[]>(project.overview_items ?? [])
  const save = useMutation((patch: ProjectOverviewPatch) => provider.updateProjectOverview(PROJECT_ID, patch))

  const updateItem = (idx: number, patch: Partial<OverviewItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  const addItem = () => setItems((prev) => [...prev, { label: '', value: '' }])
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await save.run({
      event_date: eventDate || null,
      theme: theme.trim() || null,
      venue: venue.trim() || null,
      mc_name: mcName.trim() || null,
      overview_items: items.filter((it) => it.label.trim() || it.value.trim()),
    })
    if (result) onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 t-caption">
          일자
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="ui-input"
          />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          장소
          <input value={venue} onChange={(e) => setVenue(e.target.value)} className="ui-input" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          주제
          <input value={theme} onChange={(e) => setTheme(e.target.value)} className="ui-input" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          사회
          <input value={mcName} onChange={(e) => setMcName(e.target.value)} className="ui-input" />
        </label>
      </div>

      <div className="space-y-2">
        <p className="t-caption">개요 항목</p>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              placeholder="라벨"
              value={item.label}
              onChange={(e) => updateItem(idx, { label: e.target.value })}
              className="ui-input w-32 text-xs"
            />
            <input
              placeholder="내용"
              value={item.value}
              onChange={(e) => updateItem(idx, { value: e.target.value })}
              className="ui-input flex-1 text-xs"
            />
            <button type="button" onClick={() => removeItem(idx)} className="shrink-0 text-xs text-negative">
              삭제
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} className="text-xs text-ink-sub underline">
          + 항목 추가
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={save.pending} className="btn btn-primary btn-sm">
          저장
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          취소
        </button>
      </div>
      <ErrorAlert message={save.error} />
    </form>
  )
}
