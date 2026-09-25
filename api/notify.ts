// Vercel Function — GET·POST /api/notify · Slack 알림(Phase 6, 설계서 §9). 로직은 _lib/notify/handler.ts.
// 서버 전용 env: SUPABASE_URL(=VITE_SUPABASE_URL) · SUPABASE_SECRET_KEY · SLACK_WEBHOOK_URL(공용 채널 — 없으면 no-op) ·
// CRON_SECRET(Vercel cron 인증) · APP_BASE_URL(선택 — 링크의 공개 주소).
import { handleNotifyRequest } from './_lib/notify/handler.js'

export async function GET(request: Request): Promise<Response> {
  return handleNotifyRequest(request, process.env)
}

export async function POST(request: Request): Promise<Response> {
  return handleNotifyRequest(request, process.env)
}
