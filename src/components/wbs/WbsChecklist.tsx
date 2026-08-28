import { Fragment, useState } from 'react'
import LinkedDeliverableBadge from './LinkedDeliverableBadge'
import WbsStatusControl from './WbsStatusControl'
import WbsTaskEditForm from './WbsTaskEditForm'
import { buildChecklistRows, type WbsPartnerGroup } from './wbsPartnerGroup'
import {
  WBS_DIRECTION_BADGE_CLASSES,
  dateRangeLabel,
  groupTasksByPhase,
  summarizePhase,
  wbsUrgency,
} from './wbsFormat'
import DdayBadge from '../internal/DdayBadge'
import SortableTh, { type SortDirection } from '../internal/SortableTh'
import { LevelBadge } from '../internal/StatusBadge'
import { ROLE_BAR_CLASSES, ROLE_LABELS, WBS_DIRECTION_LABELS, ddayLabel, formatDate } from '../../lib/labels'
import { toIsoDate } from '../../lib/wbs'
import type { Deliverable, WbsTask } from '../../types/entities'

interface WbsChecklistProps {
  tasks: WbsTask[]
  deliverables: Deliverable[]
  isPm: boolean
  onChanged: () => void
  /** P6-② — true(주최형)면 행마다 방향 뱃지(▲▼■)를 표기. 대행형은 항상 false로 전달(미표기). */
  isHost?: boolean
  /** 패턴 기준 시트 §05 규칙 02 — 밀집 모드(행 36). 내부 관리 화면인 S5에만 노출한다(조건 1). */
  dense?: boolean
}

/** 정렬 가능한 열만 화살표를 붙인다(§05 조건 3) — 코드 순서·기간 순서 둘 다 의미가 있다. */
type SortKey = 'code' | 'period'

/** S5 체크리스트 뷰 — 표 정본(.ui-table): 44 고정 · 스티키 첫 열 · 단계 그룹 헤더행 · 정렬 화살표.
 *  코드·태스크명(+origin_role)·담당(역할 도트)·소통 대상(v2.0)·기간·상태(5계열 배지)·D-day·연결 산출물, pm 편집.
 *  P6(3.15.1): 주최형은 같은 code의 파트너 인스턴스(partner_id 보유, 2건 이상)를 그룹 행 1줄로 접는다
 *  (기본 접힘, 펼침 토글로 개별 행 노출) + host 행사는 행마다 방향 뱃지를 표기. */
