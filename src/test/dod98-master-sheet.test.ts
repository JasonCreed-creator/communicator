// DoD 98 (Phase 6.11 PR-G · 설계서 v2.21 §27.5) — 마스터 시트 내보내기(역방향 출구).
//   순수(조립): ① 탭 7 고정 순서 · include_money=false면 견적·정산 탭 자체 없음 ② 파일 이름 {행사 ID}_마스터시트_{YYMMDD}
//   ③ WBS = 마일스톤 줄(◆) 먼저 + 태스크(Lv1·Lv2·담당자·소통 대상·D-n·상태 지연) + 간트 열 D-60~D+7(68열 · ■ 구간 · 행사일 없으면 0열)
//   ④ R&R 사람·표시 역할·책임 ⑤ 제작물 = 디자인 항목만(규격·담당·상태·최신 버전·납품) ⑥ 운영 = 운영가이드 섹션 전부(표 12종 · 연락망 0 · 원고 포함)
//   ⑦ 등록 = 통계만(시트 연동 = 시트 기준 · 아니면 RSVP 기준) · 이메일·전화·명단 어디에도 0 ⑧ 견적·정산 = 버킷 3단 · 마진 · 발주 항목(보드 없으면 안내)
//   ⑨ 개요 = 행사 ID · 필수 4 · 담당자 · 참고 문서 · 랜딩 · 연동 시트 ⑩ Sheets 요청 모양(탭 구조 · 값 RAW · 빈 칸 '' · 격자 크기)
//   서버(가짜 저장소·Drive·Sheets): ⑪ GET ready · 401·400·403·405 ⑫ Drive 미설정·미연결 503(구글 호출 0) ⑬ pm 성공 = 행사 폴더 04_WBS·운영계획에
//   스프레드시트(앱 산출물 표식 · 인박스 스캔 제외) · Sheets 3호출 · 탭 7 · 로그 master_sheet.exported(파일 이름·탭만) · permissions 0
//   ⑭ design 멤버 = 탭 6(include_money false) · admin 비멤버 = 탭 7(Phase 6.8 규칙) · 안 보이는 행사 404
//   ⑮ 구글 오류 → 조치 문구(Sheets API 꺼짐 = 콘솔 링크 · scope = 다시 연결 · 401 = 다시 연결 · 429 = 잠시 후) + 만든 빈 파일은 휴지통 · 로그 0
//   ⑯ 소스 가드: api/_lib/masterSheet에 permissions 호출 0 · 나가는 곳 googleapis.com뿐
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clearTokenCache } from '../../api/_lib/drive/auth'
import { handleDriveRequest } from '../../api/_lib/drive/handler'
import type { DriveEnv } from '../../api/_lib/drive/service'
import { APP_EXPORT_KEY, PART } from '../../api/_lib/drive/tree'
import { GSHEET_MIME, handleMasterSheetRequest, kstToday } from '../../api/_lib/masterSheet/handler'
import type { MasterSheetReader } from '../../api/_lib/masterSheet/reader'
import { sheetStats } from '../../api/_lib/masterSheet/reader'
import { SHEETS_CONSOLE_URL, structureRequests, valuesRequest } from '../../api/_lib/masterSheet/sheets'
import { createFixtureState, PROJECT_ID } from '../fixtures/sampleProject'
import { PROJECT_ID_REBUILD27 } from '../fixtures/rebuildFixtures'
import { buildGuideData, GUIDE_CANON_ORDER, GUIDE_KIND_META } from '../lib/guideStructured'
import {
  buildMasterSheet,
  ganttColumns,
  GANTT_MARK,
  MASTER_SHEET_TAB_TITLES,
  masterSheetFileName,
  masterSheetTexts,
  MILESTONE_MARK,
  tabColumnCount,
} from '../lib/masterSheet/build'
import type { MasterSheet, MasterSheetSource, MasterSheetTab } from '../lib/masterSheet/types'
import { projectLabel } from '../lib/projectLabel'
import { MockProvider } from '../providers/mock/MockProvider'
import type { GuideSection } from '../types/entities'
import { createFakeDrive } from './helpers/fakeDrive'
import { createFakeDriveStore } from './helpers/fakeDriveStore'
import { createFakeSheets, type FakeSheetsFailure } from './helpers/fakeSheets'
import { sourceFromProvider } from './helpers/masterSheetSource'

const TODAY = '2026-09-28'
const TITLES = Object.values(MASTER_SHEET_TAB_TITLES)

function tab(sheet: MasterSheet, title: string): MasterSheetTab {
  const t = sheet.tabs.find((x) => x.title === title)
  if (!t) throw new Error(`탭 없음: ${title}`)
  return t
}

function col(t: MasterSheetTab, name: string): number {
  const i = t.columns.indexOf(name)
  if (i < 0) throw new Error(`열 없음: ${name}`)
  return i
}

async function fixtureSource(projectId: string, include_money = true): Promise<MasterSheetSource> {
  const provider = new MockProvider(createFixtureState())
  return sourceFromProvider(provider, projectId, { include_money })
}

