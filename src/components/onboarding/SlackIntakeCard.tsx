// S0 온보딩 ① — 'Slack 메시지에서 불러오기'(Phase 6.2 · 설계서 v2.15 §10 S0). 사용자 지시 2026-09-26.
// 메시지 링크(봇이 읽음 — 실서버) 또는 글 붙여 넣기 → 행사 기본 정보를 폼에 채운다(주황 표시 · 사람이 확인·수정 뒤 저장).
//   · 읽은 방식 = 라벨 규칙 + AI(Claude, 키가 있을 때) — 결과 줄에 어느 쪽인지 표시. 못 읽은 칸은 이름으로 알린다(추측 없음)
//   · 기록: projects.intake(링크·시각·보낸 사람·방식·채운 칸 — 원문은 저장하지 않는다) · 선택하면 그 글의 스레드를 행사 Slack 스레드로 등록(설정 ③과 같은 칸)
//   · 첨부 파일·링크는 아래 '견적서' 칸(QuoteAttachmentCard)이 붙인다 — 여기서는 개수만 알린다
//   · mock(데모)은 붙여 넣은 글을 라벨 규칙으로 그 자리에서 읽는다(AI·링크는 실서버)
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import { formatDateTime } from '../../lib/labels'
import { BRIEF_LABELS, extractBriefByRules, extractLinks, filledBriefKeys, type BriefKey } from '../../lib/intake/eventBrief'
import { getIntakeGateway, INTAKE_MOCK_LINK_MESSAGE } from '../../lib/intake/intakeGateway'
import type { IntakeReadResult } from '../../lib/intake/intakeClient'
import { parseSlackMessageLink } from '../../lib/slackThread'
import { getDataProvider } from '../../providers'
import type { Project, ProjectIntake, UUID } from '../../types/entities'

const provider = getDataProvider()

/** 폼에 있는 칸 중 자주 필요한 것 — 못 읽었으면 이름으로 알린다 */
const WANTED: BriefKey[] = ['name', 'event_date', 'venue', 'expected_headcount', 'organizer']

