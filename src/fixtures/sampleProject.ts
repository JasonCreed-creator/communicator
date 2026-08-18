// Mock 픽스처 — 가상 행사 1건. #RULE-NO-COMPANY: 전부 가상 명칭(실존 회사·실명·행사명 금지).
// 상태 머신의 각 상태·컨펌 루프·등록 파이프라인·인박스를 한 번씩 밟는 데이터셋이다.
import type {
  ActivityLogEntry,
  Approval,
  Attendee,
  ClientContact,
  ClientToken,
  Comment,
  Deliverable,
  Milestone,
  Project,
  ProjectMember,
  RsvpContact,
  UnregisteredFile,
  Version,
} from '../types/entities'
import type { UserRef } from '../types/views'

/** `/c/demo` 데모 라우트용 토큰 값 (CLAUDE.md §4 Phase 3) */
export const DEMO_TOKEN = 'demo'
/** 테스트용 — 회수된 토큰 (410 검증) */
export const REVOKED_TOKEN = 'tok-revoked'
/** 테스트용 — 만료된 토큰 (410 검증) */
export const EXPIRED_TOKEN = 'tok-expired'

export const PROJECT_ID = 'prj-stc26'

export interface MockState {
  users: UserRef[]
  current_user_id: string
  project: Project
  members: ProjectMember[]
  client_contacts: ClientContact[]
  client_tokens: ClientToken[]
  deliverables: Deliverable[]
  versions: Version[]
  approvals: Approval[]
  comments: Comment[]
  milestones: Milestone[]
  rsvp_contacts: RsvpContact[]
  attendees: Attendee[]
  activity_log: ActivityLogEntry[]
  unregistered_files: UnregisteredFile[]
}

