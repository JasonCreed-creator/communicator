// 운영 보드 유형별 문서 표 (설계서 v2.13 §23.6 · 디자인지시서 §7-2.14 · 캔버스 "운영 문서 3종 실무화" ①).
// 네 유형이 같은 줄(상태·버전·담당·마감)이던 목록을 유형마다 그 문서가 담은 칸으로 바꾼다:
//   큐시트 = 큐 · 운영 시간 · 대본 작성 · 버전 / 시나리오 = 세션 · 멘트 작성 · 연사 확인 · 비상 멘트 /
//   운영가이드 = 섹션 채움 · 현장 인력 · 무전 · 원본 갱신 / 기타 = 최신 파일
// 공통 칸 = 문서(제목 → 항목 상세) · 상태 · 담당 · 마감 · 동작. 동작 = 정형 문서는 '열기'(그 행 바로 아래에서
// 빌더가 펼쳐진다 — v2.5 §10.2 인라인 빌더 그대로) · 파일 문서는 '열기'(상세) 또는 '올리기'(파일이 없을 때).
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DdayBadge from '../internal/DdayBadge'
import StatusBadge from '../internal/StatusBadge'
import CuesheetEditor from '../cue/CuesheetEditor'
import GuideBuilder from '../guide/GuideBuilder'
import ScenarioBuilder from '../scenario/ScenarioBuilder'
import { categoryGroupLabel } from '../../lib/boardPresets'
import { ROLE_BAR_CLASSES, STATUS_STRIP_CLASSES, formatDate, formatDateWeekday } from '../../lib/labels'
import { uploadLock } from '../../lib/uploadGate'
import type { Deliverable, Version } from '../../types/entities'
import { isStructuredDocCategory, type MemberRole } from '../../types/enums'
import { classifyOpsCard, type OpsDocCardKey } from './opsDocCards'
import { fileKind, timeRange, type OpsDocMetrics } from './opsDocMetrics'

export interface OpsBoardRow {
  deliverable: Deliverable
  latest: Version | null
  /**
   * 시나리오·운영가이드 항목의 빌더 행 수(scenario_blocks·guide_sections). 그 외 카테고리는 null.
   * 0이고 버전이 있으면 v2.5 이전 자유 카테고리 문서 — 빌더를 강제로 열지 않는다(레거시 파일 문서 보호).
   */
  builderRowCount: number | null
  metrics: OpsDocMetrics
}

/** 빌더 행 0 + 버전 1개 이상 = v2.5 이전부터 파일로 쌓아온 레거시 문서 — 빌더를 열지 않는다. */
export function isLegacyFileDoc(row: OpsBoardRow): boolean {
  return row.builderRowCount === 0 && (row.latest?.version_no ?? 0) >= 1
}

/** 유형별 가운데 칸 — [이름, 폭] */
const TYPE_COLUMNS: Record<OpsDocCardKey, [string, string][]> = {
  cuesheet: [
    ['큐', 'w-[64px]'],
    ['운영 시간', 'w-[120px]'],
    ['대본 작성', 'w-[92px]'],
    ['버전', 'w-[60px]'],
  ],
  scenario: [
    ['세션', 'w-[64px]'],
    ['멘트 작성', 'w-[92px]'],
    ['연사 확인', 'w-[100px]'],
    ['비상 멘트', 'w-[88px]'],
  ],
  guide: [
    ['섹션 채움', 'w-[92px]'],
    ['현장 인력', 'w-[88px]'],
    ['무전', 'w-[76px]'],
    ['원본 갱신', 'w-[150px]'],
  ],
  other: [['최신 파일', 'w-[200px]']],
}

const dash = <span className="text-ink-cap">—</span>

function typeCells(row: OpsBoardRow, legacy: boolean): ReactNode[] {
  const m = row.metrics
  if (legacy) return TYPE_COLUMNS[classifyOpsCard(row.deliverable.category)].map(() => dash)
  switch (m.type) {
    case 'cuesheet':
      return [
        <span className="tabular-nums">{m.cueCount}</span>,
        timeRange(m.firstTime, m.lastTime) ?? dash,
        m.cueCount > 0 ? <span className="tabular-nums">{m.scripted} / {m.cueCount}</span> : dash,
        row.latest ? `v${row.latest.version_no}` : dash,
      ]
    case 'scenario': {
      const p = m.progress
      return [
        <span className="tabular-nums">{p.sessionCount}</span>,
        p.spokenTotal > 0 ? <span className="tabular-nums">{p.spokenFilled} / {p.spokenTotal}</span> : dash,
        p.speakerPending > 0 ? (
          <span className="font-medium text-accent-deep">대기 {p.speakerPending}</span>
        ) : p.spokenTotal > 0 ? (
          <span className="text-ink-sub">완료</span>
        ) : (
          dash
        ),
        p.emergencyCount > 0 ? `${p.emergencyCount}종` : dash,
      ]
    }
    case 'guide': {
      const g = m.summary
      return [
        g.total > 0 ? <span className="tabular-nums">{g.filled} / {g.total}</span> : dash,
        g.staffTotal !== null ? `${g.staffTotal}명` : dash,
        g.radioChannels !== null ? `${g.radioChannels}채널` : dash,
        m.staleTitles.length > 0 ? (
          <span className="font-medium text-accent-deep" title={m.staleTitles.join(', ')}>
            {m.staleTitles[0]} 확인{m.staleTitles.length > 1 ? ` 외 ${m.staleTitles.length - 1}` : ''}
          </span>
        ) : (
          dash
        ),
      ]
    }
    case 'other': {
      const v = m.latest
      if (!v) return [<span className="text-ink-cap">파일 없음</span>]
      const kind = fileKind(v.file_name)
      return [
        <span title={v.file_name}>
          v{v.version_no}
          {kind ? ` · ${kind}` : ''} · {formatDate(v.created_at.slice(0, 10))}
        </span>,
      ]
    }
  }
}

