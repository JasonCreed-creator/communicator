// 행사 설정 ③ Drive 카드 — 설계서 v2.9 §7 · §10 S6 ③ "유형·연동: Drive".
// 보여 주는 것: 연결 상태(계정·시각·마지막 오류) · 저장소 루트 열기 · 이 행사 폴더 열기/만들기/기존 폴더 지정 · 표준 트리.
// 권한: 연결·해제 = 관리자(admin) — 저장소 전체에 걸리는 조작이라 전역 권한 / 행사 폴더 만들기·지정 = 그 행사 pm.
// mock: 서버가 없어 연결·폴더 작업을 흉내 내지 않는다 — 무엇이 좋아지는지와 언제 열리는지를 적는다(빈 상태 정본 ②,
// accent CTA 없음 · 게이트 뒤에 숨기지 않음 §10 진입점 원칙).
import { useEffect, useState } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { driveFolderUrl, looksLikeDriveFileId, parseDriveLink } from '../../lib/driveLink'
import { driveReturnMessage, getDriveGateway, goToDriveConsent } from '../../lib/drive/driveGateway'
import { useDriveStatus } from '../../lib/drive/useDriveStatus'
import { formatDateTime } from '../../lib/labels'

/** 설계서 §7.1 표준 트리 — 화면 안내용(실제 이름은 서버 tree.ts가 정본) */
export const STANDARD_TREE: readonly string[] = [
  '01_기획',
  '02_견적·정산',
  '03_회의록',
  '04_운영/{항목}',
  '05_산출물/디자인/{항목}',
  '06_발주처공유',
  '99_archive',
]

