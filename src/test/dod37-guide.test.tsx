/** @vitest-environment jsdom */
// DoD 37 (v2.5 §23) — 운영가이드: 섹션 4종 시드·존운영/R&R 초기 로드, 원본 변경 시 stale
// 표시·자동 덮어쓰기 없음(R-O4), 개인 연락처가 화면·S9 조립 데이터에 0건(R-O6), 인쇄 구조 계약.
// 빌더 UI 세부는 guide-builder.test.tsx(3.16d)가, provider 세부는
// MockProvider.opsDocs.test.ts(3.16a)가 정본 — 이 파일은 DoD 문장을 통합 각도로 증명한다.
// 주의: 뒤쪽 describe는 라우트 싱글턴 provider를 쓰므로(파일 단위 상태 공유) 순서대로 읽을 것.
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { MockProvider } from '../providers/mock/MockProvider'
import { mockProvider, renderRoute } from './testUtils'

const RB27 = PROJECT_ID_REBUILD27
const GUIDE_ID = 'dlv-rb27-guide-01'

afterEach(cleanup)

describe('DoD 37 (a·b) — 시드·stale (독립 MockProvider)', () => {
  it('(a) 새 운영가이드 시드 = 4섹션(zone·role·emergency·contacts), zone·role은 원본 연동으로 초기 로드', async () => {
    const p = new MockProvider()
    const fresh = await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '운영가이드',
      title: '스태프 가이드 v2',
    })
    const sections = await p.seedGuideFromSources(fresh.id)

    expect(sections.map((s) => s.kind)).toEqual(['zone', 'role', 'emergency', 'contacts'])
    const zone = sections[0]
    const role = sections[1]
    expect(zone.source_ref).toBe('zone_items')
    expect(role.source_ref).toBe('role_charters')
    // 존운영·R&R 원본에서 실제 내용이 조립돼 들어온다(빈 뼈대가 아니다)
    expect((zone.content ?? '').trim().length).toBeGreaterThan(0)
    expect((role.content ?? '').trim().length).toBeGreaterThan(0)
    expect(sections.every((s) => s.source_stale === false)).toBe(true)
  })

  it('(b) R-O4 — 존운영 원본이 바뀌면 zone 섹션이 stale로 표시될 뿐, 내용이 자동으로 덮어써지지 않는다', async () => {
    const p = new MockProvider()
    // 픽스처 zone 섹션은 stale=true로 시연돼 있다 — 먼저 사람이 반영한 상태(stale=false)로 만든다
    const before = await p.listGuideSections(GUIDE_ID)
    await p.saveGuideSections(
      GUIDE_ID,
      before.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.content,
        source_ref: s.source_ref,
        source_stale: false,
      })),
    )
    const settled = await p.listGuideSections(GUIDE_ID)
    const zoneBefore = settled.find((s) => s.kind === 'zone')!
    expect(zoneBefore.source_stale).toBe(false)

    // 원본 변경 = 비정형 ops 항목(존운영 원본) 추가
    await p.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '존운영',
      title: '스폰서 라운지 존',
      content: '신설 존 — 운영 인원 2명',
    })

    const after = await p.listGuideSections(GUIDE_ID)
    const zoneAfter = after.find((s) => s.kind === 'zone')!
    expect(zoneAfter.source_stale).toBe(true)
    // 자동 덮어쓰기 없음 — 내용은 사람이 "반영"하기 전까지 그대로
    expect(zoneAfter.content).toBe(zoneBefore.content)
    expect(zoneAfter.content ?? '').not.toContain('스폰서 라운지 존')
  })
})

describe('DoD 37 (c·d) — R-O6·인쇄 구조 (라우트 싱글턴)', () => {
  const MARKER = '010-7777-6543'

  it('(c) 개인 연락처 마커가 S9 조립 데이터(getPlan)와 S9 화면에 0건이다', async () => {
    const p = mockProvider()
    const sections = await p.listGuideSections(GUIDE_ID)
    await p.saveGuideSections(
      GUIDE_ID,
      sections.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.kind === 'contacts' ? `무대감독 개인 연락처: ${MARKER}` : s.content,
        source_ref: s.source_ref,
        source_stale: s.source_stale,
      })),
    )

    const plan = await p.getPlan(RB27)
    expect(JSON.stringify(plan)).not.toContain(MARKER)

    localStorage.setItem('communicator.currentProjectId', RB27)
    renderRoute('/plan')
    await screen.findByRole('heading', { name: '⑦비상 대응' })
    expect(screen.queryByText(new RegExp(MARKER))).toBeNull()
  })

  it('(d) 인쇄 구조 계약 — 상세 화면(S3)이 운영가이드 빌더를 렌더하고, 연락망 섹션은 기본 인쇄 제외', async () => {
    localStorage.setItem('communicator.currentProjectId', RB27)
    renderRoute(`/items/${GUIDE_ID}`)

    // v2.5 통합 배선 — category='운영가이드'(빌더 데이터 보유) 항목은 파일 폼 대신 빌더
    const contactsCard = (await screen.findByRole('heading', { name: /연락망\/비품/ })).closest(
      'article',
    )!
    expect(contactsCard.className).toContain('plan-print-hidden')
    // 파일 흐름(버전 업로드 폼)은 빌더 문서에 노출되지 않는다
    expect(screen.queryByRole('heading', { name: '버전 업로드' })).toBeNull()
  })
})
