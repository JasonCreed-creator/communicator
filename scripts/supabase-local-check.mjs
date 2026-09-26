#!/usr/bin/env node
// 로컬 Postgres 16에서 setup.sql·seed.sql·RLS·트리거 가드를 증명한다 (서버 0 — 설계서 §8 DoD 7, DoD 26 RLS 거부 3종).
//   LOCAL_PG="host=/tmp/pg-communicator port=54329 user=postgres" npm run supabase:check
// 흐름: 새 DB → test/local-shim.sql → setup.sql ×2 → seed.sql ×2 → 시나리오 검사(각각 독립 트랜잭션, 롤백).
// 출력은 한국어 ✓/✗ 목록. 하나라도 ✗면 exit 1.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const conn = process.env.LOCAL_PG ?? 'host=/tmp/pg-communicator port=54329 user=postgres'
const dbName = process.env.LOCAL_PG_DB ?? 'comm_check'
const keepDb = process.argv.includes('--keep')

function seedUuid(id) {
  const hex = createHash('md5').update('communicator-seed:' + id).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function psql(args, { db = dbName, input, allowFail = false } = {}) {
  const r = spawnSync('psql', [conn + ` dbname=${db}`, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At', ...args], {
    input,
    encoding: 'utf8',
  })
  if (r.status !== 0 && !allowFail) {
    throw new Error(`psql 실패 (${args.join(' ')}):\n${r.stderr}`)
  }
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

function hasPsql() {
  const r = spawnSync('psql', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail.split('\n')[0]}` : ''}`)
}

// 시나리오: sql을 한 트랜잭션에서 실행하고 마지막에 rollback. expect='ok'면 성공, 'error'면 실패(+match)여야 통과.
function scenario(name, sql, { expect = 'ok', match, role, sub } = {}) {
  const pre = [
    'begin;',
    role ? `set local role ${role};` : '',
    sub ? `set local request.jwt.claim.sub to '${sub}';` : '',
    sub ? `set local request.jwt.claim.role to '${role ?? 'authenticated'}';` : '',
  ].join('\n')
  const r = psql(['-f', '-'], { input: `${pre}\n${sql}\nrollback;`, allowFail: true })
  if (expect === 'ok') {
    record(name, r.ok, r.err)
    return r.out
  }
  const matched = !r.ok && (!match || new RegExp(match).test(r.err))
  record(name, matched, r.ok ? '실패해야 하는데 성공함' : r.err)
  return r.out
}

async function main() {
  if (!hasPsql()) {
    console.log('psql이 없어 로컬 검증을 건너뜁니다 (Postgres 16 클라이언트 필요).')
    process.exit(0)
  }
  // 접속 가능?
  const ping = spawnSync('psql', [conn + ' dbname=postgres', '-Atc', 'select 1'], { encoding: 'utf8' })
  if (ping.status !== 0) {
    console.log(`로컬 Postgres에 접속할 수 없어 건너뜁니다: ${ping.stderr.trim()}`)
    process.exit(0)
  }

  const setupSql = join(root, 'supabase', 'setup.sql')
  const seedSql = join(root, 'supabase', 'seed.sql')
  const shimSql = join(root, 'supabase', 'test', 'local-shim.sql')

  // 0. 새 DB
  psql(['-c', `drop database if exists ${dbName}`], { db: 'postgres' })
  psql(['-c', `create database ${dbName}`], { db: 'postgres' })
  record('빈 DB 생성', true)

  // 1. shim → setup ×2 → seed ×2
  let r = psql(['-f', shimSql], { allowFail: true }); record('local-shim.sql (auth 스키마·롤 심)', r.ok, r.err)
  r = psql(['-f', setupSql], { allowFail: true }); record('setup.sql 1회 실행', r.ok, r.err)
  r = psql(['-f', setupSql], { allowFail: true }); record('setup.sql 2회 실행 — 멱등(§8 DoD 7)', r.ok, r.err)
  const objBefore = psql(['-c', `select count(*) from pg_tables where schemaname='public'`]).out
  const rlsOff = psql(['-c', `select string_agg(tablename, ',') from pg_tables t where schemaname='public' and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t.tablename and c.relrowsecurity)`]).out
  record(`RLS 전 표 활성 (public ${objBefore}개)`, rlsOff === '', `RLS 꺼진 표: ${rlsOff}`)
  r = psql(['-f', seedSql], { allowFail: true }); record('seed.sql 1회 실행', r.ok, r.err)
  const countSql = `select (select count(*) from projects)||'/'||(select count(*) from deliverables)||'/'||(select count(*) from attendees)||'/'||(select count(*) from activity_log)`
  const c1 = psql(['-c', countSql]).out
  r = psql(['-f', seedSql], { allowFail: true }); record('seed.sql 2회 실행', r.ok, r.err)
  const c2 = psql(['-c', countSql]).out
  record(`seed 멱등 — 행 수 불변 (projects/deliverables/attendees/activity = ${c1})`, c1 === c2, `2회 후 ${c2}`)

  // 2. 시드 사용자를 auth.users에 가입시켜 프로필과 연결(트리거 검증 겸)
  const users = { pm: 'pm@example.com', design: 'design@example.com', ops: 'ops@example.com', reg: 'reg@example.com' }
  const authId = {}
  for (const [k, email] of Object.entries(users)) {
    authId[k] = psql(['-c', `insert into auth.users (email) values ('${email}') returning id`]).out
  }
  const linked = psql(['-c', `select count(*) from profiles where auth_user_id is not null`]).out
  record('auth 가입 시 이메일로 기존 프로필 자동 연결(4명)', linked === '4', `연결 ${linked}명`)
  const pmRole = psql(['-c', `select app_role from profiles where auth_user_id = '${authId.pm}'`]).out
  record('연결 후 기존 app_role 보존 (pm=sales)', pmRole === 'sales', pmRole)

  const PRJ = seedUuid('prj-stc26')          // ① 기본 샘플(모객형) — 4명 전부 멤버
  const PRJ_CLOSED = seedUuid('prj-ai-summit') // ④ 종료 — pm만 멤버
  const PRJ_DRAFT = seedUuid('prj-forum-h2')   // ③ 세팅 미완료

  // 3. RLS 거부 3종 (DoD 26)
  const staffQuotes = scenario('RLS① staff(app_role) → quotes 조회 0행', `select count(*) from quotes;`, { role: 'authenticated', sub: authId.design })
  record('RLS① staff → quotes 0행 확인', staffQuotes === '0', `보인 행 ${staffQuotes}`)
  scenario('RLS① staff → quotes insert 거부', `insert into quotes (title, input, breakdown, total_amount) values ('x','{}','{}',0);`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'row-level security' })
  const salesQuotes = scenario('RLS① sales(pm 계정) → quotes 조회 가능', `select count(*) from quotes;`, { role: 'authenticated', sub: authId.pm })
  record('RLS① sales → quotes 6행', salesQuotes === '6', `보인 행 ${salesQuotes}`)
  const nonMember = scenario('RLS② 비멤버 → 종료 행사(prj-ai-summit) 조회 0행', `select count(*) from projects where id = '${PRJ_CLOSED}';`, { role: 'authenticated', sub: authId.design })
  record('RLS② 비멤버 → project 0행 확인', nonMember === '0', `보인 행 ${nonMember}`)
  const memberSees = scenario('RLS② 멤버 → 자기 행사 목록', `select count(*) from projects;`, { role: 'authenticated', sub: authId.design })
  record('RLS② design 멤버 행사 수 = 멤버십 수', memberSees === psql(['-c', `select count(*) from project_members where user_id = (select id from profiles where auth_user_id='${authId.design}')`]).out, `보인 행 ${memberSees}`)
  scenario('RLS③ anon(토큰 경로 롤) → quotes 권한 없음', `select count(*) from quotes;`, { role: 'anon', expect: 'error', match: 'permission denied' })
  scenario('RLS③ anon → deliverables 권한 없음', `select count(*) from deliverables;`, { role: 'anon', expect: 'error', match: 'permission denied' })
  scenario('RLS③ anon → settlement_items 권한 없음 (§19.7)', `select count(*) from settlement_items;`, { role: 'anon', expect: 'error', match: 'permission denied' })

  // 4. 역할-영역 (§6.1)
  scenario('역할-영역: reg의 deliverable 생성 거부', `insert into deliverables (project_id, area, category, title) values ('${PRJ}','design','키비주얼','x');`,
    { role: 'authenticated', sub: authId.reg, expect: 'error', match: 'row-level security' })
  scenario('역할-영역: design의 ops 항목 생성 거부', `insert into deliverables (project_id, area, category, title) values ('${PRJ}','ops','동선','x');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'row-level security' })
  scenario('역할-영역: design의 design 항목 생성 허용', `insert into deliverables (project_id, area, category, title) values ('${PRJ}','design','키비주얼','x');`,
    { role: 'authenticated', sub: authId.design })
  scenario('역할-영역: design의 컨펌 발송(approvals insert) 거부 — pm만', `insert into approvals (deliverable_id, version_id) select id, null from deliverables where project_id='${PRJ}' limit 1;`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'row-level security' })
  scenario('권한: 로그인 사용자의 app_role 자가 승격 거부(컬럼 권한)', `update profiles set app_role='admin' where auth_user_id='${authId.design}';`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'permission denied' })
  scenario('권한: 로그인 사용자의 자기 직함 수정 허용', `update profiles set title='x' where auth_user_id='${authId.design}';`,
    { role: 'authenticated', sub: authId.design })

  // 5. 트리거 가드
  scenario('§5 전이 가드: draft → final 거부', `update deliverables set status='final' where id = (select id from deliverables where status='draft' limit 1);`,
    { expect: 'error', match: 'STATUS_TRANSITION_NOT_ALLOWED' })
  scenario('§5 전이 가드: draft → internal_review 허용', `update deliverables set status='internal_review' where id = (select id from deliverables where status='draft' limit 1);`)
  scenario('§5 전이 가드: requested → pending_approval(주최형 첫 제출) 허용', `update deliverables set status='pending_approval' where id = (select id from deliverables where status='requested' limit 1);`)
  scenario('견적 잠금: 확정 견적 total_amount 변경 거부', `update quotes set total_amount = total_amount + 1 where is_final;`,
    { expect: 'error', match: 'QUOTE_LOCKED' })
  scenario('견적 잠금: 확정 견적 status 변경(archived)은 허용', `update quotes set status='archived' where is_final;`)
  scenario('정산 R-S4: has_cost=false 버킷(ld)에 발주액 거부', `insert into settlement_items (board_id, bucket_id, title, ordered_amount) select board_id, id, 'x', 1000 from settlement_buckets where code='ld' limit 1;`,
    { expect: 'error', match: 'SETTLEMENT_BUCKET_HAS_NO_COST' })
  scenario('정산 R-S4: has_cost=true 버킷(s1)에 발주액 허용', `insert into settlement_items (board_id, bucket_id, title, ordered_amount) select board_id, id, 'x', 1000 from settlement_buckets where code='s1' limit 1;`)
  scenario('종료 행사 가드: authenticated pm의 마일스톤 추가 거부', `insert into milestones (project_id, title, due_date) values ('${PRJ_CLOSED}','x','2026-12-01');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'PROJECT_CLOSED' })
  scenario('종료 행사 가드: 서비스 경로는 통과', `insert into milestones (project_id, title, due_date) values ('${PRJ_CLOSED}','x','2026-12-01');`)
  scenario('종료 행사 가드: 진행 중 행사는 pm 추가 허용', `insert into milestones (project_id, title, due_date) values ('${PRJ}','x','2026-12-01');`,
    { role: 'authenticated', sub: authId.pm })
  scenario('onboarded_at 불변: 완료 시각 되돌리기 거부', `update projects set onboarded_at = null where id='${PRJ}';`,
    { expect: 'error', match: 'ONBOARDED_AT_IMMUTABLE' })
  scenario('onboarded_at: 미완료 → 완료 기록 허용', `update projects set onboarded_at = now() where id='${PRJ_DRAFT}';`)
  const vno = scenario('version_no 자동 증가', `insert into versions (deliverable_id, drive_file_id, file_name) select id, 'drv-x', 'x.pdf' from deliverables where id = (select deliverable_id from versions group by deliverable_id order by max(version_no) desc limit 1) returning version_no;`)
  record('version_no = 기존 max+1', Number(vno) > 1, `version_no=${vno}`)
  // 주의: `case … else 1/0` 같은 상수식은 플래너가 미리 계산해 항상 터진다 — 단언은 DO 블록으로
  const assertSql = (cond) => `do $$ begin if not (${cond}) then raise exception 'ASSERT_FAILED: ${cond.replace(/'/g, "''")}'; end if; end $$;`
  scenario('생성자=pm 자동: 새 행사 insert 후 멤버십 생성(insert…returning 포함)', `insert into projects (name, code) values ('x','X-CODE-1') returning id;
${assertSql(`exists (select 1 from project_members m join projects p on p.id = m.project_id where p.code='X-CODE-1' and m.role='pm')`)}`, { role: 'authenticated', sub: authId.pm })
  scenario('허용 도메인: 도메인 제한 후 다른 도메인 가입 거부', `update app_config set allowed_email_domains = array['example.com'] where id=1; insert into auth.users (email) values ('x@other.org');`,
    { expect: 'error', match: 'AUTH_DOMAIN_NOT_ALLOWED' })
  scenario('허용 도메인: 허용 도메인 가입은 통과 + 프로필 자동 생성(staff)', `update app_config set allowed_email_domains = array['example.com'] where id=1; insert into auth.users (email) values ('new@example.com');
${assertSql(`(select app_role from profiles where email='new@example.com') = 'staff'`)}`)
  scenario('코멘트: 발주처 작성분(author_token)은 shared 강제(check)', `insert into comments (deliverable_id, author_token, visibility, body) select deliverable_id, decided_via_token, 'internal', 'x' from approvals where decided_via_token is not null limit 1;`,
    { expect: 'error', match: 'comments_client_shared' })

  // 5b. RPC — 내부 경로(한 트랜잭션 다단계 쓰기)
  const DEMO_TOKEN = seedUuid('demo')          // /c/demo — 픽스처 발주처 토큰
  const REVOKED_TOKEN = seedUuid('tok-revoked')
  const PARTNER_TOKEN = seedUuid('demo-partner')
  scenario('RPC add_member: pm이 새 담당자 배정 → 프로필 생성 + 멤버 + 초대 이력', `select add_member('${PRJ}', '신규담당', 'newbie@example.com', 'design', '대리', '010-1');
${`do $$ begin if not exists (select 1 from project_members m join profiles p on p.id=m.user_id where m.project_id='${PRJ}' and lower(p.email)='newbie@example.com' and m.role='design') then raise exception 'ASSERT_FAILED: member'; end if; if not exists (select 1 from project_invites where project_id='${PRJ}' and lower(email)='newbie@example.com') then raise exception 'ASSERT_FAILED: invite'; end if; end $$;`}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC add_member: 같은 사람 중복 배정 409', `select add_member('${PRJ}', '김기획', 'pm@example.com', 'design');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '이미 이 행사의 담당자' })
  scenario('RPC add_member: design은 403', `select add_member('${PRJ}', 'x', 'x@example.com', 'reg');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM 전용' })
  scenario('RPC remove_member: 마지막 PM 삭제 409', `select remove_member('${PRJ}', (select id from profiles where email='pm@example.com'));`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '마지막 PM' })
  scenario('RPC remove_person: 배정 있는 사람 삭제 409(행사명 포함)', `select remove_person((select id from profiles where email='design@example.com'));`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '배정된 행사가 있어' })
  scenario('RPC complete_onboarding: 이미 완료 행사 409', `select complete_onboarding('${PRJ}', '[]'::jsonb);`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '이미 온보딩이 완료' })
  scenario('RPC complete_onboarding: 미완료 행사(pm) → onboarded_at 기록 + 태스크 적재', `select complete_onboarding('${PRJ_DRAFT}', '[{"id":"${seedUuid('chk-task-1')}","phase_no":1,"phase_name":"사전착수","code":"1.1","title":"x","offset_start":-40,"offset_end":-38,"role":"pm","sort_order":1}]'::jsonb);
${`do $$ begin if (select onboarded_at from projects where id='${PRJ_DRAFT}') is null then raise exception 'ASSERT_FAILED: onboarded_at'; end if; if (select count(*) from wbs_tasks where project_id='${PRJ_DRAFT}') <> 1 then raise exception 'ASSERT_FAILED: tasks'; end if; end $$;`}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC transition_deliverable: draft → internal_review(design 자기 영역) 허용', `select transition_deliverable((select id from deliverables where project_id='${PRJ}' and status='draft' and area='design' limit 1), 'internal_review');`,
    { role: 'authenticated', sub: authId.design })
  scenario('RPC transition_deliverable: internal_review → draft 코멘트 없이 422', `select transition_deliverable((select id from deliverables where project_id='${PRJ}' and status='internal_review' limit 1), 'draft');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '반려 사유 코멘트' })
  scenario('RPC transition_deliverable: draft → final 409(전이표 밖)', `select transition_deliverable((select id from deliverables where project_id='${PRJ}' and status='draft' limit 1), 'final');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'STATUS_TRANSITION_NOT_ALLOWED|허용되지 않는' })
  scenario('RPC upload_version: changes_requested 항목 업로드 → draft 자동 전이 + version_no 증가', `select upload_version((select id from deliverables where project_id='${PRJ}' and status='changes_requested' limit 1), 'x.pdf');
${`do $$ begin if not exists (select 1 from deliverables where project_id='${PRJ}' and status='draft' and id in (select deliverable_id from versions where file_name='x.pdf')) then raise exception 'ASSERT_FAILED: auto draft'; end if; end $$;`}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC request_approval: internal_review + pdf → pending_approval + approvals 생성', `select request_approval(d.id, v.id) from deliverables d join versions v on v.deliverable_id = d.id where d.project_id='${PRJ}' and d.status='internal_review' and lower(v.file_name) like '%.pdf' limit 1;`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC request_approval: design은 403', `select request_approval(d.id, v.id) from deliverables d join versions v on v.deliverable_id = d.id where d.project_id='${PRJ}' and d.status='internal_review' limit 1;`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM 전용' })
  scenario('RPC finalize_quote: 미확정 최신 견적 확정 → 다른 final archived + 상호 링크', `select finalize_quote((select id from quotes where project_id is not null and not is_final and superseded_by is null limit 1));`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC finalize_quote: staff는 403', `select finalize_quote((select id from quotes limit 1));`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: '영업·관리자' })

  // 5c. RPC — 토큰 경로(anon): 화이트리스트만, 금액 키 0건
  const queue = scenario('RPC client_queue(anon, 데모 토큰) → 큐·이력 JSON', `select client_queue('${DEMO_TOKEN}');`, { role: 'anon' })
  record('client_queue 응답에 금액·정산 키 0건(§19.7)', queue.length > 0 && !/total_amount|breakdown|settlement|contract_amount|ordered_amount|actual_amount|markup|margin/.test(queue))
  record('client_queue 응답에 internal 코멘트 0건(C-1)', !/"visibility": ?"internal"/.test(queue))
  scenario('RPC client_queue: 회수 토큰 410', `select client_queue('${REVOKED_TOKEN}');`, { role: 'anon', expect: 'error', match: 'GONE|만료' })
  scenario('RPC client_queue: 없는 토큰 404', `select client_queue('${seedUuid('nope')}');`, { role: 'anon', expect: 'error', match: 'NOT_FOUND|유효하지' })
  const status = scenario('RPC client_status(anon) → 담당자·진행률·확정본', `select client_status('${DEMO_TOKEN}');`, { role: 'anon' })
  record('client_status 응답에 금액 키 0건 + staff 노출(3.18.1)', /"staff"/.test(status) && !/total_amount|breakdown|settlement|contract_amount/.test(status))
  const pendingApprovals = psql(['-c', `select a.id from approvals a join deliverables d on d.id=a.deliverable_id where d.project_id='${PRJ}' and a.decided_at is null and d.status='pending_approval' order by a.requested_at`]).out.split('\n').filter(Boolean)
  record('데모 행사에 미결 컨펌 1건 이상(시나리오 전제 — 시나리오마다 롤백되므로 같은 건을 재사용)', pendingApprovals.length >= 1, `미결 ${pendingApprovals.length}건`)
  scenario('RPC client_decide: 수정요청 코멘트 없이 422', `select client_decide('${DEMO_TOKEN}', '${pendingApprovals[0]}', 'changes_requested');`,
    { role: 'anon', expect: 'error', match: '코멘트는 필수' })
  scenario('RPC client_decide: 승인 → approved→final + 연결 WBS done + shared 코멘트 없음', `select client_decide('${DEMO_TOKEN}', '${pendingApprovals[0]}', 'approved');
reset role;
${`do $$ begin if not exists (select 1 from approvals a join deliverables d on d.id=a.deliverable_id where d.project_id='${PRJ}' and a.decision='approved' and d.status='final' and a.decided_via_token='${DEMO_TOKEN}') then raise exception 'ASSERT_FAILED: final'; end if; end $$;`}`,
    { role: 'anon' })
  scenario('RPC client_decide: 수정요청(코멘트) → changes_requested + shared 코멘트(author_token)', `select client_decide('${DEMO_TOKEN}', '${pendingApprovals[0]}', 'changes_requested', '색을 바꿔 주세요');
reset role;
${`do $$ begin if not exists (select 1 from comments where author_token='${DEMO_TOKEN}' and visibility='shared' and body='색을 바꿔 주세요') then raise exception 'ASSERT_FAILED: comment'; end if; end $$;`}`,
    { role: 'anon' })
  const portal = scenario('RPC partner_portal(anon, 데모 파트너 토큰)', `select partner_portal('${PARTNER_TOKEN}');`, { role: 'anon' })
  record('partner_portal 응답에 contract_amount·price·타 파트너 키 0건(R-H2·R-H3)', portal.length > 0 && !/contract_amount|"price"|tier_id|settlement|total_amount/.test(portal))
  const ownItem = psql(['-c', `select d.id from deliverables d join partner_tokens t on t.partner_id = d.partner_id where t.token='${PARTNER_TOKEN}' and d.status in ('requested','changes_requested') limit 1`]).out
  const otherItem = psql(['-c', `select d.id from deliverables d join partner_tokens t on t.partner_id <> d.partner_id where t.token='${PARTNER_TOKEN}' and d.partner_id is not null limit 1`]).out
  scenario('RPC partner_submit: 텍스트 제출 → pending_approval + versions 이력', `select partner_submit('${PARTNER_TOKEN}', '${ownItem}', '{"text":"제출 본문"}'::jsonb);
reset role;
${`do $$ begin if (select status from deliverables where id='${ownItem}') <> 'pending_approval' then raise exception 'ASSERT_FAILED: status'; end if; if not exists (select 1 from versions where deliverable_id='${ownItem}' and note='파트너 텍스트 제출') then raise exception 'ASSERT_FAILED: version'; end if; end $$;`}`,
    { role: 'anon' })
  scenario('RPC partner_submit: 다른 파트너 항목 403', `select partner_submit('${PARTNER_TOKEN}', '${otherItem}', '{"text":"x"}'::jsonb);`,
    { role: 'anon', expect: 'error', match: '이 파트너가 제출할' })
  const landingId = psql(['-c', `select l.id from landing_pages l join projects p on p.id = l.project_id where l.submit_target='registration' and l.status <> 'closed' and p.status='active' limit 1`]).out
  const leadValues = psql(['-c', `select (jsonb_build_object('f_' || (f->>'id'), '홍길동') || (select coalesce(jsonb_object_agg('c_' || (c->>'id'), 'on'), '{}'::jsonb) from jsonb_array_elements(l.consents) c where (c->>'required')::boolean))::text from landing_pages l, jsonb_array_elements(l.form_fields) f where l.id='${landingId}' and (f->>'label') like '%성함%' limit 1`]).out
  scenario('RPC submit_landing_lead(anon): 성함 없으면 422', `select submit_landing_lead('${landingId}', '{}'::jsonb);`,
    { role: 'anon', expect: 'error', match: '성함은 필수' })
  scenario('RPC submit_landing_lead(anon): 정상 제출 → attendees(channel rsvp) + 지표', `select submit_landing_lead('${landingId}', '${leadValues.replace(/'/g, "''")}'::jsonb);
