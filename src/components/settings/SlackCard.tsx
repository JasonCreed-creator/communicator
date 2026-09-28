// 행사 설정 ③ Slack 카드 — 설계서 v2.12 §9 · Phase 6.1(봇). 사용자 결정 2026-09-26: 행사는 채널의 **스레드 하나**로 운영한다.
// v2.17.1(Phase 6.3 [B2] — 운영 프로토콜 v1.0): 스레드 **2개** — 운영 채널의 행사 스레드(기본 · 모든 알림) + 디자인 채널의 행사 스레드(선택 ·
// 디자인 항목 소식 [의뢰][시안][검토요청][피드백][확정][납품][일정]). 디자인 스레드가 있으면 운영 스레드엔 [키비주얼] 3줄(일정 합의·확정·납품)만.
// 보낼 곳 = 이 행사의 스레드(봇 — 여기서 링크 등록) → 이 행사의 웹훅(예비) → 서버 공용 채널(env SLACK_WEBHOOK_URL) → 없음(no-op).
// 봇은 스레드에 답글로 남기고 할 일이 생긴 사람을 @멘션한다(DM 없음). 제작 요청·검토 요청에는 '확인했어요' 버튼이 붙는다.
// 등록·해제·테스트 = 그 행사 pm(updateProject 권한 그대로). 웹훅 주소는 비밀에 가까워 저장 뒤에는 끝 토큰을 가려 보인다.
// mock: 서버가 없어 보내는 흉내를 내지 않는다 — 등록은 되고(데이터), 발송은 실서버에서만이라는 사실을 적는다(§10 진입점 원칙).
import { useState } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getNotifyGateway } from '../../lib/notify/notifyGateway'
import { isSlackThreadLink, parseSlackThreadLink, sameSlackThread, SLACK_DESIGN_THREAD_SAME_MESSAGE, SLACK_THREAD_INVALID_MESSAGE } from '../../lib/slackThread'
import { isSlackWebhookUrl, maskSlackWebhook, SLACK_WEBHOOK_INVALID_MESSAGE } from '../../lib/slackWebhook'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

/** 무엇이 언제 가는가 — 화면 안내(정본은 설계서 §9 매트릭스) */
export const SLACK_EVENTS_NOW = '새 지시 · 새 버전 · 내부검토 요청 · 컨펌 발송 · 발주처 승인·수정요청 · 납품(확정본 저장) · 파트너 제출'
export const SLACK_EVENTS_DAILY = '컨펌 기한 D-1 · 항목·마일스톤 D-1 · 파트너 마감 D-1 · 확인 없는 요청 · 미등록 파일 묶음'
/** Phase 6.13 — 멘션이 붙는 조건(실사용 "알림은 가는데 멘션이 안 걸림") */
export const SLACK_MENTION_HINT =
  '멘션은 담당자 화면(주소록)의 Slack ID로 붙고, 비어 있으면 이메일로 Slack 계정을 찾아 적어 둡니다(봇 스코프 users:read.email 필요). 못 찾으면 이름 뒤에 (Slack 미연결)로 남습니다. 새 버전 올림·컨펌 발송·미등록 파일 줄에는 멘션이 없습니다.'

