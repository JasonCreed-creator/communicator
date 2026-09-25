// 앱의 공개 기본 경로(Phase 4.4 — 회사 도메인 하위 경로 배포, 설계서 §18a). 사용자 지시 2026-09-25 "도메인은
// mkt.rememberapp.co.kr/leadgen/communicator로 교체" → 회사 CloudFront가 그 경로를 Vercel로 넘기고, 앱은 그 경로 아래에서 돈다.
// 빌드 env VITE_BASE_PATH가 Vite `base`가 되고(= import.meta.env.BASE_URL) 라우터 basename·서버 함수 기본 경로·
// 정적 자산·공유 링크가 전부 여기서 파생된다. 비우면 '/' — 지금까지와 한 글자도 다르지 않다.

/** '/' 또는 '/leadgen/communicator/' 꼴(앞뒤 슬래시). 상대 기준('./' — 데모 아티팩트)은 루트로 본다 */
export function normalizeBasePath(raw: string | undefined | null): string {
  const t = (raw ?? '').trim()
  if (!t || t === '/' || t === './' || t === '.') return '/'
  return `/${t.replace(/^\.?\/+|\/+$/g, '')}/`
}

/** 이 빌드의 기본 경로 */
export function appBasePath(): string {
  return normalizeBasePath((import.meta.env?.BASE_URL as string | undefined) ?? '/')
}

/** 라우터 basename — 루트 배포면 undefined(라우터 기본값 그대로) */
export function routerBasename(base: string = appBasePath()): string | undefined {
  return base === '/' ? undefined : base.replace(/\/$/, '')
}

/**
 * 루트 기준 자산 경로('/brand/x.png')에 기본 경로를 붙인다. 그 밖의 값(data:·http·상대 경로)은 그대로 —
 * 데모 빌드가 '/brand/…' 문자열을 data: URI로 치환해 넣는 경로(demo/plugins.ts)를 깨지 않는다.
 */
export function assetUrl(path: string, base: string = appBasePath()): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  return `${base}${path.slice(1)}`
}

/** 서버 함수 기본 경로 — VITE_API_BASE가 있으면 그것, 없으면 `{기본 경로}api` (루트 배포면 '/api') */
export function defaultApiBase(explicit: string | undefined | null, base: string = appBasePath()): string {
  const v = (explicit ?? '').trim()
  return (v || `${base}api`).replace(/\/$/, '')
}

/** 브라우저에서 새 탭·복사로 여는 앱 절대 주소(공유 링크 `/c`·`/p`, 매직링크 복귀) — origin + 기본 경로 + path */
export function appUrl(path: string, origin: string = typeof window !== 'undefined' ? window.location.origin : '', base: string = appBasePath()): string {
  return `${origin}${base}${path.replace(/^\/+/, '')}`
}

/**
 * 기본 경로 밖으로 들어온 주소를 기본 경로 아래로 옮긴 주소 — 이미 안이면 null.
 * 하위 경로로 빌드된 앱을 도메인 루트(예: Vercel 주소 `/`·옛 링크 `/home`)로 열었을 때 쓴다.
 */
export function relocateIntoBase(pathname: string, search = '', hash = '', base: string = appBasePath()): string | null {
  if (base === '/') return null
  const bare = base.replace(/\/$/, '')
  if (pathname === bare || pathname.startsWith(base)) return null
  return `${base}${pathname.replace(/^\/+/, '')}${search}${hash}`
}
