// 행사 설정 ③ Slack 카드 — 설계서 v2.12 §9 · Phase 6.1(봇). 사용자 결정 2026-09-26: 행사는 채널의 **스레드 하나**로 운영한다.
// 보낼 곳 = 이 행사의 스레드(봇 — 여기서 링크 등록) → 이 행사의 웹훅(예비) → 서버 공용 채널(env SLACK_WEBHOOK_URL) → 없음(no-op).
// 봇은 스레드에 답글로 남기고 할 일이 생긴 사람을 @멘션한다(DM 없음). 제작 요청·검토 요청에는 '확인했어요' 버튼이 붙는다.
// 등록·해제·테스트 = 그 행사 pm(updateProject 권한 그대로). 웹훅 주소는 비밀에 가까워 저장 뒤에는 끝 토큰을 가려 보인다.
// mock: 서버가 없어 보내는 흉내를 내지 않는다 — 등록은 되고(데이터), 발송은 실서버에서만이라는 사실을 적는다(§10 진입점 원칙).
import { useState } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getNotifyGateway } from '../../lib/notify/notifyGateway'
import { isSlackThreadLink, parseSlackThreadLink, SLACK_THREAD_INVALID_MESSAGE } from '../../lib/slackThread'
import { isSlackWebhookUrl, maskSlackWebhook, SLACK_WEBHOOK_INVALID_MESSAGE } from '../../lib/slackWebhook'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

/** 무엇이 언제 가는가 — 화면 안내(정본은 설계서 §9 매트릭스) */
export const SLACK_EVENTS_NOW = '새 버전 · 내부검토 요청 · 컨펌 발송 · 발주처 승인·수정요청 · 새 지시 · 파트너 제출'
export const SLACK_EVENTS_DAILY = '컨펌 기한 D-1 · 항목·마일스톤 D-1 · 파트너 마감 D-1 · 확인 없는 요청 · 미등록 파일 묶음'

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

