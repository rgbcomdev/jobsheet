import type { WorkEntry } from "./types";
import { classifyDesignOrPublish, computeDuration, round1 } from "./time";
import { projectKey } from "./constants";

export function computeProjectKPI(
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>,
  estimates: Record<string, number>
) {
  const byKey: Record<
    string,
    {
      company: string;
      project: string;
      designHours: number;
      publishHours: number;
      byOwner: Record<string, { hours: number; role: string }>;
    }
  > = {};

  entries.forEach((e) => {
    if (!e.company || !e.project) return;
    const key = projectKey(e.company, e.project);
    if ((projectStatus[key] || "진행중") !== "완료") return;
    const owner = e.owner || "";
    const leave = leaveData[`${owner}|||${e.date}`] || "";
    const dur = computeDuration(e.start, e.end, leave);
    const role = classifyDesignOrPublish(owner, e.note, e.stage, staffRole);
    if (!byKey[key]) {
      byKey[key] = {
        company: e.company,
        project: e.project,
        designHours: 0,
        publishHours: 0,
        byOwner: {},
      };
    }
    const rec = byKey[key];
    if (role === "디자인") rec.designHours += dur;
    else rec.publishHours += dur;
    if (!rec.byOwner[owner]) {
      rec.byOwner[owner] = { hours: 0, role: staffRole[owner] || "미지정" };
    }
    rec.byOwner[owner].hours += dur;
  });

  const result = Object.values(byKey).map((rec) => {
    const totalHours = round1(rec.designHours + rec.publishHours);
    const key = projectKey(rec.company, rec.project);
    const estimate = estimates[key];
    const perHour =
      estimate && totalHours > 0
        ? round1((estimate * 10000) / totalHours)
        : null;
    return {
      company: rec.company,
      project: rec.project,
      designHours: round1(rec.designHours),
      publishHours: round1(rec.publishHours),
      totalHours,
      estimate: estimate || null,
      wonPerHour: perHour,
      byOwner: rec.byOwner,
    };
  });
  result.sort((a, b) => (b.estimate || 0) - (a.estimate || 0));
  return result;
}

export function computeCategoryBaseline(
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>,
  estimates: Record<string, number>
) {
  const kpi = computeProjectKPI(
    entries,
    projectStatus,
    staffRole,
    leaveData,
    estimates
  ).filter((i) => i.estimate && i.totalHours > 0 && i.wonPerHour);

  const byCategory: Record<
    string,
    { company: string; perHour: number; estimate: number; hours: number }[]
  > = {};
  kpi.forEach((item) => {
    if (!byCategory[item.project]) byCategory[item.project] = [];
    byCategory[item.project].push({
      company: item.company,
      perHour: item.wonPerHour!,
      estimate: item.estimate!,
      hours: item.totalHours,
    });
  });

  const result: Record<
    string,
    {
      count: number;
      usedCount: number;
      avgWonPerHour: number;
      minWonPerHour: number;
      maxWonPerHour: number;
      samples: { company: string; perHour: number; estimate: number; hours: number }[];
    }
  > = {};

  for (const cat in byCategory) {
    const list = byCategory[cat].slice().sort((a, b) => a.perHour - b.perHour);
    const n = list.length;
    // 최솟값·최댓값을 제외한 평균으로 기준 시급을 잡는다 (표본 3개 이상일 때)
    const trimmed = n >= 3 ? list.slice(1, n - 1) : list;
    const avg = trimmed.reduce((s, x) => s + x.perHour, 0) / trimmed.length;
    result[cat] = {
      count: n,
      usedCount: trimmed.length,
      avgWonPerHour: Math.round(avg),
      minWonPerHour: Math.round(list[0].perHour),
      maxWonPerHour: Math.round(list[n - 1].perHour),
      samples: list,
    };
  }
  return result;
}

export function computeRoleSplitStats(
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  staffRole: Record<string, string>,
  leaveData: Record<string, string>,
  category: string
) {
  const design: number[] = [];
  const publish: number[] = [];
  const byKey: Record<string, { design: number; publish: number }> = {};

  entries.forEach((e) => {
    if (!e.company || e.project !== category) return;
    const key = projectKey(e.company, e.project);
    if ((projectStatus[key] || "진행중") !== "완료") return;
    const owner = e.owner || "";
    const leave = leaveData[`${owner}|||${e.date}`] || "";
    const dur = computeDuration(e.start, e.end, leave);
    const role = classifyDesignOrPublish(owner, e.note, e.stage, staffRole);
    if (!byKey[key]) byKey[key] = { design: 0, publish: 0 };
    if (role === "디자인") byKey[key].design += dur;
    else byKey[key].publish += dur;
  });

  Object.values(byKey).forEach((v) => {
    if (v.design > 0) design.push(v.design);
    if (v.publish > 0) publish.push(v.publish);
  });

  const avg = (arr: number[]) =>
    arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  return {
    designAvg: avg(design),
    publishAvg: avg(publish),
    designCount: design.length,
    publishCount: publish.length,
  };
}

export function computeStageRatioByCategory(
  entries: WorkEntry[],
  projectStatus: Record<string, string>,
  leaveData: Record<string, string>,
  category: string,
  staffRole?: Record<string, string>,
  roleFilter?: "디자인" | "퍼블"
) {
  const stages = { 시안: 0, 본작업: 0, 수정중: 0, 제작중: 0 };
  let total = 0;
  const projectKeys = new Set<string>();
  entries.forEach((e) => {
    if (!e.company || e.project !== category) return;
    const key = projectKey(e.company, e.project);
    if ((projectStatus[key] || "진행중") !== "완료") return;
    if (roleFilter && staffRole) {
      const role = classifyDesignOrPublish(
        e.owner || "",
        e.note,
        e.stage,
        staffRole
      );
      if (role !== roleFilter) return;
    }
    const leave = leaveData[`${e.owner}|||${e.date}`] || "";
    const dur = computeDuration(e.start, e.end, leave);
    if (e.stage in stages) {
      (stages as Record<string, number>)[e.stage] += dur;
      total += dur;
      projectKeys.add(key);
    }
  });
  if (total <= 0) {
    return { stages, total: 0, ratios: stages, sampleCount: 0 };
  }
  const ratios = {
    시안: round1((stages.시안 / total) * 100),
    본작업: round1((stages.본작업 / total) * 100),
    수정중: round1((stages.수정중 / total) * 100),
    제작중: round1((stages.제작중 / total) * 100),
  };
  return {
    stages: {
      시안: round1(stages.시안),
      본작업: round1(stages.본작업),
      수정중: round1(stages.수정중),
      제작중: round1(stages.제작중),
    },
    total: round1(total),
    ratios,
    sampleCount: projectKeys.size,
  };
}
