import { useState } from 'react'

// 리멤버 브랜드 로고 — 디자인지시서 v1 §7.
// 다크 컨텍스트(사이드바·다크 바)=offwhite, 라이트 컨텍스트·인쇄=black 자산을 쓴다.
// 높이 20~24px로만 스케일(비율 왜곡·재염색 금지). 텍스트 폴백은 이미지 로드 실패 시에만.
type Variant = 'black' | 'offwhite'

const SRC: Record<Variant, string> = {
  black: '/brand/remember-logo-black.png',
  offwhite: '/brand/remember-logo-offwhite.png',
}

export default function BrandLogo({
  variant = 'black',
  className = 'h-5 w-auto',
}: {
  variant?: Variant
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className={`select-none font-serif text-base font-black tracking-tight ${
          variant === 'offwhite' ? 'text-dark-ink' : 'text-ink'
        }`}
      >
        Remember
      </span>
    )
  }
  return (
    <img src={SRC[variant]} alt="Remember" className={className} onError={() => setFailed(true)} />
  )
}
