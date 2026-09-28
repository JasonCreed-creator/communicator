// 참고 문서 링크(projects.reference_links) 판정 — mock·실서버 공급자가 같은 규칙(Phase 6.11 PR-B · 설계서 v2.21 §27.3).
// 마스터 시트 '개요' 탭의 킥오프·요청서·제안서·계약 링크 자리. 앱은 링크를 열기만 한다(파일을 읽지 않는다 — 저장소 밖 링크도 된다).
// https 주소만 · 행사당 상한 20 · 내부 화면에만(발주처·파트너·랜딩 지면 0 · 홈 머리에도 두지 않는다).
import { REFERENCE_LINK_KINDS, type ReferenceLinkKind } from '../types/enums'
import type { ReferenceLink } from '../types/entities'
import { isHttpsUrl } from './quoteAttachment'

export const REFERENCE_LINKS_MAX = 20

export const REFERENCE_LINK_KIND_LABELS: Record<ReferenceLinkKind, string> = {
  kickoff: '킥오프',
  request: '요청서',
  proposal: '제안서',
  contract: '계약',
  other: '기타',
}

export const REFERENCE_LINK_INVALID_MESSAGE = '참고 문서 링크는 https 주소여야 합니다(구글 문서·시트·Drive·사내 위키·외부 페이지 링크).'
export const REFERENCE_LINKS_LIMIT_MESSAGE = `참고 문서는 행사당 ${REFERENCE_LINKS_MAX}개까지 붙일 수 있습니다 — 안 쓰는 링크를 빼고 다시 붙여 주세요.`
export const REFERENCE_LINK_DUPLICATE_MESSAGE = '같은 주소가 이미 붙어 있습니다.'

export function isReferenceLinkKind(v: unknown): v is ReferenceLinkKind {
  return typeof v === 'string' && (REFERENCE_LINK_KINDS as readonly string[]).includes(v)
}

/**
 * 저장 값 정규화 — null·[] = 없음(null) · 배열이 아니거나 원소 모양이 틀리면 'invalid' · 상한을 넘으면 'limit'.
 * 같은 주소는 먼저 것만 남긴다(뒤 중복은 조용히 버린다 — 화면이 미리 안내한다).
 */
export function normalizeReferenceLinks(value: unknown): ReferenceLink[] | null | 'invalid' | 'limit' {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return 'invalid'
  const out: ReferenceLink[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return 'invalid'
    const v = raw as Record<string, unknown>
    if (!isReferenceLinkKind(v.kind)) return 'invalid'
    const url = typeof v.url === 'string' ? v.url.trim() : ''
    if (!isHttpsUrl(url)) return 'invalid'
    if (seen.has(url)) continue
    seen.add(url)
    const title = typeof v.title === 'string' ? v.title.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    const addedAt = typeof v.added_at === 'string' && !Number.isNaN(Date.parse(v.added_at)) ? v.added_at : new Date().toISOString()
    out.push({ kind: v.kind, title, url, added_at: addedAt })
  }
  if (out.length > REFERENCE_LINKS_MAX) return 'limit'
  return out.length > 0 ? out : null
}

/** 화면 이름 — 제목이 있으면 제목, 없으면 호스트(구글 문서·시트·Drive는 종류 이름) */
export function referenceLinkLabel(link: Pick<ReferenceLink, 'title' | 'url'>): string {
  if (link.title.trim()) return link.title.trim()
  return hostLabel(link.url)
}

export function hostLabel(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'docs.google.com') {
      if (u.pathname.startsWith('/spreadsheets')) return '구글 시트'
      if (u.pathname.startsWith('/document')) return '구글 문서'
      if (u.pathname.startsWith('/presentation')) return '구글 슬라이드'
      return '구글 문서'
    }
    if (u.hostname === 'drive.google.com') return 'Drive 파일'
    return u.hostname.replace(/^www\./, '')
  } catch {
    return '링크'
  }
}

/** 링크 이름·주소로 종류를 어림한다(요청서·제안서·계약·킥오프 낱말 — 그 밖은 기타). 제안이지 판정이 아니라 화면에서 고칠 수 있다 */
export function guessReferenceLinkKind(url: string, label: string | null | undefined): ReferenceLinkKind {
  const s = `${label ?? ''} ${url}`.toLowerCase()
  if (/요청서|request|rfp|brief/.test(s)) return 'request'
  if (/제안서|제안|proposal/.test(s)) return 'proposal'
  if (/계약|contract|agreement/.test(s)) return 'contract'
  if (/킥오프|kickoff|kick-off|kick_off/.test(s)) return 'kickoff'
  return 'other'
}
