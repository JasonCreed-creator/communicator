// 구글 시트 실키 스모크(설계서 v2.21 §27.5 · Phase 6.11 PR-G) — 값은 출력하지 않는다.
//   npm run gsheet:smoke            # 끝나면 임시 폴더를 휴지통으로
//   npm run gsheet:smoke -- --keep  # 임시 폴더·시트를 남겨 눈으로 확인
// 자격증명(.env.local 또는 환경 변수 — 레포에 커밋 금지): drive:smoke와 같다 —
//   DRIVE_ROOT_FOLDER_ID · GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET + 갱신 토큰(GOOGLE_DRIVE_REFRESH_TOKEN 또는
//   VITE_SUPABASE_URL · SUPABASE_SECRET_KEY로 Vault에서 읽기) (서비스 계정: DRIVE_AUTH=service_account · GOOGLE_SHEETS_SA_JSON).
// 4단계: ① 토큰 교환 → ② 저장소 루트 아래 `_smoke_gsheet_…` 임시 폴더 + 빈 스프레드시트(Drive 네이티브 · 앱 산출물 표식)
//        → ③ Sheets API로 마스터 시트 모양(탭 2 · 값)을 채운다 = **가정 검증**(Drive scope 토큰으로 Sheets API 호출 · Sheets API 켜짐)
//        → ④ 한글금액 수식 오라클: 표본 금액을 A열에, `koreanAmountFormula(A행)`을 B열에 써 넣고 계산값을 읽어 JS 정본과 대조
//           (koreanAmountFormula.libreoffice.test.ts가 못 하던 "실제 타깃 엔진" 검증).
// 실제 행사·DB 행은 건드리지 않는다.
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { driveAccessToken, driveAuthMode, driveConfigured, type DriveAuthEnv } from '../api/_lib/drive/auth'
import { DriveApi } from '../api/_lib/drive/googleDrive'
import { APP_EXPORT_KEY } from '../api/_lib/drive/tree'
import { GSHEET_MIME } from '../api/_lib/masterSheet/handler'
import { fillSpreadsheet, SHEETS_API } from '../api/_lib/masterSheet/sheets'
import { koreanAmount, koreanAmountFormula } from '../src/modules/quote/export/koreanAmountFormula'
import type { MasterSheet } from '../src/lib/masterSheet/types'

const KEEP = process.argv.includes('--keep')

