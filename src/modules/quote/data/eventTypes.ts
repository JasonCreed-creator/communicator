// 행사 성격 단일 소스 — S-2 ①규모·유형에서 사용. 저장 값은 한글로 통일 (사용자가 보는 라벨과 동일).
// §16 핸드오프: 이 값은 projects.overview_items에 "행사 성격"으로 보존된다
// (communicator의 event_type(general/recruiting)과는 별개 축).
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834 src/lib/eventTypes.ts — 값 불변.

export interface EventTypeOption {
  value: string;
  label: string;
}

export const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  { value: "컨퍼런스", label: "컨퍼런스" },
  { value: "세미나", label: "세미나" },
  { value: "IR행사", label: "IR행사" },
  { value: "신제품 발표", label: "신제품 발표" },
  { value: "워크숍", label: "워크숍" },
  { value: "포럼", label: "포럼" },
  { value: "기타", label: "기타" },
];

// 영문 레거시 값(과거 영문 옵션) → 한글 라벨 매핑.
// 데이터 마이그레이션 전까지 표시용으로만 사용 — value 자체는 보존.
export const EVENT_TYPE_LEGACY_LABEL_MAP: Record<string, string> = {
  conference: "컨퍼런스",
  seminar: "세미나",
  IR: "IR행사",
  launching: "신제품 발표",
  workshop: "워크숍",
  forum: "포럼",
  etc: "기타",
};

/** 저장 값 → 표시 라벨. 한글 값은 그대로, 영문 레거시는 한글 라벨로 변환. */
export const getEventTypeLabel = (value: string | null | undefined): string => {
  if (!value) return "";
  return EVENT_TYPE_LEGACY_LABEL_MAP[value] ?? value;
};

/** EVENT_TYPE_OPTIONS에 없는 레거시 값을 fallback option으로 노출하기 위한 헬퍼. */
export const isLegacyEventType = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return !EVENT_TYPE_OPTIONS.some((o) => o.value === value) && value in EVENT_TYPE_LEGACY_LABEL_MAP;
};
