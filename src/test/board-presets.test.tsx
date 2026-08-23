/** @vitest-environment jsdom */
// 보드 항목 프리셋 — 운영 보드에 제작물(디자인) 어휘가 뜨지 않는다는 계약.
//
// 결함: 두 보드가 같은 폼을 썼다. 카테고리는 자유 텍스트에 디자인 예시("예: 배너"·"예: 현수막")만
// 달려 있었고, 스펙 4필드도 제작물 전용 라벨(규격·수량·위치·종류)이라 운영 보드에서 말이 맞지 않았다.
//
// 스키마(spec_size|qty|location|type 4열)는 그대로 두고 라벨·프리셋만 영역별로 갈아 끼웠으므로,
// 검사는 "영역마다 다른 어휘가 뜨는가"와 "자유 입력을 막지 않았는가" 두 가지다.
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'
import { areaPreset, categoryPreset } from '../lib/boardPresets'
import { DELIVERABLE_AREAS } from '../types/enums'

afterEach(cleanup)

/** '가이드 발행' 카드의 폼 루트 */
async function briefForm() {
  const heading = await screen.findByRole('heading', { name: '가이드 발행' })
  return heading.closest('div')!.parentElement!
}

describe('보드 프리셋 (a) 데이터 정합', () => {
  it('모든 영역이 프리셋을 갖는다', () => {
    for (const area of DELIVERABLE_AREAS) {
      const preset = areaPreset(area)
      expect(preset.categories.length, `${area} 카테고리 없음`).toBeGreaterThan(0)
      expect(Object.keys(preset.specLabels)).toEqual(['size', 'qty', 'location', 'type'])
    }
  })

  it('운영 프리셋에 제작물 카테고리가 섞이지 않는다', () => {
    const ops = areaPreset('ops').categories.map((c) => c.name)
    for (const designOnly of ['키비주얼', '배너', '현수막', '백월', '리플렛', '초청장', '명찰']) {
      expect(ops, `운영 보드에 ${designOnly}가 있으면 안 된다`).not.toContain(designOnly)
    }
    // 실제 운영 항목은 들어 있다
    for (const opsItem of ['큐시트', '시나리오', '존운영', '운영안', '안내문']) {
      expect(ops).toContain(opsItem)
    }
  })

  it('영역마다 스펙 라벨이 다르다 — 제작물 어휘를 운영에 쓰지 않는다', () => {
    const design = areaPreset('design').specLabels
    const ops = areaPreset('ops').specLabels
    expect(design).toEqual({ size: '규격', qty: '수량', location: '위치', type: '종류' })
    expect(ops.size).not.toBe('규격')
    expect(ops.qty).not.toBe('수량')
    expect(ops).toEqual({ size: '규모', qty: '투입 인원', location: '장소·구역', type: '운영 구분' })
  })

  it('카테고리마다 가이드 초안이 있다', () => {
    for (const area of DELIVERABLE_AREAS) {
      for (const c of areaPreset(area).categories) {
        expect(c.briefTemplate.trim().length, `${area}/${c.name} 초안 비어 있음`).toBeGreaterThan(20)
        expect(categoryPreset(area, c.name)?.name).toBe(c.name)
      }
    }
  })
})

describe('보드 프리셋 (b) 운영 보드 화면', () => {
  it('운영 보드의 카테고리 목록에 운영 항목만 뜬다', async () => {
    renderRoute('/board/ops')
    const form = await briefForm()
    const select = within(form).getByLabelText('카테고리')

    expect(within(select).getByRole('option', { name: '큐시트' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: '리허설' })).toBeTruthy()
    expect(within(select).queryByRole('option', { name: '현수막' })).toBeNull()
    expect(within(select).queryByRole('option', { name: '키비주얼' })).toBeNull()
  })

  it('운영 보드의 스펙 라벨이 운영 어휘다', async () => {
    renderRoute('/board/ops')
    const form = await briefForm()

    expect(within(form).getByLabelText('규모 (선택)')).toBeTruthy()
    expect(within(form).getByLabelText('투입 인원 (선택)')).toBeTruthy()
    expect(within(form).getByLabelText('장소·구역 (선택)')).toBeTruthy()
    expect(within(form).getByLabelText('운영 구분 (선택)')).toBeTruthy()
    // 제작물 어휘는 운영 보드에 없다
    expect(within(form).queryByLabelText('규격 (선택)')).toBeNull()
    expect(within(form).queryByLabelText('수량 (선택)')).toBeNull()
  })

  it('디자인 보드는 제작물 어휘를 그대로 쓴다 (대조군)', async () => {
    renderRoute('/board/design')
    const form = await briefForm()

    expect(within(form).getByLabelText('규격 (선택)')).toBeTruthy()
    expect(within(form).getByLabelText('수량 (선택)')).toBeTruthy()
    expect(within(form).queryByLabelText('투입 인원 (선택)')).toBeNull()
  })
})

describe('보드 프리셋 (c) 내용 프리셋', () => {
  it('카테고리를 고르면 가이드 내용에 그 항목의 초안이 채워진다', async () => {
    renderRoute('/board/ops')
    const form = await briefForm()

    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '큐시트')
    const brief = within(form).getByLabelText('가이드 내용') as HTMLTextAreaElement
    expect(brief.value).toBe(categoryPreset('ops', '큐시트')!.briefTemplate)
    expect(brief.value).toContain('콘솔 3채널')
  })

  it('카테고리를 바꾸면 초안도 따라 바뀐다', async () => {
    renderRoute('/board/ops')
    const form = await briefForm()
    const select = within(form).getByLabelText('카테고리')
    const brief = () => within(form).getByLabelText('가이드 내용') as HTMLTextAreaElement

    await userEvent.selectOptions(select, '큐시트')
    await userEvent.selectOptions(select, '리허설')
    expect(brief().value).toBe(categoryPreset('ops', '리허설')!.briefTemplate)
  })

  it('사용자가 직접 쓴 내용은 카테고리를 바꿔도 덮이지 않는다', async () => {
    renderRoute('/board/ops')
    const form = await briefForm()
    const select = within(form).getByLabelText('카테고리')
    const brief = () => within(form).getByLabelText('가이드 내용') as HTMLTextAreaElement

    await userEvent.selectOptions(select, '큐시트')
    await userEvent.clear(brief())
    await userEvent.type(brief(), '직접 쓴 지시사항')
    await userEvent.selectOptions(select, '리허설')

    expect(brief().value).toBe('직접 쓴 지시사항')
  })

  it('목록에 없는 항목은 직접 입력으로 만들 수 있다 (자유 입력을 막지 않는다)', async () => {
    renderRoute('/board/ops')
    const form = await briefForm()

    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '__custom__')
    const input = within(form).getByLabelText('카테고리') as HTMLInputElement
    await userEvent.type(input, '주차운영')
    expect(input.value).toBe('주차운영')
  })
})
