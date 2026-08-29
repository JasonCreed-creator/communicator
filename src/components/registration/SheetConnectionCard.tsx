// v2.6 §24.5 — 등록 보드(S4) 구글 시트 연결 카드. **탭 위 페이지 상단에 상시 노출**한다
// (게이트 뒤에 숨기지 않는다 — §10 진입점 원칙).
//
// 상태 4종: 미연결(빈 상태 ②) / 연결됨·정상 / 갱신 있음(주의 ＋ 좌측 도트 → 인라인 차이 표) /
//           권한 끊김(차단 — 마지막 성공 스냅숏 유지 고지).
//
// 두 가지 계약을 화면에서 지킨다.
//  · R-S2 자동 확인(결정 B)은 **감지까지만** 한다 — checkSheetUpdates는 명단·KPI를 바꾸지 않는다.
//  · R-S1 [변경 n건 반영]은 **보고 있던** diff.snapshot_version을 그대로 넘긴다. 다른 담당자가 먼저
//    반영했으면 409가 오는데, 조용히 재시도하지 않고 오류 원문을 띄운 뒤 차이를 다시 읽는다.
import { useEffect, useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { LevelBadge } from '../internal/StatusBadge'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import { SHEET_DIFF_KIND_LABELS, SHEET_FIELD_LABELS, SHEET_STATE_LABELS } from '../../types/enums'
import type { SheetConnection } from '../../types/entities'
import SheetConnectWizard from './SheetConnectWizard'
import { SHEET_STATE_LEVEL, relativeFromNow, stamp, timeHm } from './sheetFormat'

const provider = getDataProvider()

/** 자동 확인 주기 선택지 — 0은 '사용 안 함'(수동만) */
const AUTO_CHECK_OPTIONS = [0, 5, 15, 30, 60] as const

function autoCheckKey(projectId: string): string {
  return `communicator.sheetAutoCheck.${projectId}`
}

/** 주기 값은 v10 계약에 저장 메서드가 없어 **뷰어 단위 로컬 설정**으로만 보관한다(설계 개정 전까지). */
function readAutoCheck(projectId: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(autoCheckKey(projectId))
    if (raw === null) return fallback
    const n = Number(raw)
    return AUTO_CHECK_OPTIONS.includes(n as (typeof AUTO_CHECK_OPTIONS)[number]) ? n : fallback
  } catch {
    return fallback
  }
}

