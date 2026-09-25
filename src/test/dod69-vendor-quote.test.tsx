/** @vitest-environment jsdom */
// DoD 69 (Phase 4.7 · 설계서 v2.11 §19.5) — 협력사 견적서 불러오기: 업로드 → 확인 큐 → 발주 항목.
//   ① 제안: 행 = 견적서 항목(+ 항목 밖 대행료·절사) · 버킷 = 행사 추가 버킷 이름 > 섹션 > 항목 키워드, **원가 버킷만** · 부가세 =
//      부가세 줄/별도 표기면 별도(확실) · 포함 표기면 포함 제안(묻는다) · 표기 없으면 제안 없이 묻는다 · 총액 미포함·0원 행은 기본 제외
//   ② 저장은 확인 뒤: 가져오기는 제안만(항목 0) → 확정 때 고른 행마다 발주 항목(status 'ordered', 부가세 포함이면 round(v/1.1) +
//      원본 input_amount_raw, import_id·근거 표기) · 금액은 저장된 제안에서 · 원가 없는 버킷 422 · 중복·빈 행 422 · 두 번 확정 409 · 버리기
//   ③ 권한·범위: pm 전용 · 정산보드 없는 행사 409 · 엑셀만 · 활동 로그에 금액 키 0(§19.7)
//   ④ 화면: 정산보드 '견적서 불러오기' → 읽기 → 확인 큐(부가세 질문·버킷 제안·확인 필요·공급가 대조) → 확정 → 항목 수 · 이력 · 버리기
// 픽스처 초기화 단위 = 이 파일 — 시나리오 순서대로 이어진다(testUtils 주석).
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import {
  buildVendorQuote,
  isVendorQuoteFile,
  parseVendorQuoteWorkbook,
  suggestBucket,
  supplyCheck,
  vatOf,
  vendorQuoteSums,
} from '../lib/vendorQuote'
import { parseQuoteWorkbook } from '../modules/quote/import/parser'
import {
  syntheticVendorQuoteAV,
  syntheticVendorQuoteGifts,
  VENDOR_AV_EXPECTED,
} from '../modules/quote/import/__tests__/fixtures/syntheticVendorQuotes'
import { syntheticQuoteA, syntheticQuoteB } from '../modules/quote/import/__tests__/fixtures/syntheticQuotes'
import type { SettlementBucket } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  mockProvider().switchUser('usr-pm')
  vi.restoreAllMocks()
})

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const reason = (p: Promise<unknown>) => p.then(() => null, (e: { code: string; message: string }) => ({ code: e.code, message: e.message }))

async function buckets(): Promise<SettlementBucket[]> {
  return (await mockProvider().getSettlementBoard(PROJECT_ID))!.buckets.map((b) => b.bucket)
}

