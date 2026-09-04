/** @vitest-environment jsdom */
// 표 줄바꿈 계약 (2026-09-04 사용자 실측: 운영계획서 인쇄본 05 제작물 리스트에서 "카테고 리"·"최신 시 안"·
// "컨펌대 기"처럼 짧은 라벨과 배지가 글자 단위로 끊겼다).
//
// 규칙: ① 헤더 셀(.ui-th)은 어디서든 한 줄 ② 배지는 어디서든 한 줄 ③ 문서형 표(S9)는 짧은 식별 칸만
// 한 줄 고정·상단 정렬이고 긴 본문 칸은 접힌다. .ui-table은 정본 CSS가 이미 nowrap이므로 여기서는
// 그 보호를 받지 못하는 일반 표와 배지 컴포넌트를 고정한다. jsdom은 index.css를 읽지 않으므로
// 전역 규칙은 소스 가드로, 컴포넌트는 클래스 계약으로 검증한다.
import { cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import ClientDdayBadge from '../components/client/DdayBadge'
import InternalDdayBadge from '../components/internal/DdayBadge'
import StatusBadge, { BADGE_BASE, LevelBadge } from '../components/internal/StatusBadge'
import StatusPill from '../components/plan/StatusPill'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { renderRoute } from './testUtils'

afterEach(cleanup)

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

describe('표 줄바꿈 계약 — 헤더·배지는 한 줄', () => {
  it('① .ui-th 정의 블록이 white-space: nowrap을 선언한다(소스 가드)', () => {
    const block = /\.ui-th\s*\{([^}]*)\}/.exec(indexCss)
    expect(block).toBeTruthy()
    expect(block![1]).toMatch(/white-space:\s*nowrap/)
  })

  it('② 배지 컴포넌트 4종이 whitespace-nowrap을 단다', () => {
    expect(BADGE_BASE.split(/\s+/)).toContain('whitespace-nowrap')

    render(
      <>
        <StatusBadge status="pending_approval" />
        <LevelBadge level="attention" label="갱신 있음" dot />
        <StatusPill status="pending_approval" />
        <InternalDdayBadge isoDate="2099-01-01" />
        <ClientDdayBadge dueAt="2099-01-01" />
      </>,
    )
    for (const el of screen.getAllByText(/컨펌대기|갱신 있음|D-\d+/)) {
      expect(el.className.split(/\s+/)).toContain('whitespace-nowrap')
    }
  })
})

describe('표 줄바꿈 계약 — S9 문서형 표', () => {
  it('③ 05 제작물 리스트: 짧은 칸(카테고리·수량·최신 시안·상태)은 한 줄·상단 정렬, 수량은 우측정렬', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/plan')
    const heading = await screen.findByRole('heading', { name: '05 제작물 리스트' })
    const section = heading.closest('section') as HTMLElement
    const table = within(section).getByRole('table')

    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map((h) => h.textContent)).toEqual(['카테고리', '품명', '규격', '수량', '위치', '종류', '최신 시안', '상태'])
    for (const h of headers) expect(h.className.split(/\s+/)).toContain('ui-th')
    expect(headers[3].className.split(/\s+/)).toContain('ui-num')

    const firstRow = within(table).getAllByRole('row')[1]
    const cells = within(firstRow).getAllByRole('cell')
    expect(cells).toHaveLength(8)
    const classes = (i: number) => cells[i].className.split(/\s+/)
    // 한 줄 고정 칸
    for (const i of [0, 3, 6, 7]) expect(classes(i)).toContain('whitespace-nowrap')
    // 접히는 본문 칸은 nowrap이 아니다
    for (const i of [1, 2, 4, 5]) expect(classes(i)).not.toContain('whitespace-nowrap')
    // 전 칸 상단 정렬 · 좌우 12px(px-3)로 헤더(.ui-th 12px)와 좌측 기준선 일치 · 수량 우측정렬
    for (let i = 0; i < 8; i += 1) {
      expect(classes(i)).toContain('align-top')
      expect(classes(i)).toContain('px-3')
    }
    expect(classes(3)).toContain('ui-num')
    // 상태 배지도 한 줄
    const pill = cells[7].querySelector('span') as HTMLElement
    expect(pill.className.split(/\s+/)).toContain('whitespace-nowrap')
  })

  it('④ 03 큐시트: 시간·큐·구분은 한 줄, 내용·콘솔 칸은 접힌다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/plan')
    const heading = await screen.findByRole('heading', { name: '03 큐시트' })
    const section = heading.closest('section') as HTMLElement
    const table = within(section).getByRole('table')
    const firstRow = within(table).getAllByRole('row')[1]
    const cells = within(firstRow).getAllByRole('cell')
    expect(cells).toHaveLength(7)
    for (const i of [0, 1, 2]) expect(cells[i].className.split(/\s+/)).toContain('whitespace-nowrap')
    for (const i of [3, 4, 5, 6]) expect(cells[i].className.split(/\s+/)).not.toContain('whitespace-nowrap')
    for (const c of cells) {
      expect(c.className.split(/\s+/)).toContain('align-top')
      expect(c.className.split(/\s+/)).toContain('px-3')
    }
  })
})
