// v2.5 §10.2·§23 운영가이드 빌더 — Phase 3.16d(AH). props 계약은 CuesheetEditor와 동일
// (deliverableId·canEdit), 상세 화면·보드가 이 계약으로 배선한다(계약 변경 금지).
//
// 섹션 카드 4종(존별 운영·역할별 체크리스트·비상 대응·연락망/비품) + 커스텀 추가, 벌크 전체
// 교체(saveGuideSections)로 CRUD·정렬을 표현한다(CuesheetEditor의 행 단위 API와 달리 벌크
// 계약이라 모든 변경이 "현재 목록을 통째로 다시 보낸다"는 한 경로로 수렴한다).
//
// R-O4(연동 섹션 stale): source_ref가 있는 섹션이 source_stale=true면 "갱신 있음" 배지 +
// "차이 확인"으로 원본(lib/guideAssembly.ts — provider와 동일 조립 로직)과 저장값을 나란히
// 보여주고, 사람이 "반영"을 눌러야만 저장된다. 자동 덮어쓰기는 어디에도 없다.
//
// R-O6(개인 연락처): 연락망/비품 섹션에 안내 문구를 고정 노출하고, 인쇄(window.print)에서는
// "연락망 포함" 체크가 꺼져 있는 기본값에서 해당 섹션에 plan-print-hidden을 부여해 제외한다
// (createDocSnapshot의 opts.include_contacts 계약과 같은 의미 — 화면 인쇄는 별도 스냅숏이 아닌
// 이 빌더 자체를 window.print()하므로 클래스로 흉내낸다).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import InfoTip from '../internal/InfoTip'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { GUIDE_STALE_HELP } from '../../lib/helpTexts'
import { GUIDE_KIND_LABELS } from '../../lib/labels'
import { assembleRoleSectionContent, assembleZoneSectionContent } from '../../lib/guideAssembly'
import { getDataProvider } from '../../providers'
import type { GuideSection } from '../../types/entities'
import type { GuideSectionInput } from '../../types/views'
import { renderLiteMarkdown } from '../plan/markdown'

const provider = getDataProvider()

/** 현재 목록을 그대로 GuideSectionInput으로 편다 — 모든 변경(추가·삭제·정렬·수정)은
 *  이 배열을 한 군데만 고쳐 saveGuideSections로 통째 전송하는 방식으로 표현한다. */
function toInput(sections: readonly GuideSection[]): GuideSectionInput[] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    content: s.content,
    source_ref: s.source_ref,
    source_stale: s.source_stale,
  }))
}

