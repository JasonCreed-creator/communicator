// 표준 폴더 트리 — 설계서 §7.1(jc-workspace-ops 표준 준용, 새 트리 발명 금지) + v2.9 §7.1b 루트 규약.
//
//   {DRIVE_ROOT}/                      사용자 지정 저장소 루트(2026-09-24 "MICE Communicator")
//   ├ 00_견적서/                       견적 스프레드시트(Phase 4.2 — GOOGLE_QUOTE_FOLDER_ID가 없을 때 기본)
//   ├ {YYMMDD}_{코드}_{행사명}/         행사 루트 = projects.drive_root_folder_id
//   │  ├ 01_기획 · 02_견적·정산 · 03_회의록
//   │  ├ 04_운영/{항목명}/              ops 영역
//   │  ├ 05_산출물/디자인/{항목명}/      design 영역
//   │  ├ 06_발주처공유                   final 스냅숏 전용(앱만 기록 §7.5)
//   │  └ 99_archive
//   └ 99_archive/                      삭제된 행사 폴더 보관(v2.9 — Phase 4.1 이탈 2 해소)
//
// 멱등: 폴더는 "있으면 쓰고 없으면 만든다". 행사·항목 폴더는 appProperties(앱 전용 표식)로 다시 찾으므로 DB 기록 전에
// 끊겨도 두 번째 실행이 같은 폴더를 채택한다(중복 0). 파트 폴더는 표준 이름으로 찾는다 — 사람이 미리 만든 폴더도 그대로 쓴다.
import { DriveError } from './errors.js'
import { FOLDER_MIME, qEscape, type DriveApi, type DriveFile } from './googleDrive.js'
import type { DeliverableRow, DriveStore, ProjectRow } from './store.js'

export const QUOTE_FOLDER = '00_견적서'
export const ARCHIVE_FOLDER = '99_archive'
export const PART = {
  plan: '01_기획',
  money: '02_견적·정산',
  minutes: '03_회의록',
  ops: '04_운영',
  output: '05_산출물',
  share: '06_발주처공유',
  archive: '99_archive',
} as const
export const DESIGN_SUBFOLDER = '디자인'
/** 행사 트리에서 스캔(인박스)하지 않는 파트 — 앱이 쓰는 발주처 공유본과 보관함 */
export const SCAN_EXCLUDED_PARTS: readonly string[] = [PART.share, PART.archive]

export const APP_PROJECT_KEY = 'communicator_project_id'
export const APP_DELIVERABLE_KEY = 'communicator_deliverable_id'
export const APP_UPLOAD_KEY = 'communicator_upload'
export const APP_SNAPSHOT_KEY = 'communicator_snapshot'