export default function SlackCard({
  projectId,
  webhook,
  thread,
  isPm,
  onChanged,
}: {
  projectId: string
  webhook: string | null
  thread?: string | null
  isPm: boolean
  onChanged: () => void
}) {
  const gateway = getNotifyGateway()
  const status = useAsync(
    () => (gateway.mode === 'server' ? gateway.client.status().catch(() => null) : Promise.resolve(null)),
    [gateway.mode],
  )
  const [threadEditing, setThreadEditing] = useState(false)
  const [threadValue, setThreadValue] = useState('')
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [showFallback, setShowFallback] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const threadRef = parseSlackThreadLink(thread)
  const ownThread = threadRef !== null
  const ownChannel = isSlackWebhookUrl(webhook)
  const global = status.data?.slack === true
  const bot = status.data?.bot === true

  const saveThread = useMutation(async (next: string | null) => {
    await provider.updateProject(projectId, { slack_thread_url: next })
    return true
  })
  const save = useMutation(async (next: string | null) => {
    await provider.updateProject(projectId, { slack_webhook_url: next })
    return true
  })
  const test = useMutation(async () => {
    if (gateway.mode !== 'server') throw new Error('데모(mock)에서는 알림을 보내지 않습니다.')
    return gateway.client.test(projectId)
  })

  const threadTrimmed = threadValue.trim()
  const threadValid = isSlackThreadLink(threadTrimmed)
  const handleThreadSave = async () => {
    if (!threadValid) return
    setNotice(null)
    if (await saveThread.run(threadTrimmed)) {
      setThreadEditing(false)
      setThreadValue('')
      onChanged()
    }
  }
  const handleThreadClear = async () => {
    if (!window.confirm('이 행사의 Slack 스레드 등록을 해제할까요? 해제하면 웹훅(예비)·공용 채널로 갑니다.')) return
    setNotice(null)
    if (await saveThread.run(null)) onChanged()
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
  const handleTest = async () => {
    setNotice(null)
    const r = await test.run()
    if (r)
      setNotice(
        r.channel === 'thread'
          ? '보냈습니다 — 이 행사 스레드를 확인하세요.'
          : r.channel === 'project'
            ? '보냈습니다 — 이 행사 채널을 확인하세요.'
            : '보냈습니다 — 공용 채널을 확인하세요.',
      )
  }

  const threadLive = ownThread && bot
  const chip =
    gateway.mode === 'mock' ? (
      <Chip tone="off">{ownThread || ownChannel ? '등록됨 · 데모' : '데모'}</Chip>
    ) : threadLive ? (
      <Chip tone="ok">행사 스레드</Chip>
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
  const canTest = gateway.mode === 'server' && (threadLive || ownChannel || global) && !editing && !threadEditing
  const startedAt = threadRef ? threadStartedAt(threadRef.thread_ts) : null

  return (
    <Card title="Slack 알림" action={chip}>
      <div data-testid="slack-card" className="flex flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-ink-sub">
          봇이 이 행사의 Slack 스레드에 답글로 남기고, 할 일이 생긴 사람을 멘션합니다. 제작 요청·검토 요청에는
          &lsquo;확인했어요&rsquo; 버튼이 붙습니다. 바로: {SLACK_EVENTS_NOW}. 매일 오전 9시대: {SLACK_EVENTS_DAILY}. 알림이
          실패해도 화면 동작은 그대로입니다.
        </p>

        {/* ① 행사 스레드(봇) — 기본 경로 */}
        <div data-testid="slack-thread-box" className="flex w-full flex-col gap-1.5">
          <p className="text-xs font-medium text-ink-cap">행사 스레드</p>
          {ownThread && !threadEditing ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-sub" data-testid="slack-thread-saved">
              <span className="whitespace-nowrap">
                채널 <span className="font-mono text-xs">{threadRef!.channel}</span>
              </span>
              {startedAt && <span className="whitespace-nowrap">· 스레드 {startedAt}</span>}
              <a href={thread!.trim()} target="_blank" rel="noreferrer" className="whitespace-nowrap text-accent-deep underline">
                Slack에서 열기
              </a>
            </p>
          ) : isPm ? (
            <>
              <input
                value={threadValue}
                onChange={(e) => setThreadValue(e.target.value)}
                placeholder="https://….slack.com/archives/C…/p…"
                aria-label="Slack 스레드 링크"
                autoComplete="off"
                className={`ui-input w-full max-w-lg ${threadTrimmed && !threadValid ? 'ui-input-error' : ''}`}
              />
              {threadTrimmed && !threadValid && <p className="text-xs text-negative">{SLACK_THREAD_INVALID_MESSAGE}</p>}
              <p className="text-xs leading-relaxed text-ink-cap">
                Slack에서 이 행사 스레드 첫 글의 ⋯ → 링크 복사로 받은 주소를 붙여 넣으세요. 봇이 그 채널에 있어야 합니다 — 채널
                세부정보 → 에이전트 및 앱 → 앱 추가로 커뮤니케이터 앱을 넣으세요(비공개 채널은 반드시).
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-cap">스레드 등록은 이 행사의 PM이 합니다.</p>
          )}
          {gateway.mode === 'server' && ownThread && status.data && !bot && (
            <p className="text-xs leading-relaxed text-accent-deep">
              서버에 봇 토큰이 없어 스레드로 보내지 못합니다 — 웹훅(예비)·공용 채널로 갑니다. 관리자에게 알려 주세요.
            </p>
          )}
          {isPm && (
            <div className="flex flex-wrap gap-2">
              {(!ownThread || threadEditing) && (
                <button type="button" onClick={handleThreadSave} disabled={!threadValid || saveThread.pending} className="btn btn-ghost btn-sm">
                  스레드 등록
                </button>
              )}
              {ownThread && !threadEditing && (
                <button type="button" onClick={() => setThreadEditing(true)} className="btn btn-ghost btn-sm">
                  스레드 바꾸기
                </button>
              )}
              {threadEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setThreadEditing(false)
                    setThreadValue('')
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  취소
                </button>
              )}
              {ownThread && !threadEditing && (
                <button type="button" onClick={handleThreadClear} disabled={saveThread.pending} className="btn btn-ghost btn-sm">
                  스레드 해제
                </button>
              )}
            </div>
          )}
        </div>

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
          <button type="button" onClick={handleTest} disabled={test.pending} className="btn btn-ghost btn-sm">
            테스트 보내기
          </button>
        )}

        {notice && (
          <p role="status" className="text-xs text-positive">
            {notice}
          </p>
        )}
        <ErrorAlert message={saveThread.error ?? save.error ?? test.error} />
      </div>
    </Card>
  )
}
