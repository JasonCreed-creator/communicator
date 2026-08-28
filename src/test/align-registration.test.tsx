/** @vitest-environment jsdom */
// Phase 3.17c — 등록 보드(S4) 구글 시트 연동 화면 계약.
// 정본 = 설계서 §24(대원칙·동시 접속 계약·화면 계약) + 시안 `등록 보드 · 구글시트 연동.dc.html`
//        + 디자인지시서 §7-1(배지 4단계 · 표 · 빈 상태 · 터치 44).
//
// 여기서 고정하는 것은 "시트가 정본이고 앱은 읽기만 한다"를 화면이 실제로 지키는지다:
//   (1) 연결 카드 4상태(미연결 / 연결됨 / 갱신 있음 ● / 권한 끊김)가 탭 위에 상시 노출
//   (2) 갱신 있음 → 인라인 차이 표 4열 + [나중에]·[변경 n건 반영]
//   (3) 확인 전까지 화면은 직전 스냅숏 기준을 유지한다(자동 덮어쓰기 없음)
//   (4) 동시 접속 — 먼저 반영한 쪽만 성공하고, 늦은 쪽은 409 원문을 보고 차이를 다시 읽는다(R-S1)
//   (5) 명단 표는 읽기 전용(시트 소유 필드에 입력 요소 0개) · 연락처 기본 마스킹 · 제거 행 이력 보존
//   (6) 체크인 탭은 현장용 — 밀집 모드 없음 · 컨트롤 44
//   (7) 위저드는 필수 매핑(이름+이메일)이 없으면 진행 불가
//
// 시트 연결이 붙은 행사는 `prj-rebuild27` 하나뿐이므로 렌더 전에 현재 행사를 반드시 지정한다.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

const SHEET_PROJECT = 'prj-rebuild27'
const PLAIN_PROJECT = 'prj-stc26'

afterEach(cleanup)

function useProject(id: string) {
  localStorage.setItem('communicator.currentProjectId', id)
}

async function openTab(name: string) {
  await userEvent.click(screen.getByRole('button', { name }))
}