/** Drive 이름 정리 — 경로 구분자·제어문자 제거, 공백 정리, 길이 상한. 빈 값은 '이름 없음' */
export function sanitizeName(s: string, max = 120): string {
  const cleaned = String(s ?? '')
    .replace(/[\\/\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
  return cleaned || '이름 없음'
}

/** 행사 루트 이름: YYMMDD_코드_행사명 (행사일이 없으면 코드_행사명) */
export function projectFolderName(p: Pick<ProjectRow, 'code' | 'name' | 'event_date'>): string {
  const code = sanitizeName(p.code, 40)
  const name = sanitizeName(p.name, 80)
  const m = (p.event_date ?? '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}${m[2]}${m[3]}_${code}_${name}` : `${code}_${name}`
}

/**
 * 항목 → 폴더 경로(§7.1 영역 매핑). leaf=null이면 항목 전용 하위 폴더 없이 파트 폴더에 바로 둔다(공통 문서).
 * design → 05_산출물/디자인/{항목} · ops → 04_운영/{항목} · common: 회의록 → 03_회의록 · 견적·정산·계약·예산 → 02 · 그 외 01_기획
 */
export function itemFolderPlan(d: Pick<DeliverableRow, 'area' | 'category' | 'title'>): { path: string[]; leaf: string | null } {
  if (d.area === 'design') return { path: [PART.output, DESIGN_SUBFOLDER], leaf: sanitizeName(d.title) }
  if (d.area === 'ops') return { path: [PART.ops], leaf: sanitizeName(d.title) }
  const c = d.category ?? ''
  if (c.includes('회의록')) return { path: [PART.minutes], leaf: null }
  if (/견적|정산|계약|예산/.test(c)) return { path: [PART.money], leaf: null }
  return { path: [PART.plan], leaf: null }
}

function childFolderQuery(parentId: string, name: string): string {
  return `'${qEscape(parentId)}' in parents and name = '${qEscape(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`
}

function appPropQuery(parentId: string, key: string, value: string): string {
  return `'${qEscape(parentId)}' in parents and appProperties has { key='${qEscape(key)}' and value='${qEscape(value)}' } and trashed = false`
}

/** parent 아래 name 폴더를 찾거나 만든다(표준 이름 — 사람이 만든 폴더도 채택) */
export async function ensureChildFolder(api: DriveApi, parentId: string, name: string): Promise<string> {
  const found = await api.list(childFolderQuery(parentId, name), undefined, 10)
  if (found.files?.[0]) return found.files[0].id
  const created = await api.createFolder(name, parentId)
  return created.id
}

async function usableFolder(api: DriveApi, id: string | null | undefined): Promise<DriveFile | null> {
  if (!id) return null
  const f = await api.getFile(id)
  return f && !f.trashed && f.mimeType === FOLDER_MIME ? f : null
}

export interface ProjectTree {
  rootId: string
  created: boolean
  parts: Record<string, string>
}

/** 루트 바로 아래 공용 폴더(00_견적서·99_archive) — 연결 직후·견적 시트·행사 보관에 쓴다 */
export async function ensureRootFolders(api: DriveApi, driveRoot: string): Promise<{ quote: string; archive: string }> {
  return {
    quote: await ensureChildFolder(api, driveRoot, QUOTE_FOLDER),
    archive: await ensureChildFolder(api, driveRoot, ARCHIVE_FOLDER),
  }
}

/** 행사 루트 폴더의 파트 7종 + 05_산출물/디자인 — 있으면 쓰고 없으면 만든다(사람이 지운 파트 폴더도 복구) */
export async function ensureParts(api: DriveApi, rootId: string): Promise<Record<string, string>> {
  const parts: Record<string, string> = {}
  for (const name of Object.values(PART)) parts[name] = await ensureChildFolder(api, rootId, name)
  parts[`${PART.output}/${DESIGN_SUBFOLDER}`] = await ensureChildFolder(api, parts[PART.output], DESIGN_SUBFOLDER)
  return parts
}

/** 행사 루트 아래 파트 경로 하나만(예: ['05_산출물','디자인']) — 업로드마다 7종을 다 확인하지 않는다 */
export async function ensurePartPath(api: DriveApi, rootId: string, path: readonly string[]): Promise<string> {
  let id = rootId
  for (const seg of path) id = await ensureChildFolder(api, id, seg)
  return id
}

/**
 * 행사 루트를 보장한다. 순서: DB에 적힌 폴더(살아 있으면) → appProperties로 찾기 → 새로 만들기. 바뀌면 DB에 기록.
 * 새로 만든 경우에만 파트 폴더 전체를 함께 만든다 — 사람이 Drive에서 처음 볼 때 표준 구조가 다 보이도록.
 */
export async function ensureProjectRoot(
  api: DriveApi,
  store: Pick<DriveStore, 'setProjectRoot' | 'log'>,
  driveRoot: string,
  project: ProjectRow,
): Promise<{ rootId: string; created: boolean }> {
  let root = await usableFolder(api, project.drive_root_folder_id)
  let created = false
  if (!root) {
    const tagged = await api.list(appPropQuery(driveRoot, APP_PROJECT_KEY, project.id), undefined, 5)
    root = tagged.files?.find((f) => f.mimeType === FOLDER_MIME) ?? null
  }
  if (!root) {
    root = await api.createFolder(projectFolderName(project), driveRoot, { [APP_PROJECT_KEY]: project.id })
    created = true
    await ensureParts(api, root.id)
  }
  if (root.id !== project.drive_root_folder_id) {
    await store.setProjectRoot(project.id, root.id)
    project.drive_root_folder_id = root.id
    await store.log(project.id, created ? 'drive.tree_created' : 'drive.tree_linked', 'project', project.id, { folder_id: root.id })
  }
  return { rootId: root.id, created }
}

/** 행사 트리 전체(루트 + 파트) — '폴더 만들기·구조 확인' 버튼과 기존 폴더 채택에서 쓴다 */
export async function ensureProjectTree(
  api: DriveApi,
  store: Pick<DriveStore, 'setProjectRoot' | 'log'>,
  driveRoot: string,
  project: ProjectRow,
): Promise<ProjectTree> {
  const { rootId, created } = await ensureProjectRoot(api, store, driveRoot, project)
  return { rootId, created, parts: await ensureParts(api, rootId) }
}

/**
 * 항목 폴더를 보장한다(업로드·링크 복사 대상). 공통 문서(leaf=null)는 파트 폴더 자체.
 * 항목 폴더 채택 순서: DB drive_folder_id → appProperties(이 항목) → 같은 이름이면서 다른 항목 표식이 없는 폴더(사람이 미리 만든 것)
 * → 새로 만들기(같은 이름이 다른 항목 것이면 " (2)"…). 결과를 deliverables.drive_folder_id에 기록.
 */
export async function ensureItemFolder(
  api: DriveApi,
  store: Pick<DriveStore, 'setProjectRoot' | 'setItemFolder' | 'log'>,
  driveRoot: string,
  project: ProjectRow,
  deliverable: DeliverableRow,
): Promise<{ folderId: string; rootId: string }> {
  const plan = itemFolderPlan(deliverable)
  // 살아 있는 항목 폴더가 이미 기록돼 있으면 트리를 다시 돌지 않는다(업로드마다 API 호출 최소화)
  const known = plan.leaf !== null ? await usableFolder(api, deliverable.drive_folder_id) : null
  if (known && project.drive_root_folder_id) return { folderId: known.id, rootId: project.drive_root_folder_id }
  const { rootId } = await ensureProjectRoot(api, store, driveRoot, project)
  const partId = await ensurePartPath(api, rootId, plan.path)
  if (!partId) throw new DriveError(500, 'validation', `표준 폴더(${plan.path.join('/')})를 찾지 못했습니다.`)

  let folderId: string | null = null
  if (plan.leaf === null) {
    folderId = partId
  } else {
    folderId = known?.id ?? null
    if (!folderId) {
      const tagged = await api.list(appPropQuery(partId, APP_DELIVERABLE_KEY, deliverable.id), undefined, 5)
      folderId = tagged.files?.find((f) => f.mimeType === FOLDER_MIME)?.id ?? null
    }
    if (!folderId) {
      const sameName = await api.list(childFolderQuery(partId, plan.leaf), undefined, 10)
      const free = sameName.files?.find((f) => !f.appProperties?.[APP_DELIVERABLE_KEY])
      if (free) {
        await api.update(free.id, { appProperties: { [APP_DELIVERABLE_KEY]: deliverable.id } })
        folderId = free.id
      } else {
        let name = plan.leaf
        for (let n = 2; (sameName.files ?? []).some((f) => f.name === name) && n < 50; n++) name = `${plan.leaf} (${n})`
        folderId = (await api.createFolder(name, partId, { [APP_DELIVERABLE_KEY]: deliverable.id })).id
      }
    }
  }
  if (folderId !== deliverable.drive_folder_id) {
    await store.setItemFolder(deliverable.id, folderId)
    deliverable.drive_folder_id = folderId
  }
  return { folderId, rootId }
}

/**
 * file부터 위로 올라가며 만나는 id(자기 자신 포함). Drive 단일 부모 모델 · 깊이 상한 20 ·
 * 볼 수 없는 부모에서 멈춘다 · stopAt(저장소 루트)에 닿으면 더 올라가지 않는다(불필요한 호출·루트 밖 탐색 방지).
 */
export async function ancestorIds(api: DriveApi, file: Pick<DriveFile, 'id' | 'parents'>, stopAt?: string): Promise<Set<string>> {
  const out = new Set<string>([file.id])
  if (file.id === stopAt) return out
  let parents = file.parents ?? []
  for (let depth = 0; depth < 20 && parents.length > 0; depth++) {
    const pid = parents[0]
    if (out.has(pid)) break
    out.add(pid)
    if (pid === stopAt) break
    const parent = await api.getFile(pid, 'id,parents')
    if (!parent) break
    parents = parent.parents ?? []
  }
  return out
}

/** file이 ancestorId 아래(또는 그 자체)인가 */
export async function isUnderFolder(api: DriveApi, file: Pick<DriveFile, 'id' | 'parents'>, ancestorId: string): Promise<boolean> {
  return (await ancestorIds(api, file, ancestorId)).has(ancestorId)
}
