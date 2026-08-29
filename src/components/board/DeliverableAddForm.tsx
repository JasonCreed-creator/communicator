import { useState, type FormEvent } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import InfoTip from '../internal/InfoTip'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { GUIDE_TOGGLE_HELP } from '../../lib/helpTexts'
import { areaPreset, categoryPreset } from '../../lib/boardPresets'
import { getDataProvider } from '../../providers'
import type { Deliverable } from '../../types/entities'
import type { DeliverableArea } from '../../types/enums'

const provider = getDataProvider()

/**
 * P7(3.15.1) — 보드 하단 통합 "항목 추가" 카드.
 * 옛 '새 항목 생성'(셀프 생성, status='draft')과 pm 전용 '가이드 발행'
 * (brief·스펙 포함, status='requested') 두 폼을 하나로 합친다.
 * **전이 로직·provider 호출은 두 경로 그대로 — 폼 계층만 재구성했다.**
 * 기본 필드(카테고리·제목·담당·마감)는 공통이고, pm에게만 보이는
 * "제작 가이드 포함" 토글을 켜면 가이드 내용·참고 링크·스펙 4필드가 펼쳐지며
 * 발행 시 기존 가이드 발행 경로(createDeliverable에 brief 포함 → status='requested')를 탄다.
 * 꺼진 채로 제출하면 기존 셀프 생성 경로(brief 없이 → status='draft')를 탄다.
 * 기본 접힘 — 버튼은 항상 노출한다(§10 진입점 원칙).
 */
export default function DeliverableAddForm({
  area,
  projectId,
  isPm,
  onCreated,
  presetCategory,
}: {
  area: DeliverableArea
  projectId: string
  /** pm에게만 "제작 가이드 포함" 토글을 노출한다 — 담당(area) 역할은 셀프 생성만 가능 */
  isPm: boolean
  /** 생성 직후 부모(AreaBoardPage)가 보드를 새로고침하고, 카테고리='큐시트'면 인라인 에디터를 연다 */
  onCreated: (created: Deliverable) => void
  /** P10(3.16 챗 검수 후속) — 운영보드에서 유형 카드가 선택된 상태면 그 카테고리를
   *  폼을 여는 시점에 프리셀렉트한다(사용자가 언제든 바꿀 수 있는 초깃값일 뿐이다). */
  presetCategory?: string
}) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setExpanded(true)}>
        ＋ 항목 추가
      </button>
    )
  }

  return (
    <AddFormBody
      area={area}
      projectId={projectId}
      isPm={isPm}
      presetCategory={presetCategory}
      onCreated={(created) => {
        onCreated(created)
        setExpanded(false)
      }}
      onCancel={() => setExpanded(false)}
    />
  )
}

