// Google Drive 링크 파서 — 화면(링크 등록·기존 폴더 지정 입력 검증)과 서버(api/drive)가 함께 쓴다.
// 순수 함수(외부 요청 0). 설계서 v2.9 §7.2b·§7.1b.
//
// 받는 형태: drive.google.com 파일·폴더·open?id=·uc?id= 링크, docs.google.com 문서·시트·슬라이드·그림 링크
// (/u/N/ 계정 경로 포함), 그리고 링크 없이 붙여 넣은 파일 id 자체. 호스트가 둘 밖이면 null — 다른 사이트 링크를
// Drive 파일로 오인하지 않는다. 링크 모양만 보고 판단하므로 실제 존재·권한 확인은 서버가 한다.

export type DriveLinkKind = 'file' | 'folder'

export interface DriveLinkParse {
  kind: DriveLinkKind
  id: string
}

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com'])
/** Drive id — 영숫자·`-`·`_`. 실제 id는 보통 28~44자이고 링크 경로 조각과 구분되도록 하한을 둔다 */
const ID_RE = /^[A-Za-z0-9_-]{10,}$/
/** 링크 없이 id만 붙여 넣은 경우 — 짧은 단어를 id로 오인하지 않도록 더 길게 요구한다 */
const BARE_ID_RE = /^[A-Za-z0-9_-]{25,}$/
const DOC_TYPES = new Set(['document', 'spreadsheets', 'presentation', 'drawings'])

export function parseDriveLink(input: string): DriveLinkParse | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (BARE_ID_RE.test(raw)) return { kind: 'file', id: raw }

  let url: URL
  try {
    // 스킴 없이 붙여 넣은 "drive.google.com/…"도 받는다. 'https:'와 '//'를 join으로 잇는 것은 번들에
    // "https://${…}" 같은 호스트 미상 URL 문자열을 남기지 않기 위해서다(데모 아티팩트 URL 호스트 가드).
    url = new URL(/^https?:\/\//i.test(raw) ? raw : ['https:', raw].join('//'))
  } catch {
    return null
  }
  if (!DRIVE_HOSTS.has(url.hostname.toLowerCase())) return null

  // /u/0/ 같은 계정 경로 조각은 걸러 낸다 — 뒤따르는 구조는 같다
  const parts = url.pathname.split('/').filter(Boolean)
  const segs: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'u' && /^\d+$/.test(parts[i + 1] ?? '')) {
      i++
      continue
    }
    segs.push(parts[i])
  }

  const idAfter = (marker: string): string | null => {
    const at = segs.indexOf(marker)
    const id = at >= 0 ? segs[at + 1] : undefined
    return id && ID_RE.test(id) ? id : null
  }

  if (url.hostname.toLowerCase() === 'drive.google.com') {
    if (segs[0] === 'drive' && segs.includes('folders')) {
      const id = idAfter('folders')
      return id ? { kind: 'folder', id } : null
    }
    if (segs[0] === 'file') {
      const id = idAfter('d')
      return id ? { kind: 'file', id } : null
    }
    if (segs[0] === 'open' || segs[0] === 'uc') {
      const id = url.searchParams.get('id') ?? ''
      return ID_RE.test(id) ? { kind: 'file', id } : null
    }
    return null
  }

  // docs.google.com/{document|spreadsheets|presentation|drawings}/d/{id}/…
  if (DOC_TYPES.has(segs[0] ?? '')) {
    const id = idAfter('d')
    return id ? { kind: 'file', id } : null
  }
  return null
}

/** 파일 보기 링크(새 탭) — 내부 멤버 전용. 발주처에게는 주지 않는다(설계서 §7.4 프록시 원칙) */
export function driveFileUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`
}

export function driveFolderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
}

/**
 * 실제 Drive 파일 id처럼 보이는가 — Phase 4 이전 버전의 자리표시 id(`pending:…`)와 픽스처 id(`drv-…`)를 가른다.
 * 서버는 이 판정으로 파일 URL 발급을 건너뛰고(자리표시 미리보기), 실제 존재 여부는 스트림 시점에 다시 본다.
 */
export function looksLikeDriveFileId(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(id) && !id.startsWith('drv-')
}
