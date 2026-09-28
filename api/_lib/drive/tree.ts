// 표준 폴더 트리 — 설계서 §7.1(v2.21.6 — Phase 6.10 보관 분류 폴더 · v2.17 운영 커뮤니케이션 프로토콜 v1.0 표준 폴더 정합) + v2.9 §7.1b 루트 규약.
//
//   {DRIVE_ROOT}/                      사용자 지정 저장소 루트(팀 폴더 — 2026-09-27 "아카이빙 폴더를 MICE Biz로")
//   ├ 00_견적서/                       견적 스프레드시트(Phase 4.2 — GOOGLE_QUOTE_FOLDER_ID가 없을 때 기본)
//   ├ {분류 폴더}/                     보관 분류 4종(src/lib/driveCategory — 사용자 실물 이름 그대로 · 없으면 만든다)
//   │  └ {YYMMDD}_{고객사}_{행사명}/    행사 루트 = projects.drive_root_folder_id (행사 ID — src/lib/projectLabel)
//   │     ├ 01_견적                      견적서 첨부(Phase 6.2) · 공통 견적 문서
//   │     ├ 02_계약                      공통 계약 문서
//   │     ├ 03_제작·키비주얼/{항목명}/    design 영역 항목 폴더 + 프로토콜 하위 KV · 초청장 · 현장물 · 납품(= final 스냅숏 전용 §7.5)
//   │     ├ 04_WBS·운영계획/{항목명}/     ops 영역 항목 폴더 + 회의록·기획 공통 문서(바로) + 마스터 시트(§27.5)
//   │     ├ 05_현장                      현장 자료(사람이 올림 — 인박스가 잡는다)
//   │     ├ 06_결과보고·정산/            협력사 견적서(Phase 4.7) · 정산·예산·결과보고 공통 문서
//   │     └ 99_archive                   지운 항목 폴더 보관(§7.8)
//   └ 99_archive/                      삭제된 행사 폴더 보관(v2.9 — Phase 4.1 이탈 2 해소)
//
// 분류 = 자동(주최형 → 자체행사 · 대행형 모객형 → 모객 · 대행형 일반형 → 비모객) + 설정 ③에서 고친 값(projects.drive_category).
// 연도 층(v2.17 `{YYYY}` · `연도 미정`)은 퇴역 — 아직 연도 폴더 아래 있는 행사 폴더는 다음 보장 때 분류 폴더로 옮긴다(옛 트리와 같은 규칙).
// 멱등: 폴더는 "있으면 쓰고 없으면 만든다". 행사·항목 폴더는 appProperties(앱 전용 표식)로 다시 찾으므로 DB 기록 전에
// 끊겨도 두 번째 실행이 같은 폴더를 채택한다(중복 0). 파트 폴더는 표준 이름으로 찾는다 — 사람이 미리 만든 폴더도 그대로 쓴다.
// 옛 트리(v2.9~v2.16 — 01_기획 · 02_견적·정산 · 03_회의록 · 04_운영 · 05_산출물/디자인 · 06_발주처공유)로 만든 행사 폴더는
// **이름과 자리(분류 폴더)만** 새 규칙으로 맞추고(syncProjectRootPlacement) 하위 폴더·파일은 건드리지 않는다(사용자 선택 2026-09-27).
// 그 안의 항목은 기록된 항목 폴더(deliverables.drive_folder_id)를 그대로 쓰고, 새 항목·새 파트만 새 이름으로 생긴다.
import { DriveError } from './errors.js'
import { FOLDER_MIME, qEscape, type DriveApi, type DriveFile } from './googleDrive.js'
import { projectLabel } from '../../../src/lib/projectLabel.js'
import { DRIVE_CATEGORY_FOLDERS, driveCategoryOfFolderName, isDriveCategoryFolderName, resolveDriveCategory } from '../../../src/lib/driveCategory.js'
import type { DriveCategory } from '../../../src/types/enums'
import type { DeliverableRow, DriveStore, ProjectRow } from './store.js'