describe('DoD 69 · ① 제안 — 행·버킷·부가세', () => {
  it('음향·조명 협력사(A형·부가세 줄): 6행 · 섹션 키워드로 원가 버킷 · 할인 음수 행 포함 · 부가세 별도(확실) · 공급가 대조 일치', async () => {
    const doc = parseVendorQuoteWorkbook(await syntheticVendorQuoteAV(), 'av.xlsx')
    const { parsed, questions } = buildVendorQuote(doc, await buckets())
    expect(parsed.rows).toHaveLength(VENDOR_AV_EXPECTED.rows)
    for (const r of parsed.rows) {
      expect(r.bucket_code).toBe(VENDOR_AV_EXPECTED.buckets[r.section])
      expect(r.confidence).toBe('high')
    }
    expect(parsed.rows.find((r) => r.title === '패키지 할인')).toMatchObject({ amount: -1_000_000, include: true })
    expect(parsed.vat).toMatchObject({ suggested: false, certain: true })
    expect(questions).toEqual([])
    expect(supplyCheck(parsed)).toEqual({ expected: 20_000_000, actual: 20_000_000, ok: true })
    // 우리 견적서 임포트의 헤더 질문('고객명·일시 … 확인 큐에서 입력')은 협력사 견적에 싣지 않는다 — 여기 확인 큐는 부가세·버킷만 묻는다
    expect(doc.warnings.some((w) => w.startsWith('인식하지 못한 헤더 항목'))).toBe(true)
    expect(parsed.warnings.some((w) => w.includes('헤더'))).toBe(false)
  })

  it('A형(대행료·절사가 합계 줄): 항목 밖 대행료·절사를 행으로 더하고 확신 없음 · 공급가 = 총액 − 부가세', async () => {
    const doc = parseQuoteWorkbook(await syntheticQuoteA(), 'a.xlsx')
    const { parsed, questions } = buildVendorQuote(doc, await buckets())
    const fee = parsed.rows.find((r) => r.source === 'agency_fee')!
    const rounding = parsed.rows.find((r) => r.source === 'rounding')!
    expect(fee).toMatchObject({ amount: 22_500_000, confidence: 'low', spec: '25%' })
    expect(rounding).toMatchObject({ amount: -681_818, confidence: 'low' })
    expect(questions).toContain('bucket')
    expect(supplyCheck(parsed)).toEqual({ expected: 111_818_182, actual: 111_818_182, ok: true })
  })

  it('B형(기획료가 항목 섹션): 대행료 행을 따로 만들지 않는다(이중 계산 방지) · 총액 미포함 옵션은 기본 제외', async () => {
    const doc = parseQuoteWorkbook(await syntheticQuoteB(), 'b.xlsx')
    const { parsed } = buildVendorQuote(doc, await buckets())
    expect(parsed.rows.some((r) => r.source === 'agency_fee')).toBe(false)
    expect(parsed.rows.find((r) => r.section.includes('총액 미포함'))?.include).toBe(false)
    // 기획료 섹션의 행은 s5(원가 없음)로 제안하지 않는다
    expect(parsed.rows.find((r) => r.section.includes('기획료'))?.bucket_code).toBeNull()
  })

  it('버킷 제안: 원가 없는 버킷(s5·rc·ld)은 절대 제안하지 않고 · 행사 추가 버킷 이름이 들어 있으면 그 버킷', async () => {
    const all = await buckets()
    expect(suggestBucket('6. PCO 기획료', '기획료', all)).toEqual({ bucket_code: null, confidence: 'low' })
    expect(suggestBucket('등록', 'RSVP 운영', all).bucket_code).toBeNull()
    const custom: SettlementBucket = { ...all[0], id: 'bkt-gift', code: 'gift', label: '기념품', source: 'custom', has_cost: true }
    expect(suggestBucket('1. 기념품 제작', '텀블러', [...all, custom])).toEqual({ bucket_code: 'gift', confidence: 'high' })
    expect(suggestBucket('1. 기념품 제작', '텀블러', all)).toEqual({ bucket_code: null, confidence: 'low' })
  })

  it('부가세: 줄 있음·별도 = 별도(확실) · 포함 표기뿐 = 포함 제안(묻는다) · 표기 없음 = 제안 없음(반드시 고른다)', () => {
    expect(vatOf({ totals: { vat: 1 }, header: { vat_mode: 'included' } })).toMatchObject({ suggested: false, certain: true })
    expect(vatOf({ totals: {}, header: { vat_mode: 'excluded' } })).toMatchObject({ suggested: false, certain: true })
    expect(vatOf({ totals: {}, header: { vat_mode: 'included' } })).toMatchObject({ suggested: true, certain: false })
    expect(vatOf({ totals: {}, header: { vat_mode: 'unknown' } })).toMatchObject({ suggested: null, certain: false })
    expect(vendorQuoteSums([{ amount: 3_000_000 }, { amount: -1_000_000 }], true)).toEqual({ raw: 2_000_000, supply: 2_727_273 - 909_091 })
  })

  it('파일: 엑셀만 · 항목 표가 없으면 무엇을 확인할지 422', () => {
    expect(isVendorQuoteFile('견적.xlsx')).toBe(true)
    expect(isVendorQuoteFile('견적.pdf')).toBe(false)
    expect(() => parseVendorQuoteWorkbook(new TextEncoder().encode('x').buffer as ArrayBuffer, 'x.xlsx')).toThrow(/견적서/)
  })
})

