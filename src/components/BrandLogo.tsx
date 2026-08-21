import { useState } from 'react'

// 리멤버 브랜드 로고 — public/brand/remember-logo.svg 자산이 있으면 이미지를 쓰고,
// 자산이 아직 없으면 텍스트 워드마크로 폴백한다(파일만 넣으면 자동 교체).
// 흰 배경 헤더 기준 블랙 로고 자산을 사용할 것.
export default function BrandLogo({ className = 'h-4 w-auto' }: { className?: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className="select-none font-serif text-base font-black tracking-tight text-gray-900">
        Remember
      </span>
    )
  }
  return (
    <img src="/brand/remember-logo.svg" alt="Remember" className={className} onError={() => setFailed(true)} />
  )
}
