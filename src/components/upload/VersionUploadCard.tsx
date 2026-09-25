// S3 버전 업로드 카드 — 설계서 v2.9 §7.2 업로드 3경로(사용자 지시 2026-09-24
// "파일을 끌어놓거나 폴더에서 업로드하거나 드라이브에 직접 올린 후 링크를 통해서도 작업될 수 있게").
//   ① 끌어놓기 — 파일·폴더(하위까지) ② 파일 선택·폴더 선택 ③ Drive 링크로 등록(Drive에 직접 올린 파일)
// 여러 파일 = 파일마다 버전 1개(이름순, 올리기 전 목록으로 확인) — 한 번의 노트가 모두에 붙는다.
// 저장 위치: 실서버 + Drive 연결 → 행사 폴더(05_산출물/디자인/{항목} · 04_운영/{항목} …)에 4MB 조각 업로드,
//            Drive 미연결·mock → 이 브라우저 세션에만(새로고침 시 사라짐 — 카드가 그 사실을 적는다).
// 접근 규약(기존 테스트): 파일 입력의 라벨에 "파일"이 들어가는 요소는 하나뿐 · 제출 버튼 이름 "업로드".
// Phase 4.3.1(2026-09-25 실사용 결함): 업로드가 막힌 상태(컨펌대기·승인·확정·파트너 첫 제출 전)면 고르기·끌어놓기·
// 업로드 대신 이유와 다음 할 일을 먼저 보인다 — 예전에는 파일을 고르고 누른 뒤에야 영문 상태 코드로 실패했다.
// 실서버인데 Drive가 연결되지 않았으면 회색 한 줄 대신 경고 상자로 "저장되지 않는다"를 알린다.
import { useState, type DragEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { getDataProvider } from '../../providers'
import { driveFolderUrl, looksLikeDriveFileId, parseDriveLink } from '../../lib/driveLink'
import { formatBytes, pickedFromDrop, pickedFromList, type PickedFile } from '../../lib/drive/collectFiles'
import { useDriveStatus } from '../../lib/drive/useDriveStatus'
import { uploadLock } from '../../lib/uploadGate'
import type { DeliverableStatus } from '../../types/enums'

const provider = getDataProvider()

export const UPLOAD_FORM_ID = 'version-upload-form'
export const UPLOAD_INPUT_ID = 'version-upload-file'

type Mode = 'file' | 'link'

interface Progress {
  index: number
  total: number
  sent: number
  size: number
}

export default function VersionUploadCard({
  deliverableId,
  status,
  hasPartner = false,
  driveFolderId,
  canWrite,
  onUploaded,
}: {
  deliverableId: string
  /** 항목 상태 — 업로드가 막힌 상태면 폼 대신 안내만 그린다(provider 가드와 같은 판정) */
  status: DeliverableStatus
  /** 주최형 파트너 inbound 항목 — 첫 버전은 파트너가 /p로 올린다(§5.1) */
  hasPartner?: boolean
  driveFolderId: string | null
  canWrite: boolean
  onUploaded: () => void
}) {
  const drive = useDriveStatus()
  const [mode, setMode] = useState<Mode>('file')
  const [queue, setQueue] = useState<PickedFile[]>([])
  const [note, setNote] = useState('')
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [label, setLabel] = useState('')
  const [linking, setLinking] = useState(false)

  if (!canWrite) return null

  const busy = progress !== null || linking
  const serverDrive = drive.mode === 'server' && !!drive.status?.configured && drive.status.connected
  // ⑤ 실서버 + 상태 확인 끝 + 연결 안 됨 → 올려도 어디에도 저장되지 않는다(버전 기록만 남는다)
  const driveOff = drive.mode === 'server' && !drive.loading && !serverDrive
  const folderLink = driveFolderId && looksLikeDriveFileId(driveFolderId) ? driveFolderUrl(driveFolderId) : null
  const folderAction = folderLink ? (
    <a href={folderLink} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm shrink-0" title="이 항목의 Drive 폴더(새 탭)">
      Drive에서 열기
    </a>
  ) : undefined
  const lock = uploadLock(status, { hasPartner })

  // ① 업로드가 막힌 상태 — 고르기·끌어놓기·업로드 버튼을 그리지 않는다(누른 뒤 실패하는 길을 없앤다)
  if (lock) {
    return (
      <div id={UPLOAD_FORM_ID}>
        <Card title="버전 업로드" action={folderAction}>
          <div data-testid="upload-locked" role="note" className="rounded-lg border border-border bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">지금은 새 버전을 올릴 수 없습니다 — {lock.label}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-sub">{lock.reason}</p>
          </div>
        </Card>
      </div>
    )
  }

  const addFiles = (picked: PickedFile[]) => {
    if (picked.length === 0) return
    setDone(null)
    setError(null)
    setQueue((q) => {
      const seen = new Set(q.map((p) => p.path))
      return [...q, ...picked.filter((p) => !seen.has(p.path))]
    })
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (busy || !e.dataTransfer) return
    try {
      addFiles(await pickedFromDrop(e.dataTransfer))
    } catch {
      setError('끌어놓은 항목을 읽지 못했습니다 — 파일 선택으로 올려 주세요.')
    }
  }

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (queue.length === 0) {
      setError('파일을 선택하세요.')
      return
    }
    setError(null)
    setDone(null)
    const total = queue.length
    let uploaded = 0
    for (let i = 0; i < total; i++) {
      const item = queue[i]
      setProgress({ index: i, total, sent: 0, size: item.file.size })
      try {
        await provider.uploadVersion(deliverableId, {
          file_name: item.file.name,
          note: note.trim() || undefined,
          file: item.file,
          onProgress: (sent, size) => setProgress({ index: i, total, sent, size }),
        })
        uploaded++
      } catch (err) {
        setError(`${item.path} — ${err instanceof Error ? err.message : '업로드하지 못했습니다.'}`)
        break
      }
    }
    setProgress(null)
    // 올라간 것은 목록에서 빼고, 실패 지점부터는 남겨 둔다(다시 누르면 이어서)
    setQueue((q) => q.slice(uploaded))
    if (uploaded > 0) {
      if (uploaded === total) setNote('')
      setDone(uploaded === 1 ? '새 버전을 올렸습니다.' : `새 버전 ${uploaded}개를 올렸습니다.`)
      onUploaded()
    }
  }

  const parsed = link.trim() ? parseDriveLink(link) : null
  const linkHint = !link.trim()
    ? null
    : !parsed
      ? '구글 드라이브 파일 링크가 아닙니다 (drive.google.com/file/d/… · docs.google.com/…).'
      : parsed.kind === 'folder'
        ? '폴더 링크입니다 — 등록할 파일의 링크를 붙여 주세요.'
        : null

  const handleLink = async (e: FormEvent) => {
    e.preventDefault()
    if (!link.trim()) {
      setError('Drive 링크를 붙여 주세요.')
      return
    }
    setError(null)
    setDone(null)
    setLinking(true)
    try {
      await provider.uploadVersion(deliverableId, {
        file_name: label.trim(),
        note: note.trim() || undefined,
        drive_link: link.trim(),
      })
      setLink('')
      setLabel('')
      setNote('')
      setDone('Drive 파일을 새 버전으로 등록했습니다.')
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : '링크를 등록하지 못했습니다.')
    } finally {
      setLinking(false)
    }
  }

  // Drive 미연결(실서버)은 아래 경고 상자가 대신 말한다 — 같은 말을 끌어놓기 영역에서 반복하지 않는다
  const storageNote =
    drive.mode === 'mock'
      ? '데모(mock) 모드 — 올린 파일은 이 브라우저에만 임시로 보관되고 새로고침하면 사라집니다. 실서버 전환 후에는 Drive 행사 폴더에 저장됩니다.'
      : drive.loading
        ? 'Drive 연결 상태를 확인하는 중…'
        : serverDrive
          ? 'Drive 행사 폴더에 저장됩니다(파일명은 규약 YYMMDD_코드_카테고리_제목_vN으로 바뀝니다).'
          : null

  const pct = progress && progress.size > 0 ? Math.round((progress.sent / progress.size) * 100) : progress ? 100 : 0

  return (
    <div id={UPLOAD_FORM_ID}>
      <Card title="버전 업로드" action={folderAction}>
        {driveOff && (
          <div data-testid="drive-off-warning" role="note" className="mb-4 rounded-lg border border-accent/30 bg-accent-tint p-3">
            <p className="text-sm font-semibold text-accent-deep">Drive 미연결 — 지금 올리는 파일은 저장되지 않습니다</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-sub">
              기록(버전 번호·이름)만 남고 파일은 이 브라우저 탭에만 있어 새로고침하면 사라집니다. 관리자가{' '}
              <Link to="/settings?tab=integration" className="font-medium text-accent-deep underline underline-offset-2">
                행사 설정 ③ 유형·연동
              </Link>
              에서 Drive를 연결한 뒤 올려 주세요.
            </p>
          </div>
        )}
        <div className="mb-4 flex gap-1.5" role="group" aria-label="업로드 방식">
          <button
            type="button"
            aria-pressed={mode === 'file'}
            onClick={() => setMode('file')}
            className={`btn btn-sm ${mode === 'file' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={busy}
          >
            내 컴퓨터에서
          </button>
          <button
            type="button"
            aria-pressed={mode === 'link'}
            onClick={() => setMode('link')}
            className={`btn btn-sm ${mode === 'link' ? 'btn-primary' : 'btn-ghost'}`}
            disabled={busy}
          >
            Drive 링크로 등록
          </button>
        </div>

        {mode === 'file' ? (
          <form onSubmit={handleUpload} className="space-y-3">
            <div
              data-testid="upload-dropzone"
              aria-label="끌어놓기 영역"
              role="group"
              onDragEnter={(e) => {
                e.preventDefault()
                if (!busy) setDragging(true)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (e.dataTransfer) e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
              }}
              onDrop={handleDrop}
              className={`flex flex-col items-center gap-2.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragging ? 'border-accent bg-accent-tint' : 'border-border-strong bg-canvas'
              }`}
            >
              <p className="text-sm text-ink">
                {dragging ? '여기에 놓으면 목록에 담깁니다' : '파일이나 폴더를 여기로 끌어놓으세요'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <label className="btn btn-ghost btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-accent">
                  파일 선택
                  <input
                    id={UPLOAD_INPUT_ID}
                    type="file"
                    multiple
                    disabled={busy}
                    className="sr-only"
                    onChange={(e) => {
                      addFiles(pickedFromList(e.target.files))
                      e.target.value = ''
                    }}
                  />
                </label>
                <label className="btn btn-ghost btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-accent">
                  폴더 선택
                  <input
                    type="file"
                    multiple
                    disabled={busy}
                    className="sr-only"
                    ref={(el) => {
                      // React가 모르는 속성 — 폴더 선택 대화상자(크롬·엣지·사파리·파이어폭스 지원)
                      if (el) {
                        el.setAttribute('webkitdirectory', '')
                        el.setAttribute('directory', '')
                      }
                    }}
                    onChange={(e) => {
                      addFiles(pickedFromList(e.target.files))
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              {storageNote && <p className="t-caption max-w-md">{storageNote}</p>}
            </div>

            {queue.length > 0 && (
              <div data-testid="upload-queue" className="rounded-md border border-border">
                <ul className="divide-y divide-border">
                  {queue.map((item, i) => {
                    const active = progress?.index === i
                    return (
                      <li key={item.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-ink" title={item.path}>
                          {item.path}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-ink-cap">{formatBytes(item.file.size)}</span>
                        {active ? (
                          <span className="w-24 shrink-0" aria-live="polite">
                            <span className="block h-1.5 w-full overflow-hidden rounded-[3px] bg-track">
                              <span className="block h-1.5 rounded-[3px] bg-accent" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="mt-0.5 block text-right text-[11px] text-ink-sub">{pct}%</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setQueue((q) => q.filter((_, j) => j !== i))}
                            className="btn btn-ghost btn-sm shrink-0"
                            aria-label={`${item.path} 빼기`}
                          >
                            빼기
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {queue.length > 1 && (
                  <p className="border-t border-border px-3 py-2 text-xs text-ink-sub">
                    {queue.length}개를 이름순으로 하나씩 올립니다 — 파일마다 새 버전 1개가 됩니다(맨 아래가 최신).
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 t-caption">
                노트
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="버전 노트(선택)"
                  className="ui-input w-64"
                  disabled={busy}
                />
              </label>
              <button type="submit" disabled={busy} className="btn btn-primary">
                업로드
              </button>
              {progress && (
                <span className="text-xs text-ink-sub" aria-live="polite">
                  {progress.index + 1}/{progress.total} 올리는 중
                </span>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={handleLink} className="space-y-3">
            <label className="flex flex-col gap-1 t-caption">
              Drive 링크
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://drive.google.com/file/d/…"
                className={`ui-input w-full max-w-xl ${linkHint ? 'ui-input-error' : ''}`}
                disabled={busy}
                aria-invalid={linkHint ? true : undefined}
              />
            </label>
            {linkHint && <p className="text-xs text-negative">{linkHint}</p>}
            {drive.mode === 'mock' && (
              <label className="flex flex-col gap-1 t-caption">
                표시 이름(선택)
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="예: 메인배너_시안.pdf — 데모에서는 Drive의 이름을 읽지 못합니다"
                  className="ui-input w-full max-w-xl"
                  disabled={busy}
                />
              </label>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 t-caption">
                노트
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="버전 노트(선택)"
                  className="ui-input w-64"
                  disabled={busy}
                />
              </label>
              <button type="submit" disabled={busy || !!linkHint} className="btn btn-primary">
                링크 등록
              </button>
            </div>
            <p className="t-caption max-w-xl leading-relaxed">
              MICE Communicator 폴더 안에 있는 파일만 등록됩니다. 이 행사 폴더 안의 파일은 그대로 연결하고, 저장소의 다른
              곳에 있는 파일은 이 항목 폴더로 복사해 등록합니다. 저장소 밖(개인 드라이브 등)의 파일은 먼저 행사 폴더로
              옮겨 주세요. 행사 폴더에 직접 올린 파일은 홈의 미등록 인박스에도 잡힙니다.
            </p>
          </form>
        )}

        {done && (
          <p className="mt-3 text-sm text-positive" role="status">
            {done}
          </p>
        )}
        <div className="mt-3">
          <ErrorAlert message={error} />
        </div>
      </Card>
    </div>
  )
}
