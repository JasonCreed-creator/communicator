// Mock 픽스처 — 가상 행사 1건. #RULE-NO-COMPANY: 전부 가상 명칭(실존 회사·실명·행사명 금지).
// 상태 머신의 각 상태·컨펌 루프·등록 파이프라인·인박스를 한 번씩 밟는 데이터셋이다.
import type {
  ActivityLogEntry,
  Approval,
  Attendee,
  ClientContact,
  ClientToken,
  Comment,
  Cue,
  Deliverable,
  Milestone,
  ProgramSession,
  Project,
  ProjectMember,
  RoleCharter,
  RsvpContact,
  UnregisteredFile,
  Version,
  WbsTask,
} from '../types/entities'
import type { UserRef } from '../types/views'
import { offsetToDate } from '../lib/wbs'
import { RECRUITING_WBS_TEMPLATE, ROLE_CHARTER_TEMPLATES } from './wbsTemplates'

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
  program_sessions: ProgramSession[]
  cues: Cue[]
  wbs_tasks: WbsTask[]
  role_charters: RoleCharter[]
  /** v1.3 S0 — §4 스키마에 컬럼 없음: mock은 앱 상태로 관리(Phase 4에서 확정, PROGRESS 결정 로그) */
  onboarding_completed: boolean
}

