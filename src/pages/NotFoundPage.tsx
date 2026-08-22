import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-canvas p-6">
      <p className="t-caption font-mono">404</p>
      <h1 className="t-section-title">페이지를 찾을 수 없습니다</h1>
      <Link to="/" className="text-sm text-ink-sub underline hover:text-ink">
        홈으로 돌아가기
      </Link>
    </section>
  )
}