describe('DoD 98 · 순수 조립 — 탭 7 고정 · 파일 이름', () => {
  it('① pm = 탭 7(개요·WBS·R&R·제작물·운영·등록·견적·정산) 순서 고정 · include_money=false면 견적·정산 탭 자체가 없다', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const sheet = buildMasterSheet(src, { today: TODAY, include_money: true })
    expect(sheet.tabs.map((t) => t.title)).toEqual(TITLES)
    expect(sheet.includes_money).toBe(true)
    const noMoney = buildMasterSheet(src, { today: TODAY, include_money: false })
    expect(noMoney.tabs.map((t) => t.title)).toEqual(TITLES.slice(0, 6))
    expect(noMoney.includes_money).toBe(false)
    expect(masterSheetTexts(noMoney).some((s) => s.includes('마진') || s.includes('실집행'))).toBe(false)
  })

  it('② 파일 이름 = {행사 ID}_마스터시트_{YYMMDD} (행사 ID = projectLabel · 저장 안 함)', async () => {
    const src = await fixtureSource(PROJECT_ID)
    expect(masterSheetFileName(src.project, TODAY)).toBe(`${projectLabel(src.project)}_마스터시트_260928`)
    expect(buildMasterSheet(src, { today: TODAY, include_money: true }).title).toMatch(/^\d{6}_.+_마스터시트_260928$/)
    // 행사일·고객사가 비면 그 칸 없이(projectLabel 규칙 그대로)
    expect(masterSheetFileName({ ...src.project, event_date: null, organizer: null }, '2027-01-05')).toBe(`${src.project.name}_마스터시트_270105`)
  })
})

describe('DoD 98 · WBS 탭 — 간트 열 · 마일스톤 · 담당자 · 상태', () => {
  it('③ 간트 열 = D-60~D+7(68열) · 태스크 구간 ■ · 마일스톤 줄이 먼저 오고 ◆ · 행사일 없으면 간트 열 0', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const g = ganttColumns(src.project.event_date)
    expect(g).toHaveLength(68)
    expect(g[0].offset).toBe(-60)
    expect(g[67].offset).toBe(7)
    expect(g[60].header.startsWith('D-day ')).toBe(true)
    const t = tab(buildMasterSheet(src, { today: TODAY, include_money: true }), 'WBS')
    expect(t.columns.slice(0, 13)).toEqual(['단계(Lv1)', '묶음(Lv2)', '코드', '태스크', '담당 역할', '담당자', '소통 대상', 'D-n 시작', 'D-n 종료', '시작일', '종료일', '상태', '메모'])
    expect(t.columns).toHaveLength(13 + 68)
    expect(t.frozen_rows).toBe(1)
    expect(t.frozen_cols).toBe(4)
    // 마일스톤 줄 = 앞쪽 · 그 날짜 열에만 ◆
    const msRows = t.rows.filter((r) => r[0] === '마일스톤')
    expect(msRows).toHaveLength(src.milestones.length)
    expect(t.rows.slice(0, msRows.length).every((r) => r[0] === '마일스톤')).toBe(true)
    for (const r of msRows) {
      const marks = r.slice(13).filter((c) => c === MILESTONE_MARK)
      const due = String(r[col(t, '종료일')])
      const inRange = g.some((c) => c.date === due)
      expect(marks).toHaveLength(inRange ? 1 : 0)
      expect(String(r[3]).startsWith(`${MILESTONE_MARK} `)).toBe(true)
    }
    // 태스크 줄 = 시작~종료 사이 날짜 열에 ■(그 밖은 빈 칸)
    const taskRows = t.rows.slice(msRows.length)
    expect(taskRows).toHaveLength(src.wbs_tasks.length)
    const withDates = taskRows.find((r) => r[col(t, '시작일')] && r[col(t, '종료일')])!
    const from = String(withDates[col(t, '시작일')])
    const to = String(withDates[col(t, '종료일')])
    withDates.slice(13).forEach((c, i) => {
      const inside = g[i].date >= from && g[i].date <= to
      expect(c === GANTT_MARK).toBe(inside)
    })
    // 행사일 없음 → 간트 열 0(추측으로 그리지 않는다)
    const noDate = tab(buildMasterSheet({ ...src, project: { ...src.project, event_date: null } }, { today: TODAY, include_money: true }), 'WBS')
    expect(noDate.columns).toHaveLength(13)
    expect(ganttColumns(null)).toEqual([])
  })

  it('④ 담당자 = 배정된 멤버 이름(없으면 빈 칸) · Lv1·Lv2·소통 대상 · 상태 = 지연/진행/완료/미착수 · 오프셋 D-n 표기', async () => {
    const base = await fixtureSource(PROJECT_ID_REBUILD27)
    // 배정·묶음·소통 대상을 준 태스크(사람 배정은 그 행사 멤버만 — R-M6)
    const [m0, m1] = base.members
    const src: MasterSheetSource = {
      ...base,
      wbs_tasks: base.wbs_tasks.map((x, i) => (i === 0 ? { ...x, assignee_id: m0.user_id, group_name: '킥오프', target: '발주처' } : i === 1 ? { ...x, assignee_id: m1.user_id } : x)),
    }
    const t = tab(buildMasterSheet(src, { today: TODAY, include_money: true }), 'WBS')
    const ms = t.rows.filter((r) => r[0] === '마일스톤').length
    const rows = t.rows.slice(ms)
    const assigned = src.wbs_tasks.filter((x) => x.assignee_id)
    expect(assigned.length).toBeGreaterThan(0)
    const names = new Map(src.members.map((m) => [m.user_id, m.name]))
    for (const task of assigned) {
      const r = rows.find((x) => x[col(t, '코드')] === task.code)!
      expect(r[col(t, '담당자')]).toBe(names.get(task.assignee_id!))
      expect(r[col(t, '담당 역할')]).toBeTruthy()
      expect(String(r[col(t, '단계(Lv1)')])).toBe(`${task.phase_no}. ${task.phase_name}`)
      expect(r[col(t, '묶음(Lv2)')]).toBe(task.group_name ?? '')
      expect(r[col(t, '소통 대상')]).toBe(task.target ?? '')
    }
    const unassigned = src.wbs_tasks.find((x) => !x.assignee_id)!
    expect(rows.find((x) => x[col(t, '코드')] === unassigned.code)![col(t, '담당자')]).toBe('')
    const delayed = src.wbs_tasks.find((x) => x.status !== 'done' && x.end_date && x.end_date < TODAY)
    if (delayed) expect(rows.find((x) => x[col(t, '코드')] === delayed.code)![col(t, '상태')]).toBe('지연')
    const done = src.wbs_tasks.find((x) => x.status === 'done')
    if (done) expect(rows.find((x) => x[col(t, '코드')] === done.code)![col(t, '상태')]).toBe('완료')
    expect(rows.every((r) => /^D(-\d+|\+\d+|-day)$/.test(String(r[col(t, 'D-n 시작')])))).toBe(true)
  })
})