describe('DoD 69 · ②③ provider — 확인 뒤에만 저장', () => {
  it('가져오기는 제안만(항목 0) · pm 전용 · 엑셀만 · 정산보드 없는 행사 409', async () => {
    const p = mockProvider()
    const before = (await p.getSettlementBoard(PROJECT_ID))!.buckets.reduce((n, b) => n + b.items.length, 0)
    const view = await p.importVendorQuote(PROJECT_ID, { file_name: '가상음향_견적.xlsx', data: await syntheticVendorQuoteAV(), vendor_id: 'ven-002' })
    expect(view).toMatchObject({ status: 'parsed', vendor_name: '한빛시스템', item_count: 0, questions: [] })
    expect((await p.getSettlementBoard(PROJECT_ID))!.buckets.reduce((n, b) => n + b.items.length, 0)).toBe(before)

    p.switchUser('usr-design')
    expect(await reason(p.importVendorQuote(PROJECT_ID, { file_name: 'x.xlsx', data: await syntheticVendorQuoteAV() }))).toEqual({
      code: 'forbidden',
      message: 'PM 전용 기능입니다.',
    })
    p.switchUser('usr-pm')
    expect(await reason(p.importVendorQuote(PROJECT_ID, { file_name: 'x.csv', data: new ArrayBuffer(1) }))).toMatchObject({ code: 'validation', message: expect.stringContaining('엑셀') })
    const noBoard = (await p.listProjects()).find((s) => s.id !== PROJECT_ID && s.status === 'active')!.id
    expect(await reason(p.importVendorQuote(noBoard, { file_name: 'x.xlsx', data: await syntheticVendorQuoteAV() }))).toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('정산보드를 먼저'),
    })
    expect(await p.listVendorQuoteImports(noBoard)).toEqual([])
  })

  it('확정: 고른 행마다 발주 항목(ordered · import_id · 근거) · 금액은 저장된 제안에서 · 이력 확정 · 로그에 금액 키 0', async () => {
    const p = mockProvider()
    const imp = (await p.listVendorQuoteImports(PROJECT_ID)).find((x) => x.status === 'parsed')!
    const all = await buckets()
    const id = (code: string) => all.find((b) => b.code === code)!.id
    const rows = imp.parsed.rows.map((r) => ({ index: r.index, bucket_id: id(r.bucket_code!), title: r.index === 0 ? '메인 스피커(L/R)' : undefined }))
    const items = await p.confirmVendorQuoteImport(imp.id, { vat_included: false, rows })
    expect(items).toHaveLength(6)
    expect(items[0]).toMatchObject({ title: '메인 스피커(L/R)', ordered_amount: 6_000_000, actual_amount: null, status: 'ordered', vendor_id: 'ven-002', import_id: imp.id, vat_included_input: false, input_amount_raw: null })
    expect(items[0].evidence).toContain('가상음향_견적.xlsx')
    expect(items.find((i) => i.title === '패키지 할인')?.ordered_amount).toBe(-1_000_000)
    const after = (await p.listVendorQuoteImports(PROJECT_ID)).find((x) => x.id === imp.id)!
    expect(after).toMatchObject({ status: 'confirmed', item_count: 6 })

    const log = (await p.listActivity(PROJECT_ID, 5)).find((a) => a.action === 'settlement.imported')!
    expect(log.meta).toEqual({ file_name: '가상음향_견적.xlsx', count: 6 })
    expect(await reason(p.confirmVendorQuoteImport(imp.id, { vat_included: false, rows }))).toMatchObject({ code: 'conflict' })
    expect(await reason(p.discardVendorQuoteImport(imp.id))).toMatchObject({ code: 'conflict' })
  })

  it('부가세 포함 확정: round(v/1.1) + 원본 보존 · 원가 없는 버킷 422 · 중복 행·빈 확정 422 · 버리기', async () => {
    const p = mockProvider()
    const imp = await p.importVendorQuote(PROJECT_ID, { file_name: '가상선물_견적.xlsx', data: await syntheticVendorQuoteGifts() })
    expect(imp.questions).toEqual(['vat', 'bucket'])
    expect(imp.parsed.vat.suggested).toBeNull()
    const all = await buckets()
    const s5 = all.find((b) => b.code === 's5')!.id
    const ot = all.find((b) => b.code === 'ot')!.id
    expect(await reason(p.confirmVendorQuoteImport(imp.id, { vat_included: true, rows: [{ index: 0, bucket_id: s5 }] }))).toEqual({
      code: 'validation',
      message: "'PCO 기획료'은 원가가 없는 항목이라 발주·실비를 넣을 수 없습니다.",
    })
    expect(await reason(p.confirmVendorQuoteImport(imp.id, { vat_included: true, rows: [{ index: 0, bucket_id: ot }, { index: 0, bucket_id: ot }] }))).toMatchObject({ code: 'validation' })
    expect(await reason(p.confirmVendorQuoteImport(imp.id, { vat_included: true, rows: [] }))).toMatchObject({ code: 'validation' })
    expect(await reason(p.confirmVendorQuoteImport(imp.id, { vat_included: true, rows: [{ index: 99, bucket_id: ot }] }))).toMatchObject({ code: 'validation', message: expect.stringContaining('100번') })
    const [item] = await p.confirmVendorQuoteImport(imp.id, { vat_included: true, rows: [{ index: 0, bucket_id: ot }] })
    expect(item).toMatchObject({ ordered_amount: 2_727_273, input_amount_raw: 3_000_000, vat_included_input: true })

    const other = await p.importVendorQuote(PROJECT_ID, { file_name: '버릴_견적.xlsx', data: await syntheticVendorQuoteGifts() })
    await p.discardVendorQuoteImport(other.id)
    expect((await p.listVendorQuoteImports(PROJECT_ID))[0]).toMatchObject({ id: other.id, status: 'discarded', item_count: 0 })
  })
})

