// 무로그인 외부 지면(/c 발주처 · /p 파트너 포털)을 새 탭으로 열기 위한 절대 URL.
//
// 링크 '복사'는 origin + 기본 경로 + 경로면 충분하지만(appUrl) '열기'는 그렇지 않다 — 데모 아티팩트는 하위 경로에서
// HashRouter로 서빙돼(App.tsx 라우트 표 주석) `/c/...` 절대 경로가 404가 된다.
// 그래서 현재 주소가 해시 라우팅이면 해시 경로로, 아니면 기본 경로(Phase 4.4 — 회사 도메인 하위 경로)를 붙인 절대 경로로 만든다.
import { appUrl } from './basePath'

export function externalViewUrl(path: string): string {
  const { origin, pathname, hash } = window.location
  return hash.startsWith('#/') ? `${origin}${pathname}#${path}` : appUrl(path, origin)
}
