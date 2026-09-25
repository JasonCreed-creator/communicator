// Vercel Function — GET·POST /api/gate · 시험용 입구(Phase 4.3, 설계서 §12.1). Okta SSO 전까지의 임시 입구 —
// 서버 env AUTH_GATE=open + AUTH_GATE_UNTIL(14일 이내)일 때만 열린다. 로직과 안전장치는 _lib/gate.ts.
// 서버 전용 env: SUPABASE_URL(=VITE_SUPABASE_URL) · SUPABASE_SECRET_KEY · AUTH_GATE · AUTH_GATE_UNTIL.
import { handleGateRequest } from './_lib/gate.js'

export async function GET(request: Request): Promise<Response> {
  return handleGateRequest(request, process.env)
}

export async function POST(request: Request): Promise<Response> {
  return handleGateRequest(request, process.env)
}
