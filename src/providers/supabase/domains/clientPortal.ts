// SupabaseProvider · 발주처 뷰 도메인 — /c/{token} 컨펌 큐(S7)·결정·현황(S8).
// §6.2: 토큰 경로는 RLS를 통과하지 않는다 — security definer RPC(client_queue·client_decide·client_status)가
// 토큰을 검증(미존재 404 · 회수·만료 410 · last_seen_at 갱신)한 뒤 **화이트리스트 쿼리만** 수행한다. 코멘트는
// shared만, 금액 키(quotes·settlement·contract_amount·tier.price)는 어느 함수도 읽지 않는다(§19.7·§21.2).
// 이 파일이 덧붙이는 것은 파일 URL(preview_url·file_url)과 §7.5 확정 복사 호출뿐이다.
// v2.9 §7.4: 파일 URL = api/drive 서명 프록시(토큰이 볼 수 있는 버전 목록은 SQL client_file_versions가 정한다) —
//   Drive에 없는 버전(시드·Phase 4 자리표시)이나 Drive 미연결이면 자리표시(files.fileUrlFor). 발주처에게 Drive 링크는 주지 않는다.
// v2.9 §7.5: 승인하면 client_decide가 (Drive가 살아 있는 행사에서) approved에 멈추고, 여기서 client-finalize를 불러
//   06_발주처공유 복사 성공 후 final로 마감한다. 호출이 실패해도 인박스 스캔이 재시도한다.
import type { DataProvider } from '../../DataProvider'
import type { SupabaseCtx } from '../ctx'
import { driveFor } from '../drive'
import { fileUrlFor } from '../files'
import { ProviderError } from '../../../lib/errors'
import type { ClientFinalItem, ClientQueue, ClientQueueItem, ClientStatusData } from '../../../types/views'

type ClientPortalDomain = Pick<DataProvider, 'getClientQueue' | 'submitClientDecision' | 'getClientStatus'>

/** client_tokens.token은 uuid — 형식이 아니면 RPC에 가기 전에 mock의 미존재 토큰과 같은 404 */
const TOKEN_RE = /^[0-9a-f-]{36}$/i

function assertTokenShape(token: string): string {
  if (!TOKEN_RE.test(token)) throw new ProviderError('not_found', '유효하지 않은 링크입니다.')
  return token
}

/** client_queue() 응답 — version에 preview_url이 없는 것 외에는 ClientQueue와 같다 */
type RawQueueItem = Omit<ClientQueueItem, 'version' | 'shared_comments'> & {
  version: Omit<ClientQueueItem['version'], 'preview_url'>
  shared_comments: ClientQueueItem['shared_comments'] | null
}
type RawQueue = Omit<ClientQueue, 'queue' | 'history'> & {
  queue: RawQueueItem[] | null
  history: ClientQueue['history'] | null
}

/** client_status() 응답 — recent_finals에 file_url이 없는 것 외에는 ClientStatusData와 같다 */
type RawStatus = Omit<ClientStatusData, 'recent_finals' | 'area_progress' | 'milestones' | 'staff'> & {
  recent_finals: Omit<ClientFinalItem, 'file_url'>[] | null
  area_progress: ClientStatusData['area_progress'] | null
  milestones: ClientStatusData['milestones'] | null
  staff: ClientStatusData['staff'] | null
}

/** 토큰이 볼 수 있는 버전의 서명 URL — 실패(Drive 미설정·네트워크)는 빈 표로 접는다(자리표시로 대체) */
async function clientUrls(ctx: SupabaseCtx, token: string): Promise<Record<string, string | null>> {
  try {
    return await driveFor(ctx).client.clientFileUrls(token)
  } catch {
    return {}
  }
}

export function clientPortalDomain(ctx: SupabaseCtx): ClientPortalDomain {
  return {
    /** 컨펌 대기 큐 + 처리 이력. 코멘트는 shared만(§6.2 — RPC 쿼리 자체에서 internal 제외) */
    async getClientQueue(token) {
      const raw = await ctx.rpc<RawQueue>('client_queue', { p_token: assertTokenShape(token) })
      const signed = await clientUrls(ctx, token)
      return {
        project_name: raw.project_name,
        contact_name: raw.contact_name ?? null,
        queue: (raw.queue ?? []).map(
          (item): ClientQueueItem => ({
            ...item,
            version: {
              ...item.version,
              preview_url: signed[item.version.id] ?? fileUrlFor(item.version.id, item.version.file_name),
            },
            shared_comments: item.shared_comments ?? [],
          }),
        ),
        history: raw.history ?? [],
      }
    },

    /**
     * 승인/수정요청 (§5 client_decision). 404(요청 없음)·409(이미 처리)·403(다른 행사 항목)·전이표·수정요청 코멘트 필수(422)
     * 판정, approved→final 마감(+연결 WBS 자동 done), 발주처 코멘트 shared 강제, 로그(actor 'client:{token}')까지
     * RPC가 한 트랜잭션으로 수행한다 — mock과 같은 순서·메시지.
     */
    async submitClientDecision(token, input) {
      await ctx.rpc<void>('client_decide', {
        p_token: assertTokenShape(token),
        p_approval: input.approval_id,
        p_decision: input.decision,
        p_comment: input.comment ?? null,
      })
      if (input.decision === 'approved') {
        // §7.5 — 06_발주처공유 복사 성공 후 final(실패해도 approved로 남고 스캔이 재시도 — 발주처 화면은 막지 않는다)
        await driveFor(ctx)
          .client.clientFinalize(token, input.approval_id)
          .catch((e) => console.warn('[drive] 확정 복사 요청 실패(재시도 예정):', e instanceof Error ? e.message : e))
      }
    },

    /** 진행률·마일스톤·확정본·담당자(3.18.1 노출 계약 — 마스킹 없음)·발주처 담당자 */
    async getClientStatus(token) {
      const raw = await ctx.rpc<RawStatus>('client_status', { p_token: assertTokenShape(token) })
      const signed = raw.recent_finals && raw.recent_finals.length > 0 ? await clientUrls(ctx, token) : {}
      return {
        project_name: raw.project_name,
        event_date: raw.event_date ?? null,
        area_progress: raw.area_progress ?? [],
        milestones: raw.milestones ?? [],
        staff: raw.staff ?? [],
        client_contact: raw.client_contact ?? null,
        recent_finals: (raw.recent_finals ?? []).map(
          (f): ClientFinalItem => ({ ...f, file_url: signed[f.version_id] ?? fileUrlFor(f.version_id, f.file_name) }),
        ),
      }
    },
  }
}
