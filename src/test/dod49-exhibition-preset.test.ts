// DoD 49 (v2.6 §25.7 / Phase 3.18d) — 전시회 프리셋 **[전부 가정]**.
//
// 근거 행사가 0건인 프리셋이라, 이 테스트가 지키는 것은 "맞다"가 아니라 **"가정이라고 밝힌 채
// 일관되게 동작한다"**이다: EX 템플릿이 format에서만 선택되고, 화면·데이터가 assumed 표시를
// 유지하며, 무료입장 전제가 픽스처에 드러난다.
import { describe, expect, it } from 'vitest'
import { PROJECT_ID_EXPO } from '../fixtures/exhibitionFixtures'
import { PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { FORMAT_PRESETS } from '../fixtures/formatPresets'
import { EXHIBITION_TEMPLATE, HOST_TEMPLATE, hostTemplateFor } from '../fixtures/wbsTemplates'
import { mockProvider } from './testUtils'

describe('DoD 49 전시회 프리셋 (v2.6 §25.7)', () => {
  it('EX 템플릿은 §25.7 순서를 그대로 따른다 — D-90 모집부터 D+14 리포트까지', () => {
    expect(EXHIBITION_TEMPLATE).toHaveLength(12)
    const byCode = Object.fromEntries(EXHIBITION_TEMPLATE.map((t) => [t.code, t]))
    expect(byCode['EX-1'].offset_start).toBe(-90)
    expect(byCode['EX-2'].offset_start).toBe(-45)
    expect(byCode['EX-3'].offset_start).toBe(-40)
    expect(byCode['EX-4'].offset_start).toBe(-30)
    expect(byCode['EX-5'].offset_start).toBe(-21)
    expect(byCode['EX-12'].offset_end).toBe(14)
    // 오프셋이 뒤엉키지 않는다 — 시작일 기준 단조 증가
    const starts = EXHIBITION_TEMPLATE.map((t) => t.offset_start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('주최형 템플릿 선택은 format이 한다 — 전시회만 EX, 나머지는 HT (§25.1 권한 ①)', () => {
    expect(hostTemplateFor('exhibition')).toBe(EXHIBITION_TEMPLATE)
    expect(hostTemplateFor('dms')).toBe(HOST_TEMPLATE)
    expect(hostTemplateFor('conference')).toBe(HOST_TEMPLATE)
  })

  it('전개 규칙은 HT와 같다 — partner_submit만 참가업체 수만큼 인스턴스가 된다', async () => {
    const provider = mockProvider()
    const tasks = await provider.listWbsTasks(PROJECT_ID_EXPO)
    const partners = await provider.listPartners(PROJECT_ID_EXPO)
    expect(partners).toHaveLength(4)

    const submitCodes = EXHIBITION_TEMPLATE.filter((t) => t.direction === 'partner_submit')
    const otherCodes = EXHIBITION_TEMPLATE.filter((t) => t.direction !== 'partner_submit')
    for (const tpl of submitCodes) {
      expect(tasks.filter((t) => t.code === tpl.code), tpl.code).toHaveLength(partners.length)
    }
    for (const tpl of otherCodes) {
      expect(tasks.filter((t) => t.code === tpl.code), tpl.code).toHaveLength(1)
    }
    // partner_submit 태스크는 전부 inbound 산출물과 연결된다
    const submitTasks = tasks.filter((t) => t.direction === 'partner_submit')
    expect(submitTasks.every((t) => t.linked_deliverable_id !== null)).toBe(true)
  })

  it('무료입장 전제가 데이터에 드러난다 — 공개 모집이고 보장 인원 개념이 없다', async () => {
    const p = await mockProvider().getProject(PROJECT_ID_EXPO)
    expect(p.format).toBe('exhibition')
    expect(p.kind).toBe('host')
    expect(p.audience_model).toBe('open')
    expect(p.guarantee_pax).toBeNull() // 모객 보장은 대행형 개념이다
    expect(p.kpi_show_rate).toBeNull()
    expect(JSON.stringify(p.overview_items)).toContain('무료')
  })

  it('등급은 부스 규격 중심이다 — 발표 세션을 팔지 않는다', async () => {
    const tiers = await mockProvider().listPartnerTiers(PROJECT_ID_EXPO)
    expect(tiers).toHaveLength(3)
    expect(tiers.every((t) => t.session_slots === 0)).toBe(true)
    expect(tiers.every((t) => t.booth_included)).toBe(true)
    // DMS 쪽은 반대로 세션을 판다 — 두 프리셋이 실제로 갈라지는지 대조한다
    const dmsTiers = await mockProvider().listPartnerTiers(PROJECT_ID_HOST)
    expect(dmsTiers.some((t) => t.session_slots > 0)).toBe(true)
  })

  it('전시회·DMS 프리셋은 데이터에서 "가정"으로 남는다 — 근거가 생기기 전엔 지우지 않는다', () => {
    expect(FORMAT_PRESETS.exhibition.assumed).toBe(true)
    expect(FORMAT_PRESETS.dms.assumed).toBe(true)
    expect(FORMAT_PRESETS.conference_general.assumed).toBe(false)
    expect(FORMAT_PRESETS.conference_recruiting.assumed).toBe(false)
  })
})