export default function OpsDocTable({
  cardKey,
  rows,
  memberName,
  memberRole,
  canWrite,
  canEditBuilder,
  expandedId,
  onToggleBuilder,
  onCloseBuilder,
}: {
  cardKey: OpsDocCardKey
  rows: OpsBoardRow[]
  memberName: (userId: string | null) => string
  memberRole: (userId: string | null) => MemberRole | null
  /** 이 영역 쓰기 권한 — 파일 문서 '올리기' */
  canWrite: boolean
  /** pm·ops만 true — 빌더 편집 권한(§6.1) */
  canEditBuilder: boolean
  /** 지금 펼친 빌더의 항목 id */
  expandedId: string | null
  onToggleBuilder: (deliverable: Deliverable) => void
  onCloseBuilder: () => void
}) {
  const typeCols = TYPE_COLUMNS[cardKey]
  const colCount = typeCols.length + 5

  return (
    <div className="overflow-x-auto">
      <table className="ui-table min-w-[980px] table-fixed text-sm" data-testid={`ops-doc-table-${cardKey}`}>
        <colgroup>
          <col />
          {typeCols.map(([label, w]) => (
            <col key={label} className={w} />
          ))}
          <col className="w-[104px]" />
          <col className="w-[100px]" />
          <col className="w-[196px]" />
          <col className="w-[88px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="ui-th">문서</th>
            {typeCols.map(([label]) => (
              <th key={label} className="ui-th">
                {label}
              </th>
            ))}
            <th className="ui-th">상태</th>
            <th className="ui-th">담당</th>
            <th className="ui-th">마감</th>
            <th className="ui-th">동작</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const d = row.deliverable
            const structured = isStructuredDocCategory(d.category)
            const legacy = structured && isLegacyFileDoc(row)
            const expanded = expandedId === d.id
            const role = memberRole(d.assignee_id)
            const name = memberName(d.assignee_id)
            const done = d.status === 'final' || d.status === 'approved'
            const canUpload = canWrite && !row.latest && !uploadLock(d.status, { hasPartner: d.partner_id !== null })
            const sub = cardKey === 'other' ? categoryGroupLabel(d.category) : legacy ? '파일 문서 — 상세에서 열람' : null
            return (
              <Fragment key={d.id}>
                <tr data-testid="ops-doc-row" data-doc-id={d.id} className="h-14">
                  <td>
                    <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STRIP_CLASSES[d.status]}`} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        to={`/items/${d.id}`}
                        className="truncate text-sm font-semibold text-ink hover:text-accent-deep"
                        title={d.title}
                      >
                        {d.title}
                      </Link>
                      {sub && <span className="truncate text-xs font-normal text-ink-sub">{sub}</span>}
                    </div>
                  </td>
                  {typeCells(row, legacy).map((cell, i) => (
                    <td key={typeCols[i][0]} className="text-ink">
                      {cell}
                    </td>
                  ))}
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span aria-hidden className={`size-2 shrink-0 rounded-full ${role ? ROLE_BAR_CLASSES[role] : 'bg-track'}`} />
                      <span className="truncate" title={name}>
                        {name}
                      </span>
                    </span>
                  </td>
                  <td>
                    {d.due_date ? (
                      <span className="inline-flex items-center gap-2">
                        <span>{formatDateWeekday(d.due_date)}</span>
                        {done ? (
                          <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
                            완료
                          </span>
                        ) : (
                          <DdayBadge isoDate={d.due_date} />
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-cap">마감 미정</span>
                    )}
                  </td>
                  <td>
                    {structured && !legacy ? (
                      <button
                        type="button"
                        onClick={() => onToggleBuilder(d)}
                        aria-expanded={expanded}
                        aria-label={`${d.title} ${expanded ? '닫기' : '열기'}`}
                        className="btn btn-ghost btn-sm"
                      >
                        {expanded ? '닫기' : '열기'}
                      </button>
                    ) : canUpload ? (
                      <Link to={`/items/${d.id}?upload=1`} aria-label={`${d.title} 올리기`} className="btn btn-ghost btn-sm">
                        올리기
                      </Link>
                    ) : (
                      <Link to={`/items/${d.id}`} aria-label={`${d.title} 열기`} className="btn btn-ghost btn-sm">
                        열기
                      </Link>
                    )}
                  </td>
                </tr>
                {expanded && (
                  // v2.5 §10.2 인라인 빌더 — 그 행 바로 아래 한 줄 전체(별도 화면 이동 없음)
                  <tr data-testid={`builder-row-${d.id}`}>
                    <td colSpan={colCount} className="ui-cell-wrap static border-r-0 bg-canvas px-5 py-4 font-normal">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="t-card-title">
                          {d.category} 바로 편집 — {d.title}
                        </h3>
                        <span className="flex items-center gap-3">
                          <Link to={`/items/${d.id}`} className="text-sm text-steel hover:underline">
                            상세 화면으로 이동
                          </Link>
                          <button type="button" onClick={onCloseBuilder} className="btn btn-ghost btn-sm">
                            닫기
                          </button>
                        </span>
                      </div>
                      <div data-testid={`builder-panel-${classifyOpsCard(d.category)}`}>
                        {d.category === '큐시트' && <CuesheetEditor deliverableId={d.id} canEdit={canEditBuilder} />}
                        {d.category === '시나리오' && <ScenarioBuilder deliverableId={d.id} canEdit={canEditBuilder} />}
                        {d.category === '운영가이드' && <GuideBuilder deliverableId={d.id} canEdit={canEditBuilder} />}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
