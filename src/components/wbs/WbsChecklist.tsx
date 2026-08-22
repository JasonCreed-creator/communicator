import { useState } from 'react'
import LinkedDeliverableBadge from './LinkedDeliverableBadge'
import WbsStatusControl from './WbsStatusControl'
import WbsTaskEditForm from './WbsTaskEditForm'
import { dateRangeLabel, groupTasksByPhase } from './wbsFormat'
import { ROLE_LABELS } from '../../lib/labels'
import { isDelayed, isImminent, toIsoDate } from '../../lib/wbs'
import type { Deliverable, WbsTask } from '../../types/entities'

interface WbsChecklistProps {
  tasks: WbsTask[]
  deliverables: Deliverable[]
  isPm: boolean
  onChanged: () => void
}

/** S5 체크리스트 뷰 — 단계별 그룹 표. 코드·태스크명(+origin_role)·기간·담당·상태·연결 산출물, pm 편집 */
export default function WbsChecklist({ tasks, deliverables, isPm, onChanged }: WbsChecklistProps) {
  const today = toIsoDate(new Date())
  const groups = groupTasksByPhase(tasks)

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400">표시할 태스크가 없습니다.</p>
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.phase_no}>
          <h3 className="mb-2 text-xs font-semibold text-gray-500">
            {g.phase_no}. {g.phase_name}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-1.5 pr-3 font-medium">코드</th>
                  <th className="py-1.5 pr-3 font-medium">태스크</th>
                  <th className="py-1.5 pr-3 font-medium">기간</th>
                  <th className="py-1.5 pr-3 font-medium">담당</th>
                  <th className="py-1.5 pr-3 font-medium">상태</th>
                  <th className="py-1.5 pr-3 font-medium">연결 산출물</th>
                  {isPm && <th className="py-1.5 pr-3 font-medium">편집</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {g.tasks.map((task) => (
                  <WbsTaskRow
                    key={task.id}
                    task={task}
                    deliverables={deliverables}
                    isPm={isPm}
                    today={today}
                    onChanged={onChanged}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function WbsTaskRow({
  task,
  deliverables,
  isPm,
  today,
  onChanged,
}: {
  task: WbsTask
  deliverables: Deliverable[]
  isPm: boolean
  today: string
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const delayed = isDelayed(task, today)
  const imminent = isImminent(task, today)
  const rowClass = delayed ? 'bg-red-50' : imminent ? 'bg-amber-50' : ''
  const colCount = isPm ? 7 : 6

  return (
    <>
      <tr className={rowClass}>
        <td className="py-2 pr-3 font-mono text-xs text-gray-500">{task.code}</td>
        <td className="py-2 pr-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={task.status === 'done' ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}>
              {task.title}
            </span>
            {task.origin_role && (
              <span className="inline-flex shrink-0 items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {task.origin_role}
              </span>
            )}
            {delayed && <span className="text-xs font-medium text-red-700">지연</span>}
            {imminent && <span className="text-xs font-medium text-amber-700">임박</span>}
          </div>
        </td>
        <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums text-gray-600">
          {dateRangeLabel(task.start_date, task.end_date, task.offset_start, task.offset_end)}
        </td>
        <td className="py-2 pr-3">
          <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {ROLE_LABELS[task.role]}
          </span>
        </td>
        <td className="py-2 pr-3">
          <WbsStatusControl taskId={task.id} status={task.status} onChanged={onChanged} />
        </td>
        <td className="py-2 pr-3">
          <LinkedDeliverableBadge deliverableId={task.linked_deliverable_id} deliverables={deliverables} />
        </td>
        {isPm && (
          <td className="py-2 pr-3">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
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
