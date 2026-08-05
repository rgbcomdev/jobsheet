import {
  computeCategoryBaseline,
  computeRoleSplitStats,
  computeStageRatioByCategory,
} from "./kpi";
import type { WorkEntry } from "./types";
import { round1 } from "./time";
import { FIXED_ESTIMATE_SPLIT_RATIO } from "./constants";

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

  const stages: Record<string, { hours: number; days: number; ratio: number }> =
    {};
  (["시안", "본작업", "수정중", "제작중"] as const).forEach((s) => {
    const hours = round1(totalEstimate * weights[s]);
    stages[s] = {
      hours,
      days: round1(hours / hoursPerDay),
      ratio: round1(weights[s] * 100),
    };
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
  const stageRatio = computeStageRatioByCategory(
    entries,
    projectStatus,
    leaveData,
    category
  );
  const weights =
    stageRatio.total > 0
      ? {
          시안: stageRatio.ratios.시안 / 100,
          본작업: stageRatio.ratios.본작업 / 100,
          수정중: stageRatio.ratios.수정중 / 100,
          제작중: stageRatio.ratios.제작중 / 100,
        }
      : { 시안: 0.2, 본작업: 0.4, 수정중: 0.25, 제작중: 0.15 };
  const stages: Record<string, { hours: number; days: number; ratio: number }> =
    {};
  (["시안", "본작업", "수정중", "제작중"] as const).forEach((s) => {
    const h = round1(roleHours * weights[s]);
    stages[s] = {
      hours: h,
      days: round1(h / hoursPerDay),
      ratio: round1(weights[s] * 100),
    };
  });
  return {
    hours: roleHours,
    days: round1(roleHours / hoursPerDay),
    avgWonPerHour: stats.avgWonPerHour,
    stages,
  };
}

export function computeEstimateSplitRatio(
  category: string,
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>
) {
  const fixed = FIXED_ESTIMATE_SPLIT_RATIO[category];
  if (fixed) {
    return {
      designPct: fixed.designPct,
      publishPct: fixed.publishPct,
      designRatio: fixed.designPct / 100,
      publishRatio: fixed.publishPct / 100,
    };
  }
  const stats = computeRoleSplitStats(
    entries,
    projectStatus,
    staffRole,
    leaveData,
    category
  );
  const designHours = stats.designAvg * stats.designCount;
  const publishHours = stats.publishAvg * stats.publishCount;
  const total = designHours + publishHours;
  if (total <= 0) return null;
  const designRatio = designHours / total;
  const publishRatio = publishHours / total;
  return {
    designPct: Math.round(designRatio * 1000) / 10,
    publishPct: Math.round(publishRatio * 1000) / 10,
    designRatio,
    publishRatio,
  };
}

export type GradeAssignee = { grade: string; ratio: number };

export function resolveGradeAssignees(
  grade1: string,
  grade2: string,
  grade3: string,
  ratio1: number,
  ratio2: number,
  ratio3: number
): GradeAssignee[] {
  const r1 = Math.min(100, Math.max(0, ratio1 || 0));
  const r2 = Math.min(100, Math.max(0, ratio2 || 0));
  const r3 = Math.min(100, Math.max(0, ratio3 || 0));
  const out: GradeAssignee[] = [];
  if (grade3 || grade2) {
    if (grade1 && r1 > 0) out.push({ grade: grade1, ratio: r1 });
    if (grade2 && r2 > 0) out.push({ grade: grade2, ratio: r2 });
    if (grade3 && r3 > 0) out.push({ grade: grade3, ratio: r3 });
    return out;
  }
  if (grade1) return [{ grade: grade1, ratio: 100 }];
  return [];
}

export function buildGradeEstimateRows(
  label: string,
  amount: number,
  stages: Record<string, { hours: number; days: number; ratio: number }> | null,
  assignees: GradeAssignee[],
  gradeDailyRate: Record<string, number>
) {
  return assignees.map((a) => {
    const dailyRate = gradeDailyRate[a.grade];
    const assigneeAmount = round1(amount * (a.ratio / 100));
    if (!dailyRate) {
      return {
        label,
        grade: a.grade,
        ratio: a.ratio,
        amount: assigneeAmount,
        days: null as number | null,
        hours: null as number | null,
        stages: null as Record<
          string,
          { days: number; hours: number; ratio: number }
        > | null,
        error: "이 직급의 일당 정보가 없습니다.",
      };
    }
    const days = round1(assigneeAmount / dailyRate);
    const hours = round1(days * 8);
    const stageOut: Record<
      string,
      { days: number; hours: number; ratio: number }
    > = {};
    (["시안", "본작업", "수정중", "제작중"] as const).forEach((s) => {
      const st = stages?.[s];
      if (!st) return;
      const stDays = round1(days * (st.ratio / 100));
      stageOut[s] = {
        days: stDays,
        hours: round1(stDays * 8),
        ratio: st.ratio,
      };
    });
    return {
      label,
      grade: a.grade,
      ratio: a.ratio,
      amount: assigneeAmount,
      days,
      hours,
      stages: stageOut,
      error: null as string | null,
    };
  });
}

export function fmWon(manwon: number | null | undefined) {
  if (manwon == null) return "-";
  return `${manwon.toLocaleString("ko-KR")}만원`;
}