// ── (1)(2)(3)(5)(6) 비파괴 시나리오 — 픽스처의 '갱신 있음' 상태를 그대로 읽는다 ────────────
describe('3.17c 연결 카드 — 갱신 있음(stale)', () => {
  beforeEach(() => useProject(SHEET_PROJECT))

  it('카드가 탭 위에 상시 노출되고 주의 배지 + 도트 + 단방향 고지를 함께 단다', async () => {
    renderRoute('/registration')
    const card = await screen.findByRole('region', { name: '구글 시트 연결' })

    // 주의 4단계 배지 + '내 행동을 기다림' 도트(§7-1.1에서 도트가 허용된 시트 상태)
    // 헤더 배지와 차이 패널 배지 둘 다 같은 문구를 쓴다 — 헤더(첫 번째)를 본다
    const badge = (await within(card).findAllByText('갱신 있음 4'))[0]
    expect(badge.getAttribute('data-level')).toBe('attention')
    expect(badge.querySelector('span.rounded-full')).toBeTruthy()

    expect(within(card).getByText('시트 → 앱 단방향 · 시트가 정본')).toBeTruthy()
    // 연결 메타 + 외부 링크 + 조작 버튼
    expect(within(card).getByText(/참가자_확정 탭 · 컬럼 8개 매핑/)).toBeTruthy()
    expect(within(card).getByRole('link', { name: '시트 열기 ↗' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: '지금 동기화' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: '연결 설정' })).toBeTruthy()
  })

  it('자동 확인 주기 셀렉트에 0(사용 안 함) 선택지가 있고, 자동은 감지까지만이라고 명시한다', async () => {
    renderRoute('/registration')
    const card = await screen.findByRole('region', { name: '구글 시트 연결' })

    const select = (await within(card).findByLabelText('자동 확인 주기')) as HTMLSelectElement
    expect(select.value).toBe('15')
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('0')
    expect(within(card).getByText('자동 확인 사용 안 함')).toBeTruthy()
    expect(
      within(card).getByText('자동은 변경 감지까지만 — 화면 반영은 항상 차이 확인 후'),
    ).toBeTruthy()
  })

  it('차이 표가 4열(구분·대상·현재 화면·시트 원본)로 펼쳐지고 [나중에]·[변경 4건 반영]을 둔다', async () => {
    renderRoute('/registration')
    const table = await screen.findByRole('table', { name: '시트 차이' })

    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent ?? '')
    expect(headers).toHaveLength(4)
    expect(headers[0]).toBe('구분')
    expect(headers[1]).toBe('대상')
    expect(headers[2]).toMatch(/^현재 화면\(스냅숏 \d{2}:\d{2}\)$/)
    expect(headers[3]).toMatch(/^시트 원본\(\d{2}:\d{2}\)$/)

    // 픽스처 차이 4건 — 추가 2 · 변경 1 · 제거 1(정렬은 추가→변경→제거)
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('추가')).toBeTruthy()
    expect(within(rows[0]).getByText('서지안 · 가상바이오소재')).toBeTruthy()
    expect(within(rows[2]).getByText('변경')).toBeTruthy()
    expect(within(rows[2]).getByText(/구분 연사/)).toBeTruthy()
    expect(within(rows[3]).getByText('제거')).toBeTruthy()
    expect(within(rows[3]).getByText(/시트에서 제거됨.*이력 보존/)).toBeTruthy()

    expect(screen.getByRole('button', { name: '나중에' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '변경 4건 반영' })).toBeTruthy()
    expect(screen.getByText(/자동 덮어쓰기는 하지 않습니다/)).toBeTruthy()
  })

  it('확인 전까지 KPI·명단은 직전 스냅숏 기준을 유지한다 — 추가 2건이 아직 들어오지 않는다', async () => {
    renderRoute('/registration')
    await screen.findByRole('table', { name: '시트 차이' })

    // KPI 4카드는 시트 기준(신청 412) — 원본의 414가 아니다
    const kpi = within(screen.getByTestId('sheet-kpi'))
    expect(kpi.getByText('신청')).toBeTruthy()
    expect(kpi.getByText('412')).toBeTruthy()
    expect(kpi.getByText(/시트 행 \d+ · 중복·오류 6 제외/)).toBeTruthy()
    expect(kpi.getByText('응답률 86.9%')).toBeTruthy()
    expect(kpi.getByText('체크인율 59.8% · 확정 기준')).toBeTruthy()

    // 명단에서 '서지안'을 검색해도 아직 없다(반영 전)
    await openTab('참관객')
    await screen.findByRole('table', { name: '참관객 시트 명단' })
    await userEvent.type(screen.getByLabelText('이름·이메일·소속 검색'), '서지안')
    expect(screen.queryByText('서지안')).toBeNull()
  })

  it('명단 표는 읽기 전용 — 시트 소유 필드에 입력 요소가 하나도 없고 제거된 행은 이력으로 남는다', async () => {
    renderRoute('/registration')
    await screen.findByRole('region', { name: '구글 시트 연결' })
    await openTab('참관객')
    const table = await screen.findByRole('table', { name: '참관객 시트 명단' })

    // 시트 소유 필드 편집 UI 금지(§24.6) — 표 안에는 input·select·textarea가 없다
    expect(table.querySelectorAll('input, select, textarea')).toHaveLength(0)
    // 앱 소유(체크인)만 조작 가능
    expect(within(table).getAllByRole('button', { name: '체크인' }).length).toBeGreaterThan(0)

    // 필드 소유 분리 배너 + 읽기 전용 배지
    expect(screen.getByText(/시트 소유/)).toBeTruthy()
    expect(screen.getByText('읽기 전용')).toBeTruthy()

    // 하드 삭제 금지 — 이미 제거된 행(노하린)은 '시트에서 제거됨'으로 남아 있다
    await userEvent.clear(screen.getByLabelText('이름·이메일·소속 검색'))
    await userEvent.type(screen.getByLabelText('이름·이메일·소속 검색'), '노하린')
    expect(await within(table).findByText('노하린')).toBeTruthy()
    expect(within(table).getByText('시트에서 제거됨')).toBeTruthy()
  })

  it('연락처는 기본 마스킹으로만 그려진다 — 원문 이메일이 화면에 없다', async () => {
    renderRoute('/registration')
    await screen.findByRole('region', { name: '구글 시트 연결' })
    await openTab('참관객')
    const table = await screen.findByRole('table', { name: '참관객 시트 명단' })

    const contacts = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.querySelectorAll('td')[3]?.textContent ?? '')
    expect(contacts.length).toBeGreaterThan(0)
    contacts.forEach((c) => {
      expect(c).toMatch(/^\w{2}\*{4}@example\.com$/)
    })
    // 원문(sheet1@example.com …)은 어디에도 없다
    expect(table.textContent).not.toMatch(/sheet\d+@example\.com/)
  })

  it('체크인 탭(A안)은 현장용 — 밀집 모드 토글이 없고 컨트롤이 44다', async () => {
    renderRoute('/registration')
    await screen.findByRole('region', { name: '구글 시트 연결' })
    await openTab('체크인')

    const search = await screen.findByLabelText('이름 · 소속 · 뱃지번호 검색')
    expect(search.className).toContain('h-11')
    // 밀집 모드는 내부 관리 표에만 — 현장 탭에는 없다(§7-1.3 조건 1)
    expect(screen.queryByRole('button', { name: '밀집 모드' })).toBeNull()
    expect(screen.queryByRole('button', { name: '기본 밀도' })).toBeNull()

    // 상단 '체크인 n / m'(확정 기준) + 큰 체크인 버튼
    expect(screen.getByText(/^체크인 \d+ \/ 358$/)).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: '체크인' })
    // 탭 버튼은 제외 — 행 버튼만 44
    const rowButtons = buttons.filter((b) => b.className.includes('btn'))
    expect(rowButtons.length).toBeGreaterThan(0)
    rowButtons.forEach((b) => {
      expect(b.className).toContain('h-11')
      expect(b.className).not.toContain('btn-sm')
    })
  })
})