reset role;
${`do $$ begin if not exists (select 1 from attendees where name='홍길동' and channel='rsvp') then raise exception 'ASSERT_FAILED: lead'; end if; end $$;`}`,
    { role: 'anon' })
  scenario('RPC anon은 내부 RPC(add_member) 실행 불가', `select add_member('${PRJ}', 'x', 'y@example.com', 'reg');`,
    { role: 'anon', expect: 'error', match: 'permission denied' })

  // 5d. RPC — 시트 감지·반영(§24.3)
  const SHEET_PRJ = psql(['-c', `select project_id from sheet_connections limit 1`]).out
  if (SHEET_PRJ) {
    const SHEET_PM = authId.pm
    scenario('RPC check_sheet_updates: 감지만(참관객 불변) + 상태 stale/connected', `select check_sheet_updates('${SHEET_PRJ}');`, { role: 'authenticated', sub: SHEET_PM })
    scenario('RPC apply_sheet_diff: 낡은 snapshot_version 409', `select apply_sheet_diff('${SHEET_PRJ}', -1);`,
      { role: 'authenticated', sub: SHEET_PM, expect: 'error', match: '다른 담당자가 이미 반영' })
    scenario('RPC apply_sheet_diff: 현재 버전으로 반영 → 버전 +1, removed는 하드 삭제 없음', `select apply_sheet_diff('${SHEET_PRJ}', (select snapshot_version from sheet_connections where project_id='${SHEET_PRJ}'));
