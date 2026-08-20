import {
  DESIGN_KEYWORDS,
  PUBLISH_KEYWORDS,
  STAGE_FALLBACK_ROLE,
} from "./constants";

export function timeToHours(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

export function breakOverlap(a: number, b: number, bs: number, be: number) {
  const os = Math.max(a, bs);
  const oe = Math.min(b, be);
  return Math.max(0, oe - os);
}

export function computeDuration(
  s: string,
  e: string,
  _leaveType?: string
) {
  let a = timeToHours(s);
  let b = timeToHours(e);
  if (b < a) b += 24;
  let dur = Math.max(0, b - a);
  // 반차·반반차 포함, 점심(12~13)은 항상 차감
  dur -= breakOverlap(a, b, 12, 13);
  dur -= breakOverlap(a, b, 18, 19);
  return Math.max(0, dur);
}

/** YYYY-MM-DD 기준 토·일 여부 */
export function isWeekendDate(dateStr?: string) {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/** 평일: 19시 이후 / 주말: 해당일 근무시간 전부 추가근무 */
export function computeOvertime(s: string, e: string, dateStr?: string) {
  if (isWeekendDate(dateStr)) {
    return computeDuration(s, e);
  }
  let a = timeToHours(s);
  let b = timeToHours(e);
  if (b < a) b += 24;
  const os = Math.max(a, 19);
  const oe = Math.max(b, os);
  return Math.max(0, oe - os);
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function hoursToTimeValue(h: number) {
  return h / 24;
}

export function classifyDesignOrPublish(
  owner: string,
  note: string,
  stage: string,
  staffRole: Record<string, string>
) {
  const role = staffRole[owner];
  if (role === "디자인") return "디자인";
  if (role === "퍼블") return "퍼블";
  const n = note || "";
  if (DESIGN_KEYWORDS.some((k) => n.includes(k))) return "디자인";
  if (PUBLISH_KEYWORDS.some((k) => n.includes(k))) return "퍼블";
  return STAGE_FALLBACK_ROLE[stage] || "디자인";
}

export function getStaffDailyRate(
  name: string,
  staffGrade: Record<string, string>,
  gradeDailyRate: Record<string, number>,
  override: Record<string, number>
) {
  if (override[name] != null) return override[name];
  const grade = staffGrade[name];
  return gradeDailyRate[grade] != null ? gradeDailyRate[grade] : null;
}
