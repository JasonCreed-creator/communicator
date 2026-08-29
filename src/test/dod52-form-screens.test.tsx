/** @vitest-environment jsdom */
// DoD 52 (v2.6 §10 / Phase 3.19) — 폼 정본이 실제 화면에서 성립하는지.
//
// dod50이 소스·프리미티브를 지킨다면 여기는 **렌더 결과**를 지킨다. 두 화면을 대표로 잡는다:
//   A. 판매 플래너 ① — 등급 카드가 3~5장 반복돼 결함이 그만큼 곱해지던 자리(폼 정본 폴리싱 A)
//   B. 온보딩 ③ — 행사 성격을 정하는 첫 화면이라 여기서 본 규격이 나머지의 기준이 되는 자리(같은 문서 B)
//
// §10 버튼 위계의 핵심: **화면당 주 버튼 1개**. 카드마다 주 버튼을 두면 위저드 '다음'과 경합해
// 사용자가 무엇이 전진인지 못 읽는다 — 그래서 카드 저장은 ghost로 내리고 전진만 primary로 남긴다.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

/** S-11 파트너 보드 → 판매 플래너 ① 상품 정의까지 연다 */
async function openPlanner() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID_HOST)
  renderRoute('/partners')
  fireEvent.click(await screen.findByRole('button', { name: '판매 플래너' }))
  await screen.findByRole('heading', { name: /① 상품 정의/ })
}

/** S0 위저드 ③단계까지 이동한다(①·②는 '다음'만 누르면 통과) */
async function openFormatStep() {
  localStorage.setItem('communicator.currentProjectId', 'prj-forum-h2')
  renderRoute('/onboarding')
  await screen.findByRole('heading', { name: '① 행사개요' })
  fireEvent.click(await screen.findByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { name: '② 담당자' })
  fireEvent.click(await screen.findByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { name: '③ 유형·확인' })
}

