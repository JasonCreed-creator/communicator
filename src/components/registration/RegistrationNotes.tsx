// v2.22.3(Phase 6.17) — 등록 탭 '소통' (기획자님 2026-09-28 #5 "등록탭 안에서도 담당자간 소통이 가능하도록 · 슬랙 푸시도 가능하게끔").
//   · 메모는 앱에 남는다(registration_notes — 담당자만 · RLS) · 이 화면은 등록 보드 안이라 열람자는 앞에서 이미 막힌다(Phase 6.16)
//   · Slack은 사람이 올린다 — 남기면서 바로 올리기(체크) 또는 메모마다 'Slack에 올리기'(SlackRelayPanel) · 자동 전송 0
//   · 멘션 = 이 행사 멤버 카드(여러 명) · 태그 기본 [등록] · 참가자 명단·연락처는 여기 싣지 않는다(담당자가 쓴 말뿐)
// 채운 버튼 0(등록 보드의 채운 버튼은 다른 탭 몫) — 전부 ghost.
import { useState, type FormEvent } from 'react'
import EmptyState from '../internal/EmptyState'
import ErrorAlert from '../internal/ErrorAlert'
import SlackRelayPanel, { MentionPicker, RelayTagSelect } from '../internal/SlackRelayPanel'
import { choicesFromMembers } from '../wbs/AssigneePicker'
import { initialOf } from '../settings/MembersEditor'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { formatDateTime } from '../../lib/labels'
import { getNotifyGateway } from '../../lib/notify/notifyGateway'
import { SLACK_RELAY_MOCK_MESSAGE, defaultRelayTag, relayChannelLabel } from '../../lib/slackRelay'
import { getDataProvider } from '../../providers'
import type { RegistrationNote, UUID } from '../../types/entities'

const provider = getDataProvider()

export default function RegistrationNotes({ projectId }: { projectId: UUID }) {
  const notes = useAsync(() => provider.listRegistrationNotes(projectId), [projectId])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const choices = choicesFromMembers(members.data ?? [])
  const nameOf = (id: UUID | null) => (id ? (members.data?.find((m) => m.user_id === id)?.profile.name ?? '담당자') : '담당자')

  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<UUID[]>([])
  const [alsoSlack, setAlsoSlack] = useState(false)
  const [tag, setTag] = useState(defaultRelayTag('registration'))
  const [notice, setNotice] = useState<string | null>(null)
  const create = useMutation((input: { body: string; mention_ids: UUID[] }) => provider.createRegistrationNote(projectId, input))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    const note = await create.run({ body, mention_ids: picked })
    if (!note) return
    setBody('')
    setNotice(null)
    if (alsoSlack) {
      const gateway = getNotifyGateway()
      if (gateway.mode === 'mock') setNotice(SLACK_RELAY_MOCK_MESSAGE)
      else {
        try {
          const r = await gateway.client.relay({ project_id: projectId, kind: 'note', id: note.id, mention_ids: picked, tag })
          setNotice(`Slack에 올렸어요 · ${relayChannelLabel(r.channel)} · 멘션 ${r.mentioned}명`)
        } catch (err) {
          setNotice(`메모는 남겼지만 Slack에 올리지 못했어요 — ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    setPicked([])
    notes.reload()
  }

  return (
    <section className="ui-card" aria-label="담당자 소통" data-testid="registration-notes">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="t-card-title">담당자 소통</h2>
          <p className="t-caption mt-0.5">등록 담당자끼리 남기는 메모 — 이 행사 담당자만 봅니다. Slack에 올리면 행사 스레드에 답글로 갑니다.</p>
        </div>
        {notes.data && notes.data.length > 0 && <span className="t-caption">{notes.data.length}건</span>}
      </div>

      <div className="space-y-4 px-5 pb-5 pt-4">
        {notes.loading && !notes.data && <p className="text-sm text-ink-sub">불러오는 중…</p>}
        <ErrorAlert message={notes.error} />
        {notes.data && notes.data.length === 0 && (
          <EmptyState message="아직 메모가 없습니다 — 등록 명단·시트·현장 접수에 관한 이야기를 여기 남기면 담당자 모두가 봅니다." />
        )}
        {notes.data && notes.data.length > 0 && (
          <ul className="space-y-2.5" aria-label="메모 목록">
            {notes.data.map((n: RegistrationNote) => {
              const name = nameOf(n.author_id)
              return (
                <li key={n.id} data-testid="registration-note" className="flex gap-3 rounded-[10px] bg-canvas px-3.5 py-3">
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-track text-xs font-semibold text-brown">
                    {initialOf(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{name}</span>
                      <span className="t-caption">{formatDateTime(n.created_at)}</span>
                      {n.mention_ids.map((id) => (
                        <span key={id} className="rounded-full bg-track px-2 py-0.5 text-xs text-ink-sub" data-testid="note-mention">
                          @{nameOf(id)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-ink">{n.body}</p>
                    <SlackRelayPanel
                      projectId={projectId}
                      kind="note"
                      targetId={n.id}
                      area="registration"
                      members={members.data ?? []}
                      postedAt={n.slack_posted_at}
                      initialMentions={n.mention_ids}
                      onPosted={notes.reload}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-2.5 border-t border-border pt-4" aria-label="메모 남기기">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            aria-label="메모"
            placeholder="등록 관련 메모를 남기세요 — 멘션한 담당자에게는 Slack으로 알릴 수 있어요"
            className="ui-input w-full resize-none"
          />
          <MentionPicker label="멘션할 담당자" choices={choices} value={picked} onChange={setPicked} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="ui-check-row items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="ui-check" checked={alsoSlack} onChange={(e) => setAlsoSlack(e.target.checked)} />
              남기면서 Slack에도 올리기
            </label>
            {alsoSlack && <RelayTagSelect area="registration" value={tag} onChange={setTag} />}
            <button type="submit" disabled={create.pending || !body.trim()} className="btn btn-ghost">
              남기기
            </button>
          </div>
          <ErrorAlert message={create.error} />
          {notice && (
            <p className="t-caption" role="status" data-testid="registration-note-notice">
              {notice}
            </p>
          )}
        </form>
      </div>
    </section>
  )
}
