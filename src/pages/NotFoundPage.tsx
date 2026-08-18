import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6">
      <p className="font-mono text-xs text-gray-400">404</p>
      <h1 className="text-xl font-bold text-gray-900">페이지를 찾을 수 없습니다</h1>
      <Link to="/" className="text-sm text-gray-600 underline hover:text-gray-900">
        홈으로 돌아가기
      </Link>
    </section>
  )
}
