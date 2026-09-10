// Vercel Functions(api/) ESM 해석 가드 — 2026-09-10 프로덕션 실측(FUNCTION_INVOCATION_FAILED 3/3).
// @vercel/node는 `api/*.ts`와 그 상대 import 체인(src/ 포함)을 **파일 단위로 ESM 트랜스파일**하고 지정자를 그대로 둔다
// (package.json "type":"module"). Node ESM 로더는 확장자 없는 상대 경로를 해석하지 않으므로(`ERR_MODULE_NOT_FOUND`)
// 함수 진입점에서 닿는 모든 **런타임** 상대 import는 `.js` 확장자를 달아야 한다(TS·Vite·esbuild는 `.js`→`.ts`로 되짚는다).
// 이 테스트는 api/ 진입점에서 상대 import를 따라가며(타입 전용 import 제외) 지정자 끝이 `.js`인지, 대상 .ts가 있는지 본다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const API_DIR = resolve(ROOT, 'api')

/** 런타임 import/export-from 지정자만(타입 전용 `import type` 제외) */
function runtimeRelativeSpecifiers(source: string): string[] {
  const out: string[] = []
  const re = /^(?:import|export)\s+(?!type\s)[^'"]*?\sfrom\s+['"](\.{1,2}\/[^'"]+)['"]/gms
  for (const m of source.matchAll(re)) out.push(m[1])
  return out
}

function resolveTs(fromFile: string, spec: string): string {
  const base = resolve(dirname(fromFile), spec)
  return base.replace(/\.js$/, '.ts')
}

function walk(entry: string, seen = new Map<string, string[]>()): Map<string, string[]> {
  if (seen.has(entry)) return seen
  const source = readFileSync(entry, 'utf8')
  const specs = runtimeRelativeSpecifiers(source)
  seen.set(entry, specs)
  for (const spec of specs) {
    const target = resolveTs(entry, spec)
    if (existsSync(target)) walk(target, seen)
  }
  return seen
}

const entrypoints = readdirSync(API_DIR)
  .filter((f) => /\.[cm]?[jt]s$/.test(f) && !f.startsWith('_'))
  .map((f) => resolve(API_DIR, f))

describe('api/ Vercel Functions — ESM 상대 import는 .js 확장자 필수', () => {
  it('진입점이 3개 이상 잡힌다(quote-recalc · sheets · quote-gsheet)', () => {
    expect(entrypoints.length).toBeGreaterThanOrEqual(3)
  })

  it.each(entrypoints.map((e) => [e.slice(ROOT.length + 1), e]))('%s 에서 닿는 런타임 상대 import 전부 .js + 대상 .ts 존재', (_label, entry) => {
    const graph = walk(entry)
    const offenders: string[] = []
    for (const [file, specs] of graph) {
      for (const spec of specs) {
        const rel = file.slice(ROOT.length + 1)
        if (!spec.endsWith('.js')) offenders.push(`${rel}: '${spec}' (확장자 없음)`)
        else if (!existsSync(resolveTs(file, spec))) offenders.push(`${rel}: '${spec}' (대상 .ts 없음)`)
      }
    }
    expect(offenders).toEqual([])
    // 체인이 실제로 src/까지 내려간다(가드가 빈 그래프에 통과하는 것을 막는다)
    expect([...graph.keys()].some((f) => f.includes('/src/'))).toBe(true)
  })
})
