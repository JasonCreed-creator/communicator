// 견적서 첨부(파일 또는 링크) — 온보딩 ①·행사 설정 ① 공용(Phase 6.2 · 설계서 v2.15 §10 S0·S6①). 사용자 지시 2026-09-26 "견적서도 첨부(파일 혹은 링크)".
//   · 파일 = Drive 행사 폴더 02_견적·정산/견적서(서버 함수 · 4MB 이하) — Drive가 연결돼 있을 때만. mock(데모)은 저장할 곳이 없어 링크만
//   · 링크 = https 주소만 기록(구글 시트·외부 Drive·사내 문서)
//   · Slack 글에서 불러왔으면 그 글의 첨부 파일·링크를 골라 붙인다(파일은 서버가 봇으로 내려받아 행사 폴더에)
//   · 행사 하나에 하나 — 바꾸면 교체(Drive의 옛 파일은 남는다 — 지우지 않는다). 내부 화면에만(발주처·운영계획서 밖 — 견적서는 금액 문서)
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import { getDriveGateway } from '../../lib/drive/driveGateway'
import { useDriveStatus } from '../../lib/drive/useDriveStatus'
import type { BriefLink } from '../../lib/intake/eventBrief'
import type { IntakeFileInfo } from '../../lib/intake/intakeClient'
import { getIntakeGateway } from '../../lib/intake/intakeGateway'
import { formatDate } from '../../lib/labels'
import {
  isHttpsUrl,
  QUOTE_ATTACHMENT_EXT_RE,
  QUOTE_ATTACHMENT_FILE_MESSAGE,
  QUOTE_ATTACHMENT_INVALID_MESSAGE,
  QUOTE_ATTACHMENT_MAX_BYTES,
  quoteAttachmentLabel,
} from '../../lib/quoteAttachment'
import { getDataProvider } from '../../providers'
import type { Project, QuoteAttachment, UUID } from '../../types/entities'

const provider = getDataProvider()

export const QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE = '데모에서는 파일을 저장할 곳(Drive)이 없어 링크만 붙일 수 있습니다 — 실서버에서는 행사 폴더에 올라갑니다.'
export const QUOTE_ATTACHMENT_DRIVE_OFF_MESSAGE =
  'Drive를 연결하기 전에는 파일을 올릴 곳이 없어요 — 링크로 붙이거나 행사 설정 ③에서 Drive를 연결하세요.'