export const QUOTE_FOLDER = '00_견적서'
export const ARCHIVE_FOLDER = '99_archive'
/** 행사 폴더 파트 6종 + 보관함 — 운영 커뮤니케이션 프로토콜 v1.0 표준 폴더(설계서 v2.17 §7.1 · §26.2) */
export const PART = {
  quote: '01_견적',
  contract: '02_계약',
  production: '03_제작·키비주얼',
  plan: '04_WBS·운영계획',
  onsite: '05_현장',
  report: '06_결과보고·정산',
  archive: '99_archive',
} as const
/** 03_제작·키비주얼 아래 프로토콜 하위 4종 — 사람이 쓰는 칸(앱의 design 항목 폴더는 03 바로 아래) · 납품 = final 스냅숏 전용 */
export const PRODUCTION_SUBFOLDERS = ['KV', '초청장', '현장물', '납품'] as const
export const DELIVERY_SUBFOLDER = '납품'
/** §7.5 확정 사본이 놓이는 경로(행사 루트 기준) */
export const DELIVERY_PATH: readonly string[] = [PART.production, DELIVERY_SUBFOLDER]
/** 옛 트리(v2.9~v2.16)의 발주처 공유본 폴더 — 기존 행사 폴더에 남아 있으므로 스캔에서 계속 뺀다 */
export const LEGACY_SHARE_FOLDER = '06_발주처공유'
/** 행사 트리에서 스캔(인박스)하지 않는 경로(행사 루트 기준) — 앱이 쓰는 납품 사본 · 보관함 · 옛 발주처공유 */
export const SCAN_EXCLUDED_PATHS: readonly string[] = [PART.archive, DELIVERY_PATH.join('/'), LEGACY_SHARE_FOLDER]
/** 옛 연도 층(v2.17 — 퇴역)의 폴더 이름 — 아직 남아 있는 연도 폴더를 알아보고 그 아래 행사 폴더를 분류 폴더로 옮기는 데만 쓴다 */
export const YEAR_UNKNOWN_FOLDER = '연도 미정'
const YEAR_FOLDER_RE = /^(19|20)\d{2}$/

export const APP_PROJECT_KEY = 'communicator_project_id'
export const APP_DELIVERABLE_KEY = 'communicator_deliverable_id'
export const APP_UPLOAD_KEY = 'communicator_upload'
export const APP_SNAPSHOT_KEY = 'communicator_snapshot'
/** v2.21 §27.5 — 앱이 내보낸 산출물(마스터 시트) 표식. 인박스 스캔이 미등록 파일로 올리지 않는다 */
export const APP_EXPORT_KEY = 'communicator_export'

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

/** 행사 루트 이름 = 행사 ID(YYMMDD_고객사_행사명 — 운영 프로토콜 v1.0). 행사일이 없으면 날짜 칸을, 고객사가 없으면 고객사 칸을 뺀다 */
export function projectFolderName(p: Pick<ProjectRow, 'name' | 'organizer' | 'event_date'>): string {
  return projectLabel(p)
}

/** 분류 폴더 이름 = 보관 분류(자동 + 설정 ③) — src/lib/driveCategory 정본 */
export function projectCategoryFolderName(p: Pick<ProjectRow, 'kind' | 'event_type' | 'drive_category'>): string {
  return DRIVE_CATEGORY_FOLDERS[resolveDriveCategory(p)]
}

/** 저장소 루트 바로 아래 옛 연도 폴더인가(2026 · 연도 미정) — 행사 폴더로 지정할 수 없고, 그 아래 행사 폴더는 분류 폴더로 옮긴다 */
export function isYearFolderName(name: string): boolean {
  return YEAR_FOLDER_RE.test(name) || name === YEAR_UNKNOWN_FOLDER
}

