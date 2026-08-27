import BrandLogo from '../BrandLogo'

// `/p/{token}` 파트너 제출 포털 상단 바 — 디자인지시서 v1 §4의 발주처 슬림 다크 바와 동일 규격
// (--dark + offwhite 로고)에 등급 배지·파트너명을 더한 파트너 전용 버전(ClientLayout 헤더는 그대로 두고
// 별도 컴포넌트로 둔다 — CLAUDE.md Phase 3.15c 지시). 데이터 조회 실패(410 등) 시에도 침묵 폴백.
interface PartnerPortalHeaderProps {
  projectName: string | null
  tierName: string | null
  partnerName: string | null
}

export default function PartnerPortalHeader({ projectName, tierName, partnerName }: PartnerPortalHeaderProps) {
  return (
    <header className="bg-dark">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-3">
        <BrandLogo variant="offwhite" className="h-5 w-auto" />
        <span aria-hidden className="text-dark-ink/25">
          |
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-dark-ink">
          {projectName ?? '파트너 제출 포털'}
        </span>

        {(tierName || partnerName) && (
          <span className="ml-auto flex min-w-0 items-center gap-2">
            {tierName && (
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                {tierName}
              </span>
            )}
            {partnerName && (
              <span className="min-w-0 truncate text-sm text-dark-ink/85">{partnerName}</span>
            )}
          </span>
        )}
      </div>
    </header>
  )
}
