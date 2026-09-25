/** @vitest-environment jsdom */
// DoD 76 — 견적 목록 · 옵션 단계 (Phase 3.23 PR-6 · 디자인지시서 v1.4 §7-2.10 · 캔버스 견적 목록·견적 옵션).
// ① 목록: 머리 = 가져오기 + 새 견적(채운 버튼 1개) · 고른 견적에 대한 동작은 요약 패널 아래 · 묶음 제목/캡션 · 최신 버전 위 ·
//    고른 행 3px 줄 · 이모지 자물쇠 0 · 뒤 버전이 있으면 '새 버전으로 고치기' 비활성 + 이유 · 확정·미연결이면 행사 만들기
// ② 옵션 금액: 엔진을 옵션 집합만 바꿔 돌려 읽는다 — 고른 옵션 합 = 엔진 옵션 합계 · 옵션 없는 합계·PCO = 엔진 값
// ③ 옵션 화면: 체크박스·라디오 카드(.ui-check) · 막힌 옵션은 비활성 + 이유 한 줄 · 묶음 머리 건수·합계 ·
//    택1 + 선택 해제 · 부스 한 줄 · 옆 요약(고른 옵션 · 옵션으로 +n · PCO 안내) · 이모지 0 · 채운 버튼 1개
// ④ 에디터 머리: 단계 줄(aria-current=step) · 견적서 언어 토글
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { optionAmounts, pickedOptionAmounts } from '../components/quote/optionAmounts'
import { fmtMoney } from '../components/quote/quoteFormState'
import { FINAL_QUOTE_ID, UNLINKED_QUOTE_ID } from '../fixtures/quoteFixtures'
import { subjectParticle } from '../lib/labels'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import type { QuoteInput } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

const provider = mockProvider()

afterEach(() => {
  cleanup()
  provider.setAppRole('sales')
  try {
    localStorage.removeItem('communicator.quoteLang')
  } catch {
    // 저장 불가 환경 무시
  }
})

const EMOJI = /\p{Extended_Pictographic}/u

async function openList() {
  renderRoute('/quotes')
  await screen.findByRole('heading', { name: '견적', level: 1 })
  return screen.findByTestId('quote-summary')
}

