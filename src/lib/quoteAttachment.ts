// 견적서 첨부(projects.quote_attachment) 판정 — mock·실서버 공급자가 같은 규칙(Phase 6.2 · 설계서 v2.15 §10 S0·S6①).
// 파일은 Drive 행사 폴더 02_견적·정산/견적서에 서버가 올리고(drive) · 링크는 https 주소만 적어 둔다(link). 행사 하나에 하나.
import type { QuoteAttachment } from '../types/entities'

export const QUOTE_ATTACHMENT_INVALID_MESSAGE = '견적서 링크는 https 주소여야 합니다(구글 시트·Drive·사내 문서 링크).'

export const QUOTE_ATTACHMENT_FILE_MESSAGE =
  '견적서 파일은 엑셀·PDF·이미지·문서(xlsx·xls·pdf·jpg·png·docx·pptx·hwp)만 — 4MB까지. 더 크면 Drive에 올린 뒤 링크로 붙여 주세요.'

/** 첨부로 받는 파일 확장자 */
export const QUOTE_ATTACHMENT_EXT_RE = /\.(xlsx|xls|csv|pdf|jpe?g|png|webp|docx?|pptx?|hwpx?|numbers|pages)$/i

/** 서버 함수 한 번에 올리는 상한(4MB — Vercel 요청 4.5MB) */
export const QUOTE_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && !!u.hostname
  } catch {
    return false
  }
}

/**
 * 저장 값 정규화 — null = 지움 · 모양이 틀리면 'invalid'.
 * kind 'link'는 url만 필수(file_name·drive_file_id는 null로) · kind 'drive'는 drive_file_id도 필수
 */
export function normalizeQuoteAttachment(value: unknown): QuoteAttachment | null | 'invalid' {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return 'invalid'
  const v = value as Record<string, unknown>
  const kind = v.kind
  if (kind !== 'drive' && kind !== 'link') return 'invalid'
  const url = typeof v.url === 'string' ? v.url.trim() : ''
  if (!isHttpsUrl(url)) return 'invalid'
  const source = v.source === 'upload' || v.source === 'slack' || v.source === 'link' ? v.source : kind === 'link' ? 'link' : 'upload'
  const fileName = typeof v.file_name === 'string' && v.file_name.trim() ? v.file_name.trim().slice(0, 200) : null
  const driveId = typeof v.drive_file_id === 'string' && v.drive_file_id.trim() ? v.drive_file_id.trim() : null
  if (kind === 'drive' && !driveId) return 'invalid'
  const addedAt = typeof v.added_at === 'string' && !Number.isNaN(Date.parse(v.added_at)) ? v.added_at : new Date().toISOString()
  return { kind, url, file_name: fileName, drive_file_id: kind === 'drive' ? driveId : null, source, added_at: addedAt }
}

/** 화면 이름 — 파일이면 파일 이름, 링크면 호스트(구글 시트는 '구글 시트') */
export function quoteAttachmentLabel(a: QuoteAttachment): string {
  if (a.file_name) return a.file_name
  try {
    const u = new URL(a.url)
    if (u.hostname === 'docs.google.com' && u.pathname.startsWith('/spreadsheets')) return '구글 시트'
    if (u.hostname === 'drive.google.com') return 'Drive 파일'
    return u.hostname.replace(/^www\./, '')
  } catch {
    return '링크'
  }
}
