// Vercel Function — POST /api/sheets (설계서 §24 등록 시트 읽기: probe · preview · rows).
// 시트 → 앱 단방향(§24.6) — 이 함수에 쓰기 작업은 없다. 자격증명(GOOGLE_SHEETS_SA_JSON) 없으면 데모 모드.
import { handleSheetsRequest } from './_lib/sheets.js'

export async function POST(request: Request): Promise<Response> {
  return handleSheetsRequest(request, process.env)
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: { code: 'validation', message: 'POST만 허용됩니다.' } }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
