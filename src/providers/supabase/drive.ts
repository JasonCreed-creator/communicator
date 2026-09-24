// SupabaseProvider ↔ api/drive 다리 — 설계서 v2.9 §7 · Phase 5 (DataProvider 125메서드 불변, 도메인 내부 동작만 바뀐다).
//   · ready(): Drive가 설정·연결됐는가(60초 캐시) — 아니면 업로드는 Phase 4 경로(세션 메모리)로 간다
//   · fileUrl(): 버전 파일 서명 URL — 같은 틱에 요청된 버전을 한 번에 묻는다(항목 상세의 버전 N개 = 요청 1회)
//   · scanThrottled(): 인박스 조회 전 Drive 스캔 — 행사당 60초에 1회, 8초 넘으면 기다리지 않는다
// 실패는 전부 조용히 접는다(자리표시 미리보기·기존 인박스) — Drive가 없어도 화면 동작은 그대로(§9 원칙 준용).
import { createDriveClient, type DriveClient, type DriveStatus } from '../../lib/drive/driveClient'
import type { UUID } from '../../types/entities'
import type { SupabaseCtx } from './ctx'

const STATUS_TTL_MS = 60_000
const URL_TTL_MS = 45 * 60_000
const SCAN_EVERY_MS = 60_000
const SCAN_WAIT_MS = 8_000

export interface DriveBridge {
  client: DriveClient
  status(force?: boolean): Promise<DriveStatus | null>
  ready(): Promise<boolean>
  fileUrl(versionId: UUID): Promise<string | null>
  scanThrottled(projectId: UUID): Promise<void>
  ensureTreeQuietly(projectId: UUID): void
}

const bridges = new WeakMap<SupabaseCtx, DriveBridge>()

export function driveFor(ctx: SupabaseCtx): DriveBridge {
  const hit = bridges.get(ctx)
  if (hit) return hit

  const client = createDriveClient({
    apiBase: ctx.env.apiBase,
    accessToken: async () => (await ctx.sb.auth.getSession()).data.session?.access_token ?? null,
  })

  let statusCache: { at: number; value: DriveStatus | null } | null = null
  const urlCache = new Map<UUID, { url: string | null; at: number }>()
  let pending = new Map<UUID, ((url: string | null) => void)[]>()
  let flushScheduled = false
  const lastScan = new Map<UUID, number>()

  async function flush(): Promise<void> {
    flushScheduled = false
    const batch = pending
    pending = new Map()
    const ids = [...batch.keys()]
    let urls: Record<string, string | null> = {}
    try {
      urls = await client.fileUrls(ids)
    } catch {
      urls = {}
    }
    const now = Date.now()
    for (const id of ids) {
      const url = urls[id] ?? null
      urlCache.set(id, { url, at: now })
      for (const resolve of batch.get(id) ?? []) resolve(url)
    }
  }

  const bridge: DriveBridge = {
    client,

    async status(force = false) {
      if (!force && statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value
      let value: DriveStatus | null = null
      try {
        value = await client.status()
      } catch {
        value = null
      }
      statusCache = { at: Date.now(), value }
      return value
    },

    async ready() {
      const s = await bridge.status()
      return Boolean(s?.configured && s.connected)
    },

    fileUrl(versionId) {
      const cached = urlCache.get(versionId)
      if (cached && Date.now() - cached.at < URL_TTL_MS) return Promise.resolve(cached.url)
      return new Promise((resolve) => {
        const list = pending.get(versionId) ?? []
        list.push(resolve)
        pending.set(versionId, list)
        if (!flushScheduled) {
          flushScheduled = true
          setTimeout(() => void flush(), 0)
        }
      })
    },

    async scanThrottled(projectId) {
      const last = lastScan.get(projectId) ?? 0
      if (Date.now() - last < SCAN_EVERY_MS) return
      lastScan.set(projectId, Date.now())
      if (!(await bridge.ready())) return
      const scan = client.scan(projectId).catch(() => undefined)
      await Promise.race([scan, new Promise((r) => setTimeout(r, SCAN_WAIT_MS))])
    },

    ensureTreeQuietly(projectId) {
      void (async () => {
        if (!(await bridge.ready())) return
        await client.ensureTree(projectId)
      })().catch((e) => console.warn('[drive] 행사 폴더 생성 실패(나중에 첫 업로드 때 다시 시도):', e instanceof Error ? e.message : e))
    },
  }
  bridges.set(ctx, bridge)
  return bridge
}