export default function SlackIntakeCard({
  projectId,
  project,
  readOnly = false,
  onApplied,
}: {
  projectId: UUID
  project: Project
  readOnly?: boolean
  /** 읽은 결과를 폼에 채우라는 신호(부모가 prefill을 만든다) */
  onApplied: (result: IntakeReadResult) => void
}) {
  const gateway = getIntakeGateway()
  const [input, setInput] = useState('')
  const [registerThread, setRegisterThread] = useState(true)
  const [result, setResult] = useState<IntakeReadResult | null>(null)
  const [showText, setShowText] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  const read = useMutation(async (): Promise<IntakeReadResult> => {
    const text = input.trim()
    if (!text) throw new Error('Slack 메시지 링크나 글을 붙여 주세요.')
    const link = parseSlackMessageLink(text) ? text : null
    if (gateway.mode === 'mock') {
      if (link) throw new Error(INTAKE_MOCK_LINK_MESSAGE)
      const rules = extractBriefByRules(text, new Date())
      return {
        source: 'text',
        message: null,
        files: [],
        links: extractLinks(text),
        fields: rules.fields,
        filled: filledBriefKeys(rules.fields),
        method: 'rules',
        ai_note: null,
      }
    }
    return gateway.client.read(link ? { link, project_id: projectId } : { text, project_id: projectId })
  })

  const handleRead = async () => {
    setSavedNote(null)
    const r = await read.run()
    if (!r) return
    setResult(r)
    setShowText(false)
    onApplied(r)
    // 기록 — 원문은 저장하지 않는다. 링크로 읽었고 선택했으면 그 글의 스레드를 행사 스레드로(행사 설정 ③과 같은 칸)
    const intake: ProjectIntake = {
      source: r.source,
      slack_permalink: r.message?.permalink ?? null,
      posted_by: r.message?.posted_by ?? null,
      fetched_at: new Date().toISOString(),
      method: r.method,
      filled_keys: r.filled,
    }
    const wantThread = registerThread && r.message?.permalink && !project.slack_thread_url
    try {
      await provider.updateProject(projectId, { intake, ...(wantThread ? { slack_thread_url: r.message!.permalink } : {}) })
      setSavedNote(wantThread ? '이 글의 스레드를 행사 Slack 스레드로 등록했어요 — 알림이 이 스레드에 답글로 갑니다(행사 설정 ③에서 바꿀 수 있어요).' : null)
    } catch {
      // 기록 실패는 폼 채우기를 막지 않는다(사람이 확인·저장하는 흐름이 본체)
    }
  }

  const missing = result ? WANTED.filter((k) => !result.filled.includes(k)) : []

  return (
    <section
      aria-label="Slack 메시지에서 불러오기"
      data-testid="slack-intake"
      className="space-y-3 rounded-[10px] border border-border bg-canvas p-4 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-card-title">Slack 메시지에서 불러오기</p>
          <p className="mt-0.5 text-xs text-ink-cap">
            요청 글의 링크(⋯ → 링크 복사)나 글 자체를 붙이면 행사명·일시·장소·인원을 아래 칸에 채워 둡니다 — 읽은 값은 전부 고칠 수 있어요.
            {gateway.mode === 'mock' ? ' 데모에서는 붙여 넣은 글을 라벨(행사명: · 일시: …) 규칙으로 읽습니다.' : ''}
          </p>
        </div>
      </div>
      {!readOnly && (
        <>
          <textarea
            aria-label="Slack 메시지 링크 또는 글"
            className="ui-input min-h-[88px] w-full"
            placeholder={'https://….slack.com/archives/C…/p…  또는 글 붙여 넣기\n예) 행사명: 가상 테크 포럼 2027 / 일시: 10월 15일 14:00~18:00 / 장소: 가상홀 / 인원: 300명'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="ui-check-row items-center text-xs text-ink-sub">
              <input type="checkbox" className="ui-check" checked={registerThread} onChange={(e) => setRegisterThread(e.target.checked)} />
              링크로 불러오면 그 글의 스레드를 이 행사의 Slack 스레드로 등록
            </label>
            <button type="button" className="btn btn-ghost btn-sm" disabled={read.pending || !input.trim()} onClick={() => void handleRead()}>
              {read.pending ? '읽는 중…' : '불러오기'}
            </button>
          </div>
        </>
      )}
      <ErrorAlert message={read.error} />

      {result && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3" data-testid="slack-intake-result">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={result.method === 'ai' ? 'attention' : 'neutral'} label={result.method === 'ai' ? 'AI가 읽음' : '라벨 규칙으로 읽음'} />
            <span className="text-ink" data-testid="slack-intake-summary">
              채운 칸 {result.filled.length}개 — 아래 칸(주황)을 확인해 주세요
            </span>
            {result.message?.permalink && (
              <a href={result.message.permalink} target="_blank" rel="noreferrer noopener" className="text-xs text-steel underline">
                Slack에서 열기
              </a>
            )}
          </div>
          {result.message && (
            <p className="text-xs text-ink-cap">
              {result.message.posted_by ? `${result.message.posted_by} · ` : ''}
              {result.message.posted_at ? formatDateTime(result.message.posted_at) : ''}
            </p>
          )}
          {missing.length > 0 && (
            <p className="text-xs text-ink-cap" data-testid="slack-intake-missing">
              읽지 못한 칸: {missing.map((k) => BRIEF_LABELS[k]).join(' · ')} — 직접 채워 주세요
            </p>
          )}
          {result.ai_note && <p className="text-xs text-ink-cap">{result.ai_note}</p>}
          {(result.files.length > 0 || result.links.length > 0) && (
            <p className="text-xs text-ink-sub" data-testid="slack-intake-attachments">
              첨부 파일 {result.files.length}개 · 링크 {result.links.length}개 — 아래 ‘견적서’ 칸에서 붙일 수 있어요
            </p>
          )}
          {savedNote && <p className="text-xs text-positive">{savedNote}</p>}
          {result.message?.text && (
            <div>
              <button type="button" className="text-xs text-steel underline" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
                {showText ? '원문 접기' : '원문 보기'}
              </button>
              {showText && (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-canvas p-2 text-xs text-ink-sub" data-testid="slack-intake-text">
                  {result.message.text}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
