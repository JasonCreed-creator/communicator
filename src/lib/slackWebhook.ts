// Slack Incoming Webhook 주소 판정 — 행사 설정 ③(행사별 채널)과 서버 알림 함수(api/_lib/notify)가 같은 규칙을 쓴다(Phase 6, §9).
// Incoming Webhook 주소(`https://hooks.slack.com/services/…`)만 받는다: 서버가 이 값으로 POST하므로, 다른 주소를 허용하면
// 행사 설정에 적힌 임의 URL로 서버가 요청을 보내게 된다(워크플로 웹훅 `/triggers/…`는 본문 형식이 달라 제외).
export const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+$/

export const SLACK_WEBHOOK_INVALID_MESSAGE =
  'Slack 웹훅 주소는 https://hooks.slack.com/services/… 형식이어야 합니다(Slack 앱 → Incoming Webhooks에서 복사).'

export function isSlackWebhookUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && SLACK_WEBHOOK_RE.test(url.trim())
}

/** 저장 값 정규화 — 빈 칸 = 해제(null), 형식이 틀리면 null 대신 'invalid' */
export function normalizeSlackWebhook(value: string | null | undefined): string | null | 'invalid' {
  const v = (value ?? '').trim()
  if (!v) return null
  return isSlackWebhookUrl(v) ? v : 'invalid'
}

/** 화면 표시용 가림 — 끝 토큰만 가린다(채널을 알아볼 수 있게 앞부분은 둔다) */
export function maskSlackWebhook(url: string): string {
  const parts = url.split('/')
  if (parts.length < 2) return '••••'
  parts[parts.length - 1] = '••••'
  return parts.join('/')
}
