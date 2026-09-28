// 마스터 시트 조립 입력을 DataProvider(mock 픽스처)에서 만든다 — 테스트 전용(서버 reader와 같은 모양·같은 규칙).
// 실서버의 읽기는 api/_lib/masterSheet/reader.ts(사용자 JWT · RLS)가 한다 — 여기서는 화면이 보는 것과 같은 메서드로 채워
// 순수 함수(src/lib/masterSheet/build)를 픽스처 8행사로 검증한다.
import type { MasterSheetSource } from '../../lib/masterSheet/types'
import type { DataProvider } from '../../providers/DataProvider'
import type { GuideSection } from '../../types/entities'

export async function sourceFromProvider(provider: DataProvider, projectId: string, opts: { include_money: boolean }): Promise<MasterSheetSource> {
  const [project, members, wbs_tasks, milestones, charters, deliverables, landings, rsvp, sheet, sheetConn, people] = await Promise.all([
    provider.getProject(projectId),
    provider.listMembers(projectId),
    provider.listWbsTasks(projectId),
    provider.listMilestones(projectId),
    provider.listRoleCharters(projectId),
    provider.listDeliverables(projectId),
    provider.listLandingPages(projectId),
    provider.getRegistrationStats(projectId),
    provider.getSheetRegistrationStats(projectId),
    provider.getSheetConnection(projectId),
    provider.listPeople(),
  ])
  const names = new Map(people.map((p) => [p.id, p.name]))
  const details = await Promise.all(deliverables.map((d) => provider.getDeliverable(d.id)))
  let guide_sections: GuideSection[] = []
  for (const d of deliverables) {
    if (d.category !== '운영가이드') continue
    const sections = await provider.listGuideSections(d.id)
    if (sections.length > 0) {
      guide_sections = sections.filter((s) => s.kind !== 'contacts')
      break
    }
  }
  return {
    project,
    members: members.map((m) => ({ user_id: m.user_id, role: m.role, name: m.profile.name, title: m.profile.title ?? null })),
    wbs_tasks,
    milestones,
    role_charters: charters.map((c) => ({
      charter: c,
      people: (c.people ?? []).flatMap((p) => {
        const name = names.get(p.person_id)
        return name ? [{ name, display_role: p.display_role }] : []
      }),
    })),
    deliverables: details.map((d) => {
      const latest = [...d.versions].sort((a, b) => b.version_no - a.version_no)[0] ?? null
      return {
        deliverable: d,
        latest_version: latest ? { version_no: latest.version_no, file_name: latest.file_name, created_at: latest.created_at } : null,
        assignee_name: d.assignee_id ? names.get(d.assignee_id) ?? null : null,
      }
    }),
    guide_sections,
    landing_pages: landings.map((l) => ({ title: l.title, status: l.status, public_url: l.public_url })),
    registration: {
      rsvp,
      sheet,
      sheet_link: sheetConn ? { state: sheetConn.state, title: sheetConn.title, url: sheetConn.url, tab_name: sheetConn.tab_name, snapshot_at: sheetConn.snapshot_at } : null,
    },
    settlement: opts.include_money ? await provider.getSettlementBoard(projectId) : null,
  }
}
