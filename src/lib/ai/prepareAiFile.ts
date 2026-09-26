// AI로 보낼 견적서 파일 준비(브라우저) — 설계서 v2.14 §19.5b · Phase 4.8.
// 사진은 긴 변 2000px JPEG로 줄여 보낸다(휴대폰 사진 4~8MB → 보통 1MB 아래 — 서버 함수 요청 한도 4.5MB 안, 표 글자는 읽히는 크기).
// PDF는 그대로. 줄인 뒤에도 3MB를 넘으면 보내지 않고 사실대로 알린다(서버도 같은 상한으로 다시 본다).
// 원본은 따로 Drive에 근거로 보관한다(호출자) — 여기서 줄인 사본은 AI 읽기에만 쓴다.
import { ProviderError } from '../errors'
import { AI_FILE_TOO_LARGE_MESSAGE, AI_MAX_BYTES, aiMediaTypeFor, isImageMedia, type AiMediaType } from '../vendorQuoteAi'

/** 이보다 크거나(바이트) 길면(px) 줄인다 */
export const AI_IMAGE_MAX_EDGE = 2000
const AI_IMAGE_REENCODE_BYTES = 1_500_000
const JPEG_QUALITY = 0.85

export interface PreparedAiFile {
  media_type: AiMediaType
  data_base64: string
  /** 보낸 바이트 수 */
  bytes: number
  /** 사진을 줄였는가 */
  resized: boolean
}

/** 사진 줄이기 — 브라우저 전용(createImageBitmap·canvas). 없으면(null) 원본 그대로 보낸다 */
export type ImageShrinker = (blob: Blob, maxEdge: number) => Promise<Blob | null>

export const browserShrinker: ImageShrinker = async (blob, maxEdge) => {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) {
    bitmap.close?.()
    return null
  }
  // 투명 PNG도 글자가 보이게 흰 바탕
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, width, height)
  g.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY))
}

async function imageEdge(blob: Blob): Promise<number | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const b = await createImageBitmap(blob)
    const edge = Math.max(b.width, b.height)
    b.close?.()
    return edge
  } catch {
    return null
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

export async function prepareAiFile(
  fileName: string,
  data: ArrayBuffer,
  shrink: ImageShrinker = browserShrinker,
): Promise<PreparedAiFile> {
  const media = aiMediaTypeFor(fileName)
  if (!media) throw new ProviderError('validation', 'AI로 읽을 수 있는 파일은 PDF·JPG·PNG·WEBP입니다.')
  let bytes = new Uint8Array(data)
  let outMedia: AiMediaType = media
  let resized = false
  if (isImageMedia(media)) {
    const blob = new Blob([bytes], { type: media })
    const edge = bytes.byteLength > AI_IMAGE_REENCODE_BYTES ? null : await imageEdge(blob)
    const needs = bytes.byteLength > AI_IMAGE_REENCODE_BYTES || (edge !== null && edge > AI_IMAGE_MAX_EDGE)
    if (needs) {
      const small = await shrink(blob, AI_IMAGE_MAX_EDGE)
      if (small && small.size > 0 && small.size < bytes.byteLength) {
        bytes = new Uint8Array(await small.arrayBuffer())
        outMedia = 'image/jpeg'
        resized = true
      }
    }
  }
  if (bytes.byteLength === 0) throw new ProviderError('validation', '빈 파일입니다.')
  if (bytes.byteLength > AI_MAX_BYTES) throw new ProviderError('validation', AI_FILE_TOO_LARGE_MESSAGE)
  return { media_type: outMedia, data_base64: bytesToBase64(bytes), bytes: bytes.byteLength, resized }
}
