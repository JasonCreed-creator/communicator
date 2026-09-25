import { useEffect, useMemo, useState, type ReactNode } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { renderLiteMarkdown } from '../plan/markdown'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Cue } from '../../types/entities'
import CueRow from './CueRow'
import { moveByOne, nextCueNo, reorderUpdates } from './cueOrder'
import { summaryLine } from './cueFormValues'

const provider = getDataProvider()

/**
 * 큐시트 정형 에디터 — category='큐시트' 항목은 파일 미리보기·버전 업로드 대신 이 표를 쓴다(Phase 3.6c).
 * Phase 3.23 PR-4b(디자인지시서 v1.4 §7-2.8 · 캔버스 큐시트):
 *   · 머리 = '큐 n개' + 시작·마지막 큐 시각 · '대본 모아 보기'
 *   · 표 = 손잡이 · 큐 · 시간 · 구분 · 내용(+대본) · 음향 · 조명 · 스크린 · ⋯ — 칸마다 버튼 대신 행 끝 메뉴 하나
 *   · 순서 = 행을 끌어 옮기기(HTML5 DnD — 새 의존성 0) 또는 메뉴의 위/아래
 *   · 큐 추가 = 표 맨 아래 한 줄 — 다음 번호(C05)가 바로 생기고 그 줄이 편집 상태로 열린다
 *   · 대본 = 표 아래 칸에 고른 큐의 전문(side가 있으면 오른쪽에 코멘트·컨펌 기록)
 * 행 CRUD는 DataProvider의 listCues/createCue/updateCue/deleteCue만 경유한다.
 */