export default function GuideBuilder({
  deliverableId,
  canEdit,
}: {
  deliverableId: string
  /** pm·ops만 true — §8.2 guide-sections 쓰기 권한 */
  canEdit: boolean
}) {
  const deliverable = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const sections = useAsync(() => provider.listGuideSections(deliverableId), [deliverableId])
  const [includeContacts, setIncludeContacts] = useState(false)

  const list = sections.data ?? []
  const projectId = deliverable.data?.project_id ?? null

  const seed = useMutation(() => provider.seedGuideFromSources(deliverableId))
  const save = useMutation((next: GuideSectionInput[]) => provider.saveGuideSections(deliverableId, next))

  const replace = async (next: GuideSectionInput[]) => {
    const result = await save.run(next)
    if (result) sections.reload()
    return result
  }

  const handleSeed = async () => {
    const result = await seed.run()
    if (result) sections.reload()
  }

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const next = toInput(list)
    ;[next[index], next[j]] = [next[j], next[index]]
    void replace(next)
  }

  const remove = (id: string) => {
    if (!window.confirm('이 섹션을 삭제하시겠습니까?')) return
    void replace(toInput(list.filter((s) => s.id !== id)))
  }

  const addSection = () => {
    void replace([
      ...toInput(list),
      { kind: 'custom', title: '새 섹션', content: '', source_ref: null, source_stale: false },
    ])
  }

  const saveSectionEdit = (id: string, patch: { title: string; content: string }) =>
    replace(toInput(list).map((inp, i) => (list[i].id === id ? { ...inp, ...patch } : inp)))

  const applyDiff = (id: string, newContent: string) =>
    replace(
      toInput(list).map((inp, i) =>
        list[i].id === id ? { ...inp, content: newContent, source_stale: false } : inp,
      ),
    )

  return (
    <Card
      title="운영가이드"
      action={
        <div className="plan-print-hidden flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-sub">
            <input
              type="checkbox"
              checked={includeContacts}
              onChange={(e) => setIncludeContacts(e.target.checked)}
            />
            연락망 포함(인쇄)
          </label>
          <button type="button" onClick={() => window.print()} className="btn btn-ghost btn-sm">
            인쇄
          </button>
        </div>
      }
    >
      <ErrorAlert message={deliverable.error} />
      <ErrorAlert message={sections.error} />
      <ErrorAlert message={seed.error} />
      <ErrorAlert message={save.error} />

      {sections.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

      {!sections.loading && list.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-ink-cap">아직 섹션이 없습니다.</p>
          {canEdit && (
            <button type="button" onClick={handleSeed} disabled={seed.pending} className="btn btn-primary mt-3">
              기본 4섹션 만들기
            </button>
          )}
        </div>
      )}

      {list.length > 0 && (
        <div className="space-y-4">
          {list.map((s, i) => (
            <GuideSectionCard
              key={s.id}
              section={s}
              index={i}
              total={list.length}
              canEdit={canEdit}
              projectId={projectId}
              includeContactsInPrint={includeContacts}
              saving={save.pending}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onDelete={() => remove(s.id)}
              onSaveEdit={saveSectionEdit}
              onApplyDiff={applyDiff}
            />
          ))}
        </div>
      )}

      {canEdit && list.length > 0 && (
        <button
          type="button"
          onClick={addSection}
          disabled={save.pending}
          className="plan-print-hidden mt-4 btn btn-ghost btn-sm"
        >
          + 섹션 추가
        </button>
      )}

      <p className="plan-print-hidden mt-4 border-t border-border pt-4 text-xs text-ink-cap">
        컨펌 발송은 상세 화면에서 진행합니다 — 발송 시 인쇄 스냅숏이 자동 버전으로 등록됩니다.{' '}
        <Link to={`/items/${deliverableId}`} className="text-steel underline">
          항목 상세로 이동
        </Link>
      </p>
    </Card>
  )
}

