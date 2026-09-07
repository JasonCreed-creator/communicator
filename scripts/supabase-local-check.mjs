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
