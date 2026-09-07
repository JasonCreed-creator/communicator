// supabase/seed.sql 생성기 — MockProvider 픽스처(createFixtureState)를 그대로 SQL로 옮긴다.
// 설계서 §18-3 "seed.sql(데모 픽스처, 선택 실행)". mock과 데모 DB가 같은 데이터를 보도록
// 손으로 적지 않고 픽스처에서 생성한다. 픽스처 id는 문자열('prj-stc26')이라 seedUuid로 결정적 uuid에 매핑한다.
//
// 실행(esbuild 번들 → node):
//   npm run supabase:seed
// 멱등: 모든 insert는 on conflict do nothing, activity_log는 시드 행사분을 지우고 다시 넣는다.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFixtureState } from '../src/fixtures/sampleProject'
import type { MockState } from '../src/fixtures/sampleProject'
import { seedUuid } from './lib/seedUuid'

type Row = Record<string, unknown>

const ID_KEY = /(^id$|_id$|^token$|_token$|_by$|^user_id$|^superseded_by$)/

function collectIds(state: MockState): Set<string> {
  const ids = new Set<string>()
  const tables = Object.entries(state).filter(([k, v]) => Array.isArray(v) && k !== 'sheet_source_rows')
  for (const [, rows] of tables) {
    for (const row of rows as Row[]) {
      if (typeof row.id === 'string') ids.add(row.id)
      if (typeof row.token === 'string') ids.add(row.token)
    }
  }
  for (const k of Object.keys(state.landing_metrics)) ids.add(k)
  return ids
}

function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
}

interface TableSpec {
  table: string
  rows: Row[]
  /** DDL 열 목록 — 이 순서로만 insert(TS에만 있는 필드는 버린다) */
  columns: string[]
  conflict: string
  /** 자기 참조·후행 FK — insert 때 null로 넣고 뒤에서 update */
  deferred?: string[]
}

function mapIds(row: Row, ids: Set<string>): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && ID_KEY.test(k) && ids.has(v)) out[k] = seedUuid(v)
    else if (k === 'actor' && typeof v === 'string') {
      const m = v.match(/^(user|client):(.+)$/)
      out[k] = m && ids.has(m[2]) ? `${m[1]}:${seedUuid(m[2])}` : v
    } else out[k] = v
  }
  return out
}

function insertSql(spec: TableSpec, ids: Set<string>): { insert: string; deferred: string[] } {
  if (spec.rows.length === 0) return { insert: `-- ${spec.table}: 픽스처 없음\n`, deferred: [] }
  const cols = spec.columns
  const deferredCols = new Set(spec.deferred ?? [])
  const mapped = spec.rows.map((raw) => mapIds(raw, ids))
  const values = mapped.map((row) => `  (${cols.map((c) => (deferredCols.has(c) ? 'null' : lit(row[c]))).join(', ')})`)
  const insert = `insert into ${spec.table} (${cols.join(', ')}) values\n${values.join(',\n')}\non conflict ${spec.conflict} do nothing;\n`
  // 자기 참조·후행 FK는 모든 표를 넣은 뒤 한 번에 갱신한다(quotes ↔ projects 상호 링크, quotes.superseded_by 체인)
  const deferred: string[] = []
  for (const col of deferredCols) {
    for (const row of mapped) {
      if (row[col] != null) deferred.push(`update ${spec.table} set ${col} = ${lit(row[col])} where id = ${lit(row.id)};`)
    }
  }
  return { insert, deferred }
}

