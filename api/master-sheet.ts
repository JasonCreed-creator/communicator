// Vercel Function — /api/master-sheet (설계서 v2.21 §27.5 마스터 시트 내보내기 · Phase 6.11 PR-G).
// 서버 전용 env: Drive 저장소(DRIVE_ROOT_FOLDER_ID · GOOGLE_OAUTH_CLIENT_ID/SECRET — 연결은 앱 '연결하기' → Vault) +
// SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY(로그인·멤버 판정 · 사용자 JWT로 RLS 아래 읽기).
// 설정이 없으면 503을 사실대로 — 데모로 흉내 내지 않는다. GET은 `{ready}`만.
import { handleMasterSheetRequest } from './_lib/masterSheet/handler.js'

export async function GET(request: Request): Promise<Response> {
  return handleMasterSheetRequest(request, process.env)
}

export async function POST(request: Request): Promise<Response> {
  return handleMasterSheetRequest(request, process.env)
}
