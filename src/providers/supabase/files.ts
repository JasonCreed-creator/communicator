// Phase 4 파일 저장소 — 설계서 §2.1 "2단계 SupabaseProvider: DB·Auth·RLS 이식 (파일은 여전히 mock)".
// 업로드 파일은 세션 메모리의 blob URL로만 살고(새로고침 시 소실 허용), 픽스처·시드 버전은 자리표시 미리보기다.
// Phase 5 DriveFileStore가 이 모듈을 프록시(GET /files/{version_id})로 교체한다.

const store = new Map<string, string>()

export function placeholderPreviewUrl(fileName: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">` +
    `<rect width="100%" height="100%" fill="#e5e7eb"/>` +
    `<text x="50%" y="50%" text-anchor="middle" font-size="16" fill="#6b7280">${fileName}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function canBlob(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined'
}

export function rememberUpload(versionId: string, file: Blob | undefined): void {
  store.set(versionId, file && canBlob() ? URL.createObjectURL(file) : `local://files/${versionId}`)
}

export function rememberText(versionId: string, text: string, type = 'text/html'): void {
  store.set(versionId, canBlob() ? URL.createObjectURL(new Blob([text], { type })) : `local://files/${versionId}`)
}

export function fileUrlFor(versionId: string, fileName: string): string {
  return store.get(versionId) ?? placeholderPreviewUrl(fileName)
}

/** 인쇄용 스냅숏 렌더 — mock과 동일 규약(정형 문서 3종, PDF 실생성은 Phase 5) */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