${`do $$ begin if (select snapshot_version from sheet_connections where project_id='${SHEET_PRJ}') < 1 then raise exception 'ASSERT_FAILED'; end if; end $$;`}`,
      { role: 'authenticated', sub: SHEET_PM })
    scenario('RPC apply_sheet_diff: design은 403(pm·reg만)', `select apply_sheet_diff('${SHEET_PRJ}', 1);`,
      { role: 'authenticated', sub: authId.design, expect: 'error', match: '등록 데이터 권한' })
  }

  // 5e. RPC — 행사 하드 삭제 (§4-1c · DataProvider v13 deleteProject)
  // 권한 축이 프로젝트 역할(pm)이 아니라 전역 app_role이므로, "행사의 pm이지만 admin은 아닌" pm 계정과
  // 대비되는 admin 계정을 따로 만든다(승격은 서비스 경로 SQL — app.promote_admin).
  psql(['-c', `select app.promote_admin('admin@example.com', '관리자')`])
  authId.admin = psql(['-c', `insert into auth.users (email) values ('admin@example.com') returning id`]).out
  record('delete_project 전제: admin 프로필 승격 + auth 연결',
    psql(['-c', `select app_role from profiles where auth_user_id='${authId.admin}'`]).out === 'admin')
  const del = {
    vendors: psql(['-c', `select count(*) from vendors`]).out,
    profiles: psql(['-c', `select count(*) from profiles`]).out,
    quotes: psql(['-c', `select count(*) from quotes`]).out,
    imports: psql(['-c', `select count(*) from quote_imports`]).out,
    quotesFree: psql(['-c', `select count(*) from quotes where project_id is null`]).out,
    quotesPrj: psql(['-c', `select count(*) from quotes where project_id='${PRJ}'`]).out,
  }
  record(`delete_project 전제: 삭제 대상 행사에 연결 견적 ${del.quotesPrj}건(0이면 견적 보존 검사가 무의미)`, Number(del.quotesPrj) > 0)
  scenario('RPC delete_project: admin 삭제 → 행사·하위(항목·참관객·WBS·활동 로그) 전부 사라짐', `select delete_project('${PRJ}');
reset role;
${assertSql(`not exists (select 1 from projects where id='${PRJ}')`)}
${assertSql(`(select count(*) from deliverables where project_id='${PRJ}') = 0`)}
${assertSql(`(select count(*) from attendees where project_id='${PRJ}') = 0`)}
${assertSql(`(select count(*) from wbs_tasks where project_id='${PRJ}') = 0`)}
${assertSql(`(select count(*) from activity_log where project_id='${PRJ}') = 0`)}`,
    { role: 'authenticated', sub: authId.admin })
  scenario(`RPC delete_project: 견적은 지워지지 않고 project_id만 풀림(총 ${del.quotes}건 불변 · ${del.quotesPrj}건 연결 해제)`, `select delete_project('${PRJ}');
