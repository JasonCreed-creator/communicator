// Phase 4.3.1(2026-09-25 실사용 결함) — 발주처 링크가 하나도 없는 행사에서 컨펌을 보내려 할 때의 경고.
// 보내면 발주처가 열어볼 곳이 없어 항목이 컨펌대기에 멈춘다(컨펌대기에서 나가는 길은 발주처의 승인·수정요청뿐 — §5).
// 발송은 막지 않는다 — 링크는 보낸 뒤에 발급해도 발주처 화면에 그 항목이 그대로 뜬다. 판정 = 회수·만료되지 않은 링크 0개.
// 조회가 실패하면(권한 등)·행사 범위 밖이면 아무것도 그리지 않는다 — 경고를 추측으로 띄우지 않는다.
import { Link } from 'react-router-dom'
import { useOptionalProject } from '../../context/ProjectContext'
import { useAsync } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { ClientToken } from '../../types/entities'

const provider = getDataProvider()

/**
 * Phase 6(§9 v2.3) — 컨펌 발송 폼의 이메일 안내. 발주처 이메일(Resend)은 Phase 6b라 아직 가지 않는다 — 게이트 뒤에 숨기지 않고
 * 발송 폼에서 사실을 적는다(내부 Slack 알림은 자동으로 간다).
 */
export const EMAIL_PENDING_NOTICE =
  '발주처에게 이메일은 아직 가지 않습니다(준비 중) — 발주처 링크를 복사해 직접 전달하세요. 내부 Slack 알림은 자동으로 갑니다.'

export function EmailPendingNote({ className = '' }: { className?: string }) {
  return (
    <p data-testid="email-pending-note" className={`t-caption ${className}`}>
      {EMAIL_PENDING_NOTICE}
    </p>
  )
}

/** 발주처가 지금 열 수 있는 링크 — 회수되지 않았고 기한이 없거나 남았다 */
export function activeClientLinks(tokens: readonly ClientToken[], now: number = Date.now()): ClientToken[] {
  return tokens.filter((t) => !t.revoked_at && (!t.expires_at || Date.parse(t.expires_at) > now))
}

/** 발주처가 지금 열 수 있는 링크가 하나라도 있는가 */
export function hasActiveClientLink(tokens: readonly ClientToken[], now: number = Date.now()): boolean {
  return activeClientLinks(tokens, now).length > 0
}

export default function ClientLinkWarning({ className = '' }: { className?: string }) {
  const projectId = useOptionalProject()?.projectId ?? null
  const tokens = useAsync(
    () => (projectId ? provider.listClientTokens(projectId) : Promise.resolve(null)),
    [projectId],
  )
  if (!tokens.data || hasActiveClientLink(tokens.data)) return null
  return (
    <div data-testid="client-link-warning" role="note" className={`rounded-lg border border-accent/30 bg-accent-tint p-3 ${className}`}>
      <p className="text-sm font-semibold text-accent-deep">발주처 링크가 아직 없습니다</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-sub">
        지금 보내면 발주처가 열어볼 곳이 없어 이 항목이 컨펌대기에서 멈춥니다(승인·수정요청은 발주처 화면에서만 할 수
        있습니다).{' '}
        <Link to="/settings?tab=members" className="font-medium text-accent-deep underline underline-offset-2">
          행사 설정 ② 담당자
        </Link>
        의 ‘발주처 연락처·토큰’에서 링크를 먼저 발급하세요.
      </p>
    </div>
  )
}
