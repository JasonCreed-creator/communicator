// S-11 파트너 표 — 접수 대장 (시안 '파트너 보드.dc.html' · 표 정본 §05).
//
// 시안이 바꾼 것:
//   · 열 구성이 "링크 상태"에서 **접수 진행 막대 · 검토 필요 · 재요청 · 최근 접수**로 바뀐다.
//     PM이 보는 것은 링크를 줬는지가 아니라 무엇이 아직 안 들어왔는지다(제출 링크 발급은
//     행사 설정 ② 파트너 탭에 그대로 남는다 — 포털은 현행 유지).
//   · **진행 낮은 순 기본 정렬** — 손볼 파트너가 위로 온다.
//   · 셀 내 막대는 진행률 열에만(§05 조건 4), 수치는 바 아래 줄 우측(§07).
//   · 철회 파트너는 숨기지 않고 canvas 면으로 가라앉힌다.
// 계약 관련 금액은 어떤 열에도 없다(§21.2 R-H3).
import { useState } from 'react'
import SortableTh, { type SortDirection } from '../internal/SortableTh'
import { LevelBadge } from '../internal/StatusBadge'
import { PARTNER_STATUS_LABELS, formatDate } from '../../lib/labels'
import type { StatusLevel } from '../../lib/labels'
import type { PartnerWithProgress } from '../../types/views'
import { receiptProgress } from './partnerReceipt'

type SortKey = 'name' | 'progress'

/** 파트너 계열 배지(패턴 §03) — 중립 미배정 / 진행 참여 중 / 정상 제출 완료 / 차단 철회.
 *  '제출 임박'(주의)은 이 표에서 쓰지 않는다 — 임박은 마감 타임라인이 이미 말한다. */
export function partnerBoardStatus(p: PartnerWithProgress): { level: StatusLevel; label: string } {
  if (p.status === 'withdrawn') return { level: 'blocked', label: PARTNER_STATUS_LABELS.withdrawn }
  const { received, total } = receiptProgress(p.submission_counts)
  const settled =
    total > 0 &&
    received === total &&
    p.submission_counts.pending_approval === 0 &&
    p.submission_counts.changes_requested === 0
  if (settled) return { level: 'positive', label: '제출 완료' }
  return { level: 'progress', label: PARTNER_STATUS_LABELS.active }
}

/** 셀 내 진행률 막대 — §05 규칙 10(6px + 아래 줄 수치) */
function ReceiptCell({ received, total }: { received: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((received / total) * 100)
  const complete = total > 0 && received >= total
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
        <div
          data-testid="receipt-bar"
          className={`h-1.5 rounded-[3px] ${complete ? 'bg-positive' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs tabular-nums text-ink-sub">
        {received}/{total}
      </div>
    </div>
  )
}

export default function PartnerTable({
  partners,
  lastReceiptAt,
  selectedId,
  onSelect,
}: {
  partners: PartnerWithProgress[]
  /** 파트너별 최근 접수 시각 — 접수·검토로 상태가 마지막으로 움직인 제출 항목의 갱신 시각 */
  lastReceiptAt: Map<string, string>
  selectedId: string | null
  onSelect: (partnerId: string) => void
}) {
  // 기본 정렬 = 접수 진행 오름차순(진행 낮은 순). 시안의 기본 상태 그대로다.
  const [sortKey, setSortKey] = useState<SortKey>('progress')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const rows = [...partners].sort((a, b) => {
    const sign = sortDir === 'asc' ? 1 : -1
    // 철회 파트너는 정렬 방향과 무관하게 항상 아래로 가라앉힌다
    if ((a.status === 'withdrawn') !== (b.status === 'withdrawn')) {
      return a.status === 'withdrawn' ? 1 : -1
    }
    if (sortKey === 'name') return a.name.localeCompare(b.name, 'ko') * sign
    const ra = receiptProgress(a.submission_counts).ratio
    const rb = receiptProgress(b.submission_counts).ratio
    if (ra !== rb) return (ra - rb) * sign
    return a.name.localeCompare(b.name, 'ko')
  })

  return (
    <div className="overflow-x-auto">
      <table className="ui-table min-w-[900px] text-sm">
        <thead>
          <tr>
            <SortableTh
              active={sortKey === 'name'}
              direction={sortDir}
              onSort={() => toggleSort('name')}
              className="w-[220px]"
            >
              파트너
            </SortableTh>
            <th className="ui-th w-[132px]">구분</th>
            <SortableTh
              active={sortKey === 'progress'}
              direction={sortDir}
              onSort={() => toggleSort('progress')}
              className="w-[160px]"
            >
              접수 진행
            </SortableTh>
            <th className="ui-th ui-num w-[100px]">검토 필요</th>
            <th className="ui-th ui-num w-[112px]">재요청</th>
            <th
              className="ui-th w-[112px]"
              title="접수·검토로 상태가 마지막으로 움직인 제출 항목의 갱신 시각"
            >
              최근 접수
            </th>
            <th className="ui-th w-[112px]">상태</th>
            {/* 행 클릭 어포던스(›) 전용 열 */}
            <th className="ui-th w-6" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const withdrawn = p.status === 'withdrawn'
            const progress = receiptProgress(p.submission_counts)
            const status = partnerBoardStatus(p)
            const pending = p.submission_counts.pending_approval
            const unanswered = p.submission_counts.changes_requested
            const received = lastReceiptAt.get(p.id) ?? null
            const selected = selectedId === p.id
            return (
              <tr
                key={p.id}
                data-testid={`partner-row-${p.id}`}
                onClick={() => onSelect(p.id)}
                className="cursor-pointer"
                // 선택 행은 accent-tint 면으로만 표시하고, 철회는 canvas 면으로 가라앉힌다.
                // (스티키 첫 열이 background:inherit라 면은 tr에 인라인으로 고정한다 — 토큰 값만 사용)
                style={
                  selected
                    ? { background: 'var(--accent-tint)' }
                    : withdrawn
                      ? { background: 'var(--canvas)' }
                      : undefined
                }
              >
                <td title={p.name} className={withdrawn ? 'text-ink-sub' : 'text-ink'}>
                  {p.name}
                </td>
                <td className={withdrawn ? 'text-ink-cap' : 'text-ink-sub'} title={p.tier?.name ?? '미배정'}>
                  {p.tier?.name ?? '미배정'}
                </td>
                <td>
                  {withdrawn ? (
                    <span className="text-ink-cap">—</span>
                  ) : (
                    <ReceiptCell received={progress.received} total={progress.total} />
                  )}
                </td>
                <td className="ui-num">
                  {!withdrawn && pending > 0 ? (
                    // '내 행동을 기다리는' 상태 — 좌측 도트는 여기 하나에만 붙인다(§03)
                    <LevelBadge level="attention" label={String(pending)} dot />
                  ) : (
                    <span className="text-ink-cap">—</span>
                  )}
                </td>
                <td className="ui-num">
                  {!withdrawn && unanswered > 0 ? (
                    <LevelBadge level="blocked" label={`${unanswered} 미회신`} />
                  ) : (
                    <span className="text-ink-cap">—</span>
                  )}
                </td>
                <td className={withdrawn ? 'text-ink-cap' : 'text-ink-sub'}>
                  {received && !withdrawn ? formatDate(received.slice(0, 10)) : '—'}
                </td>
                <td>
                  <LevelBadge level={status.level} label={status.label} />
                </td>
                <td className="text-right text-ink-cap" aria-hidden="true">
                  ›
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