describe('DoD 76 ① 견적 목록', () => {
  it('머리 = 견적서 가져오기(ghost) + ＋ 새 견적(채운 버튼 1개) — 고른 견적에 대한 동작은 요약 패널 아래에만', async () => {
    const summary = await openList()
    const filled = [...document.querySelectorAll('main .btn-accent, main .btn-primary')]
    expect(filled.map((b) => b.textContent)).toEqual(['＋ 새 견적'])
    expect(screen.getByRole('button', { name: '견적서 가져오기' }).className).toContain('btn-ghost')
    for (const name of ['Excel 내려받기', '구글 시트로 만들기', '새 버전으로 고치기']) {
      const buttons = screen.getAllByRole('button', { name })
      expect(buttons).toHaveLength(1)
      expect(summary.contains(buttons[0])).toBe(true)
    }
  })

  it('묶음 = 행사명 제목 + "행사 연결 · 버전 n개" + 행사로 이동 / "행사 없이 견적만" + 안내 캡션(이동 없음) · 최신 버전 위', async () => {
    await openList()
    const linked = screen.getByRole('region', { name: '샘플 테크 컨퍼런스 2026' })
    expect(within(linked).getByText('행사 연결 · 버전 3개')).toBeTruthy()
    expect(within(linked).getByRole('button', { name: '행사로 이동 →' })).toBeTruthy()
    const versions = within(linked)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelector('td')?.textContent?.match(/v\d+/)?.[0])
    expect(versions).toEqual(['v3', 'v2', 'v1'])

    const unlinked = screen.getByRole('region', { name: '행사 없이 견적만' })
    expect(within(unlinked).getByText('확정하면 이 견적으로 행사를 만들 수 있습니다')).toBeTruthy()
    expect(within(unlinked).queryByRole('button', { name: '행사로 이동 →' })).toBeNull()
  })

  it('기본 선택 = 확정본 — 고른 행 3px accent 줄 · 자물쇠는 선 아이콘(확정본만) · 이모지 0', async () => {
    await openList()
    const row = screen.getByTestId(`quote-row-${FINAL_QUOTE_ID}`)
    expect(row.dataset.selected).toBe('true')
    expect((row.querySelector('td') as HTMLElement).style.boxShadow).toContain('var(--accent)')
    expect(within(row).getByRole('img', { name: '확정본 · 잠김' })).toBeTruthy()
    expect(screen.getAllByRole('img', { name: '확정본 · 잠김' }).length).toBeGreaterThanOrEqual(1)
    const v2 = screen.getByTestId('quote-row-quo-002')
    expect(within(v2).queryByRole('img', { name: '확정본 · 잠김' })).toBeNull()
    expect(EMOJI.test(document.querySelector('main')?.textContent ?? '')).toBe(false)
  })

  it('버전 버튼(키보드)으로 고른다 — 요약이 그 버전으로 바뀌고, 뒤 버전이 있으면 고치기가 막히고 이유가 뜬다', async () => {
    const summary = await openList()
    expect(within(summary).getByRole('heading', { name: '샘플 테크 컨퍼런스 2026 · v3' })).toBeTruthy()
    expect(within(summary).getByTestId('quote-edit-note').textContent).toBe(
      '확정본은 잠겨 있어요. 고치면 v4가 새로 생깁니다.',
    )
    expect((within(summary).getByRole('button', { name: '새 버전으로 고치기' }) as HTMLButtonElement).disabled).toBe(false)

    const v2Button = within(screen.getByTestId('quote-row-quo-002')).getByRole('button', { name: 'v2' })
    v2Button.focus()
    await userEvent.keyboard('{Enter}')
    expect(v2Button.getAttribute('aria-pressed')).toBe('true')
    expect(within(summary).getByRole('heading', { name: '샘플 테크 컨퍼런스 2026 · v2' })).toBeTruthy()
    expect((within(summary).getByRole('button', { name: '새 버전으로 고치기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(summary).getByTestId('quote-edit-note').textContent).toBe(
      'v3이 이미 있어 이 버전은 고칠 수 없습니다 — 최신 버전에서 고치세요.',
    )
  })

  it('요약 8행(번호 없이) · 8행 합 = 합계(VAT 별도) · 부가세 · VAT 포함', async () => {
    const summary = await openList()
    const q = await provider.getQuote(FINAL_QUOTE_ID)
    const labels = [...summary.querySelectorAll('dl')[0].querySelectorAll('dt')].map((d) => d.textContent)
    expect(labels).toEqual([
      '베뉴 사용료',
      '시스템 구축',
      '디자인·브랜딩',
      '운영·등록·보험',
      'PCO 기획료',
      '추가옵션',
      '모객 솔루션',
      '일반 참관객 관리',
    ])
    const b = q.breakdown
    expect(b.s1 + b.s2 + b.s3 + b.s4 + b.s5 + b.options + b.recruit + b.attendee).toBe(b.subtotal)
    expect(summary.textContent).toContain(`${b.subtotal.toLocaleString('ko-KR')}원`)
    expect(summary.textContent).toContain(`부가세 10%${b.vat.toLocaleString('ko-KR')}원`)
  })

  it('미연결 초안 → "고쳐서 저장하면 v2가…" / 확정되면 요약에 행사 만들기(ghost) → 에디터 ⑤', async () => {
    const summary = await openList()
    await userEvent.click(within(screen.getByTestId(`quote-row-${UNLINKED_QUOTE_ID}`)).getByRole('button', { name: 'v1' }))
    expect(within(summary).getByTestId('quote-edit-note').textContent).toBe('고쳐서 저장하면 v2가 새로 생깁니다.')
    expect(within(summary).queryByRole('button', { name: /이 견적으로 행사 만들기/ })).toBeNull()
    cleanup()

    await provider.finalizeQuote(UNLINKED_QUOTE_ID)
    const again = await openList()
    await userEvent.click(within(screen.getByTestId(`quote-row-${UNLINKED_QUOTE_ID}`)).getByRole('button', { name: 'v1' }))
    const create = within(again).getByRole('button', { name: '이 견적으로 행사 만들기 →' })
    expect(create.className).toContain('btn-ghost')
    await userEvent.click(create)
    const steps = await screen.findByRole('navigation', { name: '견적 단계' })
    expect(within(steps).getByRole('button', { current: 'step' }).textContent).toContain('행사 만들기')
  })
})

/** 옵션 금액 검산용 입력 — 픽스처 확정본(v3)의 입력에서 옵션·부스·조정만 바꾼다 */
async function baseInput(): Promise<QuoteInput> {
  const q = await provider.getQuote(FINAL_QUOTE_ID)
  return { ...structuredClone(q.input), adjustments: [], booth_count: 0, booth_premium_count: 0 }
}

describe('DoD 76 ② 옵션 금액 — 엔진에서 읽는다(단가 중복 정의 없음)', () => {
  it('고른 옵션 합 + 부스 = 엔진 옵션 합계 · 온라인중계는 화면중계 다음 증분(+150만)으로 잡힌다', async () => {
    const base = await baseInput()
    const combos: Partial<QuoteInput>[] = [
      { options: { emcee: true, survey: true } },
      { display_type: 'led', options: { screenRelay: true, onlineRelay: true, fullRecording: true } },
      { options: { souvenir: true, photo: true, photowall_premium: true }, souvenir_qty: 120, souvenir_price: 30_000 },
      { options: { emcee: true }, booth_count: 3, booth_premium_count: 2, booth_unit_price: 800_000 },
    ]
    for (const c of combos) {
      const input = { ...base, ...c } as QuoteInput
      const out = computeQuoteOutputs(input)
      const a = optionAmounts(input, out)
      const sum = a.picked.reduce((s, p) => s + p.amount, 0) + a.boothStd + a.boothPremium
      expect(sum).toBe(out.result.ot)
    }
    const relay = pickedOptionAmounts({ ...base, display_type: 'led', options: { screenRelay: true, onlineRelay: true } })
    expect(relay).toEqual([
      { id: 'screenRelay', amount: 2_000_000 },
      { id: 'onlineRelay', amount: 1_500_000 },
    ])
  })

  it('옵션 없는 합계·PCO = 옵션을 비운 엔진 결과 — 옵션으로 +n = 옵션 합계 + PCO 증가분', async () => {
    const base = await baseInput()
    const input: QuoteInput = { ...base, options: { emcee: true, video: true }, booth_count: 2 }
    const out = computeQuoteOutputs(input)
    const bare = computeQuoteOutputs({ ...input, options: {}, booth_count: 0, booth_premium_count: 0 })
    const a = optionAmounts(input, out)
    expect(a.pkWithoutOptions).toBe(bare.total_amount)
    expect(a.pcoWithoutOptions).toBe(bare.result.s5)
    expect(out.total_amount - a.pkWithoutOptions).toBe(out.result.ot + (out.result.s5 - bare.result.s5))
  })

  it('표기 헬퍼 — 만원 반올림이 0이 되는 금액은 원 단위 · 숫자 뒤 주격 조사', () => {
    expect(fmtMoney(0, false)).toBe('0원')
    expect(fmtMoney(3_000, false)).toBe('3,000원')
    expect(fmtMoney(25_000_000, false)).toBe('2,500만원')
    expect(fmtMoney(0, true)).toBe('KRW 0')
    expect([1, 2, 3, 4, 10].map((n) => `v${n}${subjectParticle(n)}`)).toEqual(['v1이', 'v2가', 'v3이', 'v4가', 'v10이'])
  })
})

async function openOptions() {
  renderRoute('/quotes/new?step=3')
  return screen.findByTestId('opt-souvenir')
}

const card = (id: string) => screen.getByTestId(`opt-${id}`)
const inputOf = (id: string) => card(id).querySelector('input') as HTMLInputElement

describe('DoD 76 ③ 옵션 화면', () => {
  it('카드 = 체크박스(여럿)·라디오(하나만) · 전부 .ui-check · 이모지 0 · 채운 버튼은 다음 단계 1개', async () => {
    await openOptions()
    for (const id of ['souvenir', 'emcee', 'survey', 'ledOperating']) {
      expect(inputOf(id).type).toBe('checkbox')
      expect(inputOf(id).className).toContain('ui-check')
    }
    for (const id of ['photo', 'video', 'aving']) expect(inputOf(id).name).toBe('quote-media')
    for (const id of ['photowall_basic', 'photowall_premium']) expect(inputOf(id).name).toBe('quote-photowall')
    expect(EMOJI.test(document.querySelector('main')?.textContent ?? '')).toBe(false)
    const filled = [...document.querySelectorAll('main .btn-accent, main .btn-primary')]
    expect(filled.map((b) => b.textContent)).toEqual(['다음: 확인·확정'])
  })

  it('막힌 옵션은 숨기지 않고 비활성 + 이유 한 줄(aria-describedby) — 빔프로젝터면 중계 2종, 중계가 없으면 전체 녹화', async () => {
    await openOptions()
    for (const [id, reason] of [
      ['screenRelay', 'LED 화면일 때만 — 2단계(베뉴)에서 LED로 바꾸세요'],
      ['onlineRelay', 'LED 화면일 때만 — 2단계(베뉴)에서 LED로 바꾸세요'],
      ['fullRecording', '화면중계나 온라인중계를 먼저 고르세요'],
    ] as const) {
      expect(inputOf(id).disabled).toBe(true)
      const line = within(card(id)).getByTestId('opt-reason')
      expect(line.textContent).toBe(reason)
      expect(inputOf(id).getAttribute('aria-describedby')).toBe(line.id)
    }
    expect(inputOf('emcee').disabled).toBe(false)
    expect(within(card('emcee')).queryByTestId('opt-reason')).toBeNull()
  })

  it('고르면 묶음 머리·옆 요약이 함께 — n개 고름 · 합계 / 고른 옵션 / 옵션으로 +n / PCO 안내', async () => {
    await openOptions()
    expect(screen.getByTestId('opt-solo-summary').textContent).toBe('고른 것 없음')
    expect(screen.queryByTestId('editor-picked-options')).toBeNull()
    expect(screen.queryByTestId('editor-pco-note')).toBeNull()

    await userEvent.click(inputOf('emcee'))
    await userEvent.click(inputOf('survey'))
    expect(inputOf('emcee').checked).toBe(true)
    expect(card('emcee').dataset.checked).toBe('true')
    expect(screen.getByTestId('opt-solo-summary').textContent).toBe('2개 고름 · 250만원')
    const picked = screen.getByTestId('editor-picked-options')
    expect(within(picked).getByText('사회자')).toBeTruthy()
    expect(within(picked).getByText('사후설문조사')).toBeTruthy()
    expect(screen.getByTestId('editor-options-delta').textContent).toMatch(/^옵션으로 \+[\d,]+만원$/)
    expect(screen.getByTestId('editor-pco-note').textContent).toMatch(
      /^PCO 기획료는 운영비의 25%라, 옵션을 고르면 함께 오릅니다 \([\d,]+만원 → [\d,]+만원\)\.$/,
    )
  })

  it('미디어 = 하나만 — 다른 걸 고르면 앞의 것이 풀리고, 선택 해제로 비운다', async () => {
    await openOptions()
    const media = screen.getByRole('region', { name: '미디어 패키지' })
    expect(within(media).getByText(/고르지 않음/)).toBeTruthy()
    expect(within(media).queryByRole('button', { name: '선택 해제' })).toBeNull()
    await userEvent.click(inputOf('photo'))
    await userEvent.click(inputOf('video'))
    expect(inputOf('photo').checked).toBe(false)
    expect(inputOf('video').checked).toBe(true)
    await userEvent.click(within(media).getByRole('button', { name: '선택 해제' }))
    expect(['photo', 'video', 'aving'].some((id) => inputOf(id).checked)).toBe(false)
  })

  it('부스 = 한 줄(− 수량 + · × 단가 · 소계) — 늘리면 소계가 엔진 금액으로, 0이면 줄이기 막힘·"0원"', async () => {
    await openOptions()
    const row = screen.getByTestId('booth-boothCount')
    const dec = within(row).getByRole('button', { name: '부스 설치 (일반형) 줄이기' }) as HTMLButtonElement
    expect(dec.disabled).toBe(true)
    expect(within(row).getByTestId('booth-amount').textContent).toBe('0원')
    await userEvent.click(within(row).getByRole('button', { name: '부스 설치 (일반형) 늘리기' }))
    await userEvent.click(within(row).getByRole('button', { name: '부스 설치 (일반형) 늘리기' }))
    expect((within(row).getByLabelText('부스 설치 (일반형) 수') as HTMLInputElement).value).toBe('2')
    expect(within(row).getByTestId('booth-amount').textContent).toBe('200만원')
    expect((within(row).getByLabelText('부스 설치 (일반형) 부스당 단가') as HTMLInputElement).placeholder).toBe('1,000,000')
    expect(within(screen.getByTestId('editor-picked-options')).getByText('부스 설치 (일반형) × 2')).toBeTruthy()
  })

  it('LED 화면이면 LED 오퍼레이팅이 잠기고(이유), 온라인중계를 고르면 화면중계가 함께 잠기며 알림이 뜬다', async () => {
    renderRoute('/quotes/new?step=2')
    await userEvent.click(await screen.findByRole('button', { name: /^LED/ }))
    await userEvent.click(within(screen.getByRole('navigation', { name: '견적 단계' })).getByRole('button', { name: /옵션/ }))
    await screen.findByTestId('opt-souvenir')
    expect(inputOf('ledOperating').checked).toBe(true)
    expect(inputOf('ledOperating').disabled).toBe(true)
    expect(within(card('ledOperating')).getByTestId('opt-reason').textContent).toBe(
      'LED 화면이라 함께 들어갑니다 — 빼려면 2단계에서 빔프로젝터로',
    )
    expect(inputOf('onlineRelay').disabled).toBe(false)
    await userEvent.click(inputOf('onlineRelay'))
    expect(inputOf('screenRelay').checked).toBe(true)
    expect(inputOf('screenRelay').disabled).toBe(true)
    expect(within(card('screenRelay')).getByTestId('opt-reason').textContent).toBe('온라인중계가 이 위에 얹혀 있어 뺄 수 없어요')
    expect((await screen.findByRole('status')).textContent).toContain('화면중계가 함께 적용됩니다')
    // 중계가 생겼으니 전체 녹화·편집이 풀린다
    expect(inputOf('fullRecording').disabled).toBe(false)
  })
})

describe('DoD 76 ④ 에디터 머리', () => {
  it('단계 줄 = 번호 + 이름, 지금 단계 aria-current=step · 누르면 옮긴다', async () => {
    await openOptions()
    const steps = screen.getByRole('navigation', { name: '견적 단계' })
    const buttons = within(steps).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['1규모·유형', '2베뉴', '3옵션', '4확인·확정', '5행사 만들기'])
    expect(buttons[2].getAttribute('aria-current')).toBe('step')
    await userEvent.click(buttons[1])
    await waitFor(() => expect(within(steps).getAllByRole('button')[1].getAttribute('aria-current')).toBe('step'))
  })

  it('머리 = 준비 · 견적 / 새 견적 + 견적서 언어 토글(한국어 · English) — 영어로 바꾸면 단계·요약이 영어', async () => {
    await openOptions()
    expect(screen.getByRole('heading', { name: '새 견적', level: 1 })).toBeTruthy()
    const lang = screen.getByRole('group', { name: '견적서 언어' })
    expect(within(lang).getByRole('button', { name: '한국어' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(lang).getByRole('button', { name: 'English' }))
    const steps = await screen.findByRole('navigation', { name: 'Quote steps' })
    expect(within(steps).getAllByRole('button')[2].textContent).toBe('3Options')
    expect(screen.getByRole('heading', { name: 'New Quote', level: 1 })).toBeTruthy()
    expect(within(screen.getByTestId('quote-editor-summary')).getByText('Total · VAT excl.')).toBeTruthy()
  })
})
