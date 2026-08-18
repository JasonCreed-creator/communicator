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
      <p className="font-mono text-xs text-gray-400">{screenId}</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
      <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
        {implementedIn} 구현 예정
      </div>
    </section>
  )
}