/** 저장소 루트 바로 아래 '자리 폴더'(분류 폴더 · 옛 연도 폴더)인가 — 행사 폴더로 지정할 수 없다(§7.1b 422) */
export function isPlacementFolderName(name: string): boolean {
  return isYearFolderName(name) || isDriveCategoryFolderName(name)
}

/**
 * 저장소 루트 바로 아래 분류 폴더를 찾거나 만든다 — 정확한 이름 → 낱말(비모객·모객·자체·일반 — 사람이 조금 다르게 적은 폴더 채택) →
 * 없을 때만 정본 이름으로 생성. 루트 바로 아래만 본다(행사 폴더 안의 같은 이름은 무관).
 */
export async function ensureCategoryFolder(api: DriveApi, driveRoot: string, category: DriveCategory): Promise<string> {
  const want = DRIVE_CATEGORY_FOLDERS[category]
  const exact = await api.list(childFolderQuery(driveRoot, want), undefined, 10)
  if (exact.files?.[0]) return exact.files[0].id
  const siblings = await api.listAll(`'${qEscape(driveRoot)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`, 200)
  const byWord = siblings.find((f) => driveCategoryOfFolderName(f.name) === category)
  if (byWord) return byWord.id
  return (await api.createFolder(want, driveRoot)).id
}

/**
 * 항목 → 폴더 경로(§7.1 영역 매핑). leaf=null이면 항목 전용 하위 폴더 없이 파트 폴더에 바로 둔다(공통 문서).
 * design → 03_제작·키비주얼/{항목} · ops → 04_WBS·운영계획/{항목} · common: 견적 → 01 · 계약 → 02 · 정산·예산·결과보고 → 06 · 그 외(회의록·기획) → 04
 */