function AddFormBody({
  area,
  projectId,
  isPm,
  onCreated,
  onCancel,
  presetCategory,
}: {
  area: DeliverableArea
  projectId: string
  isPm: boolean
  onCreated: (created: Deliverable) => void
  onCancel: () => void
  presetCategory?: string
}) {
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const [guideMode, setGuideMode] = useState(false)
  // P10 — 폼이 열리는 시점(AddFormBody 마운트)의 카드 선택을 초깃값으로만 쓴다
  const [category, setCategory] = useState(presetCategory ?? '')
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [brief, setBrief] = useState('')
  const [briefRefsText, setBriefRefsText] = useState('')
  const [specSize, setSpecSize] = useState('')
  const [specQty, setSpecQty] = useState('')
  const [specLocation, setSpecLocation] = useState('')
  const [specType, setSpecType] = useState('')

  const preset = areaPreset(area)
  const hints = categoryPreset(area, category)?.specHints ?? {}

  /**
   * 카테고리를 고르면(가이드 모드에서만) 그 항목의 가이드 초안을 채운다.
   * 사용자가 이미 쓴 내용은 덮지 않는다 — 비어 있거나 직전 템플릿 그대로일 때만 교체한다.
   */
  const pickCategory = (next: string) => {
    const prevTemplate = categoryPreset(area, category)?.briefTemplate ?? ''
    const nextTemplate = categoryPreset(area, next)?.briefTemplate ?? ''
    setCategory(next)
    if (guideMode) {
      setBrief((cur) => (cur.trim() === '' || cur === prevTemplate ? nextTemplate : cur))
    }
  }

  const create = useMutation(() =>
    provider.createDeliverable({
      project_id: projectId,
      area,
      category,
      title,
      assignee_id: assigneeId || undefined,
      due_date: dueDate || undefined,
    }),
  )

  const issue = useMutation(() => {
    if (!assigneeId) throw new Error('가이드에는 담당자 지정이 필요합니다.')
    if (!brief.trim()) throw new Error('가이드 내용을 입력하세요.')
    const brief_refs = briefRefsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    return provider.createDeliverable({
      project_id: projectId,
      area,
      category,
      title,
      assignee_id: assigneeId,
      due_date: dueDate || undefined,
      brief,
      brief_refs: brief_refs.length > 0 ? brief_refs : undefined,
      spec_size: specSize || undefined,
      spec_qty: specQty ? Number(specQty) : undefined,
      spec_location: specLocation || undefined,
      spec_type: specType || undefined,
    })
  })

  const pending = create.pending || issue.pending
  const error = create.error ?? issue.error

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = guideMode ? await issue.run() : await create.run()
    if (result) onCreated(result)
  }

  return (
    <Card
      title="항목 추가"
      action={
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          접기
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 t-caption" htmlFor="additem-category">
            카테고리
            <CategoryPicker area={area} value={category} onChange={pickCategory} id="additem-category" />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="항목 제목"
              className="ui-input w-48"
            />
          </label>
          <label className="flex flex-col gap-1 t-caption">
            담당{guideMode ? '자' : ''}
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              required={guideMode}
              className="ui-input ui-select w-36"
            >
              <option value="">{guideMode ? '담당자 선택…' : '미배정'}</option>
              {members.data?.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 t-caption">
            마감{guideMode ? '일' : ''}
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="ui-input" />
          </label>
        </div>

        {isPm && (
          <label className="ui-check-row items-center text-sm text-ink-sub">
            <input
              type="checkbox"
              checked={guideMode}
              onChange={(e) => setGuideMode(e.target.checked)}
              className="ui-check"
            />
            제작 가이드 포함
            <InfoTip text={GUIDE_TOGGLE_HELP} />
          </label>
        )}

        {guideMode && (
          <>
            <label className="flex flex-col gap-1 t-caption">
              가이드 내용
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                required
                rows={12}
                placeholder="담당자에게 전달할 가이드 내용을 입력하세요"
                className="ui-input w-full"
              />
            </label>

            <label className="flex flex-col gap-1 t-caption">
              참고 링크 (선택, 한 줄에 하나씩)
              <textarea
                value={briefRefsText}
                onChange={(e) => setBriefRefsText(e.target.value)}
                rows={2}
                placeholder={'https://…'}
                className="ui-input w-full"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 t-caption">
                {preset.specLabels.size} (선택)
                <input
                  value={specSize}
                  onChange={(e) => setSpecSize(e.target.value)}
                  placeholder={hints.size ? `예: ${hints.size}` : ''}
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1 t-caption">
                {preset.specLabels.qty} (선택)
                <input
                  type="number"
                  min="0"
                  placeholder={hints.qty ?? ''}
                  value={specQty}
                  onChange={(e) => setSpecQty(e.target.value)}
                  className="ui-input ui-input-num"
                />
              </label>
              <label className="flex flex-col gap-1 t-caption">
                {preset.specLabels.location} (선택)
                <input
                  value={specLocation}
                  onChange={(e) => setSpecLocation(e.target.value)}
                  placeholder={hints.location ? `예: ${hints.location}` : ''}
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1 t-caption">
                {preset.specLabels.type} (선택)
                <input
                  value={specType}
                  onChange={(e) => setSpecType(e.target.value)}
                  placeholder={hints.type ? `예: ${hints.type}` : ''}
                  className="ui-input"
                />
              </label>
            </div>
          </>
        )}

        <button type="submit" disabled={pending} className={guideMode ? 'btn btn-accent' : 'btn btn-primary'}>
          {guideMode ? '가이드 발행' : '생성'}
        </button>
      </form>
      <ErrorAlert message={error} />
    </Card>
  )
}

/**
 * 영역별 카테고리 선택 — 프리셋 목록 + '직접 입력'.
 * 자유 입력을 막지 않되, 기본값은 그 보드에 맞는 항목만 보이게 한다(src/lib/boardPresets.ts 정본).
 */
function CategoryPicker({
  area,
  value,
  onChange,
  id,
}: {
  area: DeliverableArea
  value: string
  onChange: (next: string) => void
  id: string
}) {
  const preset = areaPreset(area)
  const known = preset.categories.some((c) => c.name === value)
  // 값이 비었거나 프리셋에 있으면 select 모드, 사용자가 직접 입력을 고르면 자유 입력 모드
  const [freeform, setFreeform] = useState(false)
  const asSelect = !freeform && (value === '' || known)

  if (asSelect) {
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setFreeform(true)
            onChange('')
            return
          }
          onChange(e.target.value)
        }}
        required
        className="ui-input ui-select w-40"
      >
        <option value="">항목 선택…</option>
        {[...new Set(preset.categories.map((c) => c.phase))].map((phase) => (
          <optgroup key={phase} label={phase}>
            {preset.categories
              .filter((c) => c.phase === phase)
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        ))}
        <option value="__custom__">직접 입력…</option>
      </select>
    )
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder="항목명"
        className="ui-input w-28"
      />
      <button
        type="button"
        onClick={() => {
          setFreeform(false)
          onChange('')
        }}
        className="text-xs text-steel hover:underline"
      >
        목록
      </button>
    </span>
  )
}