// ── (4) 동시 접속 계약 R-S1 — 한 화면은 성공, 늦은 화면은 409 ────────────────────────
describe('3.17c 동시 접속 — 먼저 반영한 쪽만 성공한다(R-S1)', () => {
  beforeEach(() => useProject(SHEET_PROJECT))

  it('담당자 A 반영은 성공하고, 같은 스냅숏을 보던 담당자 B는 409 원문을 보고 차이를 다시 읽는다', async () => {
    // 두 담당자가 같은 보드를 동시에 열어 둔 상황 — 둘 다 스냅숏 v3을 들고 있다
    const a = renderRoute('/registration')
    const b = renderRoute('/registration')
    await within(a.container).findByRole('table', { name: '시트 차이' })
    await within(b.container).findByRole('table', { name: '시트 차이' })

    // 담당자 A가 먼저 반영 → 성공(§24.3 R-S3: snapshot_version 증가)
    await userEvent.click(within(a.container).getByRole('button', { name: '변경 4건 반영' }))
    await waitFor(() => {
      expect(within(a.container).getByText('원본과 일치합니다. 확인할 변경 사항이 없습니다.')).toBeTruthy()
    })

    // 담당자 B는 여전히 v3을 들고 있다 → 조용히 덮어쓰지 않고 409 원문을 띄운다
    await userEvent.click(within(b.container).getByRole('button', { name: '변경 4건 반영' }))
    expect(
      await within(b.container).findByText('다른 담당자가 이미 반영했습니다. 최신 차이를 다시 확인해 주세요.'),
    ).toBeTruthy()
    // 그리고 차이를 다시 읽어 최신 상태(연결됨)로 갱신된다
    await waitFor(() => {
      expect(within(b.container).queryByRole('table', { name: '시트 차이' })).toBeNull()
    })

    // 반영 결과는 실제로 명단에 들어왔다 — 추가 2건 중 서지안
    const attendees = await mockProvider().listAttendees(SHEET_PROJECT)
    expect(attendees.some((x) => x.name === '서지안')).toBe(true)
    // 하드 삭제 금지 — 윤가람은 지워지지 않고 removed로 남는다
    expect(attendees.find((x) => x.name === '윤가람')?.sheet_status).toBe('removed')
  })
})

// ── (1) 연결됨 · 권한 끊김 ──────────────────────────────────────────────────────
describe('3.17c 연결 카드 — 연결됨 · 권한 끊김', () => {
  beforeEach(() => useProject(SHEET_PROJECT))

  it('반영이 끝나면 정상 배지 + "원본과 일치합니다" 카드가 된다', async () => {
    renderRoute('/registration')
    const card = await screen.findByRole('region', { name: '구글 시트 연결' })

    const badge = await within(card).findByText('연결됨')
    expect(badge.getAttribute('data-level')).toBe('positive')
    expect(within(card).getByText('원본과 일치합니다. 확인할 변경 사항이 없습니다.')).toBeTruthy()
    expect(screen.queryByRole('table', { name: '시트 차이' })).toBeNull()
  })

  it('권한이 끊기면 차단 배지 + 마지막 스냅숏 유지 고지 + 실패 횟수 + [연결 해제]·[재인증], 반영은 비활성', async () => {
    mockProvider().simulateSheetRevoke(SHEET_PROJECT)
    renderRoute('/registration')
    const card = await screen.findByRole('region', { name: '구글 시트 연결' })

    const badge = await within(card).findByText('권한 끊김')
    expect(badge.getAttribute('data-level')).toBe('blocked')
    expect(within(card).getByText(/마지막 성공 동기화\(.+\) 스냅숏을 계속 표시합니다/)).toBeTruthy()
    expect(within(card).getByText(/실패 3회 \(\d{2}:\d{2} · \d{2}:\d{2} · \d{2}:\d{2}\)/)).toBeTruthy()
    expect(within(card).getByRole('button', { name: '연결 해제' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: '재인증' })).toBeTruthy()

    // 반영 버튼은 숨기지 않고 비활성으로 남긴다(왜 못 하는지 보이게)
    expect((within(card).getByRole('button', { name: '변경 반영' }) as HTMLButtonElement).disabled).toBe(true)
    // KPI·명단은 마지막 성공 스냅숏 그대로
    expect(within(screen.getByTestId('sheet-kpi')).getByText('신청')).toBeTruthy()
  })
})

