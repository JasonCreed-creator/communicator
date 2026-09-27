// 운영가이드 — 마스터 시트 대체 섹션 3종 (설계서 v2.21 §27.2 · Phase 6.11 PR-A): 답사 체크리스트 · 설치 도면 · 참가자 안내.
// 읽기 화면과 고치기 화면을 한 파일에 둔다(GuideDataView·GuideDataEditor가 종류별로 갈라 부른다).
// - 답사: 표(구분·항목·세부·체크사항·확인내용·담당) + 답사일 + 메모. 확인내용이 있는 줄 = 확인됨.
// - 도면: 도면 파일은 항목(design·ops)의 버전으로 올리고 여기서는 연결만(R-M7 — 새 업로드 경로 없음).
//   연결한 항목의 최신 버전이 이미지면 미리보기, 아니면 항목 링크만.
// - 참가자 안내: 단계마다 발송일·채널·대상·제목·원고·상태. 발송은 앱 밖(R-M5) — 여기서는 원고·일정·상태까지.
import { Link } from 'react-router-dom'
import { useAsync } from '../../hooks/useAsync'
import { MESSAGING_CHANNEL_LABELS, MESSAGING_STATUS_LABELS, SURVEY_SCOPE_LABELS } from '../../lib/guideStructured'
import { AREA_LABELS, formatDate, type StatusLevel } from '../../lib/labels'
import { fileExtension, isPreviewFileName } from '../../lib/statusMachine'
import { getDataProvider } from '../../providers'
import type {
  Deliverable,
  GuideFloorplanData,
  GuideFloorplanItem,
  GuideMessagingChannel,
  GuideMessagingData,
  GuideMessagingRow,
  GuideMessagingStatus,
  GuideSurveyData,
  GuideSurveyRow,
} from '../../types/entities'
import { LevelBadge } from '../internal/StatusBadge'
import { GuideLinesEditor, GuideLinesView, GuideRowsEditor, GuideRowsView, type GuideColumn } from './GuideRows'

const provider = getDataProvider()

// ── 답사 체크리스트 ────────────────────────────────────────────────────

export const SURVEY_COLUMNS: GuideColumn<GuideSurveyRow>[] = [
  {
    key: 'scope',
    label: '구분',
    kind: 'select',
    short: true,
    width: '84px',
    options: [
      { value: 'external', label: SURVEY_SCOPE_LABELS.external },
      { value: 'internal', label: SURVEY_SCOPE_LABELS.internal },
    ],
  },
  { key: 'item', label: '항목', width: '120px', placeholder: '주차' },
  { key: 'detail', label: '세부', placeholder: '스태프 · 협력사 차량' },
  { key: 'check', label: '체크사항', placeholder: '대수 · 요금 · 진입 동선' },
  { key: 'finding', label: '확인내용', placeholder: '답사에서 확인한 것' },
  { key: 'owner', label: '담당', width: '110px' },
]

export function surveyProgress(data: GuideSurveyData): { checked: number; total: number } {
  return { checked: data.rows.filter((r) => r.finding.trim()).length, total: data.rows.length }
}

export function SurveyView({ data }: { data: GuideSurveyData }) {
  const { checked, total } = surveyProgress(data)
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
        <span className="font-semibold" data-testid="survey-progress">
          확인 {checked} / {total}
        </span>
        <span className="t-caption">{data.visited_on ? `답사일 ${formatDate(data.visited_on)}` : '답사일 미정'}</span>
      </p>
      <GuideRowsView columns={SURVEY_COLUMNS} rows={data.rows} empty="답사 항목이 비어 있습니다." />
      <GuideLinesView title="답사 메모" lines={data.notes} />
    </div>
  )
}

