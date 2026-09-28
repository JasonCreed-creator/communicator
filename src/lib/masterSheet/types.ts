// 마스터 시트 내보내기 — 조립 입력(MasterSheetSource)·출력(MasterSheet) 타입 (설계서 v2.21 §27.5 · Phase 6.11 PR-G).
// 런타임 import 0 — 서버(api/_lib/masterSheet — 사용자 JWT로 RLS 아래 읽어 채운다)와 앱 테스트(mock 픽스처)가 같은 모양을 본다.
// 원칙(R-M1~R-M4): 앱이 정본, 시트는 산출물 — 탭 7 고정 · 담당자별 변형 없음 · 명단·개인 연락처 0 · 금액 탭은 pm·admin에게만.
import type { LandingStatus, MemberRole, SheetConnectionState } from '../../types/enums'
import type { Deliverable, GuideSection, IsoDate, IsoDateTime, Milestone, Project, RoleCharter, UUID, WbsTask } from '../../types/entities'
import type { RegistrationStats, SettlementBoardView, SheetRegistrationStats } from '../../types/views'

export type MasterSheetCell = string | number | null

export interface MasterSheetTab {
  /** 탭 이름(고정 7종 — MASTER_SHEET_TAB_TITLES) */
  title: string
  /** 머리 줄(첫 행) — 비면 머리 없이 rows부터(개요 탭은 항목·값·비고 열) */
  columns: string[]
  rows: MasterSheetCell[][]
  frozen_rows: number
  frozen_cols: number
  /** 열 폭(px) — 열 수보다 짧으면 나머지는 기본 폭 */
  widths: number[]
  /** 굵게 그릴 본문 행(0부터 — rows 기준) — 운영 탭의 섹션 제목 줄 · 견적·정산 탭의 묶음 제목 줄 */
  bold_rows: number[]
}

export interface MasterSheet {
  /** 파일 이름(확장자 없음) = {행사 ID}_마스터시트_{YYMMDD} */
  title: string
  tabs: MasterSheetTab[]
  /** 견적·정산 탭을 실었는가(요청자 pm·admin) */
  includes_money: boolean
}

/** 행사 멤버 — 이름·직함만(이메일·전화 0) */
export interface MasterSheetMember {
  user_id: UUID
  role: MemberRole
  name: string
  title: string | null
}

/** R&R 카드 + 사람(이름·표시 역할만) — PlanRoleCharter와 같은 규칙(연락처 0) */
export interface MasterSheetCharter {
  charter: RoleCharter
  people: { name: string; display_role: string }[]
}

export interface MasterSheetVersion {
  version_no: number
  file_name: string
  created_at: IsoDateTime
}

export interface MasterSheetDeliverable {
  deliverable: Deliverable
  latest_version: MasterSheetVersion | null
  /** 담당자 이름 — 멤버·주소록에서만(지어내지 않는다) */
  assignee_name: string | null
}

export interface MasterSheetLanding {
  title: string
  status: LandingStatus
  public_url: string | null
}

/** 등록 연동 시트 — 링크·상태·기준 시각만(명단 0) */
export interface MasterSheetSheetLink {
  state: SheetConnectionState
  title: string | null
  url: string | null
  tab_name: string | null
  snapshot_at: IsoDateTime | null
}

export interface MasterSheetSource {
  project: Project
  members: MasterSheetMember[]
  wbs_tasks: WbsTask[]
  milestones: Milestone[]
  role_charters: MasterSheetCharter[]
  deliverables: MasterSheetDeliverable[]
  /** 빌더 데이터를 가진 첫 운영가이드 항목의 섹션(정렬 순) — 없으면 []. 연락망(contacts)은 넣지 않는다(R-O6) */
  guide_sections: GuideSection[]
  landing_pages: MasterSheetLanding[]
  registration: {
    rsvp: RegistrationStats
    /** 시트 연동 행사만 — 아니면 null(RSVP 기준으로 싣는다) */
    sheet: SheetRegistrationStats | null
    sheet_link: MasterSheetSheetLink | null
  }
  /** 요청자가 pm·admin일 때만 채운다(R-M3) — 정산보드가 없으면 null(탭에는 안내 줄) */
  settlement: SettlementBoardView | null
}

export interface MasterSheetOptions {
  /** 오늘(YYYY-MM-DD · KST) — 파일 이름 · 지연 판정 */
  today: IsoDate
  /** 견적·정산 탭 포함(요청자 pm·admin) — false면 source.settlement를 읽지 않는다 */
  include_money: boolean
}

/** 서버 응답(POST /api/master-sheet) */
export interface MasterSheetResult {
  url: string
  spreadsheet_id: string
  file_name: string
  tabs: string[]
}
