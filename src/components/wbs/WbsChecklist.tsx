import { useState } from 'react'
import LinkedDeliverableBadge from './LinkedDeliverableBadge'
import WbsStatusControl from './WbsStatusControl'
import WbsTaskEditForm from './WbsTaskEditForm'
import { buildChecklistRows, type WbsPartnerGroup } from './wbsPartnerGroup'
import { WBS_DIRECTION_BADGE_CLASSES, dateRangeLabel, groupTasksByPhase } from './wbsFormat'
import { ROLE_LABELS, WBS_DIRECTION_LABELS, formatDate } from '../../lib/labels'
import { isDelayed, isImminent, toIsoDate } from '../../lib/wbs'
import type { Deliverable, WbsTask } from '../../types/entities'

interface WbsChecklistProps {
  tasks: WbsTask[]
  deliverables: Deliverable[]
  isPm: boolean
  onChanged: () => void
  /** P6-② — true(주최형)면 행마다 방향 뱃지(▲▼■)를 표기. 대행형은 항상 false로 전달(미표기). */
  isHost?: boolean
}

/** S5 체크리스트 뷰 — 단계별 그룹 표. 코드·태스크명(+origin_role)·기간·담당·소통 대상(v2.0)·상태·연결 산출물, pm 편집.
 *  P6(3.15.1): 주최형은 같은 code의 파트너 인스턴스(partner_id 보유, 2건 이상)를 그룹 행 1줄로 접는다
 *  (기본 접힘, 펼침 토글로 개별 행 노출) + host 행사는 행마다 방향 뱃지를 표기. */
