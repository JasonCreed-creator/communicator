import { Link } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'

// S-00 제품 런처 — 도메인 루트(`/`). 같은 도메인 아래 두 제품(견적 컨피규레이터 · MICE 커뮤니케이터)을
// 고르는 첫 화면이다(2026-09-04 사용자 지시 "같은 도메인에서 선택하여 각각 진입").
//
// 설계 원칙:
//  · 자동 리다이렉트 없음 — 딥링크(/quotes·/home·/schedule…)는 그대로 살고, 루트만 선택 화면이다.
//  · 사이드바 밖(InternalLayout 미적용) — 어느 제품에도 속하지 않는 중립 지면이라 레이아웃 셸을 쓰지 않는다.
//  · 카드 전체가 링크 — "선택 = 진입". accent 버튼을 두 개 두지 않는다(§5 화면당 CTA 1개 원칙).
//  · 견적은 app_role admin·sales 게이트(QuoteGate)가 `/quotes` 안에서 수행 — 여기서는 숨기지 않고
//    권한 범위만 캡션으로 밝힌다(§10 진입점 원칙: 게이트 뒤 숨김 금지).
//  · 회사명·도메인 하드코딩 없음(#RULE-NO-COMPANY) — 브랜드는 BrandLogo 자산만.

interface ProductCard {
  to: string
  code: string
  name: string
  summary: string
  features: string[]
  audience: string
  icon: string
}

export const LAUNCHER_PRODUCTS: ProductCard[] = [
  {
    to: '/quotes',
    code: 'S-2 · 견적',
    name: '견적 컨피규레이터',
    summary: '행사 규모·베뉴·옵션을 고르면 견적과 Excel 견적서가 바로 나옵니다. 확정 견적으로 행사를 만들 수 있습니다.',
    features: ['5스텝 견적 에디터', '베뉴 DB · 옵션 12종', 'Excel 내려받기 · 견적서 가져오기'],
    audience: '영업·관리자',
    icon: 'M9 7h6M9 11h6M9 15h3M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z',
  },
  {
    to: '/home',
    code: 'S1 · 홈',
    name: 'MICE 커뮤니케이터',
    summary: '행사 준비부터 현장·정산까지 — 산출물 컨펌, 일정·WBS, 등록, 운영계획서를 한 곳에서 관리합니다.',
    features: ['디자인·운영 보드 · 발주처 컨펌', '일정·WBS · 등록·현장 체크인', '운영계획서 · 정산보드'],
    audience: '행사 멤버 전원',
    icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  },
]

function ProductIcon({ d }: { d: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-accent-tint text-accent-deep">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </span>
  )
}

function ProductLink({ product }: { product: ProductCard }) {
  return (
    <Link
      to={product.to}
      aria-label={`${product.name} 들어가기`}
      className="ui-card group flex flex-col gap-4 p-6 transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <ProductIcon d={product.icon} />
        <span className="t-caption rounded-full bg-track px-2.5 py-1 font-mono">{product.code}</span>
      </div>
      <div>
        <h2 className="t-section-title">{product.name}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-sub">{product.summary}</p>
      </div>
      <ul className="space-y-1.5 text-sm text-ink">
        {product.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="t-caption">사용 대상 · {product.audience}</span>
        <span className="text-sm font-semibold text-accent-deep group-hover:underline">들어가기 →</span>
      </div>
    </Link>
  )
}

export default function LauncherPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto flex min-h-screen w-full max-w-[880px] flex-col px-6 py-10 md:py-16">
        <header className="mb-10">
          <BrandLogo variant="black" className="h-6 w-auto" />
          <p className="t-caption mt-8">MICE 플랫폼</p>
          <h1 className="t-page-title mt-1">어떤 도구로 시작할까요?</h1>
          <p className="mt-2 text-sm text-ink-sub">
            견적과 행사 운영은 같은 플랫폼 안에서 이어집니다 — 확정 견적으로 행사를 만들면 커뮤니케이터로 넘어갑니다.
          </p>
        </header>

        <section aria-label="제품 선택" className="grid gap-4 md:grid-cols-2">
          {LAUNCHER_PRODUCTS.map((p) => (
            <ProductLink key={p.to} product={p} />
          ))}
        </section>

        <footer className="mt-10 space-y-1 text-xs text-ink-cap">
          <p>발주처·파트너는 전달받은 링크(/c·/p)로 로그인 없이 접속합니다 — 이 화면을 거치지 않습니다.</p>
          <p>이전 견적 도구 주소(/quote·/configurator)는 견적 컨피규레이터로 자동 이동합니다.</p>
        </footer>
      </main>
    </div>
  )
}
