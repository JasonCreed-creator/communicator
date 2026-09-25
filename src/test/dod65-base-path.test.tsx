/** @vitest-environment jsdom */
// DoD-65 (Phase 4.4 · 설계서 §18a, 사용자 지시 2026-09-25 "도메인은 mkt.rememberapp.co.kr/leadgen/communicator로 교체"):
// 회사 CloudFront가 /leadgen/communicator/* 를 접두어 그대로 Vercel로 넘기고, 앱은 그 경로 아래에서 돈다.
//   ① 기본 경로는 VITE_BASE_PATH 하나에서 파생 — 비우면 '/'(지금과 한 글자도 다르지 않다)
//   ② 라우터 basename·서버 함수 기본 경로·자산(로고·직인)·공유 링크·새 탭 열기가 기본 경로를 따른다(data:·외부 주소는 그대로)
//   ③ 기본 경로 밖(Vercel 주소 루트·옛 링크)으로 열면 기본 경로 아래로 옮긴다 — 이미 안이면 그대로
//   ④ Drive 연결 뒤 행사 설정 복귀: 같은 오리진이면 경로만(지금과 같음), 회사 도메인이면 리디렉트 URI에서 뽑은 절대 주소
//   ⑤ vercel.json: 접두어 아래 api·assets·brand가 SPA 폴백보다 먼저 제자리로 가고, 토큰 지면·자산 헤더도 접두어에 붙는다
// 실제 빌드·브라우저 확인은 `VITE_BASE_PATH=/leadgen/communicator/ npm run build && npm run deploy:check`(D2 + 실브라우저).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import { settingsReturnBase } from '../../api/_lib/drive/service'
import { signingKey, signToken } from '../../api/_lib/drive/sign'
import BrandLogo from '../components/BrandLogo'
import {
  appBasePath,
  appUrl,
  assetUrl,
  defaultApiBase,
  normalizeBasePath,
  relocateIntoBase,
  routerBasename,
} from '../lib/basePath'
import { externalViewUrl } from '../lib/externalLink'

const SUB = '/leadgen/communicator/'
const COMPANY = 'https://mkt.example.test'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('① 기본 경로 = VITE_BASE_PATH 하나', () => {
  it('비었거나 루트·상대 기준이면 "/"', () => {
    for (const v of [undefined, null, '', '/', './', '.']) expect(normalizeBasePath(v)).toBe('/')
  })

  it('앞뒤 슬래시를 맞춘다', () => {
    for (const v of ['leadgen/communicator', '/leadgen/communicator', '/leadgen/communicator/', ' /leadgen/communicator// ']) {
      expect(normalizeBasePath(v)).toBe(SUB)
    }
  })

  it('테스트 빌드(기본)는 루트 — 기존 테스트가 보는 주소가 그대로다', () => {
    expect(appBasePath()).toBe('/')
    expect(routerBasename()).toBeUndefined()
    expect(defaultApiBase(undefined)).toBe('/api')
  })
})

describe('② 파생 경로', () => {
  it('라우터 basename — 끝 슬래시 없이', () => {
    expect(routerBasename(SUB)).toBe('/leadgen/communicator')
    expect(routerBasename('/')).toBeUndefined()
  })

  it('자산: 루트 기준 경로에만 기본 경로를 붙인다(data:·외부·프로토콜 상대 주소는 그대로 — 데모 치환 보존)', () => {
    expect(assetUrl('/brand/remember-seal.png', SUB)).toBe('/leadgen/communicator/brand/remember-seal.png')
    expect(assetUrl('/brand/remember-seal.png', '/')).toBe('/brand/remember-seal.png')
    for (const v of ['data:,', 'data:image/png;base64,AAAA', 'https://cdn.example/x.png', '//cdn.example/x.png', 'brand/x.png']) {
      expect(assetUrl(v, SUB)).toBe(v)
    }
  })

  it('서버 함수 기본 경로: 명시가 이기고, 없으면 {기본 경로}api', () => {
    expect(defaultApiBase(undefined, SUB)).toBe('/leadgen/communicator/api')
    expect(defaultApiBase('', SUB)).toBe('/leadgen/communicator/api')
    expect(defaultApiBase('https://api.example/api/', SUB)).toBe('https://api.example/api')
  })

  it('공유 링크(/c·/p) 절대 주소 = origin + 기본 경로 + 경로', () => {
    expect(appUrl('c/tok-1', COMPANY, SUB)).toBe(`${COMPANY}/leadgen/communicator/c/tok-1`)
    expect(appUrl('/p/tok-2', COMPANY, '/')).toBe(`${COMPANY}/p/tok-2`)
    expect(appUrl('login', COMPANY, SUB)).toBe(`${COMPANY}/leadgen/communicator/login`)
  })

  it('빌드 기본 경로가 하위 경로면 로고·새 탭 열기가 그 아래를 가리킨다', () => {
    vi.stubEnv('BASE_URL', SUB)
    render(<BrandLogo />)
    expect(screen.getByRole('img', { name: 'Remember' }).getAttribute('src')).toBe('/leadgen/communicator/brand/remember-logo-black.png')
    expect(externalViewUrl('/c/tok-1')).toBe(`${window.location.origin}/leadgen/communicator/c/tok-1`)
  })

  it('루트 빌드에서는 로고·새 탭 열기가 이전과 같다', () => {
    render(<BrandLogo variant="offwhite" />)
    expect(screen.getByRole('img', { name: 'Remember' }).getAttribute('src')).toBe('/brand/remember-logo-offwhite.png')
    expect(externalViewUrl('/p/tok-2')).toBe(`${window.location.origin}/p/tok-2`)
  })
})