export default function WbsChecklist({ tasks, deliverables, isPm, onChanged, isHost = false }: WbsChecklistProps) {
  const today = toIsoDate(new Date())
  const groups = groupTasksByPhase(tasks)
  const colCount = isPm ? 8 : 7

  if (tasks.length === 0) {
    return <p className="text-sm text-ink-cap">표시할 태스크가 없습니다.</p>
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const rows = buildChecklistRows(g.tasks, deliverables)
        return (
          <div key={g.phase_no}>
            <h3 className="mb-2 text-xs font-semibold text-brown">
              {g.phase_no}. {g.phase_name}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="ui-th">코드</th>
                    <th className="ui-th">태스크</th>
                    <th className="ui-th">기간</th>
                    <th className="ui-th">담당</th>
                    <th className="ui-th">소통 대상</th>
                    <th className="ui-th">상태</th>
                    <th className="ui-th">연결 산출물</th>
                    {isPm && <th className="ui-th">편집</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) =>
                    row.type === 'group' ? (
                      <WbsPartnerGroupRow
                        key={`grp-${row.group.code}`}
                        group={row.group}
                        deliverables={deliverables}
                        isPm={isPm}
                        today={today}
                        onChanged={onChanged}
                        isHost={isHost}
                        colCount={colCount}
                      />
                    ) : (
                      <WbsTaskRow
                        key={row.task.id}
                        task={row.task}
                        deliverables={deliverables}
                        isPm={isPm}
                        today={today}
                        onChanged={onChanged}
                        isHost={isHost}
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** P6-② 방향 뱃지 — host 행사에서만 렌더(WBS_DIRECTION_LABELS 재사용, 파트너 보드 타임라인과 동일 문구) */
function DirectionBadge({ direction }: { direction: WbsTask['direction'] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${WBS_DIRECTION_BADGE_CLASSES[direction]}`}
    >
      {WBS_DIRECTION_LABELS[direction]}
    </span>
  )
}

/** P5-② 파트너 그룹 요약 행 — 기본 접힘. 펼치면 인스턴스별 WbsTaskRow를 그대로 노출(제목에 파트너명 접미 포함). */
function WbsPartnerGroupRow({
  group,
  deliverables,
  isPm,
  today,
  onChanged,
  isHost,
  colCount,
}: {
  group: WbsPartnerGroup
  deliverables: Deliverable[]
  isPm: boolean
  today: string
  onChanged: () => void
  isHost: boolean
  colCount: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr className="bg-canvas hover:bg-accent-tint/20">
        <td className="py-2.5 pr-3 font-mono text-xs text-ink-cap">{group.code}</td>
        <td colSpan={colCount - 1} className="py-2.5 pr-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="btn btn-ghost btn-sm shrink-0"
            >
              {expanded ? '접기' : '펼치기'}
            </button>
            {isHost && <DirectionBadge direction={group.direction} />}
            <span className="font-medium text-ink">{group.title}</span>
            <span className="shrink-0 text-xs text-ink-cap">
              {group.end_date ? formatDate(group.end_date) : '날짜 미정'}
            </span>
            <span className="shrink-0 text-xs font-medium text-accent-deep">
              제출 {group.submitted}/{group.total}
            </span>
          </div>
        </td>
      </tr>
      {expanded &&
        group.instances.map((task) => (
          <WbsTaskRow
            key={task.id}
            task={task}
            deliverables={deliverables}
            isPm={isPm}
            today={today}
            onChanged={onChanged}
            isHost={isHost}
            indent
          />
        ))}
    </>
  )
}

function rowHighlightClass(delayed: boolean, imminent: boolean): string {
  if (delayed) return 'bg-negative-tint'
  if (imminent) return 'bg-accent-tint'
  return 'hover:bg-accent-tint/30'
}

function WbsTaskRow({
  task,
  deliverables,
  isPm,
  today,
  onChanged,
  isHost = false,
  indent = false,
}: {
  task: WbsTask
  deliverables: Deliverable[]
  isPm: boolean
  today: string
  onChanged: () => void
  /** P6-② — true면 방향 뱃지(▲▼■) 표기(host 전용) */
  isHost?: boolean
  /** P5-② — 파트너 그룹 펼침 안의 인스턴스 행이면 코드 열을 들여쓴다 */
  indent?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const delayed = isDelayed(task, today)
  const imminent = isImminent(task, today)
  const rowClass = rowHighlightClass(delayed, imminent)
  const colCount = isPm ? 8 : 7

  return (
    <>
      <tr className={rowClass}>
        <td className={`py-2.5 pr-3 font-mono text-xs text-ink-cap ${indent ? 'pl-6' : ''}`}>{task.code}</td>
        <td className="py-2.5 pr-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {isHost && <DirectionBadge direction={task.direction} />}
            <span className={task.status === 'done' ? 'text-ink-cap line-through' : 'font-medium text-ink'}>
              {task.title}
            </span>
            {task.origin_role && (
              <span className="inline-flex shrink-0 items-center rounded bg-track px-1.5 py-0.5 text-[10px] font-medium text-ink-cap">
                {task.origin_role}
              </span>
            )}
            {delayed && <span className="text-xs font-medium text-negative">지연</span>}
            {imminent && <span className="text-xs font-medium text-accent-deep">임박</span>}
          </div>
        </td>
        <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-ink-sub">
          {dateRangeLabel(task.start_date, task.end_date, task.offset_start, task.offset_end)}
        </td>
        <td className="py-2.5 pr-3">
          <span className="inline-flex shrink-0 items-center rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
            {ROLE_LABELS[task.role]}
          </span>
        </td>
        <td className="py-2.5 pr-3">
          {/* v2.0 §4-15b — 소통 대상 (템플릿 시드, 복수는 '·' 결합) */}
          {task.target ? (
            <span className="flex flex-wrap gap-1">
              {task.target.split('·').map((target) => (
                <span
                  key={target}
                  className="inline-flex shrink-0 items-center rounded bg-steel-tint px-1.5 py-0.5 text-[10px] font-medium text-steel"
                >
                  {target}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-xs text-ink-cap">—</span>
          )}
        </td>
        <td className="py-2.5 pr-3">
          <WbsStatusControl taskId={task.id} status={task.status} onChanged={onChanged} />
        </td>
        <td className="py-2.5 pr-3">
          <LinkedDeliverableBadge deliverableId={task.linked_deliverable_id} deliverables={deliverables} />
        </td>
        {isPm && (
          <td className="py-2.5 pr-3">
            <button type="button" onClick={() => setEditing((v) => !v)} className="btn btn-ghost btn-sm">
              {editing ? '닫기' : '편집'}
            </button>
          </td>
        )}
      </tr>
      {editing && isPm && (
        <tr className={rowClass}>
          <td colSpan={colCount} className="pb-3">
            <WbsTaskEditForm
              task={task}
              deliverables={deliverables}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                onChanged()
              }}
            />
          </td>
        </tr>
      )}
    </>
  )
}
