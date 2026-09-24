// Google Drive API v3 REST 얇은 래퍼 — fetch 주입형(계약 테스트는 가짜 Drive 서버로 돈다, CLAUDE.md Phase 5 원칙).
// 공유 권한(permissions)을 바꾸는 메서드는 **일부러 두지 않는다**(CLAUDE.md §6 · 설계서 §7.4 — anyone 링크 생성 금지).
// 모든 호출에 supportsAllDrives=true — 저장소가 공유 드라이브여도(서비스 계정 경로) 같은 코드가 돈다.
import { DriveError } from './errors.js'

export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'
export const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  parents?: string[]
  trashed?: boolean
  appProperties?: Record<string, string>
  webViewLink?: string
  shortcutDetails?: { targetId: string; targetMimeType?: string }
  createdTime?: string
  modifiedTime?: string
  capabilities?: { canAddChildren?: boolean }
}

export const FILE_FIELDS =
  'id,name,mimeType,size,parents,trashed,appProperties,webViewLink,shortcutDetails,createdTime,modifiedTime'

export type UploadProgress = { done: false; received: number } | { done: true; file: DriveFile }

/** Drive q 문자열 리터럴 이스케이프 (작은따옴표·역슬래시) */
export function qEscape(s: string): string {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const enc = encodeURIComponent

async function reasonOf(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: { errors?: { reason?: string }[]; status?: string; message?: string } }
    return body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? ''
  } catch {
    return ''
  }
}

/** Google 응답 → DriveError (한국어·조치 안내). 404는 호출부가 null로 다루는 경우가 많아 여기선 not_found로 둔다 */
export async function driveErrorFrom(res: Response, what: string): Promise<DriveError> {
  const reason = await reasonOf(res)
  if (res.status === 401) {
    return new DriveError(503, 'validation', 'Drive 인증이 만료됐습니다 — 관리자가 행사 설정 ③에서 Drive를 다시 연결해야 합니다.')
  }
  if (reason === 'storageQuotaExceeded') {
    return new DriveError(
      507,
      'validation',
      'Drive 저장 용량이 부족합니다 — 서비스 계정 연결이라면 저장 폴더가 공유 드라이브에 있어야 합니다(서비스 계정은 저장 용량이 없음).',
    )
  }
  if (res.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return new DriveError(503, 'validation', 'Drive 요청이 몰렸습니다 — 잠시 후 다시 시도하세요.')
  }
  if (res.status === 403) return new DriveError(403, 'forbidden', `${what} — 연결된 Drive 계정에 권한이 없습니다.`)
  if (res.status === 404) return new DriveError(404, 'not_found', `${what} — Drive에서 찾을 수 없습니다.`)
  return new DriveError(502, 'validation', `${what} — Drive 응답 오류(${res.status}).`)
}

export class DriveApi {
  constructor(
    private readonly accessToken: () => Promise<string>,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken()
    const headers = new Headers(init.headers ?? {})
    headers.set('authorization', `Bearer ${token}`)
    return this.fetchImpl(url, { ...init, headers })
  }