export default function CuesheetEditor({
  deliverableId,
  canEdit,
  side,
}: {
  deliverableId: string
  /** pm·ops만 true — §6.1 큐시트 편집 권한. false면 대본 열람만 가능한 읽기 전용 표 */
  canEdit: boolean
  /** 항목 상세에서 대본 칸 오른쪽에 놓을 것(코멘트·컨펌 기록). 보드 인라인 편집에는 없다 */
  side?: ReactNode
}) {
  const cues = useAsync(() => provider.listCues(deliverableId), [deliverableId])
  const list = useMemo(() => cues.data ?? [], [cues.data])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [allScripts, setAllScripts] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; position: 'before' | 'after' } | null>(null)

  // 처음 열면 첫 큐의 대본을 보인다(대본 칸이 비어 있지 않게)
  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId(list[0].id)
  }, [list, selectedId])

  const applyOrder = async (updates: { id: string; sort_order: number }[]) => {
    if (updates.length === 0) return
    setError(null)
    try {
      for (const u of updates) await provider.updateCue(u.id, { sort_order: u.sort_order })
      cues.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '순서를 바꾸지 못했습니다.')
      cues.reload()
    }
  }

  const add = useMutation(() => provider.createCue(deliverableId, { cue_no: nextCueNo(list) }))
  const handleAdd = async () => {
    const created = await add.run()
    if (created) {
      cues.reload()
      setSelectedId(created.id)
      setEditingId(created.id)
    }
  }

  const handleDelete = async (cue: Cue) => {
    const name = cue.cue_no ?? cue.segment ?? '이 큐'
    if (!window.confirm(`큐 '${name}'을(를) 지울까요? 대본도 함께 사라집니다.`)) return
    setError(null)
    try {
      await provider.deleteCue(cue.id)
      if (selectedId === cue.id) setSelectedId(null)
      cues.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '큐를 지우지 못했습니다.')
    }
  }

  const colCount = canEdit ? 9 : 7
  const selected = list.find((c) => c.id === selectedId) ?? null
  const times = list.map((c) => c.time_at).filter((t): t is string => !!t)
  const caption = [
    times.length > 0 ? `${times[0]} 시작` : null,
    times.length > 1 ? `마지막 큐 ${times[times.length - 1]}` : null,
    canEdit && list.length > 1 ? '끌어서 순서 바꾸기' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const scriptPanel = (
    <section className="ui-card" aria-label="대본" data-testid="cue-script-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="t-card-title">{allScripts ? '대본 전체' : '대본'}</h2>
          {!allScripts && selected && (
            <span className="t-caption truncate">
              {selected.cue_no ?? '—'} · {summaryLine(selected.body)} — 표에서 고른 큐
            </span>
          )}
        </div>
        {canEdit && !allScripts && selected && (
          <button type="button" onClick={() => setEditingId(selected.id)} className="btn btn-ghost btn-sm">
            편집
          </button>
        )}
      </div>
      <div className="space-y-3 px-5 py-4 text-sm leading-relaxed">
        {allScripts ? (
          list.length === 0 ? (
            <p className="text-ink-cap">아직 큐가 없습니다.</p>
          ) : (
            list.map((c) => (
              <div key={c.id} className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="text-xs font-semibold text-ink-sub">
                  {c.cue_no ?? '—'}
                  {c.time_at ? ` · ${c.time_at}` : ''}
                  {c.segment ? ` · ${c.segment}` : ''}
                </p>
                {c.body ? renderLiteMarkdown(c.body) : <p className="text-xs text-ink-cap">대본 없음</p>}
              </div>
            ))
          )
        ) : selected ? (
          selected.body ? (
            renderLiteMarkdown(selected.body)
          ) : (
            <p className="text-ink-cap">작성된 대본이 없습니다.{canEdit ? ' [편집]으로 적을 수 있습니다.' : ''}</p>
          )
        ) : (
          <p className="text-ink-cap">표에서 [대본]을 누르면 그 큐의 대본이 여기에 보입니다.</p>
        )}
      </div>
    </section>
  )

  return (
    <div className="space-y-4">
      <section className="ui-card" aria-label="큐시트">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="t-card-title">큐 {list.length}개</h2>
            {caption && <span className="t-caption">{caption}</span>}
          </div>
          {list.length > 0 && (
            <button type="button" onClick={() => setAllScripts((v) => !v)} aria-pressed={allScripts} className="btn btn-ghost btn-sm">
              {allScripts ? '고른 큐만 보기' : '대본 모아 보기'}
            </button>
          )}
        </div>

        {cues.loading && !cues.data && <p className="px-5 py-4 text-sm text-ink-cap">불러오는 중…</p>}
        <div className="px-5 empty:hidden">
          <ErrorAlert message={cues.error} />
          <ErrorAlert message={error} />
          <ErrorAlert message={add.error} />
        </div>

        {cues.data && (
          <div className="overflow-x-auto">
            <table className="ui-table min-w-[900px] table-fixed text-sm" data-testid="cue-table">
              <colgroup>
                {canEdit && <col className="w-9" />}
                <col className="w-[60px]" />
                <col className="w-[76px]" />
                <col className="w-[84px]" />
                <col />
                <col className="w-[150px]" />
                <col className="w-[116px]" />
                <col className="w-[126px]" />
                {canEdit && <col className="w-11" />}
              </colgroup>
              <thead>
                <tr>
                  {canEdit && <th className="ui-th static border-r-0 px-0" aria-label="순서" />}
                  <th className={`ui-th ${canEdit ? 'static border-r-0' : ''}`}>큐</th>
                  <th className="ui-th">시간</th>
                  <th className="ui-th">구분</th>
                  <th className="ui-th">내용</th>
                  <th className="ui-th">음향</th>
                  <th className="ui-th">조명</th>
                  <th className="ui-th">스크린</th>
                  {canEdit && <th className="ui-th px-0" aria-label="메뉴" />}
                </tr>
              </thead>
              <tbody>
                {list.map((c, i) => (
                  <CueRow
                    key={c.id}
                    cue={c}
                    colCount={colCount}
                    canEdit={canEdit}
                    isFirst={i === 0}
                    isLast={i === list.length - 1}
                    selected={c.id === selectedId && !allScripts}
                    editing={c.id === editingId}
                    dropHint={dropHint?.id === c.id && dragId !== c.id ? dropHint.position : null}
                    onSelect={() => {
                      setAllScripts(false)
                      setSelectedId(c.id)
                    }}
                    onEdit={() => setEditingId(c.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onMove={(dir) => void applyOrder(moveByOne(list, c.id, dir))}
                    onDelete={() => void handleDelete(c)}
                    onDragStart={() => setDragId(c.id)}
                    onDragOverRow={(position) => setDropHint({ id: c.id, position })}
                    onDropRow={(fromId, position) => {
                      setDropHint(null)
                      setDragId(null)
                      void applyOrder(reorderUpdates(list, fromId, c.id, position))
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setDropHint(null)
                    }}
                    onChanged={cues.reload}
                  />
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="static border-r-0 font-normal text-ink-cap">
                      아직 큐가 없습니다.
                    </td>
                  </tr>
                )}
                {canEdit && (
                  <tr className="h-12">
                    <td colSpan={colCount} className="ui-cell-wrap static border-b-0 border-r-0 pl-12 font-normal">
                      <span className="inline-flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => void handleAdd()}
                          disabled={add.pending}
                          className="text-sm font-semibold text-accent-deep hover:underline disabled:text-ink-cap"
                        >
                          큐 추가
                        </button>
                        <span className="t-caption">
                          {nextCueNo(list)} 줄이 바로 생기고, 칸 사이는 Tab으로 이동합니다
                        </span>
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {side ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          {scriptPanel}
          <div className="min-w-0 space-y-4">{side}</div>
        </div>
      ) : (
        scriptPanel
      )}
    </div>
  )
}
