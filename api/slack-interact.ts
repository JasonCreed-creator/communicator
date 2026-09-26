// Vercel Function — POST /api/slack-interact · Slack 앱 Interactivity(의뢰 카드 '확인했어요' 버튼, 설계서 v2.12 §9).
// 로직은 _lib/notify/interact.ts. Slack 앱 설정의 Request URL과 이 경로가 같아야 한다(바꾸면 Slack 앱 설정도 같이).
// 서버 전용 env: SLACK_SIGNING_SECRET(서명 검증) · SLACK_BOT_TOKEN(누른 사람 이메일 조회) · SUPABASE_URL · SUPABASE_SECRET_KEY.
import { handleSlackInteract } from './_lib/notify/interact.js'

export async function POST(request: Request): Promise<Response> {
  return handleSlackInteract(request, process.env)
}

export async function GET(request: Request): Promise<Response> {
  return handleSlackInteract(request, process.env)
}