describe('③ 기본 경로 밖으로 열면 안으로 옮긴다', () => {
  it('루트 배포는 아무것도 하지 않는다', () => {
    expect(relocateIntoBase('/home', '', '', '/')).toBeNull()
  })

  it('Vercel 주소 루트·옛 링크 → 기본 경로 아래(쿼리·해시 유지)', () => {
    expect(relocateIntoBase('/', '', '', SUB)).toBe(SUB)
    expect(relocateIntoBase('/home', '?x=1', '#top', SUB)).toBe('/leadgen/communicator/home?x=1#top')
    expect(relocateIntoBase('/c/tok-1', '', '', SUB)).toBe('/leadgen/communicator/c/tok-1')
  })

  it('이미 안이면 그대로(무한 이동 없음)', () => {
    expect(relocateIntoBase('/leadgen/communicator', '', '', SUB)).toBeNull()
    expect(relocateIntoBase('/leadgen/communicator/', '', '', SUB)).toBeNull()
    expect(relocateIntoBase('/leadgen/communicator/projects', '', '', SUB)).toBeNull()
  })
})

describe('④ Drive 연결 뒤 행사 설정 복귀 주소', () => {
  const VERCEL = 'https://communicator-app.vercel.app'
  const COMPANY_REDIRECT = `${COMPANY}/leadgen/communicator/api/drive`

  it('같은 오리진이면 경로만 — 루트 배포는 지금과 같은 /settings…', () => {
    expect(settingsReturnBase(`${VERCEL}/api/drive?code=x`, `${VERCEL}/api/drive`)).toBe('')
    expect(settingsReturnBase(`${VERCEL}/leadgen/communicator/api/drive`, `${VERCEL}/leadgen/communicator/api/drive`)).toBe('/leadgen/communicator')
  })

  it('회사 도메인(CloudFront 경유 — 함수는 Vercel 주소로 받는다)이면 리디렉트 URI의 절대 주소', () => {
    expect(settingsReturnBase(`${VERCEL}/api/drive?code=x`, COMPANY_REDIRECT)).toBe(`${COMPANY}/leadgen/communicator`)
  })

  it('없거나 읽을 수 없으면 경로만(이전 동작)', () => {
    expect(settingsReturnBase(`${VERCEL}/api/drive`, undefined)).toBe('')
    expect(settingsReturnBase(`${VERCEL}/api/drive`, '회사 주소')).toBe('')
  })

  it('콜백 실제 흐름: state 위조 → env 리디렉트 URI 기준 · 거절 → 연결을 시작한 리디렉트 URI 기준(절대 주소)', async () => {
    const env = { DRIVE_SIGNING_KEY: 'test-signing-key', DRIVE_OAUTH_REDIRECT_URI: COMPANY_REDIRECT }
    const forged = await handleDriveRequest(new Request(`${VERCEL}/api/drive?code=c&state=forged`), env)
    expect(forged.status).toBe(302)
    expect(forged.headers.get('location')).toBe(`${COMPANY}/leadgen/communicator/settings?drive=error&reason=state`)

    const now = Date.now()
    const state = signToken({ k: 'oa', u: 'p1', r: COMPANY_REDIRECT }, signingKey(env), 600, now)
    const denied = await handleDriveRequest(new Request(`${VERCEL}/api/drive?error=access_denied&state=${encodeURIComponent(state)}`), env, {
      now: () => now,
    })
    expect(denied.headers.get('location')).toBe(`${COMPANY}/leadgen/communicator/settings?drive=error&reason=denied`)
  })
})

describe('⑤ vercel.json — 접두어 아래가 제자리로', () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as {
    rewrites: { source: string; destination: string }[]
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const P = '/leadgen/communicator'
  const idx = (source: string) => config.rewrites.findIndex((r) => r.source === source)

  it('api·assets·brand는 함수·파일로 — SPA 폴백보다 먼저', () => {
    expect(config.rewrites[idx(`${P}/api/:path*`)]?.destination).toBe('/api/:path*')
    expect(config.rewrites[idx(`${P}/assets/:path*`)]?.destination).toBe('/assets/:path*')
    expect(config.rewrites[idx(`${P}/brand/:path*`)]?.destination).toBe('/brand/:path*')
    const fallback = idx(`${P}/(.*)`)
    expect(fallback).toBeGreaterThan(idx(`${P}/api/:path*`))
    expect(fallback).toBeGreaterThan(idx(`${P}/assets/:path*`))
    expect(fallback).toBeGreaterThan(idx(`${P}/brand/:path*`))
    expect(config.rewrites[idx(P)]?.destination).toBe('/index.html')
    // 루트 폴백은 맨 뒤 — 접두어 규칙을 가로채지 않는다
    expect(config.rewrites[config.rewrites.length - 1]).toEqual({ source: '/(.*)', destination: '/index.html' })
  })

  it('토큰 지면(/c·/p) 차단 헤더와 해시 자산 캐시가 접두어 아래에도 같다', () => {
    const headersOf = (source: string) => config.headers.find((h) => h.source === source)?.headers
    for (const tail of ['/c/(.*)', '/p/(.*)', '/assets/(.*)']) {
      expect(headersOf(`${P}${tail}`)).toEqual(headersOf(tail))
    }
  })
})
