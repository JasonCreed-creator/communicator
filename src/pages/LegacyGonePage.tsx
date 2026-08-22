// §10 옛 Configurator 라우트 — `?client_view=1` 공유 링크 폐기 안내(410 Gone).
// v2.0 §12 4중 차단 ④: 발주처는 무로그인 토큰 링크(/c/{token})만 사용한다.
export default function LegacyGonePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="ui-card w-full max-w-md p-8 text-center">
        <p className="kpi-num">410</p>
        <p className="t-card-title mt-2">이 공유 링크는 더 이상 사용되지 않습니다</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-sub">
          발주처 화면은 전용 링크로 이전되었습니다. 담당자에게 새 링크를 요청해 주세요.
        </p>
      </div>
    </div>
  )
}