describe('DoD 98 · R&R · 제작물 · 운영 · 등록 · 견적·정산 · 개요', () => {
  it('④ R&R = 카드마다 권한 역할·제목 · 사람(이름 · 표시 역할) 줄 · 책임 불릿 · 사람 없으면 빈 담당자 칸 한 줄', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const withPeople: MasterSheetSource = {
      ...src,
      role_charters: src.role_charters.map((c, i) => (i === 0 ? { ...c, people: [{ name: '김기획', display_role: '운영 총괄' }, { name: '박운영', display_role: 'Sub' }] } : c)),
    }
    const t = tab(buildMasterSheet(withPeople, { today: TODAY, include_money: true }), 'R&R')
    expect(t.columns).toEqual(['권한 역할', '카드', '담당자', '표시 역할', '책임'])
    const first = withPeople.role_charters[0]
    const rowsOfFirst = t.rows.filter((r) => r[1] === first.charter.title)
    expect(rowsOfFirst.map((r) => [r[2], r[3]])).toEqual([
      ['김기획', '운영 총괄'],
      ['박운영', 'Sub'],
    ])
    expect(String(rowsOfFirst[0][4])).toContain(`• ${first.charter.items[0]}`)
    expect(rowsOfFirst[1][4]).toBe('')
    const noPeople = t.rows.filter((r) => r[1] === withPeople.role_charters[1].charter.title)
    expect(noPeople).toHaveLength(1)
    expect(noPeople[0][2]).toBe('')
    expect(t.rows.length).toBe(src.role_charters.length + 1)
  })

  it('⑤ 제작물 = 디자인 항목만 · 규격 4종 · 담당 이름 · 상태 라벨 · 최신 버전 vN·파일 · 납품(확정만 완료)', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const t = tab(buildMasterSheet(src, { today: TODAY, include_money: true }), '제작물')
    const design = src.deliverables.filter((d) => d.deliverable.area === 'design')
    expect(t.rows).toHaveLength(design.length)
    expect(src.deliverables.some((d) => d.deliverable.area !== 'design')).toBe(true)
    for (const d of design) {
      const r = t.rows.find((x) => x[col(t, '항목')] === d.deliverable.title)!
      expect(r[col(t, '카테고리')]).toBe(d.deliverable.category)
      expect(r[col(t, '담당')]).toBe(d.assignee_name ?? '')
      expect(r[col(t, '최신 버전')]).toBe(d.latest_version ? `v${d.latest_version.version_no}` : '')
      expect(r[col(t, '파일')]).toBe(d.latest_version?.file_name ?? '')
      expect(r[col(t, '납품')]).toBe(d.deliverable.status === 'final' ? '완료' : '')
    }
    const final = design.find((d) => d.deliverable.status === 'final')
    if (final) expect(t.rows.find((x) => x[col(t, '항목')] === final.deliverable.title)![col(t, '상태')]).toBe('확정')
  })

  it('⑥ 운영 = 운영가이드 섹션마다 ■ 제목 줄(굵게) + 표 · 표 12종 전부 머리 줄 · 연락망 0 · 참가자 안내 원고 포함 · 가이드 없으면 안내 한 줄', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const ctx = { project: src.project, sessions: [], memberCount: src.members.length }
    const sections: GuideSection[] = GUIDE_CANON_ORDER.map((kind, i) => ({
      id: `gs-${i}`,
      deliverable_id: 'dlv-guide',
      kind,
      title: GUIDE_KIND_META[kind].title,
      content: kind === 'contacts' ? '이름 · 010-0000-0000' : `${GUIDE_KIND_META[kind].title} 본문\n둘째 줄`,
      source_ref: null,
      source_stale: kind === 'zone',
      sort_order: i,
      data: buildGuideData(kind, ctx),
    }))
    const messaging = sections.find((s) => s.kind === 'messaging')!
    if (messaging.data?.type === 'messaging') messaging.data.rows[0] = { ...messaging.data.rows[0], subject: '참석 확정 안내', body: '안녕하세요, 참석이 확정되었습니다.' }
    const t = tab(buildMasterSheet({ ...src, guide_sections: sections }, { today: TODAY, include_money: true }), '운영')
    const titles = t.rows.filter((r) => typeof r[0] === 'string' && r[0].startsWith('■ ')).map((r) => String(r[0]).slice(2))
    expect(titles).toEqual(GUIDE_CANON_ORDER.filter((k) => k !== 'contacts').map((k) => GUIDE_KIND_META[k].title))
    expect(t.bold_rows).toHaveLength(titles.length)
    for (const i of t.bold_rows) expect(String(t.rows[i][0]).startsWith('■ ')).toBe(true)
    const texts = t.rows.flatMap((r) => r.map(String))
    expect(texts.some((s) => s.includes('010-0000-0000') || s.includes('연락망'))).toBe(false)
    expect(texts).toContain('원고(내부용)')
    expect(texts).toContain('안녕하세요, 참석이 확정되었습니다.')
    expect(texts).toContain('원본 변경 있음 — 확인 필요')
    // 표 종류마다 머리 줄이 제목 바로 다음 줄에
    for (const kind of GUIDE_CANON_ORDER) {
      if (kind === 'contacts') continue
      const at = t.rows.findIndex((r) => r[0] === `■ ${GUIDE_KIND_META[kind].title}`)
      const s = sections.find((x) => x.kind === kind)!
      if (s.data) expect(t.rows[at + 1].length).toBeGreaterThan(1)
      else expect(t.rows[at + 1][0]).toBe(`${GUIDE_KIND_META[kind].title} 본문`)
    }
    const none = tab(buildMasterSheet({ ...src, guide_sections: [] }, { today: TODAY, include_money: true }), '운영')
    expect(none.rows).toHaveLength(1)
    expect(String(none.rows[0][0])).toContain('운영가이드가 아직 없습니다')
  })

  it('⑦ 등록 = 통계만 — 시트 연동 행사는 시트 기준(신청·확정·체크인·제외·기준 시각·링크) · 아니면 RSVP 기준 · 이메일·전화·명단은 어떤 탭에도 0', async () => {
    const sheetSrc = await fixtureSource(PROJECT_ID_REBUILD27)
    expect(sheetSrc.registration.sheet).not.toBeNull()
    const ts = tab(buildMasterSheet(sheetSrc, { today: TODAY, include_money: true }), '등록')
    const kv = (label: string) => ts.rows.find((r) => r[0] === label)
    expect(ts.rows.some((r) => r[0] === '등록 현황 — 연동 시트 기준')).toBe(true)
    expect(kv('신청')![1]).toBe(sheetSrc.registration.sheet!.applied)
    expect(kv('확정')![1]).toBe(sheetSrc.registration.sheet!.confirmed)
    expect(kv('체크인')![1]).toBe(sheetSrc.registration.sheet!.checked_in)
    expect(kv('시트 행')![1]).toBe(sheetSrc.registration.sheet!.source_rows)
    expect(kv('시트')![2]).toBe(sheetSrc.registration.sheet_link!.url)
    const rsvpSrc = await fixtureSource(PROJECT_ID)
    const tr = tab(buildMasterSheet(rsvpSrc, { today: TODAY, include_money: true }), '등록')
    expect(tr.rows.some((r) => r[0] === '등록 현황 — RSVP 기준')).toBe(true)
    expect(tr.rows.find((r) => r[0] === '초대 대상')![1]).toBe(rsvpSrc.registration.rsvp.rsvp_total)
    expect(tr.rows.find((r) => r[0] === '참관객(등록)')![1]).toBe(rsvpSrc.registration.rsvp.attendee_total)
    for (const src of [sheetSrc, rsvpSrc]) {
      const texts = masterSheetTexts(buildMasterSheet(src, { today: TODAY, include_money: true }))
      expect(texts.filter((s) => /@[a-z0-9.-]+\.[a-z]{2,}/i.test(s))).toEqual([])
      expect(texts.filter((s) => /\b0\d{1,2}-\d{3,4}-\d{4}\b/.test(s))).toEqual([])
      expect(texts.some((s) => s.includes('참가자 명단·연락처는 이 시트에 싣지 않습니다'))).toBe(true)
    }
  })

  it('⑧ 견적·정산 = 요약(마진 기준 계약액·실집행·최종 마진·검산) · 버킷 줄 · 발주 항목 줄 · 보드 없으면 안내 한 줄', async () => {
    const src = await fixtureSource(PROJECT_ID)
    expect(src.settlement).not.toBeNull()
    const view = src.settlement!
    const t = tab(buildMasterSheet(src, { today: TODAY, include_money: true }), '견적·정산')
    const kv = (label: string) => t.rows.find((r) => r[0] === label)!
    expect(kv('마진 기준 계약액')[1]).toBe(view.totals.marginBase)
    expect(kv('실집행 합')[1]).toBe(view.totals.totalActual)
    expect(kv('최종 마진')[1]).toBe(view.totals.finalMargin)
    expect(kv('검산')[1]).toBe(view.totals.identityOk ? '일치' : '어긋남')
    expect(kv('기준 견적')[1]).toBe(view.quote_label)
    const head = t.rows.findIndex((r) => r[0] === '버킷' && r[1] === '코드')
    const bucketRows = t.rows.slice(head + 1, head + 1 + view.buckets.length)
    expect(bucketRows.map((r) => r[1])).toEqual(view.buckets.map((b) => b.bucket.code))
    expect(bucketRows.map((r) => r[2])).toEqual(view.buckets.map((b) => b.bucket.quote_amount))
    const itemHead = t.rows.findIndex((r) => r[0] === '발주 항목')
    const items = view.buckets.flatMap((b) => b.items)
    expect(t.rows.slice(itemHead + 1, itemHead + 1 + items.length).map((r) => r[0])).toEqual(items.map((i) => i.title))
    expect(t.bold_rows).toEqual([0, head, itemHead])
    const noBoard = await fixtureSource(PROJECT_ID_REBUILD27)
    expect(noBoard.settlement).toBeNull()
    const tn = tab(buildMasterSheet(noBoard, { today: TODAY, include_money: true }), '견적·정산')
    expect(tn.rows).toHaveLength(1)
    expect(String(tn.rows[0][0])).toContain('정산보드가 아직 없습니다')
  })

  it('⑨ 개요 = 행사 ID · 필수 4 · 일시 · 인원 · 담당자(역할 · 이름 · 직함) · 참고 문서(종류 · 이름 · 주소) · 랜딩 링크 · 연동 시트', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const withLinks: MasterSheetSource = {
      ...src,
      project: {
        ...src.project,
        reference_links: [
          { kind: 'request', title: '요청서 시트', url: 'https://docs.google.com/spreadsheets/d/abc/edit', added_at: '2026-09-28T00:00:00.000Z' },
          { kind: 'kickoff', title: '', url: 'https://docs.google.com/presentation/d/kick/edit', added_at: '2026-09-28T00:00:00.000Z' },
        ],
      },
    }
    const t = tab(buildMasterSheet(withLinks, { today: TODAY, include_money: true }), '개요')
    expect(t.columns).toEqual([])
    const kv = (label: string) => t.rows.find((r) => r[0] === label)
    expect(kv('행사 ID')![1]).toBe(projectLabel(src.project))
    expect(kv('행사명')![1]).toBe(src.project.name)
    expect(kv('고객사(주최·주관)')![1]).toBe(src.project.organizer)
    expect(kv('행사일')![1]).toBe(src.project.event_date)
    expect(kv('장소')![1]).toBe(src.project.venue)
    expect(kv('예상 인원')![1]).toBe(src.project.expected_headcount)
    for (const m of src.members) expect(t.rows.some((r) => String(r[0]).trim() === ({ pm: 'PM', design: '디자인', ops: '운영', reg: '등록' })[m.role] && r[1] === m.name && r[2] === (m.title ?? ''))).toBe(true)
    expect(t.rows.some((r) => String(r[0]).trim() === '요청서' && r[1] === '요청서 시트' && r[2] === 'https://docs.google.com/spreadsheets/d/abc/edit')).toBe(true)
    expect(t.rows.some((r) => String(r[0]).trim() === '킥오프' && r[1] === 'https://docs.google.com/presentation/d/kick/edit')).toBe(true)
    expect(src.landing_pages.length).toBeGreaterThan(0)
    for (const l of src.landing_pages) expect(t.rows.some((r) => String(r[0]).trim() === l.title && r[2] === (l.public_url ?? ''))).toBe(true)
    expect(t.bold_rows.map((i) => t.rows[i][0])).toEqual(['담당자', '참고 문서', '랜딩페이지'])
    const sheetSrc = await fixtureSource(PROJECT_ID_REBUILD27)
    const ts = tab(buildMasterSheet(sheetSrc, { today: TODAY, include_money: true }), '개요')
    expect(ts.rows.some((r) => r[0] === '등록 연동 시트')).toBe(true)
    expect(ts.rows.find((r) => String(r[0]).trim() === '시트')![2]).toBe(sheetSrc.registration.sheet_link!.url)
  })

  it('⑩ Sheets 요청 모양 — 첫 탭은 기본 시트 이름 바꾸기 · 나머지 addSheet(고유 id) · 머리 줄 굵게 · 열 폭 · 값 RAW(빈 칸 \'\' · 빈 줄 [\'\']) · 격자 = 열 수 + 2 이상', async () => {
    const src = await fixtureSource(PROJECT_ID)
    const sheet = buildMasterSheet(src, { today: TODAY, include_money: true })
    const { requests, sheetIds } = structureRequests(sheet, 0)
    expect(sheetIds).toHaveLength(7)
    expect(new Set(sheetIds).size).toBe(7)
    const reqs = requests as Record<string, { properties?: { title?: string; sheetId?: number; gridProperties?: { columnCount: number; rowCount: number; frozenRowCount: number } }; range?: { sheetId: number; startRowIndex: number } }>[]
    const rename = reqs.find((r) => r.updateSheetProperties)!.updateSheetProperties!
    expect(rename.properties?.title).toBe('개요')
    expect(rename.properties?.sheetId).toBe(0)
    const adds = reqs.filter((r) => r.addSheet).map((r) => r.addSheet!.properties!)
    expect(adds.map((p) => p.title)).toEqual(TITLES.slice(1))
    const wbs = adds.find((p) => p.title === 'WBS')!
    expect(wbs.gridProperties!.columnCount).toBeGreaterThanOrEqual(tabColumnCount(tab(sheet, 'WBS')) + 2)
    expect(wbs.gridProperties!.frozenRowCount).toBe(1)
    const bolds = reqs.filter((r) => r.repeatCell).map((r) => r.repeatCell!.range!)
    expect(bolds.some((b) => b.sheetId === wbs.sheetId && b.startRowIndex === 0)).toBe(true)
    expect(reqs.some((r) => r.updateDimensionProperties)).toBe(true)
    const values = valuesRequest(sheet) as { valueInputOption: string; data: { range: string; values: unknown[][] }[] }
    expect(values.valueInputOption).toBe('RAW')
    expect(values.data.map((d) => d.range)).toEqual(TITLES.map((t) => `'${t}'!A1`))
    const wbsValues = values.data.find((d) => d.range === "'WBS'!A1")!.values
    expect(wbsValues[0]).toEqual(tab(sheet, 'WBS').columns)
    expect(wbsValues).toHaveLength(tab(sheet, 'WBS').rows.length + 1)
    expect(values.data.flatMap((d) => d.values.flat()).some((c) => c === null || c === undefined)).toBe(false)
    expect(values.data.every((d) => d.values.every((row) => row.length >= 1))).toBe(true)
  })

  it('시트 기준 통계 식 = 화면(getSheetRegistrationStats)과 같다 — 제외·확정률·체크인율·확정 후 취소', () => {
    const conn = { snapshot_at: '2026-09-28T00:00:00.000Z', pending_added: 2, pending_removed: 1 }
    const attendees = [
      { checked_in_at: '2026-09-28T01:00:00.000Z', sheet_row_id: 'r1', sheet_status: 'confirmed' },
      { checked_in_at: null, sheet_row_id: 'r2', sheet_status: 'confirmed' },
      { checked_in_at: null, sheet_row_id: 'r3', sheet_status: 'applied' },
      { checked_in_at: null, sheet_row_id: 'r4', sheet_status: 'cancelled' },
      { checked_in_at: null, sheet_row_id: 'r5', sheet_status: 'removed' },
      { checked_in_at: null, sheet_row_id: null, sheet_status: null },
    ]
    const rows = [
      { sheet_row_id: 'r1', invalid_reason: null, previously_confirmed: null },
      { sheet_row_id: 'r2', invalid_reason: null, previously_confirmed: null },
      { sheet_row_id: 'r3', invalid_reason: null, previously_confirmed: null },
      { sheet_row_id: 'r4', invalid_reason: null, previously_confirmed: true },
      { sheet_row_id: 'r6', invalid_reason: 'no_email', previously_confirmed: null },
    ]
    const s = sheetStats(conn, attendees, rows)
    expect(s).toMatchObject({ applied: 4, confirmed: 2, cancelled: 1, checked_in: 1, source_rows: 5, excluded: 1, confirm_rate: 0.5, checkin_rate: 0.5, cancelled_after_confirm: 1, pending_added: 2, pending_removed: 1 })
    expect(s.excluded_rows).toEqual([])
  })
})

