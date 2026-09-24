// Drive 저장소 실계정 스모크(설계서 v2.9 §20 T5 ① — D-Day·첫 연결 직후 5분 검증). 값은 출력하지 않는다.
//   npm run drive:smoke            # 끝나면 임시 폴더를 휴지통으로
//   npm run drive:smoke -- --keep  # 임시 폴더를 남겨 Drive에서 눈으로 확인
// 자격증명(.env.local 또는 환경 변수 — 레포에 커밋 금지):
//   DRIVE_ROOT_FOLDER_ID · GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET
//   + 갱신 토큰: GOOGLE_DRIVE_REFRESH_TOKEN 또는 (앱의 'Drive 연결하기'로 Vault에 넣었다면) VITE_SUPABASE_URL · SUPABASE_SECRET_KEY
//   (서비스 계정 경로: DRIVE_AUTH=service_account · GOOGLE_SHEETS_SA_JSON — 공유 드라이브 폴더일 때만)
// 5단계: ① 토큰 교환 → ② 저장소 루트 쓰기 권한 → ③ 표준 트리 생성(임시 행사 폴더) → ④ 5MB 조각 업로드 → ⑤ 06 복사 + 스트림 대조.
// 실제 행사·DB 행은 건드리지 않는다 — 저장소 루트 아래 `_smoke_…` 임시 폴더 하나만 만들고 지운다.
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { driveAccessToken, driveAuthMode, driveConfigured, type DriveAuthEnv } from '../api/_lib/drive/auth'
import { DriveApi } from '../api/_lib/drive/googleDrive'
import { ensureParts, PART, DESIGN_SUBFOLDER } from '../api/_lib/drive/tree'

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

async function main(): Promise<void> {
  console.log(`Drive 스모크 — 인증 방식: ${driveAuthMode(env) === 'service_account' ? '서비스 계정(공유 드라이브)' : 'OAuth(폴더 소유 계정)'}\n`)
  if (!driveConfigured(env)) {
    fail(
      '0. 설정',
      'Drive 저장소 env가 비어 있습니다',
      'DRIVE_ROOT_FOLDER_ID · GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET (서비스 계정이면 DRIVE_AUTH=service_account · GOOGLE_SHEETS_SA_JSON)',
    )
  }
  const root = env.DRIVE_ROOT_FOLDER_ID!

  // ① 토큰
  let token: string
  try {
    token = await driveAccessToken(env, env.GOOGLE_DRIVE_REFRESH_TOKEN ? null : vaultStore(), fetch, Date.now())
  } catch (e) {
    fail(
      '① 토큰 교환',
      e instanceof Error ? e.message : String(e),
      'OAuth 동의 화면이 Production(또는 Internal)인지 · 클라이언트 id/secret이 맞는지 · 앱에서 "Drive 연결하기"를 마쳤는지(또는 GOOGLE_DRIVE_REFRESH_TOKEN)',
    )
  }
  ok('① 토큰 교환', 'access token 발급')
  const api = new DriveApi(async () => token, fetch)

  // ② 루트
  const about = await api.about().catch(() => null)
  const rootFile = await api.getFile(root, 'id,name,mimeType,trashed,capabilities(canAddChildren)')
  if (!rootFile || rootFile.trashed) fail('② 저장소 루트', '폴더를 볼 수 없습니다', 'DRIVE_ROOT_FOLDER_ID가 맞는지 · 연결 계정이 그 폴더에 접근할 수 있는지')
  if (rootFile.capabilities?.canAddChildren === false) fail('② 저장소 루트', '쓰기 권한이 없습니다', '연결 계정을 폴더 편집자로 공유했는지')
  ok('② 저장소 루트', `"${rootFile.name}" 쓰기 가능${about?.user?.emailAddress ? ` · 계정 ${about.user.emailAddress}` : ''}`)

  // ③ 트리
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(2, 14)
  const smoke = await api.createFolder(`_smoke_${stamp}`, root).catch((e) => fail('③ 표준 트리', String(e), '루트 폴더 쓰기 권한'))
  const parts = await ensureParts(api, smoke.id).catch((e) => fail('③ 표준 트리', String(e), '루트 폴더 쓰기 권한'))
  const again = await ensureParts(api, smoke.id)
  if (JSON.stringify(parts) !== JSON.stringify(again)) fail('③ 표준 트리', '두 번째 실행이 폴더를 새로 만들었습니다(멱등 깨짐)', 'Drive 검색 지연 — 1분 뒤 다시 실행')
  ok('③ 표준 트리', `파트 ${Object.keys(parts).length}개 · 2회 실행 중복 0`)

  // ④ 업로드(5MB → 4MB + 1MB 조각)
  const size = 5 * 1024 * 1024
  const data = new Uint8Array(size)
  for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) % 251
  const target = parts[`${PART.output}/${DESIGN_SUBFOLDER}`]
  let fileId = ''
  try {
    const session = await api.startResumable({ name: '스모크_업로드.bin', parents: [target] }, { mimeType: 'application/octet-stream', size })
    const chunk = 4 * 1024 * 1024
    for (let offset = 0; offset < size; ) {
      const end = Math.min(offset + chunk, size) - 1
      const r = await api.putChunk(session, data.subarray(offset, end + 1), offset, end, size)
      if (r.done) {
        fileId = r.file.id
        break
      }
      offset = r.received
    }
  } catch (e) {
    fail('④ 조각 업로드', e instanceof Error ? e.message : String(e), '저장 용량(서비스 계정이면 공유 드라이브 필요) · 네트워크')
  }
  if (!fileId) fail('④ 조각 업로드', '완료 응답이 없습니다', 'Drive 재개 업로드 응답')
  ok('④ 조각 업로드', '5MB · 2조각')

  // ⑤ 복사 + 스트림 대조
  const copy = await api.copy(fileId, { name: '스모크_사본.bin', parents: [parts[PART.share]] }).catch((e) => fail('⑤ 06 복사', String(e), '폴더 쓰기 권한'))
  const res = await api.media(copy.id, 'bytes=4194300-4194309')
  const part = new Uint8Array(await res.arrayBuffer())
  const expected = data.subarray(4194300, 4194310)
  if (res.status !== 206 || part.length !== 10 || part.some((b, i) => b !== expected[i])) {
    fail('⑤ 스트림', `부분 응답이 원본과 다릅니다(status ${res.status})`, 'Range 전달 · 파일 손상 여부')
  }
  ok('⑤ 06 복사 + 스트림', '사본 생성 · Range 206 · 바이트 일치')

  if (!KEEP) {
    await api.update(smoke.id, { trashed: true }).catch(() => undefined)
    console.log(`\n임시 폴더 _smoke_${stamp}는 휴지통으로 옮겼습니다(--keep이면 남김).`)
  } else {
    console.log(`\n임시 폴더를 남겼습니다: _smoke_${stamp} — 확인 후 직접 지우세요.`)
  }
  console.log(`\n${passed}/${passed + failed} 통과 — Drive 저장소 실전 투입 가능.`)
}

main().catch((e) => {
  console.error(`예상하지 못한 오류: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
