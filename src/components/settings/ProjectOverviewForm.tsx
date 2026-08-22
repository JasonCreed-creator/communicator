// 공용 행사개요 폼 — 행사 설정(S6) ①탭과 온보딩(S0) ①단계가 동일하게 사용한다(설계서 v1.5 §10).
// 저장은 updateProject 단일 호출로 개요 전 필드를 patch한다(pm 전용, §8 PATCH /projects/{id}).
// 필수 4(행사명·코드·시작일·장소) 중 시작일·장소만 클라이언트에서 막고, 행사명·코드가 비면
// updateProject를 그대로 호출해 서버 검증 메시지('행사명은 비울 수 없습니다.' 등)를 그대로 노출한다.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { OverviewItem, Project, UUID } from '../../types/entities'
import type { EventType } from '../../types/enums'
import type { ProjectPatch } from '../../types/views'

const provider = getDataProvider()

const SEATING_OPTIONS = ['극장식', '라운드', '교실식', '스탠딩', '혼합']

interface FormValues {
  name: string
  code: string
  eventType: EventType
  eventDate: string
  eventEndDate: string
  startTime: string
  endTime: string
  venue: string
  expectedHeadcount: string
  seating: string
  theme: string
  organizer: string
  mcName: string
  targetAudience: string
  items: OverviewItem[]
}

function valuesFrom(project: Project): FormValues {
  return {
    name: project.name,
    code: project.code,
    eventType: project.event_type,
    eventDate: project.event_date ?? '',
    eventEndDate: project.event_end_date ?? '',
    startTime: project.start_time ?? '',
    endTime: project.end_time ?? '',
    venue: project.venue ?? '',
    expectedHeadcount: project.expected_headcount != null ? String(project.expected_headcount) : '',
    seating: project.seating ?? '',
    theme: project.theme ?? '',
    organizer: project.organizer ?? '',
    mcName: project.mc_name ?? '',
    targetAudience: project.target_audience ?? '',
    items: project.overview_items ?? [],
  }
}

interface ProjectOverviewFormProps {
  projectId: UUID
  /** 저장 성공 시 호출 — 설정: 요약 갱신 / S0: 다음 단계 진행 */
  onSaved?: () => void
  /** 기본 '저장' — S0에서는 '다음' 등으로 대체 */
  submitLabel?: string
  /** true면 입력 비활성 + 저장 버튼 숨김(비 pm 뷰어) */
  readOnly?: boolean
}