function Chip({ tone, children }: { tone: 'ok' | 'off' | 'warn'; children: string }) {
  const cls =
    tone === 'ok' ? 'bg-positive-tint text-positive' : tone === 'warn' ? 'bg-accent-tint text-accent-deep' : 'bg-track text-ink-sub'
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

/** 스레드 ts → 'M/D HH:mm'(KST) — 어느 글인지 알아보게 */
function threadStartedAt(ts: string): string | null {
  const sec = Number(ts.split('.')[0])
  if (!Number.isFinite(sec)) return null
  const k = new Date(sec * 1000 + 9 * 3600 * 1000)
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`
}

/** 스레드 링크 한 칸(운영·디자인 공용) — 등록·바꾸기·해제 · 형식 검증 · 채널·시각·Slack에서 열기 */
function ThreadBox({
  id,
  title,
  value,
  ariaLabel,
  hint,
  isPm,
  pmNote,
  labels,
  confirmText,
  extraInvalid,
  onSave,
  children,
}: {
  id: string
  title: string
  value: string | null
  ariaLabel: string
  hint: string
  isPm: boolean
  pmNote: string
  labels: { register: string; change: string; clear: string }
  confirmText: string
  /** 형식은 맞지만 받을 수 없는 링크의 사유(예: 운영 스레드와 같은 스레드) */
  extraInvalid?: (link: string) => string | null
  onSave: (next: string | null) => Promise<boolean>
  children?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const ref = parseSlackThreadLink(value)
  const own = ref !== null
  const trimmed = draft.trim()
  const formatOk = isSlackThreadLink(trimmed)
  const extra = formatOk ? extraInvalid?.(trimmed) ?? null : null
  const valid = formatOk && !extra
  const startedAt = ref ? threadStartedAt(ref.thread_ts) : null
  const run = async (next: string | null) => {
    setPending(true)
    try {
      if (await onSave(next)) {
        setEditing(false)
        setDraft('')
      }
    } finally {
      setPending(false)
    }
  }
  return (
    <div data-testid={`${id}-box`} className="flex w-full flex-col gap-1.5">
      <p className="text-xs font-medium text-ink-cap">{title}</p>
      {own && !editing ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-sub" data-testid={`${id}-saved`}>
          <span className="whitespace-nowrap">
            채널 <span className="font-mono text-xs">{ref!.channel}</span>
          </span>
          {startedAt && <span className="whitespace-nowrap">· 스레드 {startedAt}</span>}
          <a href={value!.trim()} target="_blank" rel="noreferrer" className="whitespace-nowrap text-accent-deep underline">
            Slack에서 열기
          </a>
        </p>
      ) : isPm ? (
        <>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://….slack.com/archives/C…/p…"
            aria-label={ariaLabel}
            autoComplete="off"
            className={`ui-input w-full max-w-lg ${trimmed && !valid ? 'ui-input-error' : ''}`}
          />
          {trimmed && !formatOk && <p className="text-xs text-negative">{SLACK_THREAD_INVALID_MESSAGE}</p>}
          {trimmed && extra && <p className="text-xs text-negative">{extra}</p>}
          <p className="text-xs leading-relaxed text-ink-cap">{hint}</p>
        </>
      ) : (
        <p className="text-xs text-ink-cap">{pmNote}</p>
      )}
      {children}
      {isPm && (
        <div className="flex flex-wrap gap-2">
          {(!own || editing) && (
            <button type="button" onClick={() => void run(trimmed)} disabled={!valid || pending} className="btn btn-ghost btn-sm">
              {labels.register}
            </button>
          )}
          {own && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
              {labels.change}
            </button>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft('')
              }}
              className="btn btn-ghost btn-sm"
            >
              취소
            </button>
          )}
          {own && !editing && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(confirmText)) void run(null)
              }}
              disabled={pending}
              className="btn btn-ghost btn-sm"
            >
              {labels.clear}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SlackCard({
  projectId,
  webhook,
  thread,
  designThread,
  isPm,
  onChanged,
}: {
  projectId: string
  webhook: string | null
  thread?: string | null
  /** v2.17.1 — 디자인 채널의 행사 스레드(선택) */
  designThread?: string | null
  isPm: boolean
  onChanged: () => void
}) {
  const gateway = getNotifyGateway()
  const status = useAsync(
    () => (gateway.mode === 'server' ? gateway.client.status().catch(() => null) : Promise.resolve(null)),
    [gateway.mode],
  )
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [showFallback, setShowFallback] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const threadRef = parseSlackThreadLink(thread)
  const ownThread = threadRef !== null
  const ownDesign = parseSlackThreadLink(designThread) !== null
  const ownChannel = isSlackWebhookUrl(webhook)
  const global = status.data?.slack === true
  const bot = status.data?.bot === true

  const saveThread = useMutation(async (next: string | null) => {
    await provider.updateProject(projectId, { slack_thread_url: next })
    return true
  })
  const saveDesign = useMutation(async (next: string | null) => {
    await provider.updateProject(projectId, { design_thread_url: next })
    return true
  })
  const save = useMutation(async (next: string | null) => {
    await provider.updateProject(projectId, { slack_webhook_url: next })
    return true
  })
  const test = useMutation(async (target?: 'design') => {
    if (gateway.mode !== 'server') throw new Error('데모(mock)에서는 알림을 보내지 않습니다.')
    return gateway.client.test(projectId, target)
  })
  const threadSaver = (m: typeof saveThread) => async (next: string | null) => {
    setNotice(null)
    const ok = await m.run(next)
    if (ok) onChanged()
    return Boolean(ok)
  }

  const trimmed = value.trim()
  const valid = isSlackWebhookUrl(trimmed)
  const handleSave = async () => {
    if (!valid) return
    setNotice(null)
    if (await save.run(trimmed)) {
      setEditing(false)
      setValue('')
      onChanged()
    }
  }
  const handleClear = async () => {
    if (!window.confirm('이 행사의 Slack 웹훅 등록을 해제할까요? 해제하면 서버 공용 채널(설정돼 있을 때)로 갑니다.')) return
    setNotice(null)
    if (await save.run(null)) onChanged()
  }
  const handleTest = async (target?: 'design') => {
    setNotice(null)
    const r = await test.run(target)
    if (r)
      setNotice(
        r.channel === 'design'
          ? '보냈습니다 — 디자인 스레드를 확인하세요.'
          : r.channel === 'thread'
            ? '보냈습니다 — 이 행사 스레드를 확인하세요.'
            : r.channel === 'project'
              ? '보냈습니다 — 이 행사 채널을 확인하세요.'
              : '보냈습니다 — 공용 채널을 확인하세요.',
      )
  }

  const threadLive = ownThread && bot
  const designLive = ownDesign && bot
  const chip =
    gateway.mode === 'mock' ? (
      <Chip tone="off">{ownThread || ownChannel ? '등록됨 · 데모' : '데모'}</Chip>
    ) : threadLive ? (
      <Chip tone="ok">{designLive ? '행사 스레드 · 디자인 스레드' : '행사 스레드'}</Chip>
    ) : ownThread && status.data && !bot ? (
      <Chip tone="warn">봇 준비 안 됨</Chip>
    ) : ownChannel ? (
      <Chip tone="ok">행사 채널</Chip>
    ) : global ? (
      <Chip tone="ok">공용 채널</Chip>
    ) : (
      <Chip tone="off">꺼짐</Chip>
    )

  const fallbackOpen = !ownThread || ownChannel || showFallback || editing
  const canTest = gateway.mode === 'server' && (threadLive || ownChannel || global) && !editing

  return (
    <Card title="Slack 알림" action={chip}>
      <div data-testid="slack-card" className="flex flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-ink-sub">
          봇이 이 행사의 Slack 스레드에 답글로 남기고, 할 일이 생긴 사람을 멘션합니다. 제작 요청·검토 요청에는
          &lsquo;확인했어요&rsquo; 버튼이 붙습니다. 바로: {SLACK_EVENTS_NOW}. 매일 오전 9시대: {SLACK_EVENTS_DAILY}. 알림이
          실패해도 화면 동작은 그대로입니다. 문구 앞에는 운영 규칙의 댓글 태그([의뢰] [시안] [확정] [납품] · [제작] [결정] [WBS])가
          붙습니다.
        </p>
        <p className="text-xs leading-relaxed text-ink-cap" data-testid="slack-mention-hint">
          {SLACK_MENTION_HINT}
        </p>

        {/* ① 행사 스레드(운영 채널 · 봇) — 기본 경로 */}
        <ThreadBox
          id="slack-thread"
          title="행사 스레드 (운영 채널)"
          value={thread ?? null}
          ariaLabel="Slack 스레드 링크"
          hint="Slack에서 이 행사 스레드 첫 글의 ⋯ → 링크 복사로 받은 주소를 붙여 넣으세요. 봇이 그 채널에 있어야 합니다 — 채널 세부정보 → 에이전트 및 앱 → 앱 추가로 커뮤니케이터 앱을 넣으세요(비공개 채널은 반드시)."
          isPm={isPm}
          pmNote="스레드 등록은 이 행사의 PM이 합니다."
          labels={{ register: '스레드 등록', change: '스레드 바꾸기', clear: '스레드 해제' }}
          confirmText="이 행사의 Slack 스레드 등록을 해제할까요? 해제하면 웹훅(예비)·공용 채널로 갑니다."
          onSave={threadSaver(saveThread)}
        >
          {gateway.mode === 'server' && ownThread && status.data && !bot && (
            <p className="text-xs leading-relaxed text-accent-deep">
              서버에 봇 토큰이 없어 스레드로 보내지 못합니다 — 웹훅(예비)·공용 채널로 갑니다. 관리자에게 알려 주세요.
            </p>
          )}
        </ThreadBox>

        {/* ①-2 (v2.17.1) 디자인 스레드(디자인 채널 · 선택) — 디자인 항목 소식은 여기로, 운영 스레드엔 [키비주얼] 3줄 */}
        <ThreadBox
          id="slack-design-thread"
          title="디자인 스레드 (디자인 채널 · 선택)"
          value={designThread ?? null}
          ariaLabel="디자인 스레드 링크"
          hint="디자인 협업 채널에 있는 이 행사 스레드의 링크. 등록하면 디자인 항목 소식([의뢰] [시안] [검토요청] [피드백] [확정] [납품] [일정])이 여기로 가고, 운영 스레드에는 [키비주얼] 3줄(일정 합의 · 확정 · 납품)만 남습니다. 비워 두면 전부 운영 스레드로 갑니다."
          isPm={isPm}
          pmNote={ownDesign ? '' : '디자인 스레드는 등록되지 않았습니다(디자인 소식도 운영 스레드로) — 등록은 PM이 합니다.'}
          labels={{ register: '디자인 스레드 등록', change: '디자인 스레드 바꾸기', clear: '디자인 스레드 해제' }}
          confirmText="디자인 스레드 등록을 해제할까요? 해제하면 디자인 소식도 운영 스레드로 갑니다."
          extraInvalid={(link) => (sameSlackThread(link, thread) ? SLACK_DESIGN_THREAD_SAME_MESSAGE : null)}
          onSave={threadSaver(saveDesign)}
        />

        {/* ② 예비 — 웹훅(봇을 쓰지 못할 때 · Phase 6 경로). 스레드가 있으면 접어 둔다 */}
        {fallbackOpen ? (
          <div data-testid="slack-webhook-box" className="flex w-full flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-ink-cap">예비 — 웹훅{ownThread ? ' (스레드로 못 보낼 때만 씁니다)' : ''}</p>
            {ownChannel && !editing ? (
              <p className="w-full break-all rounded-md bg-canvas px-3 py-2 text-xs text-ink-sub" data-testid="slack-webhook-masked">
                {maskSlackWebhook(webhook!.trim())}
              </p>
            ) : (
              isPm && (
                <div className="flex w-full flex-col gap-1.5">
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="https://hooks.slack.com/services/…"
                    aria-label="Slack 웹훅 주소"
                    autoComplete="off"
                    className={`ui-input w-full max-w-lg ${trimmed && !valid ? 'ui-input-error' : ''}`}
                  />
                  {trimmed && !valid && <p className="text-xs text-negative">{SLACK_WEBHOOK_INVALID_MESSAGE}</p>}
                  {!ownChannel && (
                    <p className="text-xs leading-relaxed text-ink-cap">
                      {ownThread
                        ? '스레드가 등록돼 있어 비워 둬도 됩니다.'
                        : global
                          ? '등록하지 않으면 서버 공용 채널로 갑니다.'
                          : gateway.mode === 'server'
                            ? '등록된 스레드·채널이 없어 지금은 알림을 보내지 않습니다.'
                            : '채널을 등록해 둘 수 있습니다.'}{' '}
                      웹훅은 멘션·버튼 없이 한 줄씩만 보냅니다.
                    </p>
                  )}
                </div>
              )
            )}

            {!isPm && !ownChannel && !ownThread && (
              <p className="text-xs text-ink-cap">
                {global ? '이 행사 채널이 없어 공용 채널로 갑니다.' : '채널 등록은 이 행사의 PM이 합니다.'}
              </p>
            )}

            {isPm && (
              <div className="flex flex-wrap gap-2">
                {(!ownChannel || editing) && (
                  <button type="button" onClick={handleSave} disabled={!valid || save.pending} className="btn btn-ghost btn-sm">
                    등록
                  </button>
                )}
                {ownChannel && !editing && (
                  <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
                    바꾸기
                  </button>
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setValue('')
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    취소
                  </button>
                )}
                {ownChannel && !editing && (
                  <button type="button" onClick={handleClear} disabled={save.pending} className="btn btn-ghost btn-sm">
                    해제
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setShowFallback(true)} className="text-xs text-ink-cap underline">
            예비 웹훅 보기
          </button>
        )}

        {gateway.mode === 'mock' && (
          <p data-testid="slack-mock-note" className="text-xs leading-relaxed text-ink-cap">
            데모(mock)에서는 알림을 보내지 않습니다 — 실서버에서는 등록한 스레드(없으면 채널)로 갑니다.
          </p>
        )}
        {gateway.mode === 'server' && status.data && !status.data.cron && (
          <p className="text-xs text-ink-cap">매일 리마인드가 꺼져 있습니다(서버 CRON_SECRET 미설정 — 관리자에게 알려 주세요).</p>
        )}

        {isPm && canTest && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleTest()} disabled={test.pending} className="btn btn-ghost btn-sm">
              테스트 보내기
            </button>
            {designLive && (
              <button type="button" onClick={() => void handleTest('design')} disabled={test.pending} className="btn btn-ghost btn-sm">
                디자인 스레드 테스트
              </button>
            )}
          </div>
        )}

        {notice && (
          <p role="status" className="text-xs text-positive">
            {notice}
          </p>
        )}
        <ErrorAlert message={saveThread.error ?? saveDesign.error ?? save.error ?? test.error} />
      </div>
    </Card>
  )
}
