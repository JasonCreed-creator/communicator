// 프로젝트 스코프 가드 (v2.1 §4-21 말미 — 재발 방지 정본).
//
// 두 가지를 상시 검사한다.
//  ① 화면 코드(*.tsx)에 행사 ID 상수(PROJECT_ID)가 다시 스며들지 않는다 — v1.5가 없앤 단일 행사 전제
//  ② 프로덕션 소스 어디에서도 `user.project_id`·`currentUser().project_id`로 **스코프를 유도하지**
//     않는다 — currentUser()는 행위자 신원·권한 판정 전용이다
//
// ②를 뒤늦게 넣는 이유: Phase 3.13 랜딩보드가 `listLandingPages()`에서 멤버십 첫 행으로 필터해,
// 다른 행사를 보고 있어도 같은 목록이 뜨고 종료 행사에서도 생성이 통과했다. ①의 grep이 리터럴
// `PROJECT_ID`만 봤기 때문에 그 경로가 그대로 통과했다(설계서 v2.1 §4-21).
//
// 예외를 두려면 **두 곳 모두** 손대야 한다 — 아래 화이트리스트에 file:line을 명시하고,
// 그 줄에 `scope-exempt:` 주석으로 사유를 남긴다. 무설명 예외는 통과하지 않는다.
import { describe, expect, it } from 'vitest'

/** 프로덕션 소스만 — 테스트 파일은 결함 재현을 위해 이 패턴을 의도적으로 쓴다 */
const PRODUCTION_SOURCES = {
  ...import.meta.glob('../pages/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../components/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../providers/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../context/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../hooks/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../lib/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../modules/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../fixtures/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

/** MockProvider.test.ts는 providers/ 아래 있지만 테스트다 */
const IS_TEST_FILE = /\.test\.tsx?$/

/**
 * 승인된 예외 — `파일경로:줄내용의 일부` 형태. 현재 0건.
 * 새로 추가할 때는 반드시 해당 줄에 `scope-exempt:` 주석과 사유를 함께 남긴다.
 */
const SCOPE_EXEMPTIONS: { file: string; contains: string }[] = []

function sourceEntries(): [string, string][] {
  return Object.entries(PRODUCTION_SOURCES).filter(([file]) => !IS_TEST_FILE.test(file))
}

describe('스코프 가드 (§4-21) — 행사 스코프는 인자로만 정한다', () => {
  it('스캔 대상 소스가 실제로 잡힌다 (glob 오타로 0건 통과하는 것을 막는다)', () => {
    expect(sourceEntries().length).toBeGreaterThan(30)
  })

  it('화면 코드(*.tsx)에 행사 ID 상수가 없다', () => {
    const offenders: string[] = []
    for (const [file, src] of sourceEntries()) {
      if (!file.endsWith('.tsx')) continue
      src.split('\n').forEach((line, i) => {
        if (/\bPROJECT_ID\b/.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('프로덕션 소스가 user.project_id로 스코프를 유도하지 않는다', () => {
    // currentUser()가 돌려주는 project_id는 '멤버십 첫 행'이라 현재 행사가 아니다.
    const SCOPE_FROM_USER = /\buser\.project_id\b|\bcurrentUser\(\)\.project_id\b/
    const offenders: string[] = []

    for (const [file, src] of sourceEntries()) {
      src.split('\n').forEach((line, i) => {
        if (!SCOPE_FROM_USER.test(line)) return
        const exempt = SCOPE_EXEMPTIONS.some(
          (e) => file.endsWith(e.file) && line.includes(e.contains),
        )
        // 화이트리스트에 있어도 사유 주석이 없으면 위반으로 본다
        if (exempt && line.includes('scope-exempt:')) return
        offenders.push(`${file}:${i + 1} ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
