// v2.22.3(Phase 6.17) — 'Slack에 올리기' (기획자님 2026-09-28 #1 "자동으로 PUSH하기보다 슬랙에 올리기 버튼" · #2 "멘션을 여러명 달게").
// 코멘트(항목 상세)·등록 메모(등록 탭 소통)가 같은 부품을 쓴다. 자동 전송 0 — 사람이 누른다.
//   · 멘션 = 이 행사 멤버 카드(체크박스 여러 개 · 최대 10) — 서버가 멤버가 아닌 id는 뺀다
//   · 태그 = 프로토콜 댓글 태그(lib/slackRelay — 영역마다 어휘가 다르다)
//   · mock(데모)은 보내는 흉내를 내지 않는다 — 사실 안내(Slack 카드·리마인드와 같은 규약)
//   · 결과 줄은 이 자리에서만(role=status) · 올린 시각 배지는 서버가 적은 slack_posted_at에서(새로 읽은 뒤)
// 채운 버튼 0 — 전부 ghost(화면의 채운 버튼 규칙 §5).
import { useId, useState } from 'react'
import ErrorAlert from './ErrorAlert'
import { LevelBadge } from './StatusBadge'
import { initialOf } from '../settings/MembersEditor'
import { choicesFromMembers, type PersonChoice } from '../wbs/AssigneePicker'
import { formatDateTime } from '../../lib/labels'
import { getNotifyGateway } from '../../lib/notify/notifyGateway'
import {
  RELAY_MAX_MENTIONS,
  RELAY_TAGS,
  SLACK_RELAY_MOCK_MESSAGE,
  defaultRelayTag,
  relayChannelLabel,
  type RelayArea,
  type RelayKind,
} from '../../lib/slackRelay'
import type { UUID } from '../../types/entities'
import type { MemberWithProfile } from '../../types/views'

/** 멘션할 담당자 고르기 — 체크박스 카드(여러 명). 등록 메모 남기기 폼도 같은 부품을 쓴다 */
export function MentionPicker({
  label,
  choices,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  choices: readonly PersonChoice[]
  value: readonly UUID[]
  onChange: (next: UUID[]) => void
  disabled?: boolean
}) {
  const toggle = (id: UUID) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id))
    else if (value.length < RELAY_MAX_MENTIONS) onChange([...value, id])
  }
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="t-caption">
        {label} · {value.length}/{RELAY_MAX_MENTIONS}
      </legend>
      {choices.length === 0 ? (
        <p className="text-xs text-ink-cap">이 행사에 배정된 담당자가 없습니다 — 행사 설정 ②에서 배정하세요.</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {choices.map((c) => (
            <li key={c.id}>
              <label className="ui-check-row items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-ink">
                <input type="checkbox" className="ui-check" checked={value.includes(c.id)} onChange={() => toggle(c.id)} />
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-track text-xs font-semibold text-brown">
                  {initialOf(c.name)}
                </span>
                <span className="truncate">{c.name}</span>
                {c.title && <span className="t-caption truncate">{c.title}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

/** 영역별 태그 셀렉트 */
export function RelayTagSelect({ area, value, onChange, id }: { area: RelayArea; value: string; onChange: (tag: string) => void; id?: string }) {
  return (
    <select id={id} className="ui-select" aria-label="댓글 태그" value={value} onChange={(e) => onChange(e.target.value)}>
      {RELAY_TAGS[area].map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

export default function SlackRelayPanel({
  projectId,
  kind,
  targetId,
  area,
  members,
  postedAt,
  initialMentions = [],
  onPosted,
}: {
  projectId: UUID
  kind: RelayKind
  targetId: UUID
  area: RelayArea
  members: readonly MemberWithProfile[]
  /** 서버가 적은 마지막 올린 시각 — 배지 */
  postedAt: string | null
  /** 처음 체크해 둘 사람(등록 메모의 멘션) */
  initialMentions?: readonly UUID[]
  /** 보낸 뒤(새로 읽어 배지를 갱신) */
  onPosted?: () => void
}) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState(defaultRelayTag(area))
  const [picked, setPicked] = useState<UUID[]>([...initialMentions])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const choices = choicesFromMembers(members)

  const submit = async () => {
    const gateway = getNotifyGateway()
    setError(null)
    if (gateway.mode === 'mock') {
      setResult(SLACK_RELAY_MOCK_MESSAGE)
      setOpen(false)
      return
    }
    setPending(true)
    try {
      const r = await gateway.client.relay({ project_id: projectId, kind, id: targetId, mention_ids: picked, tag })
      setResult(`Slack에 올렸어요 · ${relayChannelLabel(r.channel)} · 멘션 ${r.mentioned}명`)
      setOpen(false)
      onPosted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-2 space-y-2" data-testid={`slack-relay-${kind}-${targetId}`}>
      <div className="flex flex-wrap items-center gap-2">
        {postedAt && <LevelBadge level="neutral" label={`Slack에 올림 · ${formatDateTime(postedAt)}`} />}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v)
            setResult(null)
          }}
        >
          {postedAt ? 'Slack에 다시 올리기' : 'Slack에 올리기'}
        </button>
        {result && (
          <span className="t-caption" role="status" data-testid="slack-relay-result">
            {result}
          </span>
        )}
      </div>
      {open && (
        <div role="group" aria-label="Slack에 올리기" className="space-y-2.5 rounded-[10px] border border-border bg-canvas p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${uid}-tag`} className="t-caption">
              태그
            </label>
            <RelayTagSelect id={`${uid}-tag`} area={area} value={tag} onChange={setTag} />
            <span className="t-caption text-ink-cap">이 행사 Slack 스레드에 답글로 올라갑니다 — 멘션한 담당자에게 푸시가 갑니다.</span>
          </div>
          <MentionPicker label="멘션할 담당자" choices={choices} value={picked} onChange={setPicked} disabled={pending} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={submit}>
              {pending ? '올리는 중…' : '올리기'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setOpen(false)}>
              취소
            </button>
          </div>
          <ErrorAlert message={error} />
        </div>
      )}
    </div>
  )
}
