interface PagePlaceholderProps {
  screenId: string
  title: string
  description: string
  implementedIn: string
}

// Phase 0 라우팅 골격용 자리표시 화면 — 각 페이지는 담당 Phase에서 실제 구현으로 교체
export default function PagePlaceholder({
  screenId,
  title,
  description,
  implementedIn,
}: PagePlaceholderProps) {
  return (
    <section className="p-6">
      <p className="t-caption font-mono">{screenId}</p>
      <h1 className="t-page-title mt-1">{title}</h1>
      <p className="mt-2 text-sm text-ink-sub">{description}</p>
      <div className="mt-6 rounded-xl border border-dashed border-border p-10 text-center text-sm text-ink-cap">
        {implementedIn} 구현 예정
      </div>
    </section>
  )
}