export default function ProjectOverviewForm({
  projectId,
  onSaved,
  submitLabel = '저장',
  readOnly = false,
}: ProjectOverviewFormProps) {
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const [values, setValues] = useState<FormValues | null>(null)
  const save = useMutation((patch: ProjectPatch) => provider.updateProject(projectId, patch))

  // 최초 로드·행사 전환 시에만 폼 값을 프리필한다(재조회로 덮어써 편집 중인 입력을 잃지 않도록).
  useEffect(() => {
    if (project.data) setValues((prev) => prev ?? valuesFrom(project.data as Project))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.data])

  if (project.loading || !values) {
    return <p className="text-sm text-ink-cap">불러오는 중…</p>
  }
  if (project.error) {
    return <ErrorAlert message={project.error} />
  }

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) =>
    setValues((prev) => (prev ? { ...prev, [key]: v } : prev))

  const updateItem = (idx: number, patch: Partial<OverviewItem>) => {
    setValues((prev) =>
      prev ? { ...prev, items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : prev,
    )
  }
  const addItem = () =>
    setValues((prev) => (prev ? { ...prev, items: [...prev.items, { label: '', value: '' }] } : prev))
  const removeItem = (idx: number) =>
    setValues((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev))

  const handleReset = () => {
    if (project.data) setValues(valuesFrom(project.data))
    save.setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!values.eventDate || !values.venue.trim()) {
      save.setError('필수 항목(행사명·코드·시작일·장소)을 입력하세요.')
      return
    }
    const patch: ProjectPatch = {
      name: values.name.trim(),
      code: values.code.trim(),
      event_type: values.eventType,
      event_date: values.eventDate || null,
      event_end_date: values.eventEndDate || null,
      start_time: values.startTime || null,
      end_time: values.endTime || null,
      venue: values.venue.trim() || null,
      expected_headcount: values.expectedHeadcount === '' ? null : Number(values.expectedHeadcount),
      seating: values.seating || null,
      theme: values.theme.trim() || null,
      organizer: values.organizer.trim() || null,
      mc_name: values.mcName.trim() || null,
      target_audience: values.targetAudience.trim() || null,
      overview_items: values.items.filter((it) => it.label.trim() || it.value.trim()),
    }
    const result = await save.run(patch)
    if (result) onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="ov-name" label="행사명" required span="sm:col-span-2">
          <input
            id="ov-name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-code" label="행사 코드" required>
          <input
            id="ov-code"
            value={values.code}
            onChange={(e) => set('code', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-event-type" label="행사 유형">
          <select
            id="ov-event-type"
            value={values.eventType}
            onChange={(e) => set('eventType', e.target.value as EventType)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          >
            <option value="general">일반형</option>
            <option value="recruiting">모객형</option>
          </select>
          <p className="mt-1 text-[11px] leading-snug text-ink-cap">
            행사 유형을 바꿔도 등록 데이터는 삭제되지 않습니다(표시 계층만 전환). WBS 재전개는 일정
            화면에서 실행하세요.
          </p>
        </Field>

        <Field id="ov-start-date" label="시작일" required>
          <input
            id="ov-start-date"
            type="date"
            value={values.eventDate}
            onChange={(e) => set('eventDate', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-end-date" label="종료일">
          <input
            id="ov-end-date"
            type="date"
            value={values.eventEndDate}
            onChange={(e) => set('eventEndDate', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-start-time" label="시작 시간">
          <input
            id="ov-start-time"
            type="time"
            value={values.startTime}
            onChange={(e) => set('startTime', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-end-time" label="종료 시간">
          <input
            id="ov-end-time"
            type="time"
            value={values.endTime}
            onChange={(e) => set('endTime', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>

        <Field id="ov-venue" label="장소" required span="sm:col-span-2">
          <input
            id="ov-venue"
            value={values.venue}
            onChange={(e) => set('venue', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-headcount" label="예상 인원">
          <input
            id="ov-headcount"
            type="number"
            min={0}
            value={values.expectedHeadcount}
            onChange={(e) => set('expectedHeadcount', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-seating" label="좌석 형태">
          <select
            id="ov-seating"
            value={values.seating}
            onChange={(e) => set('seating', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          >
            <option value="">선택 안 함</option>
            {SEATING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>

        <Field id="ov-theme" label="주제(슬로건)" span="sm:col-span-2">
          <input
            id="ov-theme"
            value={values.theme}
            onChange={(e) => set('theme', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-organizer" label="주최·주관">
          <input
            id="ov-organizer"
            value={values.organizer}
            onChange={(e) => set('organizer', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-mc" label="사회자">
          <input
            id="ov-mc"
            value={values.mcName}
            onChange={(e) => set('mcName', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>
        <Field id="ov-audience" label="참가 대상" span="sm:col-span-2 lg:col-span-4">
          <input
            id="ov-audience"
            value={values.targetAudience}
            onChange={(e) => set('targetAudience', e.target.value)}
            disabled={readOnly}
            className="ui-input disabled:opacity-60"
          />
        </Field>

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
          <p className="t-caption">기타 개요 항목</p>
          {values.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                placeholder="라벨"
                value={item.label}
                onChange={(e) => updateItem(idx, { label: e.target.value })}
                disabled={readOnly}
                className="ui-input w-32 text-xs disabled:opacity-60"
              />
              <input
                placeholder="내용"
                value={item.value}
                onChange={(e) => updateItem(idx, { value: e.target.value })}
                disabled={readOnly}
                className="ui-input flex-1 text-xs disabled:opacity-60"
              />
              {!readOnly && (
                <button type="button" onClick={() => removeItem(idx)} className="shrink-0 text-xs text-negative">
                  삭제
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" onClick={addItem} className="self-start text-xs text-ink-sub underline">
              + 항목 추가
            </button>
          )}
        </div>
      </div>

      <ErrorAlert message={save.error} />

      {readOnly ? (
        <p className="text-xs text-ink-cap">이 화면은 읽기 전용입니다 — 수정은 PM만 할 수 있습니다.</p>
      ) : (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={handleReset} className="btn btn-ghost">
            변경 취소
          </button>
          <button type="submit" disabled={save.pending} className="btn btn-primary">
            {submitLabel}
          </button>
        </div>
      )}
    </form>
  )
}

function Field({
  id,
  label,
  required,
  span,
  children,
}: {
  id: string
  label: string
  required?: boolean
  span?: string
  children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1 t-caption ${span ?? ''}`}>
      <span className="flex items-baseline gap-0.5">
        <label htmlFor={id}>{label}</label>
        {required && (
          <span aria-hidden="true" className="text-accent-deep">
            *
          </span>
        )}
      </span>
      {children}
    </div>
  )
}
