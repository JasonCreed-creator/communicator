// 버전 파일 그림 — 디자인 보드 갤러리·항목 상세 미리보기·버전 목록 공용(디자인지시서 v1.4 §7-2.6·§7-2.7).
// 이미지 파일만 그림으로 그린다(provider.getFileUrl — 실서버는 서명 스트림 주소, mock은 자리표시). PDF·기타는 확장자 표지.
// 시안은 잘리지 않게 전체를 보인다(object-contain) — 가로로 긴 현수막도 비율 그대로.
import { useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Version } from '../../types/entities'
import { fileKindLabel, isThumbnailFile } from '../board/designBoardRows'

const provider = getDataProvider()

/** 이미지면 그림, 아니면(또는 못 읽으면) 파일 표지 */
export function VersionPicture({ version, size = 'md' }: { version: Version; size?: 'sm' | 'md' | 'lg' }) {
  if (!isThumbnailFile(version.file_name)) return <FileCover fileName={version.file_name} size={size} />
  return <VersionImage version={version} size={size} />
}

function VersionImage({ version, size }: { version: Version; size: 'sm' | 'md' | 'lg' }) {
  const url = useAsync(() => provider.getFileUrl(version.id), [version.id])
  const [failed, setFailed] = useState(false)
  if (failed || url.error) return <FileCover fileName={version.file_name} size={size} />
  if (!url.data) return <span className="block h-full w-full animate-pulse bg-track" aria-hidden />
  return (
    <img
      src={url.data}
      alt=""
      loading="lazy"
      data-testid="version-picture"
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  )
}

/** 확장자 표지 — 그림이 없는 형식(PDF·AI·PSD·ZIP …) */
export function FileCover({ fileName, size = 'md' }: { fileName: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={`flex h-full w-full flex-col items-center justify-center text-center ${size === 'sm' ? 'gap-1 px-1.5' : 'gap-1.5 px-4'}`}
      data-testid="version-file-cover"
    >
      <span
        className={`rounded-md border border-border-strong bg-card font-semibold tracking-wide text-brown ${
          size === 'lg' ? 'px-3 py-1.5 text-sm' : size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
        }`}
      >
        {fileKindLabel(fileName)}
      </span>
      {size !== 'sm' && (
        <span className="max-w-full truncate text-xs text-ink-sub" title={fileName}>
          {fileName}
        </span>
      )}
    </span>
  )
}
