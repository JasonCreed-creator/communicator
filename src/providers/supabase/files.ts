// 파일 URL 세션 캐시 — 방금 올린 파일의 blob URL(즉시 미리보기)과 자리표시 미리보기.
// Phase 5(v2.9 §7): Drive가 연결돼 있으면 원본은 Drive에 있고 URL은 providers/supabase/drive.ts가 서명 프록시로 준다 —
// 이 모듈은 ① 이 세션에서 올린 파일의 즉시 미리보기 ② Drive에 없는 버전(Phase 4 자리표시 · 시드)의 자리표시만 맡는다.

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

/** 이 세션에서 올린 파일이면 blob URL, 아니면 undefined */
export function sessionFileUrl(versionId: string): string | undefined {
  return store.get(versionId)
}

export function fileUrlFor(versionId: string, fileName: string): string {
  return store.get(versionId) ?? placeholderPreviewUrl(fileName)
}

/** 인쇄용 스냅숏 렌더 — mock과 동일 규약(정형 문서 3종, PDF 실생성은 Phase 5) */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