  private async jsonOrThrow<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) throw await driveErrorFrom(res, what)
    return (await res.json()) as T
  }

  /** 없으면 null(404). 권한 없음(403)도 "볼 수 없음"이라 null로 접는다 — 호출부가 한 문장으로 안내한다 */
  async getFile(id: string, fields: string = FILE_FIELDS): Promise<DriveFile | null> {
    const res = await this.call(`${DRIVE_API}/files/${enc(id)}?fields=${enc(fields)}&supportsAllDrives=true`)
    if (res.status === 404) return null
    if (res.status === 403) {
      const reason = await reasonOf(res)
      if (reason !== 'rateLimitExceeded' && reason !== 'userRateLimitExceeded') return null
    }
    return this.jsonOrThrow<DriveFile>(res, '파일 정보를 읽지 못했습니다')
  }

  async list(q: string, pageToken?: string, pageSize = 1000): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: String(pageSize),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      spaces: 'drive',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await this.call(`${DRIVE_API}/files?${params.toString()}`)
    return this.jsonOrThrow(res, '폴더 목록을 읽지 못했습니다')
  }

  async listAll(q: string, limit = 5000): Promise<DriveFile[]> {
    const out: DriveFile[] = []
    let token: string | undefined
    do {
      const page = await this.list(q, token)
      out.push(...(page.files ?? []))
      token = page.nextPageToken
    } while (token && out.length < limit)
    return out.slice(0, limit)
  }

  async createFolder(name: string, parentId: string, appProperties?: Record<string, string>): Promise<DriveFile> {
    const res = await this.call(`${DRIVE_API}/files?supportsAllDrives=true&fields=${enc(FILE_FIELDS)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], ...(appProperties ? { appProperties } : {}) }),
    })
    return this.jsonOrThrow(res, `폴더(${name})를 만들지 못했습니다`)
  }

  async update(
    id: string,
    body: { name?: string; appProperties?: Record<string, string>; trashed?: boolean; description?: string },
    opts: { addParents?: string; removeParents?: string } = {},
  ): Promise<DriveFile> {
    const params = new URLSearchParams({ supportsAllDrives: 'true', fields: FILE_FIELDS })
    if (opts.addParents) params.set('addParents', opts.addParents)
    if (opts.removeParents) params.set('removeParents', opts.removeParents)
    const res = await this.call(`${DRIVE_API}/files/${enc(id)}?${params.toString()}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })
    return this.jsonOrThrow(res, '파일 정보를 바꾸지 못했습니다')
  }

  async copy(id: string, body: { name?: string; parents: string[]; appProperties?: Record<string, string> }): Promise<DriveFile> {
    const res = await this.call(`${DRIVE_API}/files/${enc(id)}/copy?supportsAllDrives=true&fields=${enc(FILE_FIELDS)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body),
    })
    return this.jsonOrThrow(res, '파일을 복사하지 못했습니다')
  }

  /** 재개 가능 업로드 세션 시작 → 세션 URI(Location). 바이트는 putChunk로 조각 전송(설계서 §7.2) */
  async startResumable(
    metadata: { name: string; parents: string[]; appProperties?: Record<string, string>; description?: string },
    opts: { mimeType: string; size: number },
  ): Promise<string> {
    const res = await this.call(
      `${DRIVE_UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=${enc(FILE_FIELDS)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-type': opts.mimeType,
          'x-upload-content-length': String(opts.size),
        },
        body: JSON.stringify(metadata),
      },
    )
    if (!res.ok) throw await driveErrorFrom(res, '업로드를 시작하지 못했습니다')
    const location = res.headers.get('location')
    if (!location) throw new DriveError(502, 'validation', '업로드를 시작하지 못했습니다 — Drive가 세션 주소를 주지 않았습니다.')
    return location
  }

  private async progressFrom(res: Response): Promise<UploadProgress> {
    if (res.status === 308) {
      const range = res.headers.get('range')
      const m = range?.match(/bytes=0-(\d+)/)
      return { done: false, received: m ? Number(m[1]) + 1 : 0 }
    }
    if (res.status === 404 || res.status === 410) {
      throw new DriveError(410, 'gone', '업로드 세션이 만료됐습니다 — 처음부터 다시 올려 주세요.')
    }
    if (res.ok) return { done: true, file: (await res.json()) as DriveFile }
    throw await driveErrorFrom(res, '파일 조각을 올리지 못했습니다')
  }

  /** 세션 URI는 그 자체가 권한이다 — 조각 전송에는 인증 헤더가 필요 없다(Drive 재개 업로드 규약) */
  async putChunk(sessionUri: string, bytes: Uint8Array, start: number, end: number, total: number): Promise<UploadProgress> {
    const range = total === 0 ? 'bytes */0' : `bytes ${start}-${end}/${total}`
    const res = await this.fetchImpl(sessionUri, {
      method: 'PUT',
      headers: { 'content-range': range },
      body: total === 0 ? new Uint8Array(0) : bytes,
    })
    return this.progressFrom(res)
  }

  /** 중단된 업로드의 현재 수신 위치 조회(Content-Range: bytes 에스터리스크/총량) */
  async uploadStatus(sessionUri: string, total: number): Promise<UploadProgress> {
    const res = await this.fetchImpl(sessionUri, {
      method: 'PUT',
      headers: { 'content-range': `bytes */${total}` },
      body: new Uint8Array(0),
    })
    return this.progressFrom(res)
  }

  /** 원본 바이트(스트림). range는 그대로 전달 — 206 부분 응답을 브라우저 동영상·PDF 뷰어가 쓴다 */
  async media(id: string, range?: string | null): Promise<Response> {
    const headers: Record<string, string> = {}
    if (range) headers.range = range
    const res = await this.call(`${DRIVE_API}/files/${enc(id)}?alt=media&supportsAllDrives=true`, { headers })
    if (!res.ok && res.status !== 206) throw await driveErrorFrom(res, '파일을 읽지 못했습니다')
    return res
  }

  /** 구글 문서·시트·슬라이드 → PDF 내보내기(미리보기용, Drive 내보내기 한도 10MB) */
  async exportPdf(id: string): Promise<Response> {
    const res = await this.call(`${DRIVE_API}/files/${enc(id)}/export?mimeType=${enc('application/pdf')}`)
    if (!res.ok) throw await driveErrorFrom(res, 'PDF로 내보내지 못했습니다')
    return res
  }

  async about(): Promise<{ user?: { emailAddress?: string; displayName?: string } }> {
    const res = await this.call(`${DRIVE_API}/about?fields=${enc('user(emailAddress,displayName)')}`)
    return this.jsonOrThrow(res, '연결 계정을 확인하지 못했습니다')
  }
}