export function buildSeedSql(): string {
  const state = createFixtureState()
  const ids = collectIds(state)

  // profiles = users(주소록: name·title·phone) ⨝ profiles(app_role). 프로필 행이 없는 사용자는 staff
  const profileById = new Map(state.profiles.map((p) => [p.id, p]))
  const profiles: Row[] = state.users.map((u) => {
    const p = profileById.get(u.id)
    return {
      id: u.id,
      display_name: p?.display_name ?? u.name,
      email: u.email ?? `${u.id}@example.invalid`,
      app_role: p?.app_role ?? 'staff',
      title: u.title ?? null,
      phone: u.phone ?? null,
      org: null,
      created_at: p?.created_at ?? '2026-08-01T09:00:00.000Z',
    }
  })

  const metrics: Row[] = Object.entries(state.landing_metrics).flatMap(([landingId, rows]) =>
    rows.map((m) => ({ landing_id: landingId, ...m })),
  )

  const sourceRows: Row[] = state.sheet_source_rows.map((r, i, all) => ({
    ...r,
    row_number: all.filter((x) => x.project_id === r.project_id).indexOf(r) + 1,
    invalid_reason: r.invalid_reason ?? null,
    previously_confirmed: r.previously_confirmed ?? false,
  }))

  const specs: TableSpec[] = [
    { table: 'profiles', rows: profiles, conflict: '(id)',
      columns: ['id','display_name','email','app_role','title','phone','org','created_at'] },
    { table: 'projects', rows: state.projects as Row[], conflict: '(id)', deferred: ['quote_id'],
      columns: ['id','name','code','kind','event_date','event_end_date','start_time','end_time','expected_headcount','seating','organizer',
        'target_audience','status','closed_at','guarantee_pax','kpi_show_rate','targeting','quote_id','drive_root_folder_id','slack_webhook_url',
        'event_type','format','psa_enabled','audience_model','theme','venue','mc_name','overview_items','onboarded_at',
        'partner_guide_url','partner_contact_email','created_by','created_at'] },
    { table: 'project_members', rows: state.members as Row[], conflict: '(project_id, user_id)',
      columns: ['project_id','user_id','role'] },
    { table: 'partner_tiers', rows: state.partner_tiers as Row[], conflict: '(id)',
      columns: ['id','project_id','code','name','description','capacity','sort','session_slots','booth_included','staff_cap','price'] },
    { table: 'partners', rows: state.partners as Row[], conflict: '(id)',
      columns: ['id','project_id','name','tier_id','status','contract_amount','note','booth_no','booth_size','booth_power','booth_internet','created_at'] },
    { table: 'partner_tokens', rows: state.partner_tokens as Row[], conflict: '(id)',
      columns: ['id','partner_id','contact_name','contact_email','token','expires_at','revoked_at','last_seen_at','created_at'] },
    { table: 'client_contacts', rows: state.client_contacts as Row[], conflict: '(id)',
      columns: ['id','project_id','name','org','email','phone'] },
    { table: 'client_tokens', rows: state.client_tokens as Row[], conflict: '(token)',
      columns: ['token','project_id','contact_id','expires_at','revoked_at','last_seen_at','created_at'] },
    { table: 'deliverables', rows: state.deliverables as Row[], conflict: '(id)',
      columns: ['id','project_id','area','category','title','status','assignee_id','due_date','drive_folder_id','requires_approval',
        'brief','brief_refs','spec_size','spec_qty','spec_location','spec_type','content','partner_id','created_at','updated_at'] },
    { table: 'versions', rows: state.versions as Row[], conflict: '(id)',
      columns: ['id','deliverable_id','version_no','drive_file_id','file_name','note','uploaded_by','created_at'] },
    { table: 'approvals', rows: state.approvals as Row[], conflict: '(id)',
      columns: ['id','deliverable_id','version_id','requested_by','requested_at','due_at','decided_at','decision','client_comment','decided_via_token'] },
    { table: 'comments', rows: state.comments as Row[], conflict: '(id)',
      columns: ['id','deliverable_id','author_user_id','author_token','visibility','body','created_at'] },
    { table: 'milestones', rows: state.milestones as Row[], conflict: '(id)',
      columns: ['id','project_id','title','area','due_date','done'] },
    { table: 'rsvp_contacts', rows: state.rsvp_contacts as Row[], conflict: '(id)',
      columns: ['id','project_id','name','org','title','email','phone','group_tag','invite_status','invited_at','responded_at','memo'] },
    { table: 'attendees', rows: state.attendees as Row[], conflict: '(id)',
      columns: ['id','project_id','rsvp_contact_id','name','org','email','phone','channel','registered_at','checked_in_at','badge_no',
        'sheet_row_id','title','group_tag','sheet_status','note'] },
    { table: 'program_sessions', rows: state.program_sessions as Row[], conflict: '(id)',
      columns: ['id','project_id','section','start_time','end_time','title','speaker_name','speaker_title','speaker_org','note','track','sort_order'] },
    { table: 'cues', rows: state.cues as Row[], conflict: '(id)',
      columns: ['id','deliverable_id','cue_no','time_at','segment','body','console_audio','console_light','console_screen','sort_order'] },
    { table: 'scenario_blocks', rows: state.scenario_blocks as Row[], conflict: '(id)',
      columns: ['id','deliverable_id','session_id','time','kind','script','note','sort_order'] },
    { table: 'guide_sections', rows: state.guide_sections as Row[], conflict: '(id)',
      columns: ['id','deliverable_id','kind','title','content','source_ref','source_stale','sort_order'] },
    { table: 'wbs_tasks', rows: state.wbs_tasks as Row[], conflict: '(id)',
      columns: ['id','project_id','phase_no','phase_name','code','title','offset_start','offset_end','start_date','end_date','role','origin_role',
        'status','done_at','linked_deliverable_id','target','direction','partner_id','note','sort_order'] },
    { table: 'role_charters', rows: state.role_charters as Row[], conflict: '(id)',
      columns: ['id','project_id','role','origin_role','title','items'] },
    { table: 'compliance_cards', rows: state.compliance_cards as Row[], conflict: '(id)',
      columns: ['id','project_id','kind','title','items','sort_order'] },
    { table: 'quotes', rows: state.quotes as Row[], conflict: '(id)', deferred: ['superseded_by'],
      columns: ['id','project_id','title','version','status','is_final','locked_at','superseded_by','input','breakdown','total_amount','source',
        'created_by','created_at','updated_at'] },
    { table: 'quote_imports', rows: state.quote_imports as Row[], conflict: '(id)',
      columns: ['id','project_id','file_name','format','parsed','mapping','status','quote_id','created_by','created_at'] },
    { table: 'landing_pages', rows: state.landing_pages as Row[], conflict: '(id)',
      columns: ['id','project_id','title','slug','status','public_url','sticky_nav','cta_label','submit_target','external_submit_url','analytics',
        'sections','form_fields','consents','created_at','updated_at','published_at'] },
    { table: 'landing_daily_metrics', rows: metrics, conflict: '(landing_id, date)',
      columns: ['landing_id','date','views','unique_visitors','form_starts','submits'] },
    { table: 'vendors', rows: state.vendors as Row[], conflict: '(id)',
      columns: ['id','name','biz_no','note','archived_at','created_at'] },
    { table: 'settlement_boards', rows: state.settlement_boards as Row[], conflict: '(id)',
      columns: ['id','project_id','quote_id','quote_version','baselined_at','created_at','updated_at'] },
    { table: 'settlement_buckets', rows: state.settlement_buckets as Row[], conflict: '(id)',
      columns: ['id','board_id','code','label','quote_amount','has_cost','is_margin_base','source','sort_order','created_at'] },
    { table: 'settlement_items', rows: state.settlement_items as Row[], conflict: '(id)',
      columns: ['id','board_id','bucket_id','title','spec','vendor_id','assignee_id','ordered_amount','actual_amount','input_amount_raw',
        'vat_included_input','status','evidence','import_id','note','created_at','updated_at'] },
    { table: 'sheet_connections', rows: state.sheet_connections as Row[], conflict: '(id)',
      columns: ['id','project_id','state','title','url','tab_name','mapping','connected_at','connected_by','snapshot_at','snapshot_version',
        'checked_at','auto_check_minutes','source_modified_at','pending_added','pending_changed','pending_removed','failure_times','last_success_at'] },
    { table: 'sheet_source_rows', rows: sourceRows, conflict: '(project_id, sheet_row_id)',
      columns: ['project_id','sheet_row_id','row_number','name','org','title','email','phone','group_tag','registered_at','status','invalid_reason','previously_confirmed'] },
    { table: 'unregistered_files', rows: state.unregistered_files as Row[], conflict: '(id)',
      columns: ['id','project_id','drive_file_id','file_name','detected_folder','detected_at','linked_deliverable_id','dismissed'] },
  ]

  // 정합 검사: TS 행에 있지만 DDL 열 목록에 없는 키는 생성 시점에 드러낸다(조용히 버리지 않는다)
  const dropped = new Map<string, Set<string>>()
  for (const spec of specs) {
    const cols = new Set(spec.columns)
    for (const row of spec.rows) {
      for (const k of Object.keys(row)) if (!cols.has(k)) dropped.set(spec.table, (dropped.get(spec.table) ?? new Set()).add(k))
    }
  }

  const projectIds = state.projects.map((p) => seedUuid(p.id))
  const activity = state.activity_log.map((e) => mapIds(e as unknown as Row, ids))

  const parts: string[] = []
  parts.push(`-- ═══════════════════════════════════════════════════════════════════════
-- MICE 커뮤니케이터 · Supabase seed.sql (생성물 — 직접 편집 금지)
-- 원본: src/fixtures(createFixtureState) — 데모 행사 ${state.projects.length}건. 재생성: npm run supabase:seed
-- 선택 실행(설계서 §18-3): setup.sql 뒤에 SQL Editor에서 1회. 운영 프로젝트에는 실행하지 않아도 된다.
-- 멱등: 재실행해도 중복 없음. 픽스처 문자열 id는 md5('communicator-seed:'||id)::uuid 로 결정적 매핑.
--
-- 데모 행사에 본인을 pm으로 붙이려면(첫 로그인 전·후 모두 가능):
--   select app.grant_demo_access('you@company.com');
-- ═══════════════════════════════════════════════════════════════════════
set client_min_messages to warning;
begin;
`)
  const deferredUpdates: string[] = []
  for (const spec of specs) {
    const { insert, deferred } = insertSql(spec, ids)
    parts.push(`-- ── ${spec.table} (${spec.rows.length}행)\n${insert}`)
    deferredUpdates.push(...deferred)
  }
  if (deferredUpdates.length) {
    parts.push(`-- ── 후행 FK 갱신 (${deferredUpdates.length}건) — projects.quote_id · quotes.superseded_by\n${deferredUpdates.join('\n')}\n`)
  }

  parts.push(`-- ── activity_log (${activity.length}행) — identity id라 시드 행사분을 지우고 다시 넣는다
delete from activity_log where project_id in (${projectIds.map((id) => lit(id)).join(', ')});
`)
  if (activity.length) {
    parts.push(
      `insert into activity_log (project_id, actor, action, target_type, target_id, meta, created_at) values\n` +
        activity
          .map((e) => `  (${['project_id','actor','action','target_type','target_id','meta','created_at'].map((c) => lit(e[c])).join(', ')})`)
          .join(',\n') +
        ';\n',
    )
  }

  parts.push(`-- ── 데모 접근 부여: 이메일의 프로필을 admin으로 승격(없으면 생성)하고 시드 행사 전부에 pm으로 배정
create or replace function app.grant_demo_access(p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := app.promote_admin(p_email);
  insert into project_members (project_id, user_id, role)
  select p.id, v_id, 'pm' from projects p where p.id in (${projectIds.map((id) => lit(id)).join(', ')})
  on conflict (project_id, user_id) do nothing;
  return v_id;
end $$;
commit;
`)

  if (dropped.size) {
    const lines = [...dropped.entries()].map(([t, ks]) => `--   ${t}: ${[...ks].join(', ')}`)
    parts.push(`-- [생성기 메모] DDL에 열이 없어 버린 TS 필드(의도된 것만 있어야 한다):\n${lines.join('\n')}\n`)
  }
  return parts.join('\n')
}

const isMain = process.argv[1] && /gen-seed\.(ts|mjs|js)$/.test(process.argv[1])
if (isMain) {
  // 번들(esbuild)로 실행되므로 import.meta.url 대신 작업 디렉터리(레포 루트) 기준
  const out = join(process.cwd(), 'supabase', 'seed.sql')
  const sql = buildSeedSql()
  writeFileSync(out, sql)
  console.log(`supabase/seed.sql 생성 — ${sql.length.toLocaleString()} bytes`)
}
