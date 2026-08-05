import type { WorkEntry } from "./types";
import { computeDuration, round1 } from "./time";

export function findOverlappingEntries(dayEntries: WorkEntry[]) {
  const sorted = dayEntries
    .filter((e) => e.start && e.end)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      return { prev: sorted[i - 1], curr: sorted[i] };
    }
  }
  return null;
}

export function findInvertedTimeEntry(dayEntries: WorkEntry[]) {
  return (
    dayEntries.find((e) => e.start && e.end && e.end <= e.start) || null
  );
}

export function computeDayTotalHours(
  dayEntries: WorkEntry[],
  leaveType: string
) {
  return dayEntries.reduce(
    (sum, e) => sum + computeDuration(e.start, e.end, leaveType),
    0
  );
}

export function getLeaveTimeBounds(type: string): {
  minStart?: string;
  maxEnd?: string;
} {
  if (type === "오전반차") return { minStart: "14:00" };
  if (type === "오후반차") return { maxEnd: "14:00" };
  if (type === "오전반반차") return { minStart: "11:00" };
  if (type === "오후반반차") return { maxEnd: "16:00" };
  return {};
}

export function getLeaveWorkWindowLabel(type: string): string | null {
  if (type === "오전반차") return "오전반차: 14:00부터 업무 입력 가능";
  if (type === "오후반차") return "오후반차: 14:00까지만 업무 입력 가능";
  if (type === "오전반반차") return "오전반반차: 11:00부터 업무 입력 가능";
  if (type === "오후반반차") return "오후반반차: 16:00까지만 업무 입력 가능";
  return null;
}

/** 휴가 허용 구간에 맞게 시작/종료 시간을 클램프 */
export function clampTimeToLeaveBounds(
  time: string,
  bounds: { minStart?: string; maxEnd?: string }
) {
  let t = time;
  if (bounds.minStart && t < bounds.minStart) t = bounds.minStart;
  if (bounds.maxEnd && t > bounds.maxEnd) t = bounds.maxEnd;
  return t;
}

export function clampEntryToLeaveBounds(
  entry: WorkEntry,
  bounds: { minStart?: string; maxEnd?: string }
): WorkEntry | null {
  if (!bounds.minStart && !bounds.maxEnd) return entry;
  // 허용 구간과 전혀 겹치지 않으면 제거
  if (bounds.minStart && entry.end <= bounds.minStart) return null;
  if (bounds.maxEnd && entry.start >= bounds.maxEnd) return null;
  const start = clampTimeToLeaveBounds(entry.start, bounds);
  let end = clampTimeToLeaveBounds(entry.end, bounds);
  if (end <= start) return null;
  return { ...entry, start, end };
}

export function formatDayValidationError(
  inverted: WorkEntry | null,
  overlap: { prev: WorkEntry; curr: WorkEntry } | null,
  mode: "save" | "close"
) {
  if (inverted) {
    return `종료시간이 시작시간보다 빠릅니다: ${inverted.start}~${inverted.end} (${inverted.company || "미입력"}) — 시간을 다시 확인해주세요`;
  }
  if (overlap) {
    const verb = mode === "save" ? "저장할" : "닫을";
    return `시간이 겹쳐 ${verb} 수 없습니다: ${overlap.prev.start}~${overlap.prev.end} (${overlap.prev.company || "미입력"}) ↔ ${overlap.curr.start}~${overlap.curr.end} (${overlap.curr.company || "미입력"})`;
  }
  return null;
}

export function formatDaySaveOkMessage(dayTotal: number) {
  if (dayTotal > 15) {
    return {
      text: `저장되었습니다 (이 날 총 근무시간이 ${round1(dayTotal)}시간입니다 — 입력한 시간이 맞는지 한 번 더 확인해주세요)`,
      kind: "warn" as const,
      delay: 2200,
    };
  }
  return {
    text: "저장되었습니다",
    kind: "ok" as const,
    delay: 600,
  };
}