function loadEnvLocal(): Record<string, string> {
  const p = join(process.cwd(), '.env.local')
  if (!existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env } as DriveAuthEnv & Record<string, string | undefined>

let passed = 0
let failed = 0
function ok(step: string, detail = ''): void {
  passed++
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ''}`)
}
function fail(step: string, why: string, fix: string): never {
  failed++
  console.log(`✗ ${step} — ${why}\n  → 확인: ${fix}`)
  console.log(`\n${passed}/${passed + failed} 통과 — 여기서 멈춥니다.`)
  process.exit(1)
}

function vaultStore() {
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY
  if (!url || !secret) return null
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    async readRefreshToken() {
      const { data, error } = await admin.rpc('drive_token_read')
      if (error) throw new Error(error.message)
      return (data as string | null) ?? null
    },
    async recordConnectionError() {
      /* 스모크는 기록하지 않는다 */
    },
  }
}

/** 한글금액 표본 — koreanAmountFormula.test.ts의 SAMPLES 축약(억·조 경계 포함) */
const SAMPLES = [0, 1, 10, 11, 100, 101, 1_000, 1_010, 9_999, 10_000, 10_001, 120_000, 1_234_567, 12_345_678, 100_000_000, 137_810_000, 1_000_010_000, 123_456_789_012, 1_000_000_000_000]

async function main(): Promise<void> {
  console.log(`구글 시트 스모크 — 인증 방식: ${driveAuthMode(env) === 'service_account' ? '서비스 계정(공유 드라이브)' : 'OAuth(폴더 소유 계정)'}\n`)
  if (!driveConfigured(env)) {
    fail('0. 설정', 'Drive 저장소 env가 비어 있습니다', 'DRIVE_ROOT_FOLDER_ID · GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET (서비스 계정이면 DRIVE_AUTH=service_account · GOOGLE_SHEETS_SA_JSON)')
  }
  const root = env.DRIVE_ROOT_FOLDER_ID!

  // ① 토큰
  let token: string
  try {
    token = await driveAccessToken(env, env.GOOGLE_DRIVE_REFRESH_TOKEN ? null : vaultStore(), fetch, Date.now())
  } catch (e) {
    fail('① 토큰 교환', e instanceof Error ? e.message : String(e), 'OAuth 동의 화면 · 클라이언트 id/secret · 앱에서 "Drive 연결하기"를 마쳤는지(또는 GOOGLE_DRIVE_REFRESH_TOKEN)')
  }
  ok('① 토큰 교환', 'access token 발급')
  const api = new DriveApi(async () => token, fetch)

  // ② 임시 폴더 + 빈 스프레드시트(Drive 네이티브)
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(2, 14)
  const smoke = await api.createFolder(`_smoke_gsheet_${stamp}`, root).catch((e) => fail('② 임시 폴더', String(e), '저장소 루트 쓰기 권한(연결 계정이 폴더 편집자인지)'))
  const file = await api
    .createFile(`_smoke_마스터시트_${stamp}`, GSHEET_MIME, smoke.id, { [APP_EXPORT_KEY]: 'smoke' })
    .catch((e) => fail('② 빈 스프레드시트', String(e), 'Drive API 네이티브 파일 생성 권한 · 저장 용량(서비스 계정이면 공유 드라이브)'))
  ok('② 임시 폴더 + 빈 스프레드시트', `Drive 네이티브 파일 1개 · ${KEEP ? '남김(--keep)' : '끝나면 휴지통'}`)

  // ③ Sheets API로 채우기 — 마스터 시트 모양(탭 2) · 이 호출이 되면 "Drive scope 토큰으로 Sheets API" 가정이 참
  const sheet: MasterSheet = {
    title: file.name,
    includes_money: false,
    tabs: [
      { title: '개요', columns: [], rows: [['행사 ID', 'smoke', ''], ['담당자', '', '']], frozen_rows: 0, frozen_cols: 1, widths: [180, 300, 300], bold_rows: [1] },
      {
        title: '검산',
        columns: ['금액', '한글금액(수식)', 'JS 정본'],
        rows: SAMPLES.map((n, i) => [n, `=${koreanAmountFormula(`A${i + 2}`)}`, koreanAmount(n)]),
        frozen_rows: 1,
        frozen_cols: 1,
        widths: [160, 360, 360],
        bold_rows: [],
      },
    ],
  }
  try {
    await fillSpreadsheet(fetch, token, file.id, sheet)
  } catch (e) {
    await cleanup(api, smoke.id)
    fail('③ Sheets API 채우기', e instanceof Error ? e.message : String(e), '문구대로(Sheets API 켜기 · Drive 재연결) — 이 단계가 §27.5의 가정 검증이다')
  }
  ok('③ Sheets API 채우기', '탭 2(개요 · 검산) · 구조·서식·값 3호출 통과 — Drive scope 토큰으로 Sheets API 호출 가능')

  // ④ 수식은 RAW로 쓰면 글자로 남는다 — USER_ENTERED로 다시 써 넣고 계산값을 읽어 대조
  const range = encodeURIComponent(`'검산'!B2:B${SAMPLES.length + 1}`)
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' }
  const put = await fetch(`${SHEETS_API}/${encodeURIComponent(file.id)}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ range: `'검산'!B2:B${SAMPLES.length + 1}`, majorDimension: 'ROWS', values: SAMPLES.map((_, i) => [`=${koreanAmountFormula(`A${i + 2}`)}`]) }),
  })
  if (!put.ok) {
    await cleanup(api, smoke.id)
    fail('④ 한글금액 수식 쓰기', `Sheets 응답 ${put.status}`, 'values.update(USER_ENTERED) 권한 — ③이 통과했다면 일시 오류일 수 있다')
  }
  const got = await fetch(`${SHEETS_API}/${encodeURIComponent(file.id)}/values/${range}?valueRenderOption=FORMATTED_VALUE`, { headers: { authorization: `Bearer ${token}` } })
  if (!got.ok) {
    await cleanup(api, smoke.id)
    fail('④ 계산값 읽기', `Sheets 응답 ${got.status}`, 'values.get 권한')
  }
  const values = ((await got.json()) as { values?: string[][] }).values ?? []
  const mismatches = SAMPLES.map((n, i) => ({ n, got: values[i]?.[0] ?? '(빈 칸)', want: koreanAmount(n) })).filter((x) => x.got !== x.want)
  if (mismatches.length) {
    await cleanup(api, smoke.id)
    fail('④ 한글금액 수식 오라클', `${mismatches.length}건 불일치 — 예: ${mismatches[0].n} → 시트 "${mismatches[0].got}" / JS "${mismatches[0].want}"`, 'koreanAmountFormula 이식 함수(TEXT·MID·VALUE·IF·ROUND·ABS)의 구글 시트 해석 — 미니 평가기 테스트와 비교')
  }
  ok('④ 한글금액 수식 오라클', `표본 ${SAMPLES.length}건 전부 JS 정본과 일치(구글 시트 실계산)`)

  await cleanup(api, smoke.id)
  console.log(`\n${passed}/${passed + failed} 통과 — 구글 시트 스모크 완료.${KEEP ? ' 임시 폴더를 남겼습니다 — Drive에서 확인 후 지우세요.' : ''}\n`)
}

async function cleanup(api: DriveApi, folderId: string): Promise<void> {
  if (KEEP) return
  await api.update(folderId, { trashed: true }).catch(() => undefined)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