/** v1.2 가이드 문서·스펙·본문 필드 기본값 — 가이드 없이 만든 항목은 전부 null (§4) */
const NO_BRIEF = {
  brief: null,
  brief_refs: null,
  spec_size: null,
  spec_qty: null,
  spec_location: null,
  spec_type: null,
  content: null,
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
    event_type: 'recruiting', // v1.3 — 픽스처는 RSVP 파이프라인을 쓰는 모객형
    // v1.2 행사개요 — S9 §행사개요 소스 (전부 가상 명칭)
    theme: '연결, 다음 단계로',
    venue: '가상컨벤션센터 3F 그랜드볼룸',
    mc_name: '진행자 조무대',
    overview_items: [
      { label: '참가 대상', value: '파트너사·미디어·일반 참관객 300명' },
      { label: '주차 안내', value: '행사장 지하 주차 3시간 지원 (등록데스크 확인)' },
    ],
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

  // 상태 분포: pending_approval / final / draft / internal_review / changes_requested /
  //           common(internal_review) / requested(v1.2 가이드) / ops 존운영(content)
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
      ...NO_BRIEF, // 가이드 없이 만든 항목 — v1.2 필드 전부 null 허용 사례
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
      ...NO_BRIEF,
      // 스펙 완비 — S9 제작물 리스트 표의 확정본 행
      spec_size: '90×120mm',
      spec_qty: 350,
      spec_location: '등록데스크 배부',
      spec_type: 'PET 카드',
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
      ...NO_BRIEF,
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
      ...NO_BRIEF,
      // S9 ③존별 운영 렌더 소스 (마크다운)
      content:
        '### 무대 운영\n- 개막 30분 전 리허설 완료, 큐시트 기준 진행\n- 조명·음향 콜은 무대감독 단일 채널로 통일',
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
      ...NO_BRIEF, // content 미작성 — S9 존운영 섹션 진행률 미충족 사례
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
      ...NO_BRIEF,
      created_at: '2026-08-02T09:00:00.000Z',
      updated_at: '2026-08-04T09:00:00.000Z',
    },
    // v1.2 가이드 발행 상태 — PM 가이드 문서(브리프+스펙 완비), 산출물 없음 (DoD-7 기준점)
    {
      id: 'dlv-007',
      project_id: PROJECT_ID,
      area: 'design',
      category: '현수막',
      title: '메인 게이트 현수막',
      status: 'requested',
      assignee_id: 'usr-design',
      due_date: '2026-09-15',
      drive_folder_id: 'drv-dlv-007',
      requires_approval: true,
      brief: '메인 게이트 외벽용 대형 현수막 시안 요청. 키비주얼 확정안 기반으로 행사명·일자·장소 표기.',
      brief_refs: ['https://example.com/refs/keyvisual-final'],
      spec_size: '23000×5000mm',
      spec_qty: 1,
      spec_location: '메인 게이트 외벽',
      spec_type: '현수막',
      content: null,
      created_at: '2026-08-18T09:00:00.000Z',
      updated_at: '2026-08-18T09:00:00.000Z',
    },
    // ops 존운영 항목 — content로 S9 ③존별 운영 섹션 구성
    {
      id: 'dlv-008',
      project_id: PROJECT_ID,
      area: 'ops',
      category: '존운영',
      title: '등록존 운영',
      status: 'draft',
      assignee_id: 'usr-ops',
      due_date: '2026-10-01',
      drive_folder_id: 'drv-dlv-008',
      requires_approval: true,
      ...NO_BRIEF,
      content:
        '### 등록존\n- 위치: 3F 로비 (등록데스크 4석)\n- 운영 인력: 4명 (오전 피크 2명 증원)\n- VIP는 별도 라인으로 안내 후 배지 즉시 발급',
      created_at: '2026-08-14T09:00:00.000Z',
      updated_at: '2026-08-14T09:00:00.000Z',
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
    { id: 5, project_id: PROJECT_ID, actor: 'user:usr-pm', action: 'deliverable.requested', target_type: 'deliverable', target_id: 'dlv-007', meta: { assignee_id: 'usr-design' }, created_at: '2026-08-18T09:00:00.000Z' },
  ],

  // v1.2 프로그램표 — S9 §프로그램 정형 소스 (sort_order 순)
  program_sessions: [
    { id: 'pgs-001', project_id: PROJECT_ID, section: '오전', start_time: '09:30', end_time: '10:00', title: '등록·리셉션', speaker_name: null, speaker_title: null, speaker_org: null, note: null, sort_order: 1 },
    { id: 'pgs-002', project_id: PROJECT_ID, section: '오전', start_time: '10:00', end_time: '10:20', title: '개회사', speaker_name: '오대표', speaker_title: '대표', speaker_org: '가상재단', note: null, sort_order: 2 },
    { id: 'pgs-003', project_id: PROJECT_ID, section: '오전', start_time: '10:20', end_time: '11:10', title: '기조연설 — 연결의 다음 단계', speaker_name: '한석학', speaker_title: '교수', speaker_org: '가상대학교', note: '기조', sort_order: 3 },
    { id: 'pgs-004', project_id: PROJECT_ID, section: '오후', start_time: '14:00', end_time: '14:50', title: '파트너 세션 — 산업 적용 사례', speaker_name: '문리더', speaker_title: '본부장', speaker_org: '가상소프트', note: '파트너 연사', sort_order: 4 },
    { id: 'pgs-005', project_id: PROJECT_ID, section: '오후', start_time: '15:00', end_time: '16:00', title: '패널 토론', speaker_name: null, speaker_title: null, speaker_org: null, note: '패널 4인', sort_order: 5 },
  ],

  // v1.3 큐시트 — dlv-004(개막식 큐시트)의 정형 큐 (sort_order 순, 콘솔 3채널·대본 전문)
  cues: [
    { id: 'cue-001', deliverable_id: 'dlv-004', cue_no: 'C01', time_at: '09:20', segment: '사전', body: '### 사전 안내방송\n잠시 후 개막식이 시작됩니다. 좌석에 착석해 주시기 바랍니다.', console_audio: 'BGM 페이드아웃', console_light: '객석 50%', console_screen: '대기 화면', sort_order: 1 },
    { id: 'cue-002', deliverable_id: 'dlv-004', cue_no: 'C02', time_at: '09:58', segment: '오프닝', body: '오프닝 타이틀 영상 재생 (90초)', console_audio: '영상 사운드', console_light: '암전', console_screen: '오프닝 영상', sort_order: 2 },
    { id: 'cue-003', deliverable_id: 'dlv-004', cue_no: 'C03', time_at: '10:00', segment: 'MC', body: '### MC 오프닝 멘트\n안녕하십니까. 연결, 다음 단계로 — 오늘 이 자리를 찾아주신 여러분을 진심으로 환영합니다.', console_audio: 'MC 마이크 온', console_light: '무대 풀', console_screen: '행사 타이틀', sort_order: 3 },
    { id: 'cue-004', deliverable_id: 'dlv-004', cue_no: 'C04', time_at: '10:02', segment: '전환', body: '개회사 연사 무대 이동 — MC 소개 멘트 후 등단', console_audio: '등장 SFX', console_light: '연단 스팟', console_screen: '연사 프로필', sort_order: 4 },
  ],

  // v1.4 WBS — createFixtureState()에서 모객형 37태스크를 event_date 기준으로 전개해 채움
  wbs_tasks: [],

  // v1.4 R&R — createFixtureState()에서 모객형 템플릿으로 시드
  role_charters: [],

  onboarding_completed: true, // 픽스처 행사는 온보딩 완료 상태에서 시작 (S0 테스트는 mock 헬퍼로 리셋)

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
  const state = structuredClone(FIXTURE)
  // v1.4 — 모객형 37태스크 전개(event_date 기준). 리터럴 중복 대신 정본 템플릿에서 파생.
  state.wbs_tasks = RECRUITING_WBS_TEMPLATE.map((tpl, i) => ({
    id: `wbs-${String(i + 1).padStart(3, '0')}`,
    project_id: PROJECT_ID,
    phase_no: tpl.phase_no,
    phase_name: tpl.phase_name,
    code: tpl.code,
    title: tpl.title,
    offset_start: tpl.offset_start,
    offset_end: tpl.offset_end,
    start_date: offsetToDate(FIXTURE.project.event_date!, tpl.offset_start),
    end_date: offsetToDate(FIXTURE.project.event_date!, tpl.offset_end),
    role: tpl.role,
    origin_role: tpl.origin_role,
    status: 'todo',
    done_at: null,
    linked_deliverable_id: null,
    note: null,
    sort_order: i + 1,
  }))
  // 데모용 상태 분포: 1.1·1.2 완료, 1.3 진행 중, 2.8 제작물 ↔ dlv-007(현수막 가이드) 연결
  const byCode = new Map(state.wbs_tasks.map((task) => [task.code, task]))
  byCode.get('1.1')!.status = 'done'
  byCode.get('1.1')!.done_at = '2026-09-12T09:00:00.000Z'
  byCode.get('1.2')!.status = 'done'
  byCode.get('1.2')!.done_at = '2026-09-17T09:00:00.000Z'
  byCode.get('1.3')!.status = 'doing'
  byCode.get('2.8')!.linked_deliverable_id = 'dlv-007'
  state.role_charters = ROLE_CHARTER_TEMPLATES.recruiting.map((tpl, i) => ({
    id: `rrc-${String(i + 1).padStart(3, '0')}`,
    project_id: PROJECT_ID,
    role: tpl.role,
    origin_role: tpl.origin_role,
    title: tpl.title,
    items: [...tpl.items],
  }))
  return state
}