describe('DoD 69 · ④ 화면 — 정산보드에서 불러오기', () => {
  // PR-7(디자인지시서 v1.4 §7-2.11): 불러오기 버튼은 정산보드 머리의 채운 버튼 — 아래 칸은 이력만
  async function openDialog() {
    renderRoute('/settlement')
    await screen.findByTestId('settlement-kpis')
    const btn = screen.getByRole('button', { name: '협력사 견적서 불러오기' })
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    await userEvent.click(btn)
    return screen.findByTestId('vendor-quote-dialog')
  }

  it('AV 견적: 읽기 → 부가세 별도 미리 선택 · 버킷 제안 채워짐 → 확정 → 항목 6개 · 이력 · 보드 반영', async () => {
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('견적서 파일'), new File([await syntheticVendorQuoteAV()], '가상음향_2차.xlsx', { type: XLSX }))
    await userEvent.click(within(dialog).getByRole('button', { name: '읽기' }))
    const table = await within(dialog).findByTestId('vendor-quote-rows')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect((within(dialog).getByLabelText('별도(항목 금액 그대로 저장)') as HTMLInputElement).checked).toBe(true)
    // 부가세 줄이 따로 있어 확실 — 묻지 않는다
    expect(within(dialog).queryByTestId('vendor-quote-vat-needs')).toBeNull()
    expect((within(dialog).getByLabelText('1번 버킷') as HTMLSelectElement).selectedOptions[0].textContent).toBe('시스템 구축')
    expect(within(dialog).getByTestId('vendor-quote-check').textContent).toContain('=')
    const go = within(dialog).getByRole('button', { name: '확정 — 발주 항목 6개 만들기' }) as HTMLButtonElement
    expect(go.disabled).toBe(false)
    await userEvent.click(go)
    expect(await within(dialog).findByRole('heading', { name: '발주 항목 6개를 만들었습니다' })).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    const list = await screen.findByRole('list', { name: '불러온 견적서' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0].textContent).toContain('확정 · 항목 6개'))
  })

  it('표기 없는 견적: 부가세·버킷을 고르기 전에는 확정 비활성 · 확인 필요 표시 · 한 번에 채우기', async () => {
    const dialog = await openDialog()
    await userEvent.upload(within(dialog).getByLabelText('견적서 파일'), new File([await syntheticVendorQuoteGifts()], '가상선물_2차.xlsx', { type: XLSX }))
    await userEvent.click(within(dialog).getByRole('button', { name: '읽기' }))
    await within(dialog).findByTestId('vendor-quote-rows')
    const go = () => within(dialog).getByRole('button', { name: /확정 — 발주 항목 3개 만들기/ }) as HTMLButtonElement
    expect(go().disabled).toBe(true)
    // 행 3개(버킷 없음) + 부가세 1개(표기 없음 — 추측하지 않고 묻는다)
    expect(within(within(dialog).getByTestId('vendor-quote-rows')).getAllByText('확인 필요').length).toBe(3)
    expect(within(dialog).getByTestId('vendor-quote-vat-needs').textContent).toBe('확인 필요')
    await userEvent.selectOptions(within(dialog).getByLabelText('버킷 한 번에 채우기'), within(dialog).getAllByRole('option', { name: '추가옵션' })[0])
    expect(go().disabled).toBe(true)
    await userEvent.click(within(dialog).getByLabelText('포함(저장 전에 부가세 분리 — ÷1.1)'))
    expect(go().disabled).toBe(false)
    expect(within(dialog).getByTestId('vendor-quote-sums').textContent).toContain('4,545,454원')
    await userEvent.click(go())
    expect(await within(dialog).findByRole('heading', { name: '발주 항목 3개를 만들었습니다' })).toBeTruthy()
  })

  it('확인 대기 건은 이력에서 다시 열어 버릴 수 있다 · 원가 없는 버킷은 선택지에 없다', async () => {
    await mockProvider().importVendorQuote(PROJECT_ID, { file_name: '대기_견적.xlsx', data: await syntheticVendorQuoteGifts() })
    renderRoute('/settlement')
    const section = await screen.findByTestId('vendor-quote-import')
    expect((await within(section).findByTestId('vendor-quote-pending')).textContent).toContain('1건')
    // 머리 아래 알림이 먼저 알린다 — 확인할 것(부가세·버킷)까지
    const alert = screen.getByTestId('alert-vendor-pending')
    expect(alert.textContent).toContain('협력사 견적서 1건 — 대기_견적.xlsx')
    expect(alert.textContent).toContain('확인할 것: 부가세 포함 여부 · 버킷')
    const row = within(section).getAllByRole('listitem').find((li) => li.textContent?.includes('대기_견적.xlsx'))!
    await userEvent.click(within(row).getByRole('button', { name: '확인하기' }))
    const dialog = await screen.findByTestId('vendor-quote-dialog')
    const options = within(within(dialog).getByLabelText('1번 버킷')).getAllByRole('option').map((o) => o.textContent)
    expect(options).not.toContain('PCO 기획료')
    expect(options).not.toContain('RSVP 운영비')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(within(dialog).getByRole('button', { name: '버리기' }))
    await waitFor(() => expect(screen.queryByTestId('vendor-quote-dialog')).toBeNull())
    await waitFor(() => expect(within(screen.getByTestId('vendor-quote-import')).getByRole('list', { name: '불러온 견적서' }).textContent).toContain('버림'))
  })

  it('pm이 아니면 불러오기 버튼은 비활성(이유 title)', async () => {
    mockProvider().switchUser('usr-design')
    renderRoute('/settlement')
    await screen.findByTestId('settlement-kpis')
    const btn = screen.getByRole('button', { name: '협력사 견적서 불러오기' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(true))
    expect(btn.title).toContain('PM 전용')
  })
})
