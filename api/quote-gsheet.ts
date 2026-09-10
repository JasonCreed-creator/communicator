// Vercel Function — POST /api/quote-gsheet (견적서 xlsx → 구글 스프레드시트 생성, 2026-09-10).
// GET /api/quote-gsheet 은 준비 상태(`{ready}`)만 돌려준다 — 자격증명 값은 어떤 경우에도 내보내지 않는다.
// 서버 전용 env: SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY(로그인·app_role 판정) +
// GOOGLE_SHEETS_SA_JSON(서비스 계정)·GOOGLE_QUOTE_FOLDER_ID(저장 폴더). 없으면 503 — 데모로 흉내 내지 않는다.
import { handleGsheetRequest } from './_lib/quoteGsheet'

export async function POST(request: Request): Promise<Response> {
  return handleGsheetRequest(request, process.env)
}

export async function GET(request: Request): Promise<Response> {
  return handleGsheetRequest(request, process.env)
}