function sizeText(n: number | null): string {
  if (n === null) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

const SOURCE_LABEL: Record<QuoteAttachment['source'], string> = { upload: '올린 파일', slack: 'Slack 첨부', link: '링크' }

export default function QuoteAttachmentCard({
  projectId,
  project,
  readOnly = false,
  onChanged,
  slackFiles = [],
  slackLinks = [],
}: {
  projectId: UUID
  project: Project
  readOnly?: boolean
  onChanged: () => void
  /** Slack 글에서 불러온 첨부 파일(실서버에서 봇이 내려받아 행사 폴더에 넣는다) */
  slackFiles?: IntakeFileInfo[]
  /** Slack 글 속 링크 */
  slackLinks?: BriefLink[]
}) {
  const current = project.quote_attachment ?? null
  const drive = getDriveGateway()
  const intake = getIntakeGateway()
  const driveStatus = useDriveStatus()
  const canFile = drive.mode === 'server' && !!driveStatus.status?.connected
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')

  const save = useMutation(async (att: QuoteAttachment | null) => {
    await provider.updateProject(projectId, { quote_attachment: att })
    return true
  })
  const attachFile = useMutation(async (file: File) => {
    if (!QUOTE_ATTACHMENT_EXT_RE.test(file.name) || file.size > QUOTE_ATTACHMENT_MAX_BYTES) throw new Error(QUOTE_ATTACHMENT_FILE_MESSAGE)
    if (drive.mode !== 'server') throw new Error(QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE)
    if (!driveStatus.status?.connected) throw new Error(QUOTE_ATTACHMENT_DRIVE_OFF_MESSAGE)
    const r = await drive.client.projectFile(projectId, file.name, await file.arrayBuffer(), file.type || 'application/octet-stream')
    await provider.updateProject(projectId, {
      quote_attachment: { kind: 'drive', url: r.url, file_name: r.file_name, drive_file_id: r.file_id, source: 'upload', added_at: new Date().toISOString() },
    })
    return true
  })
  const attachSlack = useMutation(async (f: IntakeFileInfo) => {
    if (intake.mode !== 'server') throw new Error(QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE)
    if (!driveStatus.status?.connected) throw new Error(QUOTE_ATTACHMENT_DRIVE_OFF_MESSAGE)
    const r = await intake.client.slackFile({ project_id: projectId, file_id: f.id })
    await provider.updateProject(projectId, {
      quote_attachment: { kind: 'drive', url: r.url, file_name: r.file_name, drive_file_id: r.file_id, source: 'slack', added_at: new Date().toISOString() },
    })
    return true
  })

  const done = () => {
    setLinkOpen(false)
    setUrl('')
    onChanged()
  }
  const handleLink = async (value: string, label: string | null) => {
    const v = value.trim()
    if (!isHttpsUrl(v)) {
      save.setError(QUOTE_ATTACHMENT_INVALID_MESSAGE)
      return
    }
    if (await save.run({ kind: 'link', url: v, file_name: label, drive_file_id: null, source: 'link', added_at: new Date().toISOString() })) done()
  }
  const handleFile = async (file: File | null) => {
    if (!file) return
    if (await attachFile.run(file)) done()
  }
  const handleRemove = async () => {
    if (!window.confirm('견적서 첨부를 뺄까요? Drive에 올린 파일은 그대로 남습니다.')) return
    if (await save.run(null)) done()
  }

  const error = save.error ?? attachFile.error ?? attachSlack.error
  const busy = save.pending || attachFile.pending || attachSlack.pending

  return (
    <section aria-label="견적서" data-testid="quote-attachment" className="space-y-3 rounded-[10px] border border-border p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-card-title">견적서</p>
          <p className="mt-0.5 text-xs text-ink-cap">받은 견적서를 파일이나 링크로 붙여 둡니다 — 내부 화면에만 보이고, 정산보드의 기준 견적과는 별개예요.</p>
        </div>
        {current && !readOnly && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleRemove()} disabled={busy}>
            빼기
          </button>
        )}
      </div>

      {current ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="quote-attachment-current">
          <LevelBadge level="neutral" label={current.kind === 'drive' ? '파일' : '링크'} />
          <a href={current.url} target="_blank" rel="noreferrer noopener" className="font-medium text-ink underline">
            {quoteAttachmentLabel(current)}
          </a>
          <span className="text-xs text-ink-cap">
            {SOURCE_LABEL[current.source]} · {formatDate(current.added_at.slice(0, 10))}
            {current.kind === 'drive' ? ' · 행사 폴더 02_견적·정산/견적서' : ''}
          </span>
        </div>
      ) : (
        <p className="text-xs text-ink-cap" data-testid="quote-attachment-empty">
          아직 붙인 견적서가 없습니다.
        </p>
      )}

      {!readOnly && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 t-caption">
              {current ? '다른 파일로 바꾸기' : '파일 올리기'}
              <input
                type="file"
                aria-label="견적서 파일"
                accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.ppt,.pptx,.hwp,.hwpx"
                className="text-sm"
                disabled={busy || !canFile}
                title={canFile ? undefined : drive.mode === 'server' ? QUOTE_ATTACHMENT_DRIVE_OFF_MESSAGE : QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  e.target.value = ''
                  void handleFile(f)
                }}
              />
            </label>
            {!linkOpen ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkOpen(true)} disabled={busy}>
                {current ? '다른 링크로 바꾸기' : '링크 붙이기'}
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <input
                  className="ui-input w-72"
                  aria-label="견적서 링크"
                  placeholder="https://docs.google.com/spreadsheets/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !url.trim()} onClick={() => void handleLink(url, null)}>
                  붙이기
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkOpen(false)}>
                  취소
                </button>
              </span>
            )}
          </div>
          {!canFile && (
            <p className="text-xs text-ink-cap" data-testid="quote-attachment-file-note">
              {drive.mode === 'server' ? QUOTE_ATTACHMENT_DRIVE_OFF_MESSAGE : QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE}
            </p>
          )}

          {(slackFiles.length > 0 || slackLinks.length > 0) && (
            <div className="space-y-1 rounded-md bg-canvas p-3" data-testid="quote-attachment-slack">
              <p className="text-xs font-medium text-ink-sub">Slack 글에서 온 첨부·링크</p>
              <ul className="m-0 list-none space-y-1 p-0">
                {slackFiles.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {f.name}
                      <span className="ml-1 text-xs text-ink-cap">
                        {sizeText(f.size)}
                        {f.looks_like_quote ? ' · 견적서 같음' : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy || !canFile}
                      title={canFile ? undefined : drive.mode === 'server' ? QUOTE_ATTACHMENT_DRIVE_OFF_MESSAGE : QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE}
                      onClick={async () => {
                        if (await attachSlack.run(f)) done()
                      }}
                    >
                      이 파일 첨부
                    </button>
                  </li>
                ))}
                {slackLinks.map((l) => (
                  <li key={l.url} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {l.label ?? l.url}
                      {l.looks_like_quote ? <span className="ml-1 text-xs text-ink-cap">견적서 같음</span> : null}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void handleLink(l.url, l.label)}>
                      이 링크 첨부
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <ErrorAlert message={error} />
    </section>
  )
}
