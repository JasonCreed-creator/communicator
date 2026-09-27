// Vercel Function — /api/intake (Phase 6.2 · 설계서 v2.15 §8.7 — Slack 메시지로 행사 만들기 + Slack 첨부 → 행사 폴더).
// 서버 전용 env: SLACK_BOT_TOKEN(글 읽기 — 없으면 글 붙여 넣기만) · ANTHROPIC_API_KEY(선택 — 없으면 라벨 규칙만) · Drive env(첨부 옮기기)
// + SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY. 토큰·키 값은 어떤 응답에도 싣지 않는다.
import { handleIntakeRequest } from './_lib/intake/handler.js'

// 최대 실행 시간 120초 = vercel.json functions(Slack 읽기 + AI 읽기 + Drive 올리기)
export async function POST(request: Request): Promise<Response> {
  return handleIntakeRequest(request, process.env)
}

export async function GET(request: Request): Promise<Response> {
  return handleIntakeRequest(request, process.env)
}