export function SurveyEditor({
  data,
  onChange,
  idPrefix,
}: {
  data: GuideSurveyData
  onChange: (next: GuideSurveyData) => void
  idPrefix: string
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-visited`} className="t-caption">
          답사일
        </label>
        <input
          id={`${idPrefix}-visited`}
          type="date"
          value={data.visited_on ?? ''}
          onChange={(e) => onChange({ ...data, visited_on: e.target.value || null })}
          className="ui-input w-[180px] text-sm"
        />
      </div>
      <GuideRowsEditor
        columns={SURVEY_COLUMNS}
        rows={data.rows}
        onChange={(rows) => onChange({ ...data, rows })}
        newRow={(): GuideSurveyRow => ({ scope: 'internal', item: '', detail: '', check: '', finding: '', owner: '' })}
        addLabel="답사 항목 추가"
        rowLabel={(r, i) => r.item || `${i + 1}행`}
      />
      <GuideLinesEditor label="답사 메모" lines={data.notes} onChange={(notes) => onChange({ ...data, notes })} addLabel="메모 추가" />
    </div>
  )
}

// ── 설치 도면 ─────────────────────────────────────────────────────────

/** 연결한 항목의 최신 버전 — 이미지(PNG·JPG)면 미리보기, 아니면 항목 링크만(PDF·그 밖) */
function FloorplanPreview({ deliverableId, title }: { deliverableId: string; title: string }) {
  const detail = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const latest = detail.data?.versions?.[0] ?? null
  const image = !!latest && isPreviewFileName(latest.file_name) && fileExtension(latest.file_name) !== 'pdf'
  const url = useAsync(() => (latest && image ? provider.getFileUrl(latest.id) : Promise.resolve(null)), [latest?.id, image])
  if (detail.error) return <p className="text-xs text-negative">{detail.error}</p>
  if (!detail.data) return <p className="text-xs text-ink-cap">불러오는 중…</p>
  const itemLink = (
    <Link to={`/items/${deliverableId}`} className="text-xs font-medium text-steel underline underline-offset-2">
      {detail.data.title} 열기
    </Link>
  )
  if (!latest) {
    return (
      <p className="text-xs text-ink-cap">
        아직 올린 버전이 없습니다 — 항목에 도면 파일을 올리면 여기에 보입니다. {itemLink}
      </p>
    )
  }
  if (image && url.data) {
    return (
      <figure className="m-0">
        <img
          src={url.data}
          alt={`${title} 도면 v${latest.version_no}`}
          className="max-h-64 rounded-md border border-border object-contain"
          data-testid="floorplan-image"
        />
        <figcaption className="mt-1 text-xs text-ink-cap">
          최신 v{latest.version_no} · {latest.file_name} · {itemLink}
        </figcaption>
      </figure>
    )
  }
  return (
    <p className="text-xs text-ink-cap" data-testid="floorplan-link-only">
      최신 v{latest.version_no} · {latest.file_name} — 이미지가 아니라 링크만 싣습니다. {itemLink}
    </p>
  )
}

export function FloorplanView({ data, linkables }: { data: GuideFloorplanData; linkables: readonly Deliverable[] }) {
  if (data.items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-ink-sub">
        연결한 도면이 없습니다 — 도면 파일은 디자인·운영 보드의 항목에 버전으로 올리고, 여기서 그 항목을 연결하세요.
      </p>
    )
  }
  const titleOf = (id: string | null) => (id ? linkables.find((d) => d.id === id)?.title ?? null : null)
  return (
    <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
      {data.items.map((it, i) => (
        <li key={i} className="rounded-lg border border-border px-4 py-3">
          <p className="text-sm font-semibold text-ink">{it.title || `도면 ${i + 1}`}</p>
          {it.note.trim() && <p className="mt-0.5 text-xs text-ink-sub">{it.note}</p>}
          <div className="mt-2">
            {it.deliverable_id ? (
              <FloorplanPreview deliverableId={it.deliverable_id} title={it.title || titleOf(it.deliverable_id) || `도면 ${i + 1}`} />
            ) : (
              <p className="text-xs text-ink-cap">연결한 항목 없음</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function FloorplanEditor({
  items,
  linkables,
  onChange,
}: {
  items: GuideFloorplanItem[]
  linkables: readonly Deliverable[]
  onChange: (items: GuideFloorplanItem[]) => void
}) {
  const set = (i: number, patch: Partial<GuideFloorplanItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-canvas px-3 py-2 text-xs text-ink-sub">
        도면 파일은 디자인·운영 보드의 항목에 버전으로 올린 뒤 여기서 연결합니다 — 이 섹션에 파일을 직접 올리는 칸은 없습니다.
      </p>
      {items.map((it, i) => {
        const name = it.title || `도면 ${i + 1}`
        return (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-border px-4 py-3 @2xl:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              value={it.title}
              onChange={(e) => set(i, { title: e.target.value })}
              aria-label={`${name} 이름`}
              placeholder="무대 평면도"
              className="ui-input w-full text-sm"
            />
            <select
              value={it.deliverable_id ?? ''}
              onChange={(e) => set(i, { deliverable_id: e.target.value || null })}
              aria-label={`${name} 연결 항목`}
              className="ui-input ui-select w-full text-sm"
            >
              <option value="">— 연결 안 함 —</option>
              {linkables.map((d) => (
                <option key={d.id} value={d.id}>
                  {AREA_LABELS[d.area]} · {d.title}
                </option>
              ))}
            </select>
            <input
              value={it.note}
              onChange={(e) => set(i, { note: e.target.value })}
              aria-label={`${name} 메모`}
              placeholder="버전 · 확인할 것"
              className="ui-input w-full text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, k) => k !== i))}
              aria-label={`${name} 빼기`}
              className="btn btn-ghost-negative btn-sm"
            >
              빼기
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...items, { title: '', deliverable_id: null, note: '' }])}
        className="text-sm font-medium text-accent-deep underline underline-offset-2"
      >
        ＋ 도면 추가
      </button>
    </div>
  )
}

// ── 참가자 안내 ───────────────────────────────────────────────────────

const MESSAGING_STATUS_LEVEL: Record<GuideMessagingStatus, StatusLevel> = {
  draft: 'neutral',
  ready: 'progress',
  sent: 'positive',
}

const CHANNELS = Object.keys(MESSAGING_CHANNEL_LABELS) as GuideMessagingChannel[]
const STATUSES = Object.keys(MESSAGING_STATUS_LABELS) as GuideMessagingStatus[]

function sendLabel(r: GuideMessagingRow): string {
  if (!r.send_on) return '—'
  return r.send_at ? `${formatDate(r.send_on)} ${r.send_at}` : formatDate(r.send_on)
}

export function messagingProgress(data: GuideMessagingData): { sent: number; total: number } {
  return { sent: data.rows.filter((r) => r.status === 'sent').length, total: data.rows.length }
}

export function MessagingView({ data }: { data: GuideMessagingData }) {
  if (data.rows.length === 0) return <p className="text-sm text-ink-sub">참가자 안내 단계가 비어 있습니다.</p>
  const { sent, total } = messagingProgress(data)
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        <span className="font-semibold" data-testid="messaging-progress">
          발송 완료 {sent} / {total}
        </span>
        <span className="t-caption ml-2">발송은 알림톡·이메일 도구에서 — 여기서는 원고·일정·상태를 관리합니다</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="ui-th w-[150px]">단계</th>
              <th className="ui-th w-[130px]">발송일</th>
              <th className="ui-th w-[80px]">채널</th>
              <th className="ui-th w-[120px]">대상</th>
              <th className="ui-th">제목</th>
              <th className="ui-th w-[110px]">상태</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-b border-track">
                <td className="px-3 py-2 align-top text-sm font-semibold text-ink">{r.stage || `${i + 1}단계`}</td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-sm tabular-nums text-ink">{sendLabel(r)}</td>
                <td className="whitespace-nowrap px-3 py-2 align-top text-sm text-ink-sub">{MESSAGING_CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                <td className="px-3 py-2 align-top text-sm text-ink-sub">{r.audience || '—'}</td>
                <td className="px-3 py-2 align-top text-sm text-ink-sub">{r.subject || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  <LevelBadge level={MESSAGING_STATUS_LEVEL[r.status] ?? 'neutral'} label={MESSAGING_STATUS_LABELS[r.status] ?? r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.some((r) => r.body.trim()) && (
        <details className="rounded-md bg-canvas px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink">원고 보기</summary>
          <div className="mt-2 space-y-3">
            {data.rows
              .filter((r) => r.body.trim())
              .map((r, i) => (
                <article key={i}>
                  <p className="text-sm font-semibold text-ink">
                    {r.stage}
                    {r.subject.trim() && <span className="ml-2 font-normal text-ink-sub">{r.subject}</span>}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-sub">{r.body}</p>
                </article>
              ))}
          </div>
        </details>
      )}
    </div>
  )
}

export function MessagingEditor({
  rows,
  onChange,
  idPrefix,
}: {
  rows: GuideMessagingRow[]
  onChange: (rows: GuideMessagingRow[]) => void
  idPrefix: string
}) {
  const set = (i: number, patch: Partial<GuideMessagingRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const name = r.stage || `${i + 1}단계`
        const id = `${idPrefix}-m${i}`
        return (
          <section key={i} className="space-y-2 rounded-lg border border-border px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={r.stage}
                onChange={(e) => set(i, { stage: e.target.value })}
                aria-label={`${i + 1}단계 이름`}
                placeholder="단계 이름"
                className="ui-input w-[180px] text-sm font-semibold"
              />
              <input
                type="date"
                value={r.send_on ?? ''}
                onChange={(e) => set(i, { send_on: e.target.value || null })}
                aria-label={`${name} 발송일`}
                className="ui-input w-[160px] text-sm"
              />
              <input
                type="time"
                value={r.send_at ?? ''}
                onChange={(e) => set(i, { send_at: e.target.value || null })}
                aria-label={`${name} 발송 시각`}
                className="ui-input w-[120px] text-sm"
              />
              <select
                value={r.channel}
                onChange={(e) => set(i, { channel: e.target.value as GuideMessagingChannel })}
                aria-label={`${name} 채널`}
                className="ui-input ui-select w-[110px] text-sm"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {MESSAGING_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
              <select
                value={r.status}
                onChange={(e) => set(i, { status: e.target.value as GuideMessagingStatus })}
                aria-label={`${name} 상태`}
                className="ui-input ui-select w-[140px] text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MESSAGING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, k) => k !== i))}
                aria-label={`${name} 빼기`}
                className="btn btn-ghost-negative btn-sm ml-auto"
              >
                빼기
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-[200px_minmax(0,1fr)]">
              <input
                value={r.audience}
                onChange={(e) => set(i, { audience: e.target.value })}
                aria-label={`${name} 대상`}
                placeholder="참가 확정자"
                className="ui-input w-full text-sm"
              />
              <input
                value={r.subject}
                onChange={(e) => set(i, { subject: e.target.value })}
                aria-label={`${name} 제목`}
                placeholder="메시지 제목"
                className="ui-input w-full text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-body`} className="t-caption">
                원고
              </label>
              <textarea
                id={`${id}-body`}
                value={r.body}
                onChange={(e) => set(i, { body: e.target.value })}
                rows={5}
                placeholder="받는 사람에게 보낼 글 — 이름·연락처 같은 개인정보는 넣지 않습니다"
                className="ui-input w-full text-sm"
              />
            </div>
          </section>
        )
      })}
      <button
        type="button"
        onClick={() =>
          onChange([...rows, { stage: '', send_on: null, send_at: null, channel: 'alimtalk', audience: '', subject: '', body: '', status: 'draft' }])
        }
        className="text-sm font-medium text-accent-deep underline underline-offset-2"
      >
        ＋ 단계 추가
      </button>
    </div>
  )
}
