// 픽스처 id('prj-stc26'·'usr-pm'·'demo' …) → 결정적 uuid. seed.sql과 검증 테스트가 같은 값을 쓴다.
// md5 32hex는 Postgres에서 그대로 uuid로 캐스팅된다(버전 비트를 세우지 않아도 유효한 uuid 문자열).
import { createHash } from 'node:crypto'

export const SEED_NAMESPACE = 'communicator-seed:'

export function seedUuid(fixtureId: string): string {
  const hex = createHash('md5').update(SEED_NAMESPACE + fixtureId).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
