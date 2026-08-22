// 베뉴 상세설정 — 베뉴 후보 다중 등록 + 택1 선택.
// 엔진(calcEstimate)은 무변경: "선택된 베뉴 1곳"의 대관료를 venueRental 입력으로 전달한다 (s1 경로).
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834 src/lib/venueOptions.ts — 로직 불변.
// ※ 베뉴 옵션 프리셋(오·만찬 등)은 가격 편차가 커 프리셋화가 어렵다는 판단으로 제거됨(2026-08-13) —
//    옵션성 비용은 베뉴별 대관료에 합산해 직접 입력한다.
// ※ 다중 합산 → 택1 전환(2026-08-13): 후보 베뉴는 비교용으로 나란히 기재하고 1곳만 견적에 반영.

export type VenueEntry = {
  name: string;
  date: string; // YYYY-MM-DD ("" = 미정)
  rental: number;
};

export const newVenue = (rental = 0): VenueEntry => ({ name: "", date: "", rental });

// 선택 인덱스를 후보 범위로 클램프
export const clampVenueIndex = (venues: VenueEntry[], idx: unknown): number =>
  Math.max(0, Math.min(Math.round(Number(idx) || 0), Math.max(0, (venues?.length || 1) - 1)));

// 택1: 선택된 베뉴의 대관료 — calcEstimate의 venueRental 입력으로 전달된다
export const selectedVenueRental = (venues: VenueEntry[], idx: unknown): number =>
  Number(venues?.[clampVenueIndex(venues, idx)]?.rental) || 0;

// 구버전 설정(단일 venueName/venueRental) → 다중 베뉴 마이그레이션
export const migrateVenues = (raw: { venues?: unknown; venueName?: string; venueRental?: number }): VenueEntry[] => {
  if (Array.isArray(raw.venues) && raw.venues.length > 0) {
    return (raw.venues as VenueEntry[]).map(v => ({
      name: v.name || "", date: v.date || "", rental: Number(v.rental) || 0,
    }));
  }
  return [{ name: raw.venueName || "", date: "", rental: Number(raw.venueRental) || 0 }];
};