// ── 서버 계약 — 가짜 저장소·Drive·Sheets ─────────────────────────────────────────────
const BASE = 'https://app.example.com'
const PRJ = '11111111-1111-4111-8111-111111111111'
const PRJ_HIDDEN = '22222222-2222-4222-8222-222222222222'

async function serverSetup(over: Partial<DriveEnv> = {}, sheetsOpts: { fail?: FakeSheetsFailure; failAt?: 'get' | 'structure' | 'values' } = {}) {
  clearTokenCache()
  const drive = createFakeDrive({ accountEmail: 'owner@company.example' })
  const sheets = createFakeSheets(sheetsOpts)
  const db = createFakeDriveStore()
  const env: DriveEnv = {
    DRIVE_ROOT_FOLDER_ID: drive.rootId,
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'csecret',
    SUPABASE_SECRET_KEY: 'test-signing-secret-not-a-real-key',
    ...over,
  }
  db.refreshToken = 'refresh-token-1'
  db.addUser({ jwt: 'jwt-pm', authUserId: 'auth-pm', email: 'pm@example.com', profileId: 'p-pm', appRole: 'sales' })
  db.addUser({ jwt: 'jwt-design', authUserId: 'auth-design', email: 'design@example.com', profileId: 'p-design', appRole: 'staff' })
  db.addUser({ jwt: 'jwt-admin', authUserId: 'auth-admin', email: 'admin@example.com', profileId: 'p-admin', appRole: 'admin' })
  db.addUser({ jwt: 'jwt-out', authUserId: 'auth-out', email: 'out@example.com', profileId: 'p-out', appRole: 'sales' })
  const provider = new MockProvider(createFixtureState())
  const base = await sourceFromProvider(provider, PROJECT_ID, { include_money: true })
  const source: MasterSheetSource = { ...base, project: { ...base.project, id: PRJ, drive_root_folder_id: null } }
  db.addProject({ id: PRJ, code: source.project.code, name: source.project.name, organizer: source.project.organizer, event_date: source.project.event_date, status: 'active', drive_root_folder_id: null })
  db.addMember('p-pm', PRJ, 'pm')
  db.addMember('p-design', PRJ, 'design')
  const reads: { projectId: string; include_money: boolean }[] = []
  const logs: { projectId: string; actor: string; meta: Record<string, unknown> }[] = []
  const reader: MasterSheetReader = {
    async read(projectId, opts) {
      reads.push({ projectId, include_money: opts.include_money })
      if (projectId !== PRJ) return null
      return { ...source, settlement: opts.include_money ? source.settlement : null }
    },
    async log(projectId, actor, meta) {
      logs.push({ projectId, actor, meta })
    },
  }
  const now = Date.parse('2026-09-28T03:00:00Z')
  const deps = { store: db.store, reader: () => reader, fetchImpl: sheets.wrap(drive.fetch), now: () => now }
  const call = (init: { jwt?: string | null; method?: string; body?: Record<string, unknown> }) =>
    handleMasterSheetRequest(
      new Request(`${BASE}/api/master-sheet`, {
        method: init.method ?? 'POST',
        headers: { 'content-type': 'application/json', ...(init.jwt ? { authorization: `Bearer ${init.jwt}` } : {}) },
        body: init.method === 'GET' ? undefined : JSON.stringify(init.body ?? { project_id: PRJ }),
      }),
      env,
      deps,
    )
  return { drive, sheets, db, env, deps, source, reads, logs, call, now }
}

