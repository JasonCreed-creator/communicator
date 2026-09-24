// Vercel Function — /api/drive (설계서 v2.9 §7 Drive 저장소 · Phase 5).
// 서버 전용 env: DRIVE_ROOT_FOLDER_ID(저장소 루트) · GOOGLE_OAUTH_CLIENT_ID/SECRET(OAuth 웹 클라이언트) ·
// (선택) GOOGLE_DRIVE_REFRESH_TOKEN — 없으면 관리자가 앱에서 '연결하기'로 동의해 Supabase Vault에 둔다 ·
// SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY(로그인·권한 판정). 설정이 없으면 503을 사실대로 돌려준다.
// 파일 조각 본문은 4MB 이하(Vercel 요청 한도 4.5MB) · 파일 보기 응답은 스트리밍(Node 함수 기본)이라 크기 한도 밖이다.
import { handleDriveRequest } from './_lib/drive/handler.js'

export async function GET(request: Request): Promise<Response> {
  return handleDriveRequest(request, process.env)
}

export async function POST(request: Request): Promise<Response> {
  return handleDriveRequest(request, process.env)
}

export async function PUT(request: Request): Promise<Response> {
  return handleDriveRequest(request, process.env)
}
