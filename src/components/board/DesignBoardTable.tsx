// 디자인 보드 목록 보기 — 표 정본(§7-1.3) 6열: 상태 112 · 항목(제목 + 카테고리·규격) · 버전 56 · 담당 100 · 마감 220 · 다음 행동 300.
// 캔버스 "커뮤니케이터 UX 개편" 디자인 보드(§7-2.6). 행 높이 64(두 줄 제목), 좌측 3px 상태 스트립, 행을 누르면 항목 상세.
// 열 폭이 고정이라(table-fixed) 긴 제목은 …로 자르고 title로 전체를 보인다(표 정본 조건 2).
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DdayBadge from '../internal/DdayBadge'
import StatusBadge, { LevelBadge } from '../internal/StatusBadge'
import { categoryGroupLabel } from '../../lib/boardPresets'
import {
  DELIVERABLE_STATUS_LEVEL,
  HOST_STATUS_LABELS,
  ROLE_BAR_CLASSES,
  STATUS_DOT_STATUSES,
  STATUS_STRIP_CLASSES,
  formatDateWeekday,
} from '../../lib/labels'
import type { MemberRole } from '../../types/enums'
import DesignNextActionView, { type ClientLinkTarget } from './DesignNextAction'
import { designSpecParts, designTurn, type DesignNextAction, type DesignRow } from './designBoardRows'

export interface DesignRowView {
  row: DesignRow
  next: DesignNextAction
  assigneeName: string
  assigneeRole: MemberRole | null
}

/** 항목 상태 배지 — 파트너 항목은 주최형 라벨(§5.1), 그 외는 컨펌 계열 배지 그대로 */
export function DesignStatusBadge({ row }: { row: DesignRow }) {
  const d = row.deliverable
  if (d.partner_id === null) return <StatusBadge status={d.status} />
  return (
    <LevelBadge
      level={DELIVERABLE_STATUS_LEVEL[d.status]}
      label={HOST_STATUS_LABELS[d.status]}
      dot={STATUS_DOT_STATUSES.includes(d.status)}
    />
  )
}

/** 마감 — 요일 날짜 + 남은 날(`D-n`·`오늘`·`n일 지남`). 끝난 항목은 '완료'(지남을 붙이지 않는다 §7-2.2) */
export function DesignDue({ row }: { row: DesignRow }) {
  const due = row.deliverable.due_date
  if (!due) return <span className="text-sm text-ink-cap">마감 미정</span>
  const done = designTurn(row.deliverable) === 'done'
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-sm text-ink">{formatDateWeekday(due)}</span>
      {done ? (
        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
          완료
        </span>
      ) : (
        <DdayBadge isoDate={due} />
      )}
    </span>
  )
}

export function DesignAssignee({ name, role }: { name: string; role: MemberRole | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ink">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${role ? ROLE_BAR_CLASSES[role] : 'bg-track'}`} />
      <span className="truncate" title={name}>
        {name}
      </span>
    </span>
  )
}

export default function DesignBoardTable({
  views,
  clientLink,
  onChanged,
}: {
  views: DesignRowView[]
  clientLink: ClientLinkTarget | null
  onChanged: () => void
}) {
  const navigate = useNavigate()
  // 행 어디를 눌러도 상세가 열린다(캔버스 "행을 누르면 항목 상세가 열립니다"). 키보드는 제목 링크로 간다.
  const openRow = (id: string) => (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    navigate(`/items/${id}`)
  }

  return (
    <div className="overflow-x-auto">
      <table className="ui-table min-w-[960px] table-fixed" data-testid="design-board-table">
        <colgroup>
          <col className="w-[112px]" />
          <col />
          <col className="w-[56px]" />
          <col className="w-[100px]" />
          {/* 마감 = 요일 날짜 + 'nn일 지남' 알약이 한 줄에 들어가는 폭(190이면 알약이 잘렸다 — 렌더 실측) */}
          <col className="w-[220px]" />
          <col className="w-[300px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="ui-th">상태</th>
            <th className="ui-th">항목</th>
            <th className="ui-th">버전</th>
            <th className="ui-th">담당</th>
            <th className="ui-th">마감</th>
            <th className="ui-th">다음 행동</th>
          </tr>
        </thead>
        <tbody>
          {views.map(({ row, next, assigneeName, assigneeRole }) => {
            const d = row.deliverable
            return (
              <tr
                key={d.id}
                data-testid="design-row"
                data-turn={designTurn(d)}
                onClick={openRow(d.id)}
                className="h-16 cursor-pointer"
              >
                <td>
                  <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STRIP_CLASSES[d.status]}`} />
                  <DesignStatusBadge row={row} />
                </td>
                <td>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      to={`/items/${d.id}`}
                      className="truncate text-sm font-semibold text-ink hover:text-accent-deep"
                      title={d.title}
                    >
                      {d.title}
                    </Link>
                    {/* 한 줄 전체를 끝에서 한 번만 자른다 — 조각마다 자르면 좁은 폭에서 '100×1… · …'처럼 읽을 수 없었다(렌더 실측) */}
                    <span
                      className="block truncate text-xs text-ink-sub"
                      title={[categoryGroupLabel(d.category), ...designSpecParts(d)].join(' · ')}
                    >
                      <span>{categoryGroupLabel(d.category)}</span>
                      {designSpecParts(d).map((part) => (
                        <span key={part}>
                          <span aria-hidden className="text-border-strong">
                            {' · '}
                          </span>
                          {part}
                        </span>
                      ))}
                    </span>
                  </div>
                </td>
                <td className={row.latest ? 'text-sm text-ink' : 'text-sm text-ink-cap'}>
                  {row.latest ? `v${row.latest.version_no}` : '—'}
                </td>
                <td>
                  <DesignAssignee name={assigneeName} role={assigneeRole} />
                </td>
                <td>
                  <DesignDue row={row} />
                </td>
                <td>
                  <DesignNextActionView row={row} next={next} clientLink={clientLink} onChanged={onChanged} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