// ── 섹션 카드 ─────────────────────────────────────────────────────────
function GuideSectionCard({
  section,
  index,
  total,
  canEdit,
  projectId,
  includeContactsInPrint,
  saving,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSaveEdit,
  onApplyDiff,
}: {
  section: GuideSection
  index: number
  total: number
  canEdit: boolean
  projectId: string | null
  includeContactsInPrint: boolean
  saving: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onSaveEdit: (id: string, patch: { title: string; content: string }) => Promise<unknown>
  onApplyDiff: (id: string, content: string) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(section.title)
  const [content, setContent] = useState(section.content ?? '')

  const startEdit = () => {
    setTitle(section.title)
    setContent(section.content ?? '')
    setEditing(true)
  }

  const submitEdit = async () => {
    const result = await onSaveEdit(section.id, { title, content })
    if (result) setEditing(false)
  }

  const isContacts = section.kind === 'contacts'
  // R-O6: 인쇄에서 연락망 섹션은 명시 체크 전까지 제외 — plan-print-hidden(§23.2)을 재사용해
  // 화면에는 그대로 두고 window.print()에서만 숨긴다.
  const printClass = isContacts && !includeContactsInPrint ? 'plan-print-hidden' : ''

  return (
    <article className={`plan-section rounded-lg border border-border p-4 ${printClass}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
            {GUIDE_KIND_LABELS[section.kind]}
          </span>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="ui-input text-sm font-semibold"
            />
          ) : (
            <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
          )}
          {section.source_stale && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent">
              갱신 있음
              <InfoTip text={GUIDE_STALE_HELP} />
            </span>
          )}
        </div>
        {canEdit && (
          <div className="plan-print-hidden flex flex-wrap items-center gap-2">
            {!editing && (
              <button type="button" onClick={startEdit} className="text-xs text-ink-sub underline">
                수정
              </button>
            )}
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              className="text-xs text-ink-sub underline disabled:opacity-40"
            >
              위로
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="text-xs text-ink-sub underline disabled:opacity-40"
            >
              아래로
            </button>
            <button type="button" onClick={onDelete} className="text-xs text-negative underline">
              삭제
            </button>
          </div>
        )}
      </header>

      {isContacts && (
        <p className="plan-print-hidden mb-3 rounded-md bg-canvas px-3 py-2 text-xs text-ink-sub">
          개인 연락처(개인 휴대폰 등)는 넣지 마세요 — 화면·운영계획서 조립에서 제외되며, 인쇄 포함은
          명시 옵션입니다.
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="ui-input w-full font-mono text-xs"
          />
          <div>
            <p className="t-caption mb-1">미리보기</p>
            <div className="rounded-md bg-canvas p-3">{renderLiteMarkdown(content || '_내용 없음_')}</div>
          </div>
          <div className="plan-print-hidden flex gap-2">
            <button type="button" onClick={submitEdit} disabled={saving} className="btn btn-primary btn-sm">
              저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost btn-sm">
              취소
            </button>
          </div>
        </div>
      ) : section.content?.trim() ? (
        <div className="text-sm text-ink-sub">{renderLiteMarkdown(section.content)}</div>
      ) : (
        <p className="text-xs text-ink-cap">본문 미작성</p>
      )}

      {section.source_stale && section.source_ref && projectId && (
        <StaleDiffPanel
          section={section}
          projectId={projectId}
          canApply={canEdit}
          applying={saving}
          onApply={(next) => onApplyDiff(section.id, next)}
        />
      )}
    </article>
  )
}

// ── R-O4 차이 확인 패널 ────────────────────────────────────────────────
// "기준 견적 갱신"과 같은 패턴 — 저장된 내용과 현재 원본을 나란히 보여주기만 하고,
// 반영 버튼을 사람이 직접 눌러야만 saveGuideSections가 호출된다(자동 덮어쓰기 금지).
function StaleDiffPanel({
  section,
  projectId,
  canApply,
  applying,
  onApply,
}: {
  section: GuideSection
  projectId: string
  canApply: boolean
  applying: boolean
  onApply: (content: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (current !== null) return
    setLoading(true)
    setError(null)
    try {
      let assembled = section.content ?? ''
      if (section.source_ref === 'zone_items') {
        const items = await provider.listDeliverables(projectId, { area: 'ops' })
        assembled = assembleZoneSectionContent(items)
      } else if (section.source_ref === 'role_charters') {
        const charters = await provider.listRoleCharters(projectId)
        assembled = assembleRoleSectionContent(charters)
      }
      setCurrent(assembled)
    } catch (e) {
      setError(e instanceof Error ? e.message : '원본을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="plan-print-hidden mt-3 border-t border-border pt-3">
      <button type="button" onClick={handleToggle} className="text-xs font-medium text-steel underline">
        {open ? '차이 확인 접기' : '차이 확인'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <ErrorAlert message={error} />
          {loading && <p className="text-xs text-ink-cap">불러오는 중…</p>}
          {!loading && current !== null && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="t-caption mb-1">저장된 내용</p>
                  <div className="rounded-md border border-border bg-canvas p-2 text-xs text-ink-sub">
                    {renderLiteMarkdown(section.content ?? '_내용 없음_')}
                  </div>
                </div>
                <div>
                  <p className="t-caption mb-1">현재 원본</p>
                  <div className="rounded-md border border-accent/40 bg-accent-tint/30 p-2 text-xs text-ink-sub">
                    {renderLiteMarkdown(current || '_내용 없음_')}
                  </div>
                </div>
              </div>
              {canApply && (
                <button
                  type="button"
                  onClick={() => onApply(current)}
                  disabled={applying}
                  className="btn btn-accent btn-sm"
                >
                  반영
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