reset role;
${assertSql(`(select count(*) from quotes) = ${del.quotes}`)}
${assertSql(`(select count(*) from quotes where project_id is null) = ${Number(del.quotesFree) + Number(del.quotesPrj)}`)}
${assertSql(`(select count(*) from quote_imports) = ${del.imports}`)}`,
    { role: 'authenticated', sub: authId.admin })
  scenario(`RPC delete_project: 주소록(profiles ${del.profiles})·협력사(vendors ${del.vendors})는 행사 비종속 — 건수 불변`, `select delete_project('${PRJ}');
reset role;
${assertSql(`(select count(*) from profiles) = ${del.profiles}`)}
${assertSql(`(select count(*) from vendors) = ${del.vendors}`)}`,
    { role: 'authenticated', sub: authId.admin })
  scenario('RPC delete_project: 종료(closed) 행사도 삭제 가능 — require_writable 경로가 아님', `select delete_project('${PRJ_CLOSED}');
reset role;
${assertSql(`not exists (select 1 from projects where id='${PRJ_CLOSED}')`)}`,
    { role: 'authenticated', sub: authId.admin })
  scenario('RPC delete_project: 행사 pm이어도 app_role이 admin이 아니면 403(sales)', `select delete_project('${PRJ}');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '관리자\\(admin\\) 권한' })
  scenario('RPC delete_project: staff는 403', `select delete_project('${PRJ}');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: '관리자\\(admin\\) 권한' })
  scenario('RPC delete_project: 없는 행사 404', `select delete_project('${seedUuid('nope')}');`,
    { role: 'authenticated', sub: authId.admin, expect: 'error', match: 'NOT_FOUND|찾을 수 없' })
  scenario('RPC delete_project: anon(토큰 경로 롤)은 실행 불가', `select delete_project('${PRJ}');`,
    { role: 'anon', expect: 'error', match: 'permission denied' })

  // 5f. RPC — 항목 고치기·지우기 (Phase 4.5 · DataProvider v14 updateDeliverable·deleteDeliverable)
  const KV = seedUuid('dlv-001')      // design · pending_approval · 버전·컨펌·코멘트 있음
  const DRAFT = seedUuid('dlv-003')   // design · draft
  const CUE = seedUuid('dlv-004')     // ops · 큐시트(정형) · 큐 있음
  const upd = (id, patch) => `select update_deliverable('${id}', '${JSON.stringify(patch).replace(/'/g, "''")}'::jsonb);`
  scenario('RPC update_deliverable: pm이 제목·마감·담당자를 한 번에 → 보낸 키만 바뀌고 로그(fields)', `${upd(DRAFT, { title: '  고친 제목  ', due_date: '2026-10-01', assignee_id: seedUuid('usr-pm') })}
reset role;
${assertSql(`(select title from deliverables where id='${DRAFT}') = '고친 제목'`)}
${assertSql(`(select due_date from deliverables where id='${DRAFT}') = '2026-10-01'`)}
${assertSql(`(select assignee_id from deliverables where id='${DRAFT}') = '${seedUuid('usr-pm')}'`)}
${assertSql(`(select category from deliverables where id='${DRAFT}') = '배너'`)}
${assertSql(`exists (select 1 from activity_log where target_id='${DRAFT}' and action='deliverable.updated' and meta->'fields' ? 'title' and meta->'fields' ? 'due_date' and not (meta->'fields' ? 'category'))`)}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC update_deliverable: 상태는 이 경로로 바뀌지 않는다(status 키 무시 · 컨펌대기 그대로)', `${upd(KV, { status: 'final', title: '키비주얼 v2' })}
reset role;
${assertSql(`(select status from deliverables where id='${KV}') = 'pending_approval'`)}
${assertSql(`(select title from deliverables where id='${KV}') = '키비주얼 v2'`)}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC update_deliverable: design은 자기 영역 항목의 제목을 고칠 수 있다', upd(DRAFT, { title: 'x' }),
    { role: 'authenticated', sub: authId.design })
  scenario('RPC update_deliverable: design의 ops 항목 수정 403', upd(CUE, { title: 'x' }),
    { role: 'authenticated', sub: authId.design, expect: 'error', match: '고칠 권한이 없습니다' })
  scenario('RPC update_deliverable: design이 담당자·가이드를 고치면 403(PM 전용)', upd(DRAFT, { brief: 'x' }),
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM만 고칠 수' })
  scenario('RPC update_deliverable: reg는 403', upd(DRAFT, { title: 'x' }),
    { role: 'authenticated', sub: authId.reg, expect: 'error', match: '고칠 권한이 없습니다' })
  scenario('RPC update_deliverable: 빈 제목 422', upd(DRAFT, { title: '   ' }),
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '제목은 비울 수 없' })
  scenario('RPC update_deliverable: 큐시트 → 다른 종류 409(빌더 데이터 보호)', upd(CUE, { category: '기타' }),
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '종류를 바꿀 수 없' })
  scenario('RPC update_deliverable: 일반 항목 → 시나리오 409', upd(DRAFT, { category: '시나리오' }),
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '종류를 바꿀 수 없' })
  scenario('RPC update_deliverable: 행사 멤버가 아닌 담당자 422', upd(DRAFT, { assignee_id: seedUuid('usr-nobody') }),
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '멤버여야' })
  scenario('RPC update_deliverable: 마감일 형식 422', upd(DRAFT, { due_date: '10/01' }),
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '마감일 형식' })
  scenario('RPC update_deliverable: 수량 음수·소수 422', upd(DRAFT, { spec_qty: 1.5 }),
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '0 이상의 정수' })
  // 종료 행사(prj-ai-summit)에는 시드 항목이 없다 — 서비스 경로로 하나 넣어 두고(종료 가드는 서비스 경로를 통과시킨다) 판정한다
  const CLOSED_ITEM = seedUuid('chk-closed-item')
  const closedItem = `reset role;
insert into deliverables (id, project_id, area, category, title) values ('${CLOSED_ITEM}', '${PRJ_CLOSED}', 'design', '배너', 'x');
set local role authenticated;`
  scenario('RPC update_deliverable: 종료 행사 항목 409', `${closedItem}
${upd(CLOSED_ITEM, { title: 'y' })}`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '종료된 행사' })
  scenario('RPC update_deliverable: anon 실행 불가', upd(DRAFT, { title: 'x' }),
    { role: 'anon', expect: 'error', match: 'permission denied' })
  scenario('RPC delete_deliverable: pm이 컨펌대기 항목 삭제 → 버전·컨펌·코멘트 cascade · WBS 연결 해제 · 인박스 닫힘 · 버전 파일은 처리됨 행 · 로그', `reset role;
update wbs_tasks set linked_deliverable_id = '${KV}' where id = (select id from wbs_tasks where project_id='${PRJ}' order by sort_order limit 1);
update unregistered_files set linked_deliverable_id = '${KV}' where drive_file_id = 'drv-f-inbox-001';
set local role authenticated;
select delete_deliverable('${KV}');
reset role;
${assertSql(`not exists (select 1 from deliverables where id='${KV}')`)}
${assertSql(`not exists (select 1 from versions where deliverable_id='${KV}')`)}
${assertSql(`not exists (select 1 from approvals where deliverable_id='${KV}')`)}
${assertSql(`not exists (select 1 from comments where deliverable_id='${KV}')`)}
${assertSql(`not exists (select 1 from wbs_tasks where linked_deliverable_id='${KV}')`)}
${assertSql(`(select dismissed and linked_deliverable_id is null from unregistered_files where drive_file_id='drv-f-inbox-001')`)}
${assertSql(`(select count(*) from unregistered_files where project_id='${PRJ}' and dismissed and starts_with(detected_folder, '삭제된 항목:')) > 0`)}
${assertSql(`exists (select 1 from activity_log where target_id='${KV}' and action='deliverable.deleted' and meta->>'status'='pending_approval')`)}`,
    { role: 'authenticated', sub: authId.pm })
  const delRes = scenario('RPC delete_deliverable: 반환값 = 지운 항목 id·행사·영역·Drive 항목 폴더(앱이 99_archive로 옮긴다)', `select delete_deliverable('${DRAFT}');`,
    { role: 'authenticated', sub: authId.pm })
  record('delete_deliverable 반환에 drive_folder_id·area 포함', /"drive_folder_id"/.test(delRes) && /"area": ?"design"/.test(delRes), delRes.slice(0, 160))
  scenario('RPC delete_deliverable: 큐시트 항목 삭제 → 큐도 함께', `select delete_deliverable('${CUE}');
reset role;
${assertSql(`not exists (select 1 from cues where deliverable_id='${CUE}')`)}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('RPC delete_deliverable: design은 자기 영역이어도 403(PM 전용)', `select delete_deliverable('${DRAFT}');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM 전용' })
  scenario('RPC delete_deliverable: 종료 행사 409', `${closedItem}
select delete_deliverable('${CLOSED_ITEM}');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '종료된 행사' })
  scenario('RPC delete_deliverable: 없는 항목 404', `select delete_deliverable('${seedUuid('nope-dlv')}');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'NOT_FOUND|찾을 수 없' })
  scenario('RPC delete_deliverable: anon 실행 불가', `select delete_deliverable('${DRAFT}');`,
    { role: 'anon', expect: 'error', match: 'permission denied' })

  // 5e. Drive 저장소 (v2.9 §7 · Phase 5) — 5인자 upload_version · 인박스 연결 · service 전용 RPC 권한 · Vault 토큰 · §7.5 2단계 확정
  const DRV = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'   // 실제 Drive id 모양(20자+, drv- 접두 아님)
  const designItem = psql(['-c', `select id from deliverables where project_id='${PRJ}' and area='design' and status in ('draft','changes_requested','requested','internal_review') and partner_id is null order by created_at limit 1`]).out
  record('Drive 전제: 데모 행사에 업로드 가능한 디자인 항목 1건 이상', Boolean(designItem))
  scenario('Drive upload_version(5인자): Drive 파일 id 기록 + 같은 항목 중복 등록 409', `select upload_version('${designItem}', '260924_X_키비주얼_시안_v9.pdf', null, 'a.pdf', '${DRV}');
reset role;
${assertSql(`exists (select 1 from versions where deliverable_id='${designItem}' and drive_file_id='${DRV}')`)}
set local role authenticated;
select upload_version('${designItem}', 'dup.pdf', null, 'dup.pdf', '${DRV}');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: '이미 이 항목에 등록된 파일' })
  scenario('Drive upload_version: 인박스에 있던 파일을 등록하면 인박스는 연결 처리(중복 표시 없음)', `reset role;
insert into unregistered_files (project_id, drive_file_id, file_name, detected_folder) values ('${PRJ}', '${DRV}', 'a.pdf', '05_산출물/디자인');
set local role authenticated;
select upload_version('${designItem}', 'a.pdf', null, 'a.pdf', '${DRV}');
reset role;
${assertSql(`(select linked_deliverable_id from unregistered_files where drive_file_id='${DRV}') = '${designItem}'`)}`,
    { role: 'authenticated', sub: authId.design })
  scenario('Drive upload_version: 4인자 호출도 그대로 동작(Phase 4 호출부 호환 · 자리표시 id)', `select upload_version('${designItem}', 'legacy.pdf', 'n', 'legacy.pdf');
reset role;
${assertSql(`exists (select 1 from versions where deliverable_id='${designItem}' and file_name='legacy.pdf' and starts_with(drive_file_id, 'pending:'))`)}`,
    { role: 'authenticated', sub: authId.design })
  const check = scenario('Drive drive_upload_check(pm): 폴더 경로에 필요한 값만(JSON)', `select drive_upload_check('${designItem}');`, { role: 'authenticated', sub: authId.pm })
  record('drive_upload_check 응답에 행사 코드·항목 영역 포함 · 금액 키 0건', /"code"/.test(check) && /"area": ?"design"/.test(check) && !/total_amount|breakdown|contract_amount/.test(check), check.slice(0, 200))
  scenario('Drive drive_upload_check: reg는 403(역할-영역)', `select drive_upload_check('${designItem}');`,
    { role: 'authenticated', sub: authId.reg, expect: 'error', match: '쓰기 권한' })
  for (const [fn, call] of [
    ['drive_token_read', 'drive_token_read()'],
    ['drive_known_file_ids', `drive_known_file_ids('${PRJ}')`],
    ['client_file_versions', `client_file_versions('${DEMO_TOKEN}')`],
    ['finalize_approved', `finalize_approved('${designItem}', null)`],
    ['drive_connection_save', `drive_connection_save('x', 'a@example.com', null)`],
  ]) {
    scenario(`Drive ${fn}: authenticated 실행 불가(service 전용)`, `select ${call};`, { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
    scenario(`Drive ${fn}: anon 실행 불가(service 전용)`, `select ${call};`, { role: 'anon', expect: 'error', match: 'permission denied' })
  }
  scenario('Drive drive_connection: authenticated는 표 권한 없음', `select count(*) from drive_connection;`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
  scenario('Drive Vault: 저장 → 읽기 → 재저장(갱신) → 해제', `select drive_connection_save('rt-1', 'owner@example.com', null);
${assertSql(`drive_token_read() = 'rt-1'`)}
${assertSql(`(select account_email from drive_connection where id=1) = 'owner@example.com'`)}
select drive_connection_error('끊김');
${assertSql(`(select last_error from drive_connection where id=1) = '끊김'`)}
select drive_connection_save('rt-2', 'owner@example.com', null);
${assertSql(`drive_token_read() = 'rt-2' and (select last_error from drive_connection where id=1) is null and (select count(*) from vault.secrets where name='communicator_drive_refresh_token') = 1`)}
select drive_connection_clear();
${assertSql(`drive_token_read() is null and not exists (select 1 from drive_connection)`)}`)
  const known = scenario('Drive drive_known_file_ids: 버전 + 인박스 id를 모두 안다', `select array_length(drive_known_file_ids('${PRJ}'), 1) > 0 and 'drv-f-inbox-001' = any(drive_known_file_ids('${PRJ}'));`)
  record('drive_known_file_ids에 인박스 시드 id 포함', known === 't', known)
  const files = scenario('Drive client_file_versions(service): 데모 토큰의 컨펌 대기 + 확정본 버전', `select client_file_versions('${DEMO_TOKEN}');`)
  record('client_file_versions: 버전 목록 JSON · 금액 키 0건', /"version_id"/.test(files) && !/total_amount|breakdown|contract_amount/.test(files), files.slice(0, 160))
  scenario('Drive client_file_versions: 회수 토큰 410', `select client_file_versions('${REVOKED_TOKEN}');`, { expect: 'error', match: 'GONE|만료' })
  scenario('§7.5 drive_enabled=false(기본): 승인 즉시 final — 기존 흐름 불변', `select client_decide('${DEMO_TOKEN}', '${pendingApprovals[0]}', 'approved');
reset role;
${assertSql(`(select status from deliverables where id = (select deliverable_id from approvals where id='${pendingApprovals[0]}')) = 'final'`)}`,
    { role: 'anon' })
  scenario('§7.5 drive_enabled=true + 행사 폴더: 승인은 approved에서 멈추고 → 복사 대상 조회 → finalize_approved로 final(+로그)', `update app_config set drive_enabled = true where id = 1;
update projects set drive_root_folder_id = '${DRV}ROOT' where id = '${PRJ}';
set local role anon;
select client_decide('${DEMO_TOKEN}', '${pendingApprovals[0]}', 'approved');
reset role;
${assertSql(`(select status from deliverables where id = (select deliverable_id from approvals where id='${pendingApprovals[0]}')) = 'approved'`)}
${assertSql(`(client_snapshot_target('${DEMO_TOKEN}', '${pendingApprovals[0]}') ->> 'version_id') = (select version_id::text from approvals where id='${pendingApprovals[0]}')`)}
${assertSql(`jsonb_array_length(drive_pending_snapshots('${PRJ}')) >= 1`)}
select finalize_approved((select deliverable_id from approvals where id='${pendingApprovals[0]}'), 'SNAPSHOT-COPY-ID');
${assertSql(`(select status from deliverables where id = (select deliverable_id from approvals where id='${pendingApprovals[0]}')) = 'final'`)}
${assertSql(`exists (select 1 from activity_log where action='drive.snapshot_copied' and meta->>'snapshot_file_id'='SNAPSHOT-COPY-ID')`)}
${assertSql(`client_snapshot_target('${DEMO_TOKEN}', '${pendingApprovals[0]}') is null`)}
select finalize_approved((select deliverable_id from approvals where id='${pendingApprovals[0]}'), 'again');
${assertSql(`(select count(*) from activity_log where starts_with(action, 'drive.snapshot_')) = 1`)}`)

  scenario('Drive drive_project_folder: admin은 삭제 전 행사 폴더 id·이름을 읽는다(멤버가 아니어도)', `reset role;
update projects set drive_root_folder_id = '${DRV}EVENT' where id = '${PRJ_CLOSED}';
set local role authenticated;
${assertSql(`(drive_project_folder('${PRJ_CLOSED}') ->> 'drive_root_folder_id') = '${DRV}EVENT'`)}`,
    { role: 'authenticated', sub: authId.admin })
  scenario('Drive drive_project_folder: admin이 아니면 403(sales pm)', `select drive_project_folder('${PRJ}');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '관리자\\(admin\\)' })

  // 5g. Slack 알림 (Phase 6 · 설계서 v2.10.1 §9) — service 전용 · 선점(한 번만) · 리마인드 날짜 키 · 수동 리마인드 시간당 1회 · 금액 0
  for (const [fn, call] of [
    ['notify_claim_events', 'notify_claim_events(10)'],
    ['notify_claim_reminders', 'notify_claim_reminders()'],
    ['notify_claim_manual', `notify_claim_manual('${PRJ}', 'delayed')`],
    ['notify_mark', `notify_mark(array['x'], 'sent')`],
  ]) {
    scenario(`알림 ${fn}: authenticated 실행 불가(service 전용)`, `select ${call};`, { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
    scenario(`알림 ${fn}: anon 실행 불가`, `select ${call};`, { role: 'anon', expect: 'error', match: 'permission denied' })
  }
  scenario('알림 notification_log: authenticated는 표 권한 없음', `select count(*) from notification_log;`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
  scenario('알림 사건 선점: 새 버전 → 행사 코드·항목 제목과 함께 한 번만(두 번째 선점 0건) · 금액 키 0 · mark → sent', `select upload_version('${designItem}', 'n.pdf', null, 'n.pdf', 'drv-notify-1');
reset role;
do $$ declare r jsonb; r2 jsonb; k text; begin
  r := notify_claim_events(50);
  select e->>'key' into k from jsonb_array_elements(r) e where e->>'action' = 'version.uploaded' and e->>'title' is not null and e->>'project_code' is not null limit 1;
  if k is null then raise exception 'ASSERT_FAILED: claim %', r; end if;
  if r::text ~ 'total_amount|breakdown|contract_amount|ordered_amount|actual_amount' then raise exception 'ASSERT_FAILED: money'; end if;
  r2 := notify_claim_events(50);
  if jsonb_array_length(r2) <> 0 then raise exception 'ASSERT_FAILED: dedupe %', r2; end if;
  perform notify_mark(array[k], 'sent');
  if (select status from notification_log where key = k) <> 'sent' or (select sent_at from notification_log where key = k) is null then raise exception 'ASSERT_FAILED: mark'; end if;
end $$;`, { role: 'authenticated', sub: authId.design })
  scenario('알림 사건 선점: 오래된 사건(2일 밖 — 시드 로그)은 선점하지 않는다', `do $$ begin
  if exists (select 1 from jsonb_array_elements(notify_claim_events(200)) e where (e->>'at')::timestamptz < now() - interval '2 days') then raise exception 'ASSERT_FAILED: old'; end if;
end $$;`)
  scenario('알림 리마인드: 내일(KST) 기한 컨펌·마일스톤 + 미등록 파일 묶음 → 같은 날 두 번째는 0건 · 종료 행사 제외', `update approvals set due_at = ((now() at time zone 'Asia/Seoul')::date + 1 + time '12:00') at time zone 'Asia/Seoul' where id = '${pendingApprovals[0]}';
insert into milestones (project_id, title, due_date) values ('${PRJ}', '알림 검사 마일스톤', (now() at time zone 'Asia/Seoul')::date + 1);
insert into milestones (project_id, title, due_date) values ('${PRJ_CLOSED}', '종료 행사 마일스톤', (now() at time zone 'Asia/Seoul')::date + 1);
do $$ declare r jsonb; begin
  r := notify_claim_reminders();
  if not exists (select 1 from jsonb_array_elements(r) e where e->>'kind' = 'approval_due' and e->>'deliverable_id' is not null) then raise exception 'ASSERT_FAILED: approval_due %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r) e where e->>'kind' = 'milestone_due' and e->>'title' = '알림 검사 마일스톤') then raise exception 'ASSERT_FAILED: milestone'; end if;
  if exists (select 1 from jsonb_array_elements(r) e where e->>'title' = '종료 행사 마일스톤') then raise exception 'ASSERT_FAILED: closed'; end if;
  if not exists (select 1 from jsonb_array_elements(r) e where e->>'kind' = 'inbox_digest' and (e->>'count')::int >= 1) then raise exception 'ASSERT_FAILED: inbox'; end if;
  if jsonb_array_length(notify_claim_reminders()) <> 0 then raise exception 'ASSERT_FAILED: same-day dedupe'; end if;
end $$;`)
  scenario('알림 수동 리마인드: 목록(건수·상위 10)과 함께 선점 → 같은 시간 두 번째는 null · 실패하면 다시 선점 가능 · 대상 검증 422', `do $$ declare r jsonb; begin
  r := notify_claim_manual('${PRJ}', 'approval');
  if r is null or (r->>'total')::int < 1 or jsonb_array_length(r->'items') < 1 then raise exception 'ASSERT_FAILED: manual %', r; end if;
  if notify_claim_manual('${PRJ}', 'approval') is not null then raise exception 'ASSERT_FAILED: hourly'; end if;
  if notify_claim_manual('${PRJ}', 'delayed') is null then raise exception 'ASSERT_FAILED: other target'; end if;
  perform notify_mark(array[r->>'key'], 'failed', 'Slack 403');
  if notify_claim_manual('${PRJ}', 'approval') is null then raise exception 'ASSERT_FAILED: retry after failure'; end if;
  if notify_claim_manual('${PRJ}', 'approval') is not null then raise exception 'ASSERT_FAILED: hourly after retry'; end if;
end $$;
select notify_claim_manual('${PRJ}', 'x');`, { expect: 'error', match: '리마인드 대상' })
  scenario('알림 notify_mark: 알 수 없는 결과 422', `select notify_mark(array['k'], 'maybe');`, { expect: 'error', match: '알 수 없는 결과' })

  // 5g-2. Slack 봇 전환 + 의뢰 확인 버튼 (Phase 6.1 · 설계서 v2.12 §9) — 행사 스레드 · 멘션 대상 · 의뢰 카드 기록 · 확인은 멘션된 사람만 · 24시간 미확인 한 번
  const pmProfile = `(select id from profiles where auth_user_id='${authId.pm}')`
  const designProfile = `(select id from profiles where auth_user_id='${authId.design}')`
  for (const [fn, call] of [
    ['notify_record_card', `notify_record_card(gen_random_uuid(), '${PRJ}', '[]'::jsonb, '{}', 'C1', '1.1', null)`],
    ['notify_ack_card', `notify_ack_card(gen_random_uuid(), null)`],
    ['notify_set_slack_user', `notify_set_slack_user(gen_random_uuid(), 'U123')`],
  ]) {
    scenario(`Slack 봇 ${fn}: authenticated 실행 불가(service 전용)`, `select ${call};`, { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
    scenario(`Slack 봇 ${fn}: anon 실행 불가`, `select ${call};`, { role: 'anon', expect: 'error', match: 'permission denied' })
  }
  scenario('Slack 봇 request_acks: 멤버도 직접 쓰기 불가(카드 기록은 서버만)', `insert into request_acks (card_id, project_id, deliverable_id, kind, notify_key, channel_id, message_ts) values (gen_random_uuid(), '${PRJ}', '${designItem}', 'work', 'k', 'C1', '1.1');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
  scenario('Slack 봇 profiles.slack_user_id: pm은 고칠 수 있고 목록(list_people)에 실린다 · app_role은 계속 막힘', `update profiles set slack_user_id = 'U0DESIGN1' where id = ${designProfile};
${assertSql(`(select slack_user_id from profiles where id = ${designProfile}) = 'U0DESIGN1'`)}
${assertSql(`exists (select 1 from jsonb_array_elements(list_people()) e where e->>'slack_user_id' = 'U0DESIGN1')`)}`, { role: 'authenticated', sub: authId.pm })
  scenario('Slack 봇 profiles.app_role: 여전히 authenticated가 못 바꾼다', `update profiles set app_role = 'admin' where id = ${designProfile};`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
  scenario('Slack 봇 사건 선점: 내부검토 요청만(다른 상태 전이 제외) · PM 멘션 대상(이메일·Slack ID) · 최신 버전 메모·파일 · 행사 스레드 · 새 지시는 담당자', `update projects set slack_thread_url = 'https://ws.slack.com/archives/C0TEST01/p1727251234567890' where id = '${PRJ}';
update profiles set slack_user_id = 'U0PM00001' where id = ${pmProfile};
update deliverables set assignee_id = ${designProfile} where id = '${designItem}';
insert into versions (deliverable_id, version_no, drive_file_id, file_name, note) values ('${designItem}', 97, 'drv-sb-1', 'x_v97.pdf', '띠 높이를 줄였습니다');
select app.write_log('${PRJ}', 'user:' || ${designProfile}, 'status.transitioned', 'deliverable', '${designItem}', '{"from":"draft","to":"internal_review"}');
select app.write_log('${PRJ}', 'user:' || ${designProfile}, 'status.transitioned', 'deliverable', '${designItem}', '{"from":"internal_review","to":"pending_approval"}');
select app.write_log('${PRJ}', 'user:' || ${pmProfile}, 'deliverable.requested', 'deliverable', '${designItem}', null);
do $$ declare r jsonb; e jsonb; begin
  r := notify_claim_events(200);
  if (select count(*) from jsonb_array_elements(r) x where x->>'action' = 'status.transitioned') <> 1 then raise exception 'ASSERT_FAILED: only internal_review %', r; end if;
  select x into e from jsonb_array_elements(r) x where x->>'action' = 'status.transitioned';
  if e->>'thread' <> 'https://ws.slack.com/archives/C0TEST01/p1727251234567890' then raise exception 'ASSERT_FAILED: thread %', e; end if;
  if (e->>'version_no')::int <> 97 or e->>'file_name' <> 'x_v97.pdf' or e->>'version_note' <> '띠 높이를 줄였습니다' then raise exception 'ASSERT_FAILED: version %', e; end if;
  if not exists (select 1 from jsonb_array_elements(e->'recipients') p where p->>'slack_user_id' = 'U0PM00001' and p->>'email' is not null) then raise exception 'ASSERT_FAILED: pm recipient %', e; end if;
  if exists (select 1 from jsonb_array_elements(e->'recipients') p where p->>'id' = (select id::text from profiles where email = 'design@example.com')) then raise exception 'ASSERT_FAILED: designer is not a review recipient'; end if;
  select x into e from jsonb_array_elements(r) x where x->>'action' = 'deliverable.requested' and x->>'deliverable_id' = '${designItem}';
  if jsonb_array_length(e->'recipients') <> 1 or (e->'recipients'->0->>'email') <> 'design@example.com' then raise exception 'ASSERT_FAILED: assignee recipient %', e; end if;
  if r::text ~ 'total_amount|breakdown|contract_amount|ordered_amount|actual_amount|"phone"' then raise exception 'ASSERT_FAILED: money/phone'; end if;
end $$;`)
  scenario('Slack 봇 의뢰 카드: 기록(다른 행사 항목은 버림) → 멘션 안 된 사람 not_recipient → 멘션된 사람 ok → 두 번째 already → 없는 카드 not_found', `do $$ declare c uuid := gen_random_uuid(); r jsonb; other uuid; begin
  select id into other from deliverables where project_id <> '${PRJ}' limit 1;
  if notify_record_card(c, '${PRJ}', jsonb_build_array(jsonb_build_object('deliverable_id', '${designItem}', 'kind', 'work', 'notify_key', 'act:1'),
       jsonb_build_object('deliverable_id', other, 'kind', 'work', 'notify_key', 'act:2')), array[${designProfile}], 'C0TEST01', '1727.0001', '1727251234.567890') <> 1 then raise exception 'ASSERT_FAILED: record'; end if;
  r := notify_ack_card(c, ${pmProfile});
  if r->>'status' <> 'not_recipient' or not (r->'names') ? (select display_name from profiles where id = ${designProfile}) then raise exception 'ASSERT_FAILED: not_recipient %', r; end if;
  r := notify_ack_card(c, null);
  if r->>'status' <> 'not_recipient' then raise exception 'ASSERT_FAILED: unknown user %', r; end if;
  r := notify_ack_card(c, ${designProfile});
  if r->>'status' <> 'ok' or (r->>'count')::int <> 1 then raise exception 'ASSERT_FAILED: ok %', r; end if;
  if (select acknowledged_by from request_acks where card_id = c) <> ${designProfile} then raise exception 'ASSERT_FAILED: by'; end if;
  r := notify_ack_card(c, ${designProfile});
  if r->>'status' <> 'already' or r->>'by' is null then raise exception 'ASSERT_FAILED: already %', r; end if;
  if notify_ack_card(gen_random_uuid(), ${designProfile})->>'status' <> 'not_found' then raise exception 'ASSERT_FAILED: not_found'; end if;
  if (select status from deliverables where id = '${designItem}') is null then raise exception 'ASSERT_FAILED: status untouched'; end if;
end $$;`)
  scenario('Slack 봇 request_acks: 멤버는 자기 행사 카드 기록을 읽는다(앱 칩)', `reset role;
select notify_record_card(gen_random_uuid(), '${PRJ}', jsonb_build_array(jsonb_build_object('deliverable_id', '${designItem}', 'kind', 'review', 'notify_key', 'act:3')), array[${pmProfile}], 'C0TEST01', '1727.0002', null);
set local role authenticated;
${assertSql(`(select count(*) from request_acks where deliverable_id = '${designItem}') = 1`)}`, { role: 'authenticated', sub: authId.design })
  scenario('Slack 봇 리마인드: 24시간 넘은 미확인 카드는 한 번만(받는 사람·채널·원래 카드 ts) · 확인한 카드·하루 안 된 카드 제외 · 항목 마감 D-1 → 담당자', `do $$ declare c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid(); r jsonb; e jsonb; begin
  perform notify_record_card(c1, '${PRJ}', jsonb_build_array(jsonb_build_object('deliverable_id', '${designItem}', 'kind', 'work', 'notify_key', 'a1')), array[${designProfile}], 'C0TEST01', '1727.1000', '1727.0000');
  perform notify_record_card(c2, '${PRJ}', jsonb_build_array(jsonb_build_object('deliverable_id', '${designItem}', 'kind', 'work', 'notify_key', 'a2')), array[${designProfile}], 'C0TEST01', '1727.2000', '1727.0000');
  perform notify_record_card(c3, '${PRJ}', jsonb_build_array(jsonb_build_object('deliverable_id', '${designItem}', 'kind', 'work', 'notify_key', 'a3')), array[${designProfile}], 'C0TEST01', '1727.3000', '1727.0000');
  update request_acks set created_at = now() - interval '25 hours' where card_id in (c1, c2);
  perform notify_ack_card(c2, ${designProfile});
  update deliverables set due_date = (now() at time zone 'Asia/Seoul')::date + 1, status = 'draft' where id = '${designItem}';
  r := notify_claim_reminders();
  if (select count(*) from jsonb_array_elements(r) x where x->>'kind' = 'unacked') <> 1 then raise exception 'ASSERT_FAILED: unacked count %', r; end if;
  select x into e from jsonb_array_elements(r) x where x->>'kind' = 'unacked';
  if e->>'key' <> 'rem:unacked:' || c1 or e->>'message_ts' <> '1727.1000' or e->>'channel_id' <> 'C0TEST01' then raise exception 'ASSERT_FAILED: unacked row %', e; end if;
  if (e->'recipients'->0->>'email') <> 'design@example.com' then raise exception 'ASSERT_FAILED: unacked recipients %', e; end if;
  if (select reminded_at from request_acks where card_id = c1) is null then raise exception 'ASSERT_FAILED: reminded_at'; end if;
  select x into e from jsonb_array_elements(r) x where x->>'kind' = 'deliverable_due' and x->>'deliverable_id' = '${designItem}';
  if e is null or (e->'recipients'->0->>'email') <> 'design@example.com' then raise exception 'ASSERT_FAILED: deliverable_due %', r; end if;
  delete from notification_log where key like 'rem:%';
  if exists (select 1 from jsonb_array_elements(notify_claim_reminders()) x where x->>'kind' = 'unacked') then raise exception 'ASSERT_FAILED: unacked twice'; end if;
end $$;`)
  scenario('Slack 봇 notify_set_slack_user: 비어 있을 때만 적고(담당자 화면 값이 이김) · 형식이 틀리면 무시', `do $$ begin
  update profiles set slack_user_id = null where email = 'ops@example.com';
  perform notify_set_slack_user((select id from profiles where email = 'ops@example.com'), 'not-an-id');
  if (select slack_user_id from profiles where email = 'ops@example.com') is not null then raise exception 'ASSERT_FAILED: invalid'; end if;
  perform notify_set_slack_user((select id from profiles where email = 'ops@example.com'), 'U0OPS0001');
  perform notify_set_slack_user((select id from profiles where email = 'ops@example.com'), 'U0OTHER99');
  if (select slack_user_id from profiles where email = 'ops@example.com') <> 'U0OPS0001' then raise exception 'ASSERT_FAILED: no overwrite'; end if;
end $$;`)
  scenario('Slack 봇 항목 지우기: 의뢰 카드 기록도 함께 사라진다(cascade)', `do $$ declare c uuid := gen_random_uuid(); begin
  perform notify_record_card(c, '${PRJ}', jsonb_build_array(jsonb_build_object('deliverable_id', '${designItem}', 'kind', 'work', 'notify_key', 'x')), array[]::uuid[], 'C1', '1.2', null);
  delete from unregistered_files where linked_deliverable_id = '${designItem}';
  delete from deliverables where id = '${designItem}';
  if exists (select 1 from request_acks where card_id = c) then raise exception 'ASSERT_FAILED: cascade'; end if;
end $$;`)

  // 5h. 협력사 견적서 불러오기 (Phase 4.7 · 설계서 v2.11 §19.5) — 확정 RPC(금액은 저장된 제안에서) · 원본 보관 판정 · 인박스 대조
  const BOARD = seedUuid('brd-001')
  const VQ = seedUuid('chk-vendor-import')
  const bkt = (code) => seedUuid(`bkt-${code}`)
  const vqSetup = `reset role;
insert into settlement_imports (id, board_id, file_name, vendor_id, parsed, questions, status)
values ('${VQ}', '${BOARD}', '가상음향_견적.xlsx', '${seedUuid('ven-002')}',
  '{"kind":"vendor_quote","rows":[{"index":0,"title":"메인 스피커","spec":"L/R","amount":6000000},{"index":1,"title":"패키지 할인","spec":null,"amount":-1000000},{"index":2,"title":"오퍼레이터","spec":null,"amount":3000000}]}'::jsonb,
  '[]'::jsonb, 'parsed');
set local role authenticated;`
  const vqRows = (rows) => `'${JSON.stringify(rows)}'::jsonb`
  scenario('정산 가져오기 확정: pm → 고른 행마다 발주 항목(ordered · import_id · 제안 금액 · 근거) · 가져오기 확정 · 로그에 금액 없음', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 0, bucket_id: bkt('s2'), title: '메인 스피커(L/R)' }, { index: 1, bucket_id: bkt('s2') }])});
reset role;
${assertSql(`(select count(*) from settlement_items where import_id='${VQ}') = 2`)}
${assertSql(`exists (select 1 from settlement_items where import_id='${VQ}' and title='메인 스피커(L/R)' and ordered_amount=6000000 and status='ordered' and vendor_id='${seedUuid('ven-002')}' and not vat_included_input and input_amount_raw is null and spec='L/R' and starts_with(evidence, '협력사 견적서 '))`)}
${assertSql(`exists (select 1 from settlement_items where import_id='${VQ}' and title='패키지 할인' and ordered_amount=-1000000)`)}
${assertSql(`(select status from settlement_imports where id='${VQ}') = 'confirmed'`)}
${assertSql(`exists (select 1 from activity_log where action='settlement.imported' and target_id='${VQ}' and meta = '{"count": 2, "file_name": "가상음향_견적.xlsx"}'::jsonb)`)}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('정산 가져오기 확정: 부가세 포함 → round(v/1.1) + 원본 보존 · 협력사 지우기(p_vendor_set)', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', true, null, true, ${vqRows([{ index: 0, bucket_id: bkt('s2') }])});
reset role;
${assertSql(`exists (select 1 from settlement_items where import_id='${VQ}' and ordered_amount=5454545 and input_amount_raw=6000000 and vat_included_input and vendor_id is null)`)}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('정산 가져오기 확정: 두 번째 확정 409', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 0, bucket_id: bkt('s2') }])});
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 2, bucket_id: bkt('s4') }])});`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '이미 확정했거나 버린' })
  scenario('정산 가져오기 확정: 원가 없는 버킷(s5) 422', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 0, bucket_id: bkt('s5') }])});`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '원가가 없는 항목' })
  scenario('정산 가져오기 확정: 다른 보드의 버킷 422', `${vqSetup}