describe('DoD 98 · 서버 — 인증·권한·설정', () => {
  it('⑪ GET = {ready}(자격증명 값 0) · 로그인 없음 401 · project_id 형식 400 · 비멤버 403 · DELETE 405', async () => {
    const s = await serverSetup()
    const ready = await handleMasterSheetRequest(new Request(`${BASE}/api/master-sheet`, { method: 'GET' }), s.env, s.deps)
    expect(await ready.json()).toEqual({ ready: true })
    const notReady = await handleMasterSheetRequest(new Request(`${BASE}/api/master-sheet`, { method: 'GET' }), { SUPABASE_SECRET_KEY: 'x' }, s.deps)
    expect(await notReady.json()).toEqual({ ready: false })
    expect((await s.call({ jwt: null })).status).toBe(401)
    const bad = await s.call({ jwt: 'jwt-pm', body: { project_id: 'prj-stc26' } })
    expect(bad.status).toBe(400)
    const out = await s.call({ jwt: 'jwt-out' })
    expect(out.status).toBe(403)
    expect((await out.json()).error.message).toBe('프로젝트 멤버가 아닙니다.')
    expect((await s.call({ jwt: 'jwt-pm', method: 'DELETE' })).status).toBe(405)
    expect(s.reads).toEqual([])
    expect(s.sheets.calls).toEqual([])
  })

  it('⑫ Drive env 없음 503 · 연결(갱신 토큰) 없음 503 — 흉내 내지 않고 구글 호출 0 · 읽기 0', async () => {
    const off = await serverSetup({ DRIVE_ROOT_FOLDER_ID: undefined })
    const r0 = await off.call({ jwt: 'jwt-pm' })
    expect(r0.status).toBe(503)
    expect((await r0.json()).error.message).toContain('Drive 저장소가 아직 설정되지 않았습니다')
    const s = await serverSetup()
    s.db.refreshToken = null
    const r1 = await s.call({ jwt: 'jwt-pm' })
    expect(r1.status).toBe(503)
    expect((await r1.json()).error.message).toContain('Drive가 아직 연결되지 않았습니다')
    expect(s.reads).toEqual([])
    expect(s.sheets.calls).toEqual([])
    expect(s.drive.calls.filter((c) => c.url.includes('/drive/v3/files'))).toEqual([])
  })
})