describe('DoD 52-A 판매 플래너 ① — 버튼 위계·금액·체크 (§10)', () => {
  it('카드 저장은 ghost sm · 라벨은 "저장" — 카드 제목을 버튼이 다시 읽지 않는다', async () => {
    await openPlanner()
    const saves = screen.getAllByRole('button', { name: /저장$/ })
    expect(saves.length).toBeGreaterThanOrEqual(3) // 등급 카드 수만큼

    for (const btn of saves) {
      expect(btn.className).toContain('btn-ghost')
      expect(btn.className).toContain('btn-sm')
      expect(btn.className).not.toContain('btn-primary')
      expect(btn.className).not.toContain('btn-accent')
      // 화면에 보이는 라벨은 '저장' 한 단어 — 등급명은 aria-label에만 남는다
      expect(btn.textContent?.trim()).toBe('저장')
    }
  })

  it('화면의 주 버튼은 전진 하나뿐이다 — 카드 저장 4개와 경합하지 않는다', async () => {
    await openPlanner()
    const primaries = screen
      .getAllByRole('button')
      .filter((b) => /\bbtn-primary\b|\bbtn-accent\b/.test(b.className))
    expect(primaries.map((b) => b.textContent?.trim())).toEqual(['다음'])
  })

  it('변경 전에는 저장이 비활성이고, 저장하면 버튼 옆에 "저장됨 HH:mm" 캡션이 뜬다', async () => {
    await openPlanner()
    const save = screen.getAllByRole('button', { name: /저장$/ })[0]
    expect((save as HTMLButtonElement).disabled).toBe(true)

    // 아무 숫자 필드나 건드리면 dirty가 된다
    const capacity = screen.getAllByLabelText('정원')[0]
    fireEvent.change(capacity, { target: { value: '5' } })
    expect((save as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(save)
    // 성공 배지·토스트가 아니라 캡션 한 줄이다
    expect(await screen.findByText(/^저장됨 \d{2}:\d{2}$/)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('판매 단가는 천단위 표시 + 한글 에코 — 자릿수 오타를 눈으로 잡는다', async () => {
    await openPlanner()
    const tiers = await mockProvider().listPartnerTiers(PROJECT_ID_HOST)
    const priced = tiers.find((t) => t.price != null)!
    const input = screen.getAllByLabelText('판매 단가 (내부)')[0] as HTMLInputElement

    expect(input.className).toContain('ui-input-num')
    expect(input.value).toContain(',') // 천단위 구분
    expect(input.value).toBe(priced.price!.toLocaleString('ko-KR'))
    // 에코 줄이 같은 카드 안에 있다
    expect(screen.getAllByText(/억|만원|원$/).length).toBeGreaterThan(0)
  })

  it('숫자 필드는 우측정렬 규격을 달고, 체크박스는 숫자 그리드 밖 라벨 행에 있다', async () => {
    await openPlanner()
    for (const label of ['정원', '발표 세션 수', '상주 인력 상한']) {
      expect((screen.getAllByLabelText(label)[0] as HTMLInputElement).className).toContain(
        'ui-input-num',
      )
    }
    const booth = screen.getAllByLabelText(/부스 포함$/)[0]
    expect(booth.className).toContain('ui-check')
    // 라벨 행 전체가 클릭 영역 — 컨트롤만 누르게 두지 않는다
    expect(booth.closest('label')?.className).toContain('ui-check-row')
  })
})

describe('DoD 52-B 온보딩 ③ — 선택 카드·셀렉트 (§10-B·§10-A)', () => {
  it("선택 표시는 보더·틴트 두 겹까지 — '선택' 필이 0건이다", async () => {
    await openFormatStep()
    expect(screen.queryByText('선택', { exact: true })).toBeNull()

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    const selected = radios.find((r) => (r as HTMLInputElement).checked)!
    const card = selected.closest('label')!
    expect(card.className).toContain('border-accent')
    expect(card.className).toContain('bg-accent-tint')
  })

  it('우측 배지 자리는 정보 배지 전용 — 가정 표기는 그대로 남는다', async () => {
    await openFormatStep()
    expect(screen.getAllByText('가정')).toHaveLength(2) // DMS · 전시회
  })

  it('라디오·체크는 .ui-check를 달고 라벨 행 전체가 클릭 영역이다', async () => {
    await openFormatStep()
    for (const r of screen.getAllByRole('radio')) {
      expect(r.className).toContain('ui-check')
      expect(r.closest('label')?.className).toContain('ui-check-row')
    }
    const psa = screen.getByRole('checkbox', { name: /비즈매칭|PSA/ })
    expect(psa.className).toContain('ui-check')
  })

  it('셀렉트는 .ui-select 셰브론을 쓰고 힌트 한 줄로 카드와의 관계를 말한다', async () => {
    await openFormatStep()
    const kind = screen.getByLabelText('행사 성격')
    const eventType = screen.getByLabelText('모객 유형')
    expect(kind.className).toContain('ui-select')
    expect(eventType.className).toContain('ui-select')
    expect(screen.getByText('카드가 시드한 값')).toBeTruthy()
    expect(screen.getByText('바꿔도 카드 선택은 유지')).toBeTruthy()
  })

  it('세부 토글은 여전히 독립 수정된다 — 표시 정리가 §25.1 계약을 깨지 않았다', async () => {
    await openFormatStep()
    const before = (screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).checked) as
      | HTMLInputElement
      | undefined)!.value

    fireEvent.change(screen.getByLabelText('행사 성격'), { target: { value: 'host' } })
    await waitFor(async () => {
      const p = await mockProvider().getProject('prj-forum-h2')
      expect(p.kind).toBe('host')
    })
    // 카드 선택은 유지된다
    const after = (screen.getAllByRole('radio').find((r) => (r as HTMLInputElement).checked) as
      | HTMLInputElement
      | undefined)!.value
    expect(after).toBe(before)
  })
})

describe('DoD 52-C 외부 지면 — 터치 규정은 폼에도 걸린다 (§10-B)', () => {
  it('/c·/p·현장 체크인의 체크·라디오는 20px + 44 행이다', async () => {
    // 외부 지면 소스에 체크·라디오가 있다면 반드시 -lg / -touch를 단다.
    const EXTERNAL = {
      ...import.meta.glob('../components/partner-portal/**/*.tsx', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
      ...import.meta.glob('../components/client/**/*.tsx', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
      ...import.meta.glob('../pages/Client*.tsx', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
      ...import.meta.glob('../pages/PartnerPortalPage.tsx', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
      ...import.meta.glob('../pages/OnsiteCheckinPage.tsx', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
    } as Record<string, string>

    expect(Object.keys(EXTERNAL).length).toBeGreaterThan(3)

    const offenders: string[] = []
    for (const [file, src] of Object.entries(EXTERNAL)) {
      const hasCheck = /type=["'](checkbox|radio)["']/.test(src)
      if (!hasCheck) continue
      if (!/ui-check-lg/.test(src)) offenders.push(`${file}: ui-check-lg 없음`)
      if (!/ui-check-row-touch/.test(src)) offenders.push(`${file}: ui-check-row-touch 없음`)
    }
    expect(offenders).toEqual([])
  })

  it('밀집 모드는 외부 지면에 없다 (dod40 회귀 방지 — 폼 정본이 이 계약을 건드리지 않았다)', async () => {
    renderRoute('/c/demo')
    await waitFor(() => expect(screen.queryByRole('button', { name: /밀집/ })).toBeNull())
  })
})