export default function WbsChecklist({
  tasks,
  deliverables,
  isPm,
  onChanged,
  isHost = false,
  dense = false,
}: WbsChecklistProps) {
  const today = toIsoDate(new Date())
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const groups = groupTasksByPhase(tasks)
  const colCount = isPm ? 8 : 7

  if (tasks.length === 0) {
    return <p className="text-sm text-ink-cap">표시할 태스크가 없습니다.</p>
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // 정렬은 단계 그룹 안에서만 일어난다 — 그룹 헤더행(§05 규칙 08)의 의미를 깨지 않기 위해서다.
  const sortTasks = (list: WbsTask[]): WbsTask[] => {
    const sign = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (sortKey === 'period') {
        const diff = a.offset_start - b.offset_start || a.offset_end - b.offset_end
        if (diff !== 0) return diff * sign
      }
      return a.code.localeCompare(b.code, 'ko', { numeric: true }) * sign
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className={`ui-table min-w-[1080px] text-sm ${dense ? 'ui-table-dense' : ''}`}>
        <thead>
          <tr>
            <SortableTh
              active={sortKey === 'code'}
              direction={sortDir}
              onSort={() => toggleSort('code')}
              className="w-[300px]"
            >
              태스크
            </SortableTh>
            <th className="ui-th w-[104px]">담당</th>
            <th className="ui-th w-[132px]">소통 대상</th>
            <SortableTh
              active={sortKey === 'period'}
              direction={sortDir}
              onSort={() => toggleSort('period')}
              className="w-[212px]"
            >
              기간
            </SortableTh>
            <th className="ui-th w-[112px]">상태</th>
            <th className="ui-th ui-num w-[84px]">D-day</th>
            <th className="ui-th w-[176px]">연결 산출물</th>
            {isPm && <th className="ui-th print-hidden w-[76px]">편집</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const rows = buildChecklistRows(sortTasks(g.tasks), deliverables)
            const summary = summarizePhase(g.tasks, today)
            return (
              <Fragment key={g.phase_no}>
                {/* 그룹 헤더행 — canvas 면(§05 규칙 08). 스티키 첫 열 규칙이 background:inherit로
                    행 배경을 덮어써서, 면은 tr 인라인 배경으로 고정한다(토큰 값만 사용). */}
                <tr className="ui-table-group" style={{ background: 'var(--canvas)' }}>
                  <td colSpan={colCount}>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span>
                        {g.phase_no}. {g.phase_name}
                      </span>
                      <span className="font-normal text-ink-cap">
                        {summary.total}건 · 완료 {summary.done}/{summary.total}
                      </span>
                      {summary.delayed > 0 && <LevelBadge level="blocked" label={`지연 ${summary.delayed}`} />}
                      {summary.imminent > 0 && <LevelBadge level="attention" label={`임박 ${summary.imminent}`} />}
                    </span>
                  </td>
                </tr>
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
              </Fragment>
            )
          })}
        </tbody>
      </table>
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

/** 역할 = 형태(패턴 기준 시트 §04) — 상태는 면(배지), 역할은 좌측 4px 바와 담당자 앞 도트로만 나타낸다. */
function RoleBar({ role }: { role: WbsTask['role'] }) {
  return <span aria-hidden className={`h-5 w-1 shrink-0 rounded-[2px] ${ROLE_BAR_CLASSES[role]}`} />
}

function RoleDot({ role }: { role: WbsTask['role'] }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${ROLE_BAR_CLASSES[role]}`} />
}

/** D-day 열 — 미완료 태스크만 배지(지난 기한은 negative). 완료 태스크는 경보가 아니므로 중립 텍스트. */
function TaskDday({ task }: { task: WbsTask }) {
  if (!task.end_date) return <span className="text-xs text-ink-cap">—</span>
  if (task.status === 'done') return <span className="text-xs text-ink-cap">{ddayLabel(task.end_date)}</span>
  return <DdayBadge isoDate={task.end_date} />
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
      <tr>
        <td>
          <span className="flex min-w-0 items-center gap-2">
            <RoleBar role={group.instances[0].role} />
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="btn btn-ghost btn-sm print-hidden shrink-0"
            >
              {expanded ? '접기' : '펼치기'}
            </button>
            <span className="shrink-0 font-mono text-xs font-normal text-ink-cap">{group.code}</span>
            {isHost && <DirectionBadge direction={group.direction} />}
            <span className="truncate font-medium text-ink" title={group.title}>
              {group.title}
            </span>
          </span>
        </td>
        <td colSpan={colCount - 1}>
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-ink-cap">
              {group.end_date ? formatDate(group.end_date) : '날짜 미정'}
            </span>
            <span className="text-xs font-medium text-accent-deep">
              제출 {group.submitted}/{group.total}
            </span>
          </span>
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
  const urgency = wbsUrgency(task, today)
  const colCount = isPm ? 8 : 7

  return (
    <>
      {/* 지연·임박은 행 배경이 아니라 상태 배지(차단·주의)와 D-day 배지로 읽힌다 —
          표 정본의 zebra·hover 면(§05 규칙 01·06)을 상태 색이 덮지 않게 한다. */}
      <tr data-urgency={urgency ?? undefined}>
        <td>
          <span className={`flex min-w-0 items-center gap-2 ${indent ? 'pl-5' : ''}`}>
            <RoleBar role={task.role} />
            <span className="shrink-0 font-mono text-xs font-normal text-ink-cap">{task.code}</span>
            {isHost && <DirectionBadge direction={task.direction} />}
            <span
              className={`truncate ${task.status === 'done' ? 'text-ink-cap line-through' : 'font-medium text-ink'}`}
              title={task.title}
            >
              {task.title}
            </span>
            {task.origin_role && (
              <span className="inline-flex shrink-0 items-center rounded bg-track px-1.5 py-0.5 text-[10px] font-medium text-ink-cap">
                {task.origin_role}
              </span>
            )}
          </span>
        </td>
        <td className="text-xs text-ink-sub">
          <span className="inline-flex items-center gap-1.5">
            <RoleDot role={task.role} />
            {ROLE_LABELS[task.role]}
          </span>
        </td>
        <td>
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
        <td className="text-xs text-ink-sub">
          {dateRangeLabel(task.start_date, task.end_date, task.offset_start, task.offset_end)}
        </td>
        <td>
          <WbsStatusControl task={task} today={today} onChanged={onChanged} />
        </td>
        <td className="ui-num">
          <TaskDday task={task} />
        </td>
        <td>
          <LinkedDeliverableBadge deliverableId={task.linked_deliverable_id} deliverables={deliverables} />
        </td>
        {isPm && (
          <td className="print-hidden">
            <button type="button" onClick={() => setEditing((v) => !v)} className="btn btn-ghost btn-sm">
              {editing ? '닫기' : '편집'}
            </button>
          </td>
        )}
      </tr>
      {editing && isPm && (
        <tr>
          {/* 편집 폼 행 — 표 정본의 nowrap·ellipsis(§05 규칙 07)는 한 줄 셀용이라 이 행에서만 해제한다
              (클래스는 .ui-table 셀 규칙에 특이도로 밀려 인라인으로 지정) */}
          <td colSpan={colCount} className="py-3" style={{ whiteSpace: 'normal', overflow: 'visible' }}>
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