describe('DoD 98 · 서버 — 성공 경로', () => {
  it('⑬ pm = 행사 폴더 04_WBS·운영계획에 스프레드시트(앱 산출물 표식) · Sheets 3호출(읽기 → 탭 구조 → 값) · 탭 7 · 링크 · 로그(파일 이름·탭만) · permissions 0', async () => {
    const s = await serverSetup()
    const res = await s.call({ jwt: 'jwt-pm' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string; spreadsheet_id: string; file_name: string; tabs: string[] }
    expect(body.tabs).toEqual(TITLES)
    expect(body.file_name).toBe(`${projectLabel(s.source.project)}_마스터시트_${kstToday(s.now).replace(/-/g, '').slice(2)}`)
    expect(body.url).toBe(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(body.spreadsheet_id)}/edit`)
    // Drive: 행사 폴더(분류 폴더/행사 ID) → 04_WBS·운영계획 → 파일
    const rootId = s.db.projects.get(PRJ)!.drive_root_folder_id!
    const plan = s.drive.childNamed(rootId, PART.plan)!
    const file = s.drive.childrenOf(plan.id).find((f) => f.id === body.spreadsheet_id)!
    expect(file.name).toBe(body.file_name)
    expect(file.mimeType).toBe(GSHEET_MIME)
    expect(file.appProperties[APP_EXPORT_KEY]).toBe('master_sheet')
    // Sheets: GET → batchUpdate → values:batchUpdate, 전부 Bearer · 탭 7이 제목대로 · 값이 탭마다
    expect(s.sheets.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST'])
    expect(s.sheets.calls[1].url.endsWith(`/${encodeURIComponent(body.spreadsheet_id)}:batchUpdate`)).toBe(true)
    const ss = s.sheets.spreadsheets.get(body.spreadsheet_id)!
    expect(ss.sheets.map((x) => x.title)).toEqual(TITLES)
    expect([...ss.values.keys()]).toEqual(TITLES)
    expect(ss.values.get('WBS')![0]).toContain('D-n 시작')
    // 읽기는 사용자 JWT 기준 include_money=true(pm) · 로그 = 파일 이름·탭만(금액 키 0)
    expect(s.reads).toEqual([{ projectId: PRJ, include_money: true }])
    expect(s.logs).toEqual([{ projectId: PRJ, actor: 'user:p-pm', meta: { file_name: body.file_name, tabs: TITLES } }])
    expect(JSON.stringify(s.logs)).not.toMatch(/amount|margin|markup|quote_amount/)
    expect(s.drive.calls.filter((c) => c.url.includes('/permissions'))).toEqual([])
    // 인박스 스캔은 앱 산출물을 미등록 파일로 올리지 않는다
    const scan = await handleDriveRequest(
      new Request(`${BASE}/api/drive`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer jwt-pm' }, body: JSON.stringify({ action: 'scan', project_id: PRJ }) }),
      s.env,
      { store: s.db.store, fetchImpl: s.deps.fetchImpl, now: s.deps.now, sleep: async () => undefined },
    )
    expect(scan.status).toBe(200)
    expect(s.db.inbox.map((r) => r.drive_file_id)).not.toContain(body.spreadsheet_id)
  })

  it('⑭ design 멤버 = 탭 6(견적·정산 없음 · 읽기도 include_money=false) · admin 비멤버 = 탭 7 · 안 보이는 행사 404', async () => {
    const s = await serverSetup()
    const design = await s.call({ jwt: 'jwt-design' })
    expect(design.status).toBe(200)
    const d = (await design.json()) as { tabs: string[]; spreadsheet_id: string }
    expect(d.tabs).toEqual(TITLES.slice(0, 6))
    expect(s.reads[0]).toEqual({ projectId: PRJ, include_money: false })
    expect(s.sheets.spreadsheets.get(d.spreadsheet_id)!.sheets.map((x) => x.title)).toEqual(TITLES.slice(0, 6))
    const admin = await s.call({ jwt: 'jwt-admin' })
    expect(admin.status).toBe(200)
    expect(((await admin.json()) as { tabs: string[] }).tabs).toEqual(TITLES)
    expect(s.reads[1]).toEqual({ projectId: PRJ, include_money: true })
    // 두 번째 파일도 같은 폴더에 새 파일(덮어쓰기 없음)
    const rootId = s.db.projects.get(PRJ)!.drive_root_folder_id!
    expect(s.drive.childrenOf(s.drive.childNamed(rootId, PART.plan)!.id).filter((f) => f.mimeType === GSHEET_MIME)).toHaveLength(2)
    s.db.addMember('p-pm', PRJ_HIDDEN, 'pm')
    const hidden = await s.call({ jwt: 'jwt-pm', body: { project_id: PRJ_HIDDEN } })
    expect(hidden.status).toBe(404)
  })
})

describe('DoD 98 · 서버 — 구글 오류 → 조치 문구 · 빈 파일 정리', () => {
  it.each([
    ['disabled', 503, ['Google Sheets API', 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123456']],
    ['scope', 503, ['권한 범위(scope)', '다시 연결']],
    ['unauthorized', 503, ['다시 연결']],
    ['rate', 503, ['잠시 후']],
    ['server', 502, ['Google Sheets 응답 오류(500)']],
  ] as const)('⑮ %s → %i + 문구 · 만든 스프레드시트는 휴지통 · 로그 0', async (fail, status, phrases) => {
    const s = await serverSetup({}, { fail })
    const res = await s.call({ jwt: 'jwt-pm' })
    expect(res.status).toBe(status)
    const message = (await res.json()).error.message as string
    for (const p of phrases) expect(message).toContain(p)
    expect(message).not.toContain('refresh-token')
    const rootId = s.db.projects.get(PRJ)!.drive_root_folder_id!
    const plan = s.drive.childNamed(rootId, PART.plan)!
    expect(s.drive.childrenOf(plan.id).filter((f) => f.mimeType === GSHEET_MIME)).toEqual([])
    expect(s.drive.calls.some((c) => c.method === 'PATCH' && c.url.includes('/drive/v3/files/'))).toBe(true)
    expect(s.logs).toEqual([])
  })

  it('Sheets API 꺼짐 문구는 activationUrl이 없으면 일반 콘솔 링크로', async () => {
    const s = await serverSetup({}, { fail: 'disabled', failAt: 'values' })
    s.sheets.setFailure('disabled')
    const res = await s.call({ jwt: 'jwt-pm' })
    expect(res.status).toBe(503)
    expect(SHEETS_CONSOLE_URL).toContain('sheets.googleapis.com')
    expect((await res.json()).error.message).toMatch(/console\.(developers|cloud)\.google\.com/)
  })
})

describe('DoD 98 · ⑯ 소스 가드', () => {
  it('api/_lib/masterSheet에 permissions 호출 0 · 절대 주소는 googleapis.com·console.cloud.google.com뿐 · exceljs 0', () => {
    const dir = new URL('../../api/_lib/masterSheet/', import.meta.url)
    const names = readdirSync(dir)
    expect(names.length).toBeGreaterThanOrEqual(3)
    for (const name of names) {
      const src = readFileSync(new URL(name, dir), 'utf8')
      expect(src.includes('/permissions'), name).toBe(false)
      expect(src.includes('exceljs'), name).toBe(false)
      const hosts = [...src.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1])
      expect(hosts.filter((h) => !/(^|\.)googleapis\.com$/.test(h) && h !== 'console.cloud.google.com' && h !== 'docs.google.com'), name).toEqual([])
    }
  })
})