reset role;
insert into settlement_boards (id, project_id, baselined_at) values ('${seedUuid('chk-board-2')}', '${PRJ_DRAFT}', now());
insert into settlement_buckets (id, board_id, code, label, quote_amount, has_cost, is_margin_base, source, sort_order)
values ('${seedUuid('chk-bucket-2')}', '${seedUuid('chk-board-2')}', 's2', '시스템 구축', 0, true, true, 'quote', 1);
set local role authenticated;
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 0, bucket_id: seedUuid('chk-bucket-2') }])});`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '이 정산보드의 버킷이 아닙니다' })
  scenario('정산 가져오기 확정: 같은 행 두 번 422', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 0, bucket_id: bkt('s2') }, { index: 0, bucket_id: bkt('s2') }])});`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '같은 행을 두 번' })
  scenario('정산 가져오기 확정: 없는 행 422 · 빈 목록 422', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 9, bucket_id: bkt('s2') }])});`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '견적서에 없는 행입니다\\(10번\\)' })
  scenario('정산 가져오기 확정: 빈 목록 422', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, '[]'::jsonb);`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '만들 항목이 없습니다' })
  scenario('정산 가져오기 확정: design은 403(PM 전용)', `${vqSetup}
select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, ${vqRows([{ index: 0, bucket_id: bkt('s2') }])});`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM 전용' })
  scenario('정산 가져오기 확정: anon 실행 불가', `select count(*) from confirm_vendor_quote_import('${VQ}', false, null, false, '[]'::jsonb);`,
    { role: 'anon', expect: 'error', match: 'permission denied' })
  scenario('정산 원본 보관 판정: pm → 행사 정보(금액 없음) · 확정 뒤 409', `${vqSetup}
do $$ declare r jsonb; begin
  r := drive_settlement_file_check('${VQ}');
  if r->'project'->>'id' <> '${PRJ}' or r->>'file_name' <> '가상음향_견적.xlsx' then raise exception 'ASSERT_FAILED: %', r; end if;
end $$;
reset role;
update settlement_imports set status='confirmed' where id='${VQ}';
set local role authenticated;
select drive_settlement_file_check('${VQ}');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: '이미 확정했거나 버린' })
  scenario('정산 원본 보관 판정: design은 403', `${vqSetup}
select drive_settlement_file_check('${VQ}');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM 전용' })
  scenario('정산 settlement_import_set_file: authenticated 실행 불가(service 전용)', `select settlement_import_set_file('${VQ}', 'x');`,
    { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'permission denied' })
  scenario('정산 가져오기 등록·버리기(공급자 직접 경로): pm은 insert·update 가능(RLS settlement_imports_write)', `
insert into settlement_imports (id, board_id, file_name, parsed, questions, status)
values ('${seedUuid('chk-vendor-import-2')}', '${BOARD}', '가상.xlsx', '{"kind":"vendor_quote","rows":[]}'::jsonb, '["vat"]'::jsonb, 'parsed');
update settlement_imports set status='discarded' where id='${seedUuid('chk-vendor-import-2')}' and status='parsed';
reset role;
${assertSql(`(select status from settlement_imports where id='${seedUuid('chk-vendor-import-2')}') = 'discarded'`)}`,
    { role: 'authenticated', sub: authId.pm })
  scenario('정산 가져오기 등록: design은 RLS 거부', `
insert into settlement_imports (board_id, file_name, status) values ('${BOARD}', '가상.xlsx', 'parsed');`,
    { role: 'authenticated', sub: authId.design, expect: 'error', match: 'row-level security' })
  scenario('정산 원본은 인박스가 아는 파일(drive_known_file_ids 재정의)', `${vqSetup}
reset role;
select settlement_import_set_file('${VQ}', 'drv-vendor-original-1');
${assertSql(`'drv-vendor-original-1' = any(drive_known_file_ids('${PRJ}'))`)}`)

  // 5i. 운영가이드 현장 운영 섹션 (Phase 3.24 · 설계서 v2.13 §23.5) — data 저장 · 모양 검사 · 새 kind · 권한
  const GD = '00000000-0000-4000-8000-00000000a324'
  const gdSetup = `reset role;
insert into deliverables (id, project_id, area, category, title) values ('${GD}', '${PRJ}', 'ops', '운영가이드', '구조화 가이드 검사');
set local role authenticated;`
  const staffing = `{"kind":"staffing","title":"현장 인력·콜타임","content":"- 요원 3명","data":{"type":"staffing","rows":[{"role":"요원","count":3,"call_time":"12:00","duty":"","channel":"CH2"}],"extra":""}}`
  scenario('운영가이드 구조화: pm이 표 섹션(data)과 마크다운 섹션을 함께 저장 · data 그대로 · 마크다운 섹션 data 없음 · emergency는 표/글 모두 허용', `${gdSetup}
select count(*) from save_guide_sections('${GD}', '[${staffing}, {"kind":"zone","title":"존별 운영","content":"- 로비"}, {"kind":"emergency","title":"비상 대응","content":"- 글"}]'::jsonb);
${assertSql(`(select (data->'rows'->0->>'count')::int from guide_sections where deliverable_id = '${GD}' and kind = 'staffing') = 3`)}
${assertSql(`(select data from guide_sections where deliverable_id = '${GD}' and kind = 'zone') is null`)}
select count(*) from save_guide_sections('${GD}', '[{"kind":"emergency","title":"비상 대응","content":"- 표","data":{"type":"emergency","rows":[]}}]'::jsonb);
${assertSql(`(select data->>'type' from guide_sections where deliverable_id = '${GD}' and kind = 'emergency') = 'emergency'`)}`, { role: 'authenticated', sub: authId.pm })
  for (const [label, body] of [
    ['표 섹션에 data 없음', `[{"kind":"staffing","title":"x","content":"- a"}]`],
    ['마크다운 섹션(zone)에 data', `[{"kind":"zone","title":"x","content":"- a","data":{"type":"zone"}}]`],
    ['data.type이 kind와 다름', `[{"kind":"setup","title":"x","content":"- a","data":{"type":"staffing","rows":[],"extra":""}}]`],
  ]) {
    scenario(`운영가이드 구조화: ${label} → 거부`, `${gdSetup}
select count(*) from save_guide_sections('${GD}', '${body}'::jsonb);`, { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'guide_sections_data_shape' })
  }
  scenario('운영가이드 구조화: 모르는 kind → 거부', `${gdSetup}
select count(*) from save_guide_sections('${GD}', '[{"kind":"banquet","title":"x","content":"- a"}]'::jsonb);`, { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'guide_sections_kind_check' })
  scenario('운영가이드 구조화: design은 저장 불가(pm·ops만)', `${gdSetup}
select count(*) from save_guide_sections('${GD}', '[${staffing}]'::jsonb);`, { role: 'authenticated', sub: authId.design, expect: 'error', match: 'PM·운영 담당만' })
  scenario('운영가이드 구조화: ops는 저장 가능', `${gdSetup}
select count(*) from save_guide_sections('${GD}', '[${staffing}]'::jsonb);
${assertSql(`(select count(*) from guide_sections where deliverable_id = '${GD}') = 1`)}`, { role: 'authenticated', sub: authId.ops })

  // 5j. 시나리오 비상 예비 멘트 (Phase 3.24 PR-B · 설계서 v2.13 §23.6) — kind 'emergency' 저장 · 모르는 kind 거부
  const SC = '00000000-0000-4000-8000-00000000a325'
  const scSetup = `reset role;
insert into deliverables (id, project_id, area, category, title) values ('${SC}', '${PRJ}', 'ops', '시나리오', '원고형 시나리오 검사');
set local role authenticated;`
  scenario('시나리오 원고형: 비상 예비 멘트(emergency)를 세션·시각 없이 저장 · 기존 kind와 섞여도 순서 그대로', `${scSetup}
select count(*) from save_scenario_blocks('${SC}', '[{"kind":"mc","time":"14:00","script":"환영합니다.","note":"무대 조명 업"},{"kind":"emergency","script":"잠시만 기다려 주십시오.","note":"음향 교체"}]'::jsonb);
${assertSql(`(select kind from scenario_blocks where deliverable_id = '${SC}' order by sort_order offset 1 limit 1) = 'emergency'`)}
${assertSql(`(select session_id is null and "time" is null and note = '음향 교체' from scenario_blocks where deliverable_id = '${SC}' and kind = 'emergency')`)}`, { role: 'authenticated', sub: authId.ops })
  scenario('시나리오 원고형: 모르는 kind → 거부', `${scSetup}
select count(*) from save_scenario_blocks('${SC}', '[{"kind":"banquet","script":"x"}]'::jsonb);`, { role: 'authenticated', sub: authId.pm, expect: 'error', match: 'scenario_blocks_kind_check' })

  // 6. 시크릿 커밋 가드 (§8 DoD 9) — 실키 값 패턴이 레포 파일에 없는가
  const grep = spawnSync('grep', ['-rnE', 'sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,}', 'src', 'supabase', 'scripts', '--include=*.ts', '--include=*.tsx', '--include=*.sql', '--include=*.mjs', '--include=*.md'], { encoding: 'utf8' })
  record('시크릿 커밋 가드: sb_secret_/sbp_ 실키 패턴 0건 (DoD 9)', grep.status === 1, grep.stdout)
  const gi = readFileSync(join(root, '.gitignore'), 'utf8')
  record('.gitignore에 .env.* (env.local 커밋 차단)', /^\.env\.\*$/m.test(gi))

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 통과${failed.length ? ` — 실패 ${failed.length}건` : ''}`)
  if (!keepDb) psql(['-c', `drop database if exists ${dbName}`], { db: 'postgres' })
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
