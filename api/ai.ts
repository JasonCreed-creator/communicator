// Vercel Function — /api/ai (Phase 4.8 · 설계서 v2.14 §19.5b — 협력사 견적서 PDF·사진 읽기).
// 서버 전용 env: ANTHROPIC_API_KEY(필수 — 없으면 503) · ANTHROPIC_MODEL(선택, 기본 claude-sonnet-5) · AI_DAILY_LIMIT(선택, 기본 30)
// + SUPABASE_URL·SUPABASE_SECRET_KEY·VITE_SUPABASE_PUBLISHABLE_KEY(권한·한도 기록). 키 값은 어떤 응답에도 싣지 않는다.
import { handleAiRequest } from './_lib/ai/handler.js'

// 최대 실행 시간 120초 = vercel.json functions(긴 견적서 PDF를 읽는 데 수십 초 — SDK 제한 시간 100초보다 넉넉하게)
export async function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, process.env)
}

export async function GET(request: Request): Promise<Response> {
  return handleAiRequest(request, process.env)
}
