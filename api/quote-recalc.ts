// Vercel Function — POST /api/quote-recalc (설계서 §8 견적 서버 재계산의 실행 자리, 2026-09-07 사용자 결정:
// Edge Function 대신 Vercel Functions — 같은 레포·같은 배포, D-Day 추가 단계는 Vercel env의 secret 1줄).
// Web 표준 시그니처: Vercel Node 런타임이 Request → Response 핸들러를 그대로 지원한다.
// 서버 전용 env: SUPABASE_URL(=VITE_SUPABASE_URL) · SUPABASE_SECRET_KEY · VITE_SUPABASE_PUBLISHABLE_KEY.
import { handleRecalcRequest } from './_lib/quoteRecalc'

export async function POST(request: Request): Promise<Response> {
  return handleRecalcRequest(request, process.env)
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: { code: 'validation', message: 'POST만 허용됩니다.' } }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