const FIXTURE: MockState = {
  users: [
    { id: 'usr-pm', name: '김기획', email: 'pm@example.com' },
    { id: 'usr-design', name: '이디자', email: 'design@example.com' },
    { id: 'usr-ops', name: '박운영', email: 'ops@example.com' },
    { id: 'usr-reg', name: '최등록', email: 'reg@example.com' },
  ],
  current_user_id: 'usr-pm',

  project: {
    id: PROJECT_ID,
    name: '샘플 테크 컨퍼런스 2026',
    code: 'STC26',
    event_date: '2026-10-22',
    drive_root_folder_id: 'drv-root-stc26',
    slack_webhook_url: null,
    created_by: 'usr-pm',
    created_at: '2026-08-01T09:00:00.000Z',
  },

  members: [
    { project_id: PROJECT_ID, user_id: 'usr-pm', role: 'pm' },
    { project_id: PROJECT_ID, user_id: 'usr-design', role: 'design' },
    { project_id: PROJECT_ID, user_id: 'usr-ops', role: 'ops' },
    { project_id: PROJECT_ID, user_id: 'usr-reg', role: 'reg' },
  ],

  client_contacts: [
    {
      id: 'cct-001',
      project_id: PROJECT_ID,
      name: '한담당',
      org: '가상재단(발주처)',
      email: 'client@example.com',
    },
  ],

  client_tokens: [
    {
      token: DEMO_TOKEN,
      project_id: PROJECT_ID,
      contact_id: 'cct-001',
      expires_at: '2026-11-21T00:00:00.000Z', // 행사일+30일 (§6.3 기본)
      revoked_at: null,
      last_seen_at: null,
      created_at: '2026-08-10T09:00:00.000Z',
    },
    {
      token: REVOKED_TOKEN,
      project_id: PROJECT_ID,
      contact_id: 'cct-001',
      expires_at: '2026-11-21T00:00:00.000Z',
      revoked_at: '2026-08-15T09:00:00.000Z',
      last_seen_at: null,
      created_at: '2026-08-10T09:00:00.000Z',
    },
    {
      token: EXPIRED_TOKEN,
      project_id: PROJECT_ID,
      contact_id: 'cct-001',
      expires_at: '2026-08-11T00:00:00.000Z',
      revoked_at: null,
      last_seen_at: null,
      created_at: '2026-08-01T09:00:00.000Z',
    },
  ],

  // 상태 분포: pending_approval / final / draft / internal_review / changes_requested / common(internal_review)
  deliverables: [
    {
      id: 'dlv-001',
      project_id: PROJECT_ID,
      area: 'design',
      category: '키비주얼',
      title: '메인 키비주얼',
      status: 'pending_approval',
      assignee_id: 'usr-design',
      due_date: '2026-09-04',
      drive_folder_id: 'drv-dlv-001',
      requires_approval: true,
      created_at: '2026-08-05T09:00:00.000Z',
      updated_at: '2026-08-17T02:00:00.000Z',
    },
    {
      id: 'dlv-002',
      project_id: PROJECT_ID,
      area: 'design',
      category: '명찰',
      title: '참가자 명찰',
      status: 'final',
      assignee_id: 'usr-design',
      due_date: '2026-08-28',
      drive_folder_id: 'drv-dlv-002',
      requires_approval: true,
      created_at: '2026-08-03T09:00:00.000Z',
      updated_at: '2026-08-14T05:00:00.000Z',
    },
    {
      id: 'dlv-003',
      project_id: PROJECT_ID,
      area: 'design',
      category: '배너',
      title: '무대 백월 배너',
      status: 'draft',
      assignee_id: 'usr-design',
      due_date: '2026-09-18',
      drive_folder_id: 'drv-dlv-003',
      requires_approval: true,
      created_at: '2026-08-12T09:00:00.000Z',
      updated_at: '2026-08-12T09:00:00.000Z',
    },
    {
      id: 'dlv-004',
      project_id: PROJECT_ID,
      area: 'ops',
      category: '큐시트',
      title: '개막식 큐시트',
      status: 'internal_review',
      assignee_id: 'usr-ops',
      due_date: '2026-09-25',
      drive_folder_id: 'drv-dlv-004',
      requires_approval: true,
      created_at: '2026-08-08T09:00:00.000Z',
      updated_at: '2026-08-16T07:00:00.000Z',
    },
    {
      id: 'dlv-005',
      project_id: PROJECT_ID,
      area: 'ops',
      category: '시나리오',
      title: '운영 시나리오',
      status: 'changes_requested',
      assignee_id: 'usr-ops',
      due_date: '2026-09-11',
      drive_folder_id: 'drv-dlv-005',
      requires_approval: true,
      created_at: '2026-08-06T09:00:00.000Z',
      updated_at: '2026-08-15T08:00:00.000Z',
    },
    {
      id: 'dlv-006',
      project_id: PROJECT_ID,
      area: 'common',
      category: '회의록',
      title: '킥오프 회의록',
      status: 'internal_review',
      assignee_id: 'usr-pm',
      due_date: null,
      drive_folder_id: 'drv-dlv-006',
      requires_approval: false, // common 문서 — draft ↔ internal_review만 (§5)
      created_at: '2026-08-02T09:00:00.000Z',
      updated_at: '2026-08-04T09:00:00.000Z',
    },
  ],

  versions: [
    // dlv-001 메인 키비주얼: v1(원본) → v2(미리보기 포맷, 컨펌 발송 대상)
    {
      id: 'ver-001',
      deliverable_id: 'dlv-001',
      version_no: 1,
      drive_file_id: 'drv-f-001',
      file_name: '260810_STC26_키비주얼_메인 키비주얼_v1.ai',
      note: '초안 — 원본 작업 파일',
      uploaded_by: 'usr-design',
      created_at: '2026-08-10T06:00:00.000Z',
    },
    {
      id: 'ver-002',
      deliverable_id: 'dlv-001',
      version_no: 2,
      drive_file_id: 'drv-f-002',
      file_name: '260816_STC26_키비주얼_메인 키비주얼_v2.png',
      note: '내부 리뷰 반영 — 컨펌용 미리보기',
      uploaded_by: 'usr-design',
      created_at: '2026-08-16T06:00:00.000Z',
    },
    // dlv-002 명찰: v1 승인 → final
    {
      id: 'ver-003',
      deliverable_id: 'dlv-002',
      version_no: 1,
      drive_file_id: 'drv-f-003',
      file_name: '260812_STC26_명찰_참가자 명찰_v1.pdf',
      note: '컨펌용',
      uploaded_by: 'usr-design',
      created_at: '2026-08-12T06:00:00.000Z',
    },
    // dlv-004 큐시트: v1
    {
      id: 'ver-004',
      deliverable_id: 'dlv-004',
      version_no: 1,
      drive_file_id: 'drv-f-004',
      file_name: '260815_STC26_큐시트_개막식 큐시트_v1.pdf',
      note: null,
      uploaded_by: 'usr-ops',
      created_at: '2026-08-15T06:00:00.000Z',
    },
    // dlv-005 운영 시나리오: v1 → 수정요청 받음
    {
      id: 'ver-005',
      deliverable_id: 'dlv-005',
      version_no: 1,
      drive_file_id: 'drv-f-005',
      file_name: '260813_STC26_시나리오_운영 시나리오_v1.pdf',
      note: '컨펌용',
      uploaded_by: 'usr-ops',
      created_at: '2026-08-13T06:00:00.000Z',
    },
    // dlv-006 회의록: v1
    {
      id: 'ver-006',
      deliverable_id: 'dlv-006',
      version_no: 1,
      drive_file_id: 'drv-f-006',
      file_name: '260802_STC26_회의록_킥오프 회의록_v1.pdf',
      note: null,
      uploaded_by: 'usr-pm',
      created_at: '2026-08-02T09:30:00.000Z',
    },
  ],

  approvals: [
    // 진행 중: dlv-001 v2 — S7 큐에 노출
    {
      id: 'apr-001',
      deliverable_id: 'dlv-001',
      version_id: 'ver-002',
      requested_by: 'usr-pm',
      requested_at: '2026-08-17T02:00:00.000Z',
      due_at: '2026-08-21T09:00:00.000Z',
      decided_at: null,
      decision: null,
      client_comment: null,
      decided_via_token: null,
    },
    // 완료: dlv-002 승인 → final
    {
      id: 'apr-002',
      deliverable_id: 'dlv-002',
      version_id: 'ver-003',
      requested_by: 'usr-pm',
      requested_at: '2026-08-13T02:00:00.000Z',
      due_at: '2026-08-15T09:00:00.000Z',
      decided_at: '2026-08-14T05:00:00.000Z',
      decision: 'approved',
      client_comment: null,
      decided_via_token: DEMO_TOKEN,
    },
    // 완료: dlv-005 수정요청
    {
      id: 'apr-003',
      deliverable_id: 'dlv-005',
      version_id: 'ver-005',
      requested_by: 'usr-pm',
      requested_at: '2026-08-14T02:00:00.000Z',
      due_at: '2026-08-18T09:00:00.000Z',
      decided_at: '2026-08-15T08:00:00.000Z',
      decision: 'changes_requested',
      client_comment: 'VIP 동선 안내 부분을 더 구체화해 주세요.',
      decided_via_token: DEMO_TOKEN,
    },
  ],

  comments: [
    // internal — 발주처 화면에 절대 노출되면 안 되는 코멘트 (§7 DoD-3 테스트 기준점)
    {
      id: 'cmt-001',
      deliverable_id: 'dlv-001',
      author_user_id: 'usr-design',
      author_token: null,
      visibility: 'internal',
      body: '[내부] 단가 협의 전이라 인쇄 사양은 미정입니다.',
      created_at: '2026-08-16T07:00:00.000Z',
    },
    {
      id: 'cmt-002',
      deliverable_id: 'dlv-001',
      author_user_id: 'usr-pm',
      author_token: null,
      visibility: 'shared',
      body: '메인 컬러는 기존 안 대비 채도를 낮췄습니다. 확인 부탁드립니다.',
      created_at: '2026-08-17T02:10:00.000Z',
    },
    // 발주처 작성 — shared 강제 (§4 check 제약)
    {
      id: 'cmt-003',
      deliverable_id: 'dlv-005',
      author_user_id: null,
      author_token: DEMO_TOKEN,
      visibility: 'shared',
      body: 'VIP 동선 안내 부분을 더 구체화해 주세요.',
      created_at: '2026-08-15T08:00:00.000Z',
    },
  ],

  milestones: [
    { id: 'mls-001', project_id: PROJECT_ID, title: '키비주얼 확정', area: 'design', due_date: '2026-09-04', done: false },
    { id: 'mls-002', project_id: PROJECT_ID, title: '인쇄물 일괄 발주', area: 'design', due_date: '2026-09-30', done: false },
    { id: 'mls-003', project_id: PROJECT_ID, title: '운영 시나리오 확정', area: 'ops', due_date: '2026-09-11', done: false },
    { id: 'mls-004', project_id: PROJECT_ID, title: '초청장 발송', area: null, due_date: '2026-09-08', done: false },
    { id: 'mls-005', project_id: PROJECT_ID, title: '킥오프 미팅', area: null, due_date: '2026-08-04', done: true },
  ],

  rsvp_contacts: [
    { id: 'rsv-001', project_id: PROJECT_ID, name: '홍초청', org: '가상전자', title: '상무', email: 'guest1@example.com', phone: '010-0000-0001', group_tag: 'VIP', invite_status: 'accepted', invited_at: '2026-08-10T09:00:00.000Z', responded_at: '2026-08-12T09:00:00.000Z', memo: null },
    { id: 'rsv-002', project_id: PROJECT_ID, name: '정미디', org: '가상일보', title: '기자', email: 'guest2@example.com', phone: '010-0000-0002', group_tag: '미디어', invite_status: 'sent', invited_at: '2026-08-10T09:00:00.000Z', responded_at: null, memo: '사진 취재 요청' },
    { id: 'rsv-003', project_id: PROJECT_ID, name: '강일반', org: '가상소프트', title: '매니저', email: 'guest3@example.com', phone: null, group_tag: '일반', invite_status: 'declined', invited_at: '2026-08-10T09:00:00.000Z', responded_at: '2026-08-13T09:00:00.000Z', memo: null },
    { id: 'rsv-004', project_id: PROJECT_ID, name: '윤대기', org: '가상모빌리티', title: '팀장', email: 'guest4@example.com', phone: null, group_tag: '일반', invite_status: 'none', invited_at: null, responded_at: null, memo: null },
    { id: 'rsv-005', project_id: PROJECT_ID, name: '서수락', org: '가상바이오', title: '이사', email: 'guest5@example.com', phone: null, group_tag: 'VIP', invite_status: 'accepted', invited_at: '2026-08-10T09:00:00.000Z', responded_at: '2026-08-11T09:00:00.000Z', memo: null },
  ],

  attendees: [
    // RSVP 전환 1건 + 임포트 2건 (체크인 1건 포함)
    { id: 'att-001', project_id: PROJECT_ID, rsvp_contact_id: 'rsv-001', name: '홍초청', org: '가상전자', email: 'guest1@example.com', phone: '010-0000-0001', channel: 'rsvp', registered_at: '2026-08-12T09:30:00.000Z', checked_in_at: null, badge_no: 'A-001' },
    { id: 'att-002', project_id: PROJECT_ID, rsvp_contact_id: null, name: '임참관', org: '가상캐피탈', email: 'walkin1@example.com', phone: null, channel: 'import', registered_at: '2026-08-14T09:00:00.000Z', checked_in_at: '2026-08-14T23:00:00.000Z', badge_no: 'B-001' },
    { id: 'att-003', project_id: PROJECT_ID, rsvp_contact_id: null, name: '오현장', org: null, email: 'walkin2@example.com', phone: null, channel: 'onsite', registered_at: '2026-08-15T01:00:00.000Z', checked_in_at: null, badge_no: null },
  ],

  activity_log: [
    { id: 1, project_id: PROJECT_ID, actor: 'user:usr-design', action: 'version.uploaded', target_type: 'version', target_id: 'ver-002', meta: { deliverable_id: 'dlv-001', version_no: 2 }, created_at: '2026-08-16T06:00:00.000Z' },
    { id: 2, project_id: PROJECT_ID, actor: 'user:usr-pm', action: 'approval.requested', target_type: 'approval', target_id: 'apr-001', meta: { deliverable_id: 'dlv-001' }, created_at: '2026-08-17T02:00:00.000Z' },
    { id: 3, project_id: PROJECT_ID, actor: `client:${DEMO_TOKEN}`, action: 'approval.decided', target_type: 'approval', target_id: 'apr-003', meta: { decision: 'changes_requested' }, created_at: '2026-08-15T08:00:00.000Z' },
    { id: 4, project_id: PROJECT_ID, actor: 'system', action: 'deliverable.finalized', target_type: 'deliverable', target_id: 'dlv-002', meta: null, created_at: '2026-08-14T05:00:00.000Z' },
  ],

  unregistered_files: [
    {
      id: 'inb-001',
      project_id: PROJECT_ID,
      drive_file_id: 'drv-f-inbox-001',
      file_name: '리플렛 시안 수정본.pdf',
      detected_folder: '05_산출물/디자인',
      detected_at: '2026-08-17T05:00:00.000Z',
      linked_deliverable_id: null,
      dismissed: false,
    },
    {
      id: 'inb-002',
      project_id: PROJECT_ID,
      drive_file_id: 'drv-f-inbox-002',
      file_name: '조명 견적 메모.xlsx',
      detected_folder: '04_운영',
      detected_at: '2026-08-16T05:00:00.000Z',
      linked_deliverable_id: null,
      dismissed: false,
    },
  ],
}

/** 픽스처의 독립 사본 — MockProvider 인스턴스 간 상태 공유 방지 */
export function createFixtureState(): MockState {
  return structuredClone(FIXTURE)
}
