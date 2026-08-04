import {
  computeCategoryBaseline,
  computeRoleSplitStats,
  computeStageRatioByCategory,
} from "./kpi";
import type { WorkEntry } from "./types";
import { round1 } from "./time";

export function estimateHoursFromBudget(
  category: string,
  estimateManwon: number,
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>,
  estimates: Record<string, number>
) {
  const baseline = computeCategoryBaseline(
    entries,
    projectStatus,
    staffRole,
    leaveData,
    estimates
  );
  const b = baseline[category];
  if (!b || !b.avgWonPerHour) return null;
  const won = estimateManwon * 10000;
  return round1(won / b.avgWonPerHour);
}

export function estimateStagePlanFromBudget(
  category: string,
  estimateManwon: number,
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>,
  estimates: Record<string, number>,
  hoursPerDay = 8
) {
  const totalEstimate = estimateHoursFromBudget(
    category,
    estimateManwon,
    entries,
    projectStatus,
    staffRole,
    leaveData,
    estimates
  );
  if (totalEstimate == null) return null;

  const ratio = computeStageRatioByCategory(
    entries,
    projectStatus,
    leaveData,
    category
  );
  const weights =
    ratio.total > 0
      ? {
          시안: ratio.ratios.시안 / 100,
          본작업: ratio.ratios.본작업 / 100,
          수정중: ratio.ratios.수정중 / 100,
          제작중: ratio.ratios.제작중 / 100,
        }
      : { 시안: 0.2, 본작업: 0.4, 수정중: 0.25, 제작중: 0.15 };

  const stages: Record<string, { hours: number; days: number }> = {};
  (["시안", "본작업", "수정중", "제작중"] as const).forEach((s) => {
    const hours = round1(totalEstimate * weights[s]);
    stages[s] = { hours, days: round1(hours / hoursPerDay) };
  });
  return { totalHours: totalEstimate, stages };
}

export function estimateStagePlanForRole(
  category: string,
  role: "디자인" | "퍼블",
  estimateManwon: number,
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>,
  estimates: Record<string, number>,
  hoursPerDay = 8
) {
  const baseline = computeCategoryBaseline(
    entries,
    projectStatus,
    staffRole,
    leaveData,
    estimates
  );
  const stats = baseline[category];
  if (!stats?.avgWonPerHour) return null;
  const hours = round1((estimateManwon * 10000) / stats.avgWonPerHour);
  const roleStats = computeRoleSplitStats(
    entries,
    projectStatus,
    staffRole,
    leaveData,
    category
  );
  const roleShare =
    role === "디자인"
      ? roleStats.designAvg /
        Math.max(1, roleStats.designAvg + roleStats.publishAvg)
      : roleStats.publishAvg /
        Math.max(1, roleStats.designAvg + roleStats.publishAvg);
  const roleHours = round1(hours * (roleShare || 0.5));
  return {
    hours: roleHours,
    days: round1(roleHours / hoursPerDay),
    avgWonPerHour: stats.avgWonPerHour,
  };
}

export function fmWon(manwon: number | null | undefined) {
  if (manwon == null) return "-";
  return `${manwon.toLocaleString("ko-KR")}만원`;
}