function Chip({ tone, children }: { tone: 'ok' | 'off' | 'warn'; children: string }) {
  const cls =
    tone === 'ok' ? 'bg-positive-tint text-positive' : tone === 'warn' ? 'bg-negative-tint text-negative' : 'bg-track text-ink-sub'
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

function TreePreview() {
  return (
    <div className="rounded-md bg-canvas px-3 py-2.5">
      <p className="mb-1.5 text-xs font-medium text-ink-sub">행사 폴더 표준 구조(자동 생성)</p>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-ink-sub sm:grid-cols-2">
        {STANDARD_TREE.map((p) => (
          <li key={p} className="whitespace-nowrap">
            {p}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DriveCard({
  projectId,
  driveRootFolderId,
  isPm,
  isAdmin,
  onChanged,
}: {
  projectId: string
  driveRootFolderId: string | null
  isPm: boolean
  isAdmin: boolean
  onChanged: () => void
}) {
  const gateway = getDriveGateway()
  const drive = useDriveStatus()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)
  const [adoptLink, setAdoptLink] = useState('')

  // OAuth 복귀(/settings?drive=…) — 결과를 한 번 보여 주고 주소창에서는 걷어 낸다
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ret = driveReturnMessage(window.location.search)
    if (!ret) return
    setNotice(ret)
    const url = new URL(window.location.href)
    url.searchParams.delete('drive')
    url.searchParams.delete('reason')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    drive.reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const eventFolder = driveRootFolderId && looksLikeDriveFileId(driveRootFolderId) ? driveRootFolderId : null

  if (gateway.mode === 'mock') {
    return (
      <Card title="Drive 연결" action={<Chip tone="off">데모(mock)</Chip>}>
        <div data-testid="drive-card" className="space-y-3">
          <p className="text-sm text-ink-sub">
            실서버 모드에서 연결하면 이 행사의 산출물이 지정한 Drive 저장소(행사별 → 파트별 폴더)에 자동으로 정리됩니다.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-sub">
            <li>업로드 3경로 — 끌어놓기(파일·폴더) · 파일/폴더 선택 · Drive에 직접 올린 파일의 링크 등록</li>
            <li>행사 폴더에 직접 올린 파일은 홈의 미등록 인박스에 잡힙니다</li>
            <li>발주처가 승인한 버전은 06_발주처공유에 사본이 남은 뒤 확정됩니다</li>
          </ul>
          <TreePreview />
          <p className="text-xs text-ink-cap">데모에서는 올린 파일이 브라우저에만 임시 보관됩니다 — Supabase 실서버 전환 후 연결됩니다.</p>
        </div>
      </Card>
    )
  }

  const client = gateway.client
  const status = drive.status
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const connect = () =>
    run('connect', async () => {
      const { url } = await client.oauthStart()
      goToDriveConsent(url)
    })
  const disconnect = () =>
    run('disconnect', async () => {
      await client.disconnect()
      drive.reload()
      setNotice({ ok: true, message: 'Drive 연결을 해제했습니다 — 파일은 Drive에 그대로 남습니다.' })
    })
  const ensure = () =>
    run('ensure', async () => {
      const r = await client.ensureTree(projectId)
      setNotice({ ok: true, message: r.created ? '행사 폴더를 만들었습니다.' : '행사 폴더 구조를 확인했습니다(빠진 파트 폴더는 다시 만들었습니다).' })
      onChanged()
    })
  const adopt = () =>
    run('adopt', async () => {
      await client.adoptFolder(projectId, adoptLink.trim())
      setAdoptLink('')
      setNotice({ ok: true, message: '기존 폴더를 이 행사의 폴더로 지정했습니다 — 빠진 파트 폴더는 그 안에 만들었습니다.' })
      onChanged()
    })

  const adoptParsed = adoptLink.trim() ? parseDriveLink(adoptLink) : null
  const adoptHint = adoptLink.trim() && adoptParsed?.kind !== 'folder' ? '폴더 링크를 붙여 주세요 (drive.google.com/drive/folders/…).' : null

  const chip = drive.loading ? (
    <Chip tone="off">확인 중</Chip>
  ) : !status ? (
    <Chip tone="warn">확인 실패</Chip>
  ) : !status.configured ? (
    <Chip tone="off">서버 설정 필요</Chip>
  ) : status.connected ? (
    <Chip tone="ok">연결됨</Chip>
  ) : (
    <Chip tone="off">미연결</Chip>
  )

  return (
    <Card title="Drive 연결" action={chip}>
      <div data-testid="drive-card" className="space-y-3.5">
        {notice && (
          <p className={`rounded-md px-3 py-2 text-sm ${notice.ok ? 'bg-positive-tint text-positive' : 'bg-negative-tint text-negative'}`} role="status">
            {notice.message}
          </p>
        )}

        {drive.loading && <p className="text-sm text-ink-sub">Drive 연결 상태를 확인하는 중…</p>}
        {!drive.loading && !status && <ErrorAlert message={drive.error ?? 'Drive 상태를 확인하지 못했습니다.'} />}

        {status && !status.configured && (
          <div className="space-y-2 text-sm text-ink-sub">
            <p>Drive 저장소가 아직 서버에 설정되지 않았습니다.</p>
            {isAdmin ? (
              <p className="text-xs leading-relaxed text-ink-cap">
                Vercel 환경 변수에 <code>DRIVE_ROOT_FOLDER_ID</code>(저장소 루트 폴더 id) ·{' '}
                <code>GOOGLE_OAUTH_CLIENT_ID</code> · <code>GOOGLE_OAUTH_CLIENT_SECRET</code>를 넣고 다시 배포하세요 — 절차는
                supabase/README §3d.
              </p>
            ) : (
              <p className="text-xs text-ink-cap">관리자가 서버 설정을 마치면 여기서 연결할 수 있습니다.</p>
            )}
          </div>
        )}

        {status?.configured && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-sub">연결 계정</dt>
            <dd className="min-w-0 truncate text-ink">
              {status.connected
                ? status.mode === 'service_account'
                  ? '서비스 계정(공유 드라이브)'
                  : status.account_email ?? (status.token_source === 'env' ? '서버 env 토큰' : '연결됨')
                : '없음'}
              {status.connected_at && <span className="ml-2 text-xs text-ink-cap">{formatDateTime(status.connected_at)}</span>}
            </dd>
            <dt className="text-ink-sub">저장소</dt>
            <dd className="min-w-0">
              {status.root_url ? (
                <a href={status.root_url} target="_blank" rel="noreferrer" className="text-accent-deep underline-offset-2 hover:underline">
                  저장소 루트 열기
                </a>
              ) : (
                '—'
              )}
            </dd>
          </dl>
        )}

        {status?.last_error && (
          <p className="rounded-md bg-negative-tint px-3 py-2 text-xs text-negative">
            마지막 오류: {status.last_error}
            {status.last_error_at && ` (${formatDateTime(status.last_error_at)})`}
          </p>
        )}

        {status?.configured && !status.connected && (
          <div className="flex flex-wrap items-center gap-3">
            {status.can_connect ? (
              <>
                <button type="button" onClick={connect} disabled={busy !== null} className="btn btn-primary">
                  Drive 연결하기
                </button>
                <span className="text-xs leading-relaxed text-ink-cap">
                  저장소 폴더에 편집 권한이 있는 회사 계정으로 Google 동의를 한 번 하면 됩니다.
                </span>
              </>
            ) : (
              <span className="text-xs text-ink-cap">관리자(admin)가 연결하면 이 행사 폴더를 만들 수 있습니다.</span>
            )}
          </div>
        )}

        {status?.configured && status.connected && (
          <div className="space-y-2.5 border-t border-border pt-3">
            <p className="text-sm font-medium text-ink">이 행사 폴더</p>
            {eventFolder ? (
              <div className="flex flex-wrap items-center gap-2">
                <a href={driveFolderUrl(eventFolder)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                  행사 폴더 열기
                </a>
                {isPm && (
                  <button type="button" onClick={ensure} disabled={busy !== null} className="btn btn-ghost btn-sm">
                    폴더 구조 확인
                  </button>
                )}
              </div>
            ) : isPm ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={ensure} disabled={busy !== null} className="btn btn-ghost btn-sm">
                  행사 폴더 만들기
                </button>
                <span className="text-xs text-ink-cap">첫 업로드 때도 자동으로 만들어집니다.</span>
              </div>
            ) : (
              <p className="text-xs text-ink-cap">아직 만들어지지 않았습니다 — 첫 업로드 때 자동으로 만들어집니다.</p>
            )}
            {isPm && (
              <div className="space-y-1.5">
                <label className="flex flex-col gap-1 t-caption">
                  기존 폴더를 이 행사 폴더로 지정
                  <span className="flex flex-wrap gap-2">
                    <input
                      value={adoptLink}
                      onChange={(e) => setAdoptLink(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/…"
                      className={`ui-input w-full max-w-md ${adoptHint ? 'ui-input-error' : ''}`}
                      disabled={busy !== null}
                    />
                    <button type="button" onClick={adopt} disabled={busy !== null || !adoptLink.trim() || !!adoptHint} className="btn btn-ghost btn-sm">
                      지정
                    </button>
                  </span>
                </label>
                {adoptHint && <p className="text-xs text-negative">{adoptHint}</p>}
                <p className="text-xs text-ink-cap">
                  Drive에서 먼저 만들어 둔 폴더가 있으면 링크로 지정하세요(MICE Communicator 안이어야 합니다) — 빠진 파트 폴더만
                  그 안에 채웁니다.
                </p>
              </div>
            )}
          </div>
        )}

        <TreePreview />

        {status?.configured && status.connected && isAdmin && status.mode === 'oauth' && status.token_source === 'vault' && (
          <div className="flex justify-end">
            <button type="button" onClick={disconnect} disabled={busy !== null} className="btn btn-ghost-negative btn-sm">
              Drive 연결 해제
            </button>
          </div>
        )}

        <ErrorAlert message={error} />
      </div>
    </Card>
  )
}