export function itemFolderPlan(d: Pick<DeliverableRow, 'area' | 'category' | 'title'>): { path: string[]; leaf: string | null } {
  if (d.area === 'design') return { path: [PART.production], leaf: sanitizeName(d.title) }
  if (d.area === 'ops') return { path: [PART.plan], leaf: sanitizeName(d.title) }
  const c = d.category ?? ''
  if (c.includes('견적')) return { path: [PART.quote], leaf: null }
  if (c.includes('계약')) return { path: [PART.contract], leaf: null }
  if (/정산|예산|결과보고/.test(c)) return { path: [PART.report], leaf: null }
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

/** 행사 루트 폴더의 파트 6종 + 99_archive + 03_제작·키비주얼 하위 4종 — 있으면 쓰고 없으면 만든다(사람이 지운 파트 폴더도 복구) */
export async function ensureParts(api: DriveApi, rootId: string): Promise<Record<string, string>> {
  const parts: Record<string, string> = {}
  for (const name of Object.values(PART)) parts[name] = await ensureChildFolder(api, rootId, name)
  for (const sub of PRODUCTION_SUBFOLDERS) parts[`${PART.production}/${sub}`] = await ensureChildFolder(api, parts[PART.production], sub)
  return parts
}

/** 행사 루트 아래 파트 경로 하나만(예: ['03_제작·키비주얼','납품']) — 업로드마다 파트 전부를 다 확인하지 않는다 */
export async function ensurePartPath(api: DriveApi, rootId: string, path: readonly string[]): Promise<string> {
  let id = rootId
  for (const seg of path) id = await ensureChildFolder(api, id, seg)
  return id
}

/** 행사 표식(appProperties)이 붙은 폴더를 저장소 안에서 찾는다 — 루트 바로 아래(옛 트리)든 옛 연도 폴더·분류 폴더 아래든 */
async function findTaggedProjectRoot(api: DriveApi, driveRoot: string, projectId: string): Promise<DriveFile | null> {
  const tagged = await api.list(
    `appProperties has { key='${APP_PROJECT_KEY}' and value='${qEscape(projectId)}' } and mimeType = '${FOLDER_MIME}' and trashed = false`,
    undefined,
    10,
  )
  for (const f of tagged.files ?? []) {
    if (f.id !== driveRoot && (await ancestorIds(api, f, driveRoot)).has(driveRoot)) return f
  }
  return null
}

/**
 * 있는 행사 폴더를 규약 자리에 맞춘다(v2.17 [B1] — 사용자 선택 "기존 폴더는 이름만 새 규칙으로, 하위 폴더 그대로" · v2.21.6 분류 층).
 * 이름 = 행사 ID · 부모 = 저장소 루트/{분류 폴더}. 옮기는 경우는 부모가 저장소 루트 자체(옛 트리)이거나 옛 연도 폴더이거나
 * **다른 분류 폴더**(성격·유형·보관 분류가 바뀜)일 때만 — 사람이 루트 안 다른 곳(예: 고객사 폴더)에 두고 지정한 폴더는 자리를
 * 존중한다(이름만 맞춘다). 하위 폴더·파일은 건드리지 않는다. 바뀐 것이 있을 때만 PATCH 1회 + 로그(drive.tree_placed).
 */
export async function syncProjectRootPlacement(
  api: DriveApi,
  store: Pick<DriveStore, 'log'>,
  driveRoot: string,
  project: ProjectRow,
  root: DriveFile,
): Promise<{ renamed: boolean; moved: boolean }> {
  const wantName = projectFolderName(project)
  const renamed = root.name !== wantName
  const parentId = root.parents?.[0]
  let moveTo: string | null = null
  if (parentId) {
    const category = resolveDriveCategory(project)
    if (parentId === driveRoot) {
      moveTo = await ensureCategoryFolder(api, driveRoot, category)
    } else {
      const parent = await api.getFile(parentId, 'id,name,parents')
      const underRoot = !!parent && (parent.parents ?? []).includes(driveRoot)
      const wrongPlace = !!parent && underRoot && (isYearFolderName(parent.name) || (isDriveCategoryFolderName(parent.name) && driveCategoryOfFolderName(parent.name) !== category))
      if (wrongPlace) {
        const target = await ensureCategoryFolder(api, driveRoot, category)
        if (target !== parentId) moveTo = target
      }
    }
  }
  if (!renamed && !moveTo) return { renamed: false, moved: false }
  await api.update(root.id, renamed ? { name: wantName } : {}, moveTo ? { addParents: moveTo, removeParents: parentId } : {})
  root.name = wantName
  if (moveTo) root.parents = [moveTo]
  await store.log(project.id, 'drive.tree_placed', 'project', project.id, { folder_id: root.id, renamed, moved: !!moveTo, name: wantName })
  return { renamed, moved: !!moveTo }
}

/**
 * 행사 루트를 보장한다. 순서: DB에 적힌 폴더(살아 있으면) → appProperties로 찾기 → 새로 만들기(저장소 루트/{분류 폴더}/ 아래). 바뀌면 DB에 기록.
 * 새로 만든 경우에만 파트 폴더 전체를 함께 만든다 — 사람이 Drive에서 처음 볼 때 표준 구조가 다 보이도록.
 * 이미 있는 폴더는 이름·분류 자리를 규약에 맞춘다(syncProjectRootPlacement — 행사일·고객사·행사명·성격·유형·보관 분류가 바뀌면 여기서 따라간다).
 */
export async function ensureProjectRoot(
  api: DriveApi,
  store: Pick<DriveStore, 'setProjectRoot' | 'log'>,
  driveRoot: string,
  project: ProjectRow,
): Promise<{ rootId: string; created: boolean }> {
  let root = await usableFolder(api, project.drive_root_folder_id)
  let created = false
  if (!root) root = await findTaggedProjectRoot(api, driveRoot, project.id)
  if (!root) {
    const categoryId = await ensureCategoryFolder(api, driveRoot, resolveDriveCategory(project))
    root = await api.createFolder(projectFolderName(project), categoryId, { [APP_PROJECT_KEY]: project.id })
    created = true
    await ensureParts(api, root.id)
  } else {
    await syncProjectRootPlacement(api, store, driveRoot, project, root)
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
