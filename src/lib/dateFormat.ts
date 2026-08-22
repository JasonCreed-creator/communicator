// 날짜 포맷 공유 util — "YYYY.MM.DD" 도트 포맷 표준.
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834 src/lib/dateFormat.ts — 로직 불변.

/** ISO/Date → "2026.05.18" */
export const fmtDateKR = (input: string | Date | null | undefined): string => {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
};

/** ISO/Date → "2026년 5월 18일 (월)" — Calendar/PDF 헤더용 long form */
export const fmtDateKRLong = (input: string | Date | null | undefined): string => {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
};

/** ISO/Date → "2026.05.18 14:30" */
export const fmtDateTimeKR = (input: string | Date | null | undefined): string => {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const date = fmtDateKR(d);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mm}`;
};
