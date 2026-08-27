// 견적서 임포트 파서 — 스텁 (Phase 3.15a). 실 구현은 3.15d(에이전트 AD)가 맡는다.
// A·B·C 서식(§22.1) 감지 → 헤더·섹션·항목·검산 결과(ParsedQuoteDoc) 반환이 최종 계약이며,
// 그 계약 타입은 이미 ./types.ts에 확정돼 있다 — provider(MockProvider.importQuoteFile)는
// 이 함수를 호출하는 배선만 지금 갖추고, 실제 xlsx 파싱은 다음 단계에서 채운다(§22.3 R-Q4).
import { ProviderError } from '../../../lib/errors'
import type { ParsedQuoteDoc } from './types'

/**
 * xlsx 바이너리 → ParsedQuoteDoc. 지금은 항상 던진다 — provider가 이 실패를 그대로
 * 전파하므로, 이번 단계의 importQuoteFile은 "배선은 있으나 아직 안 열린 문"이다.
 */
export function parseQuoteWorkbook(_data: ArrayBuffer, _fileName: string): ParsedQuoteDoc {
  throw new ProviderError('validation', '파서는 3.15d에서 구현됩니다')
}
