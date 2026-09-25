// 행사 설정 ③ Slack 카드 — 설계서 v2.10.1 §9 · Phase 6 "Slack: 프로젝트별 Incoming Webhook 1개(설정 화면에서 등록)".
// 보낼 곳 = 이 행사의 채널(여기서 등록) → 없으면 서버 공용 채널(env SLACK_WEBHOOK_URL) → 둘 다 없으면 보내지 않는다(no-op).
// 등록·해제·테스트 = 그 행사 pm(updateProject 권한 그대로). 주소는 비밀에 가까워 저장 뒤에는 끝 토큰을 가려 보인다.
// mock: 서버가 없어 보내는 흉내를 내지 않는다 — 등록은 되고(데이터), 발송은 실서버에서만이라는 사실을 적는다(§10 진입점 원칙).
import { useState } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getNotifyGateway } from '../../lib/notify/notifyGateway'
import { isSlackWebhookUrl, maskSlackWebhook, SLACK_WEBHOOK_INVALID_MESSAGE } from '../../lib/slackWebhook'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

/** 무엇이 언제 가는가 — 화면 안내(정본은 설계서 §9 매트릭스) */
export const SLACK_EVENTS_NOW = '새 버전 · 컨펌 발송 · 발주처 승인·수정요청 · 새 지시 · 파트너 제출'
export const SLACK_EVENTS_DAILY = '컨펌 기한 D-1 · 마일스톤 D-1 · 파트너 마감 D-1 · 미등록 파일 묶음'

function Chip({ tone, children }: { tone: 'ok' | 'off'; children: string }) {
  const cls = tone === 'ok' ? 'bg-positive-tint text-positive' : 'bg-track text-ink-sub'
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

export default function SlackCard({
  projectId,
  webhook,
  isPm,
  onChanged,
}: {
  projectId: string
  webhook: string | null
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
  const [notice, setNotice] = useState<string | null>(null)
  const ownChannel = isSlackWebhookUrl(webhook)
  const global = status.data?.slack === true

  const save = useMutation(async (next: string | null) => {
    await provider.updateProject(projectId, { slack_webhook_url: next })
    return true
  })
  const test = useMutation(async () => {
    if (gateway.mode !== 'server') throw new Error('데모(mock)에서는 알림을 보내지 않습니다.')
    return gateway.client.test(projectId)
  })

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
    if (!window.confirm('이 행사의 Slack 채널 등록을 해제할까요? 해제하면 서버 공용 채널(설정돼 있을 때)로 갑니다.')) return
    setNotice(null)
    if (await save.run(null)) onChanged()
  }
  const handleTest = async () => {
    setNotice(null)
    const r = await test.run()
    if (r) setNotice(r.channel === 'project' ? '보냈습니다 — 이 행사 채널을 확인하세요.' : '보냈습니다 — 공용 채널을 확인하세요.')
  }

  const chip =
    gateway.mode === 'mock' ? (
      <Chip tone="off">{ownChannel ? '등록됨 · 데모' : '데모'}</Chip>
    ) : ownChannel ? (
      <Chip tone="ok">행사 채널</Chip>
    ) : global ? (
      <Chip tone="ok">공용 채널</Chip>
    ) : (
      <Chip tone="off">꺼짐</Chip>
    )

  return (
    <Card title="Slack 알림" action={chip}>
      <div data-testid="slack-card" className="flex flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-ink-sub">
          바로: {SLACK_EVENTS_NOW}. 매일 오전 9시대: {SLACK_EVENTS_DAILY}. 알림이 실패해도 화면 동작은 그대로입니다.
        </p>

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
                  {global
                    ? '등록하지 않으면 서버 공용 채널로 갑니다.'
                    : gateway.mode === 'server'
                      ? '등록된 채널이 없어 지금은 알림을 보내지 않습니다.'
                      : '채널을 등록해 둘 수 있습니다.'}{' '}
                  Slack 앱 → Incoming Webhooks에서 채널을 골라 주소를 복사해 붙이세요.
                </p>
              )}
            </div>
          )
        )}

        {!isPm && !ownChannel && (
          <p className="text-xs text-ink-cap">
            {global ? '이 행사 채널이 없어 공용 채널로 갑니다.' : '채널 등록은 이 행사의 PM이 합니다.'}
          </p>
        )}

        {gateway.mode === 'mock' && (
          <p data-testid="slack-mock-note" className="text-xs leading-relaxed text-ink-cap">
            데모(mock)에서는 알림을 보내지 않습니다 — 실서버에서는 등록한 채널로 갑니다.
          </p>
        )}
        {gateway.mode === 'server' && status.data && !status.data.cron && (
          <p className="text-xs text-ink-cap">매일 리마인드가 꺼져 있습니다(서버 CRON_SECRET 미설정 — 관리자에게 알려 주세요).</p>
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
            {gateway.mode === 'server' && (ownChannel || global) && !editing && (
              <button type="button" onClick={handleTest} disabled={test.pending} className="btn btn-ghost btn-sm">
                테스트 보내기
              </button>
            )}
          </div>
        )}

        {notice && (
          <p role="status" className="text-xs text-positive">
            {notice}
          </p>
        )}
        <ErrorAlert message={save.error ?? test.error} />
      </div>
    </Card>
  )
}
