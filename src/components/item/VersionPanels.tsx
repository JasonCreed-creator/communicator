// 항목 상세 — 큰 미리보기 · 버전 이력 · 컨펌 기록 (디자인지시서 v1.4 §7-2.7 · 캔버스 항목 상세).
// 사용자 요청(2026-09-25) "비주얼 미리보기가 좀 더 컸으면" → 최신 시안을 본문 폭 16:9로. 옛 버전은 오른쪽 목록을 눌러 같은 자리에서 본다.
// 컨펌 이력 표는 오른쪽 '컨펌 기록' 줄글 타임라인으로(보낸 날 · 답 기한 · 발주처 답) — 표 5칸보다 빨리 읽힌다.
import type { ReactNode } from 'react'
import { LevelBadge } from '../internal/StatusBadge'
import SegmentedToggle from '../internal/SegmentedToggle'
import { useAsync } from '../../hooks/useAsync'
import { daysUntil, formatDateTime } from '../../lib/labels'
import { versionStorage } from '../../lib/uploadGate'
import { getDataProvider } from '../../providers'
import { providerKind } from '../../providers/kind'
import type { Approval, Version } from '../../types/entities'
import { isThumbnailFile } from '../board/designBoardRows'
import { VersionPicture } from './VersionMedia'

const provider = getDataProvider()

/** 버전 이름 — 최신에는 '최신'을 붙인다 */
const versionName = (v: Version, latestId: string) => `v${v.version_no}${v.id === latestId ? ' 최신' : ''}`

