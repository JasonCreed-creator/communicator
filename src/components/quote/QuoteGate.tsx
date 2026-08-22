// S-2 접근 게이트 — app_role admin·sales만 통과. staff 직접 접근 시 403 화면(§10·DoD 25).
import type { ReactNode } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { CurrentUser } from '../../types/views'

const provider = getDataProvider()

export function canUseQuotes(user: Pick<CurrentUser, 'app_role'>): boolean {
  return user.app_role === 'admin' || user.app_role === 'sales'
}

export default function QuoteGate({ children }: { children: (user: CurrentUser) => ReactNode }) {
  const me = useAsync(() => provider.getCurrentUser(), [])

  if (me.loading) return <p className="p-6 text-sm text-ink-cap">불러오는 중…</p>
  if (me.error || !me.data) return <p className="p-6 text-sm text-negative">{me.error ?? '사용자 정보를 불러오지 못했습니다.'}</p>

  if (!canUseQuotes(me.data)) {
    return (
      <div className="p-6">
        <div className="ui-card mx-auto max-w-md p-8 text-center">
          <p className="kpi-num">403</p>
          <p className="t-card-title mt-2">접근 권한이 없습니다</p>
          <p className="mt-2 text-sm text-ink-sub">견적 메뉴는 영업·관리자 권한이 필요합니다.</p>
        </div>
      </div>
    )
  }
  return <>{children(me.data)}</>
}
