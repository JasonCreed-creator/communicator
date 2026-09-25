// 디자인 보드 갤러리 보기 — 최신 시안 썸네일 16:9 + 제목·버전·담당·마감 + 다음 행동(§7-2.6, 사용자 결정 2026-09-25 "보드에 갤러리 보기 추가").
// 썸네일은 이미지 파일만 그린다(provider.getFileUrl — 실서버는 서명 스트림 주소, mock은 자리표시). PDF·기타는 파일 표지.
// 시안이 없으면 점선 자리 — 올릴 수 있으면 항목 상세의 업로드 카드로 보낸다(보드에서 바로 올리지 않는다: 잠금·Drive 경고·진행률은 한 곳).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../../hooks/useAsync'
import { categoryGroupLabel } from '../../lib/boardPresets'
import { formatDate } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { Version } from '../../types/entities'
import DesignNextActionView, { type ClientLinkTarget } from './DesignNextAction'
import { DesignAssignee, DesignDue, DesignStatusBadge, type DesignRowView } from './DesignBoardTable'
import { designSpecParts, fileKindLabel, isThumbnailFile, type DesignRow } from './designBoardRows'

const provider = getDataProvider()

export default function DesignBoardGallery({
  views,
  clientLink,
  canWrite,
  onChanged,
}: {
  views: DesignRowView[]
  clientLink: ClientLinkTarget | null
  canWrite: boolean
  onChanged: () => void
}) {
  return (
    <ul className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="design-board-gallery">
      {views.map(({ row, next, assigneeName, assigneeRole }) => {
        const d = row.deliverable
        return (
          <li key={d.id} data-testid="design-card" className="ui-card flex flex-col overflow-hidden">
            <div className="relative">
              <Thumb row={row} canUpload={canWrite && next.action?.kind === 'upload'} />
              {/* 썸네일 위 배지는 흰 받침에 올린다 — 중립 배지(track 면)가 같은 색 썸네일 위에서 사라졌다(렌더 실측) */}
              <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex rounded-full bg-card p-[2px] shadow-sm">
                <DesignStatusBadge row={row} />
              </span>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-3.5 pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="min-w-0 truncate text-[15px] font-semibold text-ink" title={d.title}>
                  <Link to={`/items/${d.id}`} className="hover:text-accent-deep">
                    {d.title}
                  </Link>
                </h3>
                <span className="shrink-0 text-xs text-ink-sub">
                  {row.latest ? `v${row.latest.version_no} · ${formatDate(row.latest.created_at.slice(0, 10))}` : '버전 없음'}
                </span>
              </div>
              {/* 두 줄로 나눈다 — 한 줄에 몰면 카드 폭(~340)에서 구분점이 줄 끝에 홀로 남았다(렌더 실측) */}
              <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-sub">
                <span className="truncate" title={categoryGroupLabel(d.category)}>
                  {categoryGroupLabel(d.category)}
                </span>
                <Sep />
                <DesignAssignee name={assigneeName} role={assigneeRole} />
              </div>
              <div>
                <DesignDue row={row} />
              </div>
              <div className="border-t border-track pt-2.5">
                <DesignNextActionView row={row} next={next} clientLink={clientLink} onChanged={onChanged} compact />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Sep() {
  return (
    <span aria-hidden className="text-border-strong">
      ·
    </span>
  )
}

/** 16:9 썸네일 자리 — 최신 버전이 이미지면 그림, 아니면 파일 표지, 버전이 없으면 점선 자리 */
function Thumb({ row, canUpload }: { row: DesignRow; canUpload: boolean }) {
  const d = row.deliverable
  if (!row.latest) {
    const spec = designSpecParts(d).join(' · ')
    const hint = d.spec_location ? `${spec} · ${d.spec_location}` : spec
    const body = (
      <>
        <span className="text-[13px] font-semibold text-brown">
          아직 시안 없음{canUpload ? ' — 첫 시안 올리기' : ''}
        </span>
        <span className="text-xs text-ink-sub">{hint}</span>
      </>
    )
    const box =
      'flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong px-3 text-center'
    return (
      <div className="aspect-video bg-canvas p-3" data-testid="design-thumb-empty">
        {canUpload ? (
          <Link to={`/items/${d.id}?upload=1`} className={`${box} hover:border-accent hover:bg-accent-tint/40`}>
            {body}
          </Link>
        ) : (
          <div className={box}>{body}</div>
        )}
      </div>
    )
  }
  return (
    <Link
      to={`/items/${d.id}`}
      aria-label={`${d.title} v${row.latest.version_no} 크게 보기`}
      className="block aspect-video overflow-hidden bg-track"
    >
      {isThumbnailFile(row.latest.file_name) ? <ImageThumb version={row.latest} /> : <FileCover version={row.latest} />}
    </Link>
  )
}

function ImageThumb({ version }: { version: Version }) {
  const url = useAsync(() => provider.getFileUrl(version.id), [version.id])
  const [failed, setFailed] = useState(false)
  if (failed || url.error) return <FileCover version={version} />
  if (!url.data) return <span className="block h-full w-full animate-pulse bg-track" aria-hidden />
  // 시안은 잘리지 않게 전체를 보인다(object-contain) — 가로로 긴 현수막도 비율 그대로
  return (
    <img
      src={url.data}
      alt=""
      loading="lazy"
      data-testid="design-thumb-image"
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  )
}

function FileCover({ version }: { version: Version }) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center" data-testid="design-thumb-file">
      <span className="rounded-md border border-border-strong bg-card px-2 py-1 text-xs font-semibold tracking-wide text-brown">
        {fileKindLabel(version.file_name)}
      </span>
      <span className="max-w-full truncate text-xs text-ink-sub" title={version.file_name}>
        {version.file_name}
      </span>
    </span>
  )
}