export default function SheetConnectionCard({
  projectId,
  connection,
  loading,
  error,
  onChanged,
}: {
  projectId: string
  connection: SheetConnection | null
  loading: boolean
  error: string | null
  onChanged: () => void
}) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(true)
  const [autoMinutes, setAutoMinutes] = useState<number>(15)

  const state = connection?.state ?? 'disconnected'
  const isStale = state === 'stale'
  const pendingTotal =
    (connection?.pending_added ?? 0) + (connection?.pending_changed ?? 0) + (connection?.pending_removed ?? 0)

  // 연결이 바뀌면 이 행사의 저장된 주기(없으면 연결의 기본값)를 다시 읽는다
  const connectionId = connection?.id ?? null
  const defaultAutoMinutes = connection?.auto_check_minutes ?? 15
  useEffect(() => {
    if (!connectionId) return
    setAutoMinutes(readAutoCheck(projectId, defaultAutoMinutes))
  }, [projectId, connectionId, defaultAutoMinutes])

  const syncM = useMutation(() => provider.checkSheetUpdates(projectId))
  const applyM = useMutation((version: number) => provider.applySheetDiff(projectId, version))
  const reauthM = useMutation(() => provider.reauthorizeSheet(projectId))
  const disconnectM = useMutation(() => provider.disconnectSheet(projectId))

  const diff = useAsync(
    () => (isStale ? provider.getSheetDiff(projectId) : Promise.resolve(null)),
    [projectId, isStale, connection?.snapshot_version, pendingTotal],
  )

  // 주기 자동 확인(결정 B) — **감지만** 한다. 0이면 걸지 않고, 언마운트·주기 변경 시 반드시 정리한다.
  useEffect(() => {
    if (!connectionId || autoMinutes <= 0) return
    const id = setInterval(() => {
      provider
        .checkSheetUpdates(projectId)
        .then(() => onChanged())
        .catch(() => undefined)
    }, autoMinutes * 60_000)
    return () => clearInterval(id)
  }, [projectId, autoMinutes, connectionId, onChanged])

  const handleSyncNow = async () => {
    const result = await syncM.run()
    if (result) {
      onChanged()
      diff.reload()
    }
  }

  const handleApply = async () => {
    const current = diff.data
    if (!current) return
    // R-S1 — 보고 있던 버전을 그대로 넘긴다
    const result = await applyM.run(current.snapshot_version)
    onChanged()
    // 성공이면 반영 후 상태, 409면 남이 올려둔 최신 차이 — 어느 쪽이든 다시 읽는다
    diff.reload()
    if (result) setDiffOpen(true)
  }

  const handleAutoChange = (value: number) => {
    setAutoMinutes(value)
    try {
      localStorage.setItem(autoCheckKey(projectId), String(value))
    } catch {
      // 저장 못 해도 이번 세션 동작에는 영향 없음
    }
  }

  const handleReauth = async () => {
    const result = await reauthM.run()
    if (result) onChanged()
  }

  const handleDisconnect = async () => {
    await disconnectM.run()
    setSettingsOpen(false)
    onChanged()
  }

  const handleConnected = () => {
    setWizardOpen(false)
    onChanged()
  }

  const badgeLevel = syncM.pending ? 'progress' : SHEET_STATE_LEVEL[state]
  const badgeLabel = syncM.pending ? '동기화 중' : SHEET_STATE_LABELS[state]

  return (
    <section className="ui-card" aria-label="구글 시트 연결">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="t-card-title">구글 시트 연결</h2>
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge
            level={badgeLevel}
            label={isStale && !syncM.pending ? `${badgeLabel} ${pendingTotal}` : badgeLabel}
            dot={isStale && !syncM.pending}
          />
          <span className="ui-badge inline-flex shrink-0 items-center rounded-full bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">
            시트 → 앱 단방향 · 시트가 정본
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <ErrorAlert message={error} />

        {loading && !connection && <p className="text-sm text-ink-cap">연결 상태를 불러오는 중…</p>}

        {wizardOpen && (
          <SheetConnectWizard
            projectId={projectId}
            onConnected={handleConnected}
            onCancel={() => setWizardOpen(false)}
          />
        )}

        {/* ── 미연결: 빈 상태 ② — 무엇이 좋아지는지 + 준비물 + CTA + xlsx 텍스트 링크 ── */}
        {!wizardOpen && !connection && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="max-w-2xl text-sm leading-relaxed text-ink-sub">
                참가자 명단 구글 시트를 연결하면 신청·확정·취소 현황과 명단이 이 화면에 그대로 올라옵니다.
                시트가 정본이고 앱은 읽기만 합니다.
              </p>
              <p className="mt-2 text-xs text-ink-cap">
                준비물 — 시트 URL, 그리고 뷰어 권한(서비스 계정 초대)
              </p>
            </div>
            <div className="shrink-0 text-right">
              <button type="button" onClick={() => setWizardOpen(true)} className="btn btn-accent">
                시트 연결하기
              </button>
              {/* 화면당 accent 1개 원칙 — 파일 임포트는 링크 텍스트로만 안내하고 실제 입력은 아래 툴바에 둔다 */}
              <p className="mt-2.5 text-sm text-ink-cap">
                또는 아래 <span className="underline decoration-border underline-offset-2">CSV 임포트</span>로
                xlsx를 한 번만 가져오기
              </p>
            </div>
          </div>
        )}

        {/* ── 권한 끊김: 마지막 성공 스냅숏을 계속 표시한다는 고지 ── */}
        {!wizardOpen && connection && state === 'revoked' && (
          <div className="rounded-md border border-negative/40 bg-negative-tint px-3 py-2 text-sm leading-relaxed text-negative">
            시트에 접근할 수 없습니다 — 공유가 해제되었거나 인증이 만료되었습니다. 마지막 성공 동기화(
            {stamp(connection.last_success_at ?? connection.snapshot_at)}) 스냅숏을 계속 표시합니다. 명단·KPI는
            그 시점 기준입니다.
          </div>
        )}

        {!wizardOpen && connection && (
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{connection.title ?? '연결된 시트'}</p>
              <p className="t-caption mt-1.5">
                {connection.tab_name} 탭 · 컬럼 {connection.mapping.length}개 매핑
                {connection.connected_at ? ` · 연결 ${stamp(connection.connected_at).slice(0, 10)}` : ''}
                {connection.connected_by ? ` · 연결자 ${connection.connected_by}` : ''}
                {state === 'revoked' && connection.failure_times.length > 0
                  ? ` · 실패 ${connection.failure_times.length}회 (${connection.failure_times
                      .map((t) => timeHm(t))
                      .join(' · ')})`
                  : ''}
              </p>
              {connection.url && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  <span className="max-w-md truncate rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink-sub">
                    {connection.url}
                  </span>
                  <a
                    href={connection.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-accent-deep hover:underline"
                  >
                    시트 열기 ↗
                  </a>
                </div>
              )}
              {state === 'connected' && (
                <p className="mt-2.5 text-sm text-ink-sub">원본과 일치합니다. 확인할 변경 사항이 없습니다.</p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="t-caption">마지막 동기화</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {stamp(connection.snapshot_at)}{' '}
                <span className="font-normal text-ink-cap">· {relativeFromNow(connection.snapshot_at)}</span>
              </p>
              {state !== 'revoked' && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <label className="sr-only" htmlFor="sheet-auto-check">
                    자동 확인 주기
                  </label>
                  <select
                    id="sheet-auto-check"
                    value={autoMinutes}
                    onChange={(e) => handleAutoChange(Number(e.target.value))}
                    className="ui-input ui-select text-sm"
                  >
                    {AUTO_CHECK_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m === 0 ? '자동 확인 사용 안 함' : `자동 확인 ${m}분`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="btn btn-ghost"
                    aria-expanded={settingsOpen}
                  >
                    연결 설정
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={syncM.pending}
                    className="btn btn-accent"
                  >
                    지금 동기화
                  </button>
                </div>
              )}
              {state === 'revoked' && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnectM.pending}
                    className="btn btn-ghost-negative"
                  >
                    연결 해제
                  </button>
                  <button
                    type="button"
                    onClick={handleReauth}
                    disabled={reauthM.pending}
                    className="btn btn-primary"
                  >
                    재인증
                  </button>
                </div>
              )}
              {state !== 'revoked' && (
                <p className="mt-2 max-w-xs text-right text-xs text-ink-cap">
                  자동은 변경 감지까지만 — 화면 반영은 항상 차이 확인 후
                </p>
              )}
            </div>
          </div>
        )}

        {/* 409(다른 담당자가 먼저 반영)는 차이 패널이 접힌 뒤에도 남아야 한다 — 카드 본문에 둔다 */}
        <ErrorAlert message={applyM.error} />
        <ErrorAlert message={syncM.error} />
        <ErrorAlert message={reauthM.error} />
        <ErrorAlert message={disconnectM.error} />

        {/* ── 연결 설정 패널 — 매핑은 읽기 전용, 여기서만 연결 해제 ── */}
        {!wizardOpen && connection && settingsOpen && (
          <div className="rounded-lg border border-border bg-canvas p-4">
            <p className="t-caption">컬럼 매핑 (읽기 전용 — 매핑을 바꾸려면 연결을 해제하고 다시 연결합니다)</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {connection.mapping.map((m) => (
                <li
                  key={m.column}
                  className="inline-flex items-center gap-1 rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub"
                >
                  <span className="text-ink-cap">{m.column}</span>
                  {m.field ? SHEET_FIELD_LABELS[m.field] : '무시'}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnectM.pending}
                className="btn btn-ghost-negative btn-sm"
              >
                연결 해제
              </button>
            </div>
          </div>
        )}

        {/* ── 갱신 있음 → 인라인 차이 확인 (canvas 인셋) ── */}
        {!wizardOpen && connection && isStale && (
          <div className="rounded-lg border border-border bg-canvas">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 핸드오프 §2.12: 배지 클릭으로도 차이가 펼쳐진다(우측 '차이 확인'과 같은 토글) */}
                <button
                  type="button"
                  onClick={() => setDiffOpen((v) => !v)}
                  aria-expanded={diffOpen}
                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <LevelBadge level="attention" label={`갱신 있음 ${pendingTotal}`} dot />
                </button>
                <span className="text-sm text-ink-sub">
                  원본 시트가 {timeHm(connection.source_modified_at)}에 수정되었습니다 — 추가{' '}
                  {connection.pending_added} · 변경 {connection.pending_changed} · 시트에서 제거{' '}
                  {connection.pending_removed}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDiffOpen((v) => !v)}
                aria-expanded={diffOpen}
                className="text-sm font-medium text-accent-deep hover:underline"
              >
                {diffOpen ? '차이 접기 ▲' : '차이 확인 ▼'}
              </button>
            </div>

            {diffOpen && (
              <div className="border-t border-border px-4 pb-4 pt-3.5">
                <ErrorAlert message={diff.error} />
                {diff.loading && !diff.data && <p className="text-sm text-ink-cap">차이를 불러오는 중…</p>}
                {diff.data && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="ui-table text-left text-sm" aria-label="시트 차이">
                        <thead>
                          <tr>
                            <th className="ui-th w-24">구분</th>
                            <th className="ui-th">대상</th>
                            <th className="ui-th">현재 화면(스냅숏 {timeHm(diff.data.snapshot_at)})</th>
                            <th className="ui-th">시트 원본({timeHm(diff.data.source_modified_at)})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.data.rows.map((row) => (
                            <tr key={`${row.kind}:${row.sheet_row_id}`}>
                              <td>
                                <LevelBadge
                                  level={
                                    row.kind === 'added'
                                      ? 'positive'
                                      : row.kind === 'changed'
                                        ? 'attention'
                                        : 'neutral'
                                  }
                                  label={SHEET_DIFF_KIND_LABELS[row.kind]}
                                />
                              </td>
                              <td className="text-ink" title={row.subject}>
                                {row.subject}
                              </td>
                              <td className={row.current ? 'text-ink-sub' : 'text-ink-cap'}>
                                {row.current ?? '—'}
                              </td>
                              <td className={row.source ? 'text-ink-sub' : 'text-ink-cap'}>
                                {row.source ?? '시트 행 없음 → ‘시트에서 제거됨’으로 이력 보존'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-xl text-xs leading-relaxed text-ink-sub">
                        확인 전까지 화면은 {timeHm(diff.data.snapshot_at)} 스냅숏 기준으로 유지됩니다. 자동
                        덮어쓰기는 하지 않습니다. 시트에서 사라진 행은 삭제하지 않고 상태만 바꿔 이력을
                        남깁니다.
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => setDiffOpen(false)} className="btn btn-ghost">
                          나중에
                        </button>
                        <button
                          type="button"
                          onClick={handleApply}
                          disabled={applyM.pending || diff.data.rows.length === 0}
                          className="btn btn-primary"
                        >
                          변경 {diff.data.rows.length}건 반영
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 권한 끊김에서도 반영 버튼은 숨기지 않고 비활성으로 남긴다(§24.5 — 왜 못 하는지 보이게) */}
        {!wizardOpen && connection && state === 'revoked' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-4 py-3">
            <p className="text-xs text-ink-sub">
              재인증 전에는 원본을 읽을 수 없어 차이를 반영할 수 없습니다.
            </p>
            <button type="button" disabled className="btn btn-primary">
              변경 반영
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