// ── (1) 미연결 + (7) 위저드 ─────────────────────────────────────────────────────
describe('3.17c 미연결 빈 상태 ② · 최초 연결 3단계 위저드', () => {
  beforeEach(() => useProject(PLAIN_PROJECT))

  it('연결이 없는 행사에서도 카드가 상시 노출되고 준비물·CTA·xlsx 링크를 안내한다', async () => {
    renderRoute('/registration')
    const card = await screen.findByRole('region', { name: '구글 시트 연결' })

    const badge = within(card).getByText('미연결')
    expect(badge.getAttribute('data-level')).toBe('neutral')
    expect(within(card).getByText(/참가자 명단 구글 시트를 연결하면/)).toBeTruthy()
    expect(within(card).getByText(/준비물 — 시트 URL, 그리고 뷰어 권한/)).toBeTruthy()
    expect(within(card).getByRole('button', { name: '시트 연결하기' })).toBeTruthy()
    expect(within(card).getByText(/xlsx를 한 번만 가져오기/)).toBeTruthy()

    // 미연결이면 KPI는 기존 3종으로 폴백한다
    expect(screen.queryByTestId('sheet-kpi')).toBeNull()
    expect(screen.getByText('응답률')).toBeTruthy()
  })

  it('URL → 탭 → 매핑 3단계를 밟고, 필수 매핑(이름+이메일)이 없으면 [연결 완료]가 비활성이다', async () => {
    renderRoute('/registration')
    const card = await screen.findByRole('region', { name: '구글 시트 연결' })
    await userEvent.click(within(card).getByRole('button', { name: '시트 연결하기' }))

    const oneWay = /시트 → 앱 단방향입니다\. 시트가 정본입니다\./
    // 단계 1 — 고지는 3단계 내내 상단 고정
    expect(screen.getByText(oneWay)).toBeTruthy()
    expect(screen.getByText('단계 1 / 3')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('구글 시트 URL'), 'https://sheets.example.com/spreadsheets/d/demo/edit')
    await userEvent.click(screen.getByRole('button', { name: '시트 확인' }))
    expect(await screen.findByText(/탭 4개 · 마지막 수정/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '복사' })).toBeTruthy()

    // 단계 2 — 표가 아닌 탭은 사유와 함께 선택 불가
    await userEvent.click(screen.getByRole('button', { name: '다음 — 탭 선택' }))
    expect(await screen.findByText('단계 2 / 3')).toBeTruthy()
    expect(screen.getByText(oneWay)).toBeTruthy()
    const blocked = screen.getByText('안내문_초안').closest('button') as HTMLButtonElement
    expect(blocked.disabled).toBe(true)
    expect(within(blocked).getByText(/표 형태가 아님 — 명단으로 쓸 수 없습니다/)).toBeTruthy()
    expect(screen.getByLabelText('첫 행을 헤더로 사용')).toBeTruthy()

    // 단계 3 — 미리보기 값은 마스킹, 필수 매핑 2종은 헤더 추측으로 채워진다
    await userEvent.click(screen.getByRole('button', { name: '다음 — 컬럼 매핑' }))
    expect(await screen.findByText('단계 3 / 3')).toBeTruthy()
    expect(screen.getByText(oneWay)).toBeTruthy()
    expect(screen.getByText('ki****@example.com')).toBeTruthy()
    expect(screen.getByText('010-****-0117')).toBeTruthy()
    expect(screen.getByText('필수 2개 모두 매핑됨')).toBeTruthy()
    const finish = () => screen.getByRole('button', { name: '연결 완료' }) as HTMLButtonElement
    expect(finish().disabled).toBe(false)

    // 이메일 매핑을 '무시'로 바꾸면 진행 불가
    await userEvent.selectOptions(screen.getByLabelText('이메일 매핑'), 'ignore')
    await waitFor(() => expect(finish().disabled).toBe(true))
    expect(screen.getByText('필수 미지정 — 이메일')).toBeTruthy()
  })
})