// ── 큰 미리보기 ──────────────────────────────────────────────────────────
export function VersionPreviewCard({
  versions,
  selectedId,
  onSelect,
}: {
  /** version_no 내림차순(첫 번째 = 최신) */
  versions: Version[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0]
  const url = useAsync(() => provider.getFileUrl(selected.id), [selected.id])
  const latestId = versions[0].id
  // 2~4개면 머리에서 바로 고른다. 그보다 많으면 오른쪽 '버전 이력'에서 고른다(머리가 길어지지 않게)
  const inlineSwitch = versions.length >= 2 && versions.length <= 4
  const image = isThumbnailFile(selected.file_name)

  return (
    <section className="ui-card" aria-label="미리보기" data-testid="version-preview">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {inlineSwitch ? (
            <SegmentedToggle
              label="미리볼 버전"
              value={selected.id}
              options={versions.map((v) => ({ value: v.id, label: versionName(v, latestId) }))}
              onChange={onSelect}
            />
          ) : (
            <span className="shrink-0 text-sm font-semibold text-ink">{versionName(selected, latestId)}</span>
          )}
          <span className="t-caption min-w-0 truncate" title={selected.file_name}>
            {selected.file_name}
          </span>
        </div>
        {url.data && (
          <a href={url.data} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm shrink-0">
            새 탭에서 보기
          </a>
        )}
      </div>
      <div className="p-4">
        <div className="aspect-video w-full overflow-hidden rounded-md bg-track">
          <VersionPicture version={selected} size="lg" />
        </div>
        {!image && (
          <p className="t-caption mt-2">이 형식은 화면에서 미리볼 수 없습니다 — 새 탭에서 열거나 내려받아 확인하세요.</p>
        )}
      </div>
    </section>
  )
}

// ── 버전 이력(오른쪽) ────────────────────────────────────────────────────
export function VersionListCard({
  versions,
  selectedId,
  onSelect,
  sentVersionId,
  uploaderName,
}: {
  versions: Version[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** 지금 발주처에 가 있는 버전(열린 컨펌) — '발송본' 표시 */
  sentVersionId: string | null
  uploaderName: (userId: string | null) => string
}) {
  const kind = providerKind()
  return (
    <section className="ui-card" aria-label="버전 이력">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="t-card-title">버전 이력</h2>
        {versions.length > 0 && <span className="t-caption">{versions.length}개 · 누르면 미리보기</span>}
      </div>
      {versions.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-cap">업로드된 버전이 없습니다.</p>
      ) : (
        <ul className="space-y-1 p-2">
          {versions.map((v, i) => {
            const storage = versionStorage(v.drive_file_id, kind)
            const pressed = v.id === selectedId
            return (
              <li key={v.id}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onSelect(v.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                    pressed ? 'bg-canvas' : 'hover:bg-canvas'
                  }`}
                >
                  <span
                    className={`block h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-track ${
                      pressed ? 'ring-2 ring-accent' : 'ring-1 ring-border'
                    }`}
                  >
                    <VersionPicture version={v} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">v{v.version_no}</span>
                      {i === 0 && <LevelBadge level="neutral" label="최신" />}
                      {v.id === sentVersionId && <LevelBadge level="attention" label="발송본" />}
                      {storage && (
                        <span title={storage.title} data-testid="version-storage">
                          <LevelBadge level={storage.level} label={storage.label} />
                        </span>
                      )}
                    </span>
                    {v.note && <span className="truncate text-xs text-ink-sub">{v.note}</span>}
                    <span className="t-caption truncate">
                      {uploaderName(v.uploaded_by)} · {formatDateTime(v.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── 컨펌 기록(오른쪽) ────────────────────────────────────────────────────
type Entry = { key: string; dot: string; title: ReactNode; sub: ReactNode; subClass?: string }

export function ApprovalTimeline({
  approvals,
  versions,
  requesterName,
  hasPartner,
}: {
  /** 요청순 */
  approvals: Approval[]
  versions: Version[]
  requesterName: (userId: string | null) => string
  hasPartner: boolean
}) {
  const who = hasPartner ? '파트너' : '발주처'
  const entries: Entry[] = []
  for (const a of approvals) {
    const v = versions.find((x) => x.id === a.version_id)
    entries.push({
      key: `${a.id}:sent`,
      dot: 'bg-steel',
      title: `${v ? `v${v.version_no} ` : ''}${who}에 발송`,
      sub: `${formatDateTime(a.requested_at)} · ${requesterName(a.requested_by)}`,
    })
    if (a.decision) {
      entries.push({
        key: `${a.id}:answer`,
        dot: a.decision === 'approved' ? 'bg-positive' : 'bg-negative',
        title: (
          <span className="inline-flex items-center gap-1.5">
            {who} 답
            <LevelBadge
              level={a.decision === 'approved' ? 'positive' : 'blocked'}
              label={a.decision === 'approved' ? '승인' : '수정요청'}
            />
          </span>
        ),
        sub: (
          <>
            {a.decided_at ? formatDateTime(a.decided_at) : ''}
            {a.client_comment && <span className="mt-0.5 block text-ink-sub">“{a.client_comment}”</span>}
          </>
        ),
      })
    } else {
      if (a.due_at) {
        const left = daysUntil(a.due_at.slice(0, 10))
        entries.push({
          key: `${a.id}:due`,
          dot: left < 0 ? 'bg-negative' : 'bg-border-strong',
          title: '답 기한',
          sub: `${formatDateTime(a.due_at)}${left < 0 ? ` — ${-left}일 지남` : ''}`,
          subClass: left < 0 ? 'text-negative' : undefined,
        })
      }
      entries.push({
        key: `${a.id}:waiting`,
        dot: 'bg-border-strong',
        title: `${who} 답`,
        sub: '아직 없음 — 승인 또는 수정요청을 기다리는 중',
      })
    }
  }

  return (
    <section className="ui-card" aria-label="컨펌 기록" data-testid="approval-timeline">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="t-card-title">컨펌 기록</h2>
        <span className="t-caption">{approvals.length}회</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-cap">아직 보낸 적이 없습니다.</p>
      ) : (
        <ol className="space-y-3 px-5 py-4">
          {entries.map((e) => (
            <li key={e.key} className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2.5">
              <span aria-hidden className={`mt-1.5 size-2 rounded-full ${e.dot}`} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-[18px] text-ink">{e.title}</p>
                <p className={`t-caption mt-0.5 ${e.subClass ?? ''}`}>{e.sub}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
