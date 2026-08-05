import { TASK_STAGE_SUFFIX, DEFAULT_PROJECT_TYPES_BY_MAJOR, MAJORS, STAGE_RANK } from "./constants";
import type { CompanyInfo, WorkEntry } from "./types";
import { classifyDesignOrPublish, computeDuration, computeOvertime, pad, round1 } from "./time";

export function summarizeNoteForCell(note: string, company: string) {
  if (!note) return "";
  let text = note.replace(/^\[[^\]]*\]\s*/, "");
  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp("^" + esc + "[_\\s]*"), "");
  }
  text = text.trim();
  if (!text) return "";
  return text.length > 16 ? text.slice(0, 16) + "…" : text;
}

export function stripPrefixOnly(note: string, company: string) {
  if (!note) return "";
  let text = note.replace(/^\[[^\]]*\]\s*/, "");
  if (company) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp("^" + esc + "[_\\s]*"), "");
  }
  return text.trim();
}

export function summarizeTaskItem(
  note: string,
  company: string,
  owner: string,
  categoryForOverride: string,
  overrides: Record<string, string>
) {
  const prefixOnly = stripPrefixOnly(note, company);
  let text = prefixOnly;
  if (!text) return "";
  let prev;
  do {
    prev = text;
    text = text.replace(TASK_STAGE_SUFFIX, "").trim();
  } while (text !== prev && text.length > 0);
  const autoResult = text || prefixOnly;
  if (owner && company && categoryForOverride) {
    const overrideKey = `${owner}|||${company}|||${categoryForOverride}|||${autoResult}`;
    if (overrides[overrideKey]) return overrides[overrideKey];
  }
  return prefixOnly;
}

export type AggGroup = {
  company: string;
  project: string;
  major: string;
  category: string;
  stages: Record<string, number>;
  total: number;
  notes: string[];
  owners: Set<string>;
  lastDate: string;
};

export function buildGroups(
  entries: WorkEntry[],
  monthPrefix: string | null,
  filterOwner: string | null,
  leaveData: Record<string, string>,
  companyCat: Record<string, { major?: string; cat?: string }>
) {
  const groups: Record<string, AggGroup> = {};
  entries.forEach((e) => {
    if (filterOwner && (e.owner || "") !== filterOwner) return;
    if (monthPrefix && !e.date.startsWith(monthPrefix)) return;
    if (!e.company || !e.project) return;
    const key = `${e.company}|||${e.project}`;
    if (!groups[key]) {
      const info = companyCat[e.company];
      groups[key] = {
        company: e.company,
        project: e.project,
        major: info?.major || "",
        category: info?.cat || e.project,
        stages: { 시안: 0, 본작업: 0, 수정중: 0, 제작중: 0 },
        total: 0,
        notes: [],
        owners: new Set(),
        lastDate: "",
      };
    }
    const g = groups[key];
    const leave = leaveData[`${e.owner}|||${e.date}`] || "";
    const dur = computeDuration(e.start, e.end, leave);
    if (e.stage && g.stages[e.stage] != null) g.stages[e.stage] += dur;
    g.total += dur;
    g.owners.add(e.owner);
    if (e.note) g.notes.push(e.note);
    if (e.date >= g.lastDate) g.lastDate = e.date;
  });
  Object.values(groups).forEach((g) => {
    g.total = round1(g.total);
    Object.keys(g.stages).forEach((s) => {
      g.stages[s] = round1(g.stages[s]);
    });
  });
  return groups;
}

export type TaskStageRow = {
  task: string;
  stage: string;
  hours: Record<string, number>;
  total: number;
  lastDate: string;
};

/** 전체 프로젝트: 작업항목+단계별 시간 분해 */
export function buildTaskStageBreakdown(
  entries: WorkEntry[],
  owner: string,
  company: string,
  project: string,
  leaveData: Record<string, string>,
  overrides: Record<string, string>,
  staffRole: Record<string, string>,
  roleFilter?: "디자인" | "퍼블" | null
): TaskStageRow[] {
  const rows: Record<
    string,
    {
      task: string;
      stage: string;
      hours: Record<string, number>;
      lastDate: string;
    }
  > = {};

  entries.forEach((e) => {
    if ((e.owner || "") !== owner) return;
    if (e.company !== company || e.project !== project) return;
    const leave = leaveData[`${owner}|||${e.date}`] || "";
    const dur = computeDuration(e.start, e.end, leave);
    if (roleFilter) {
      const role = classifyDesignOrPublish(
        owner,
        e.note,
        e.stage,
        staffRole
      );
      if (role !== roleFilter) return;
    }
    const task =
      summarizeTaskItem(e.note, company, owner, project, overrides) || "-";
    const stage = e.stage || "본작업";
    const key = `${task}|||${stage}`;
    if (!rows[key]) {
      rows[key] = {
        task,
        stage,
        hours: { 시안: 0, 본작업: 0, 수정중: 0, 제작중: 0 },
        lastDate: "",
      };
    }
    if (rows[key].hours[stage] != null) rows[key].hours[stage] += dur;
    if (e.date >= rows[key].lastDate) rows[key].lastDate = e.date;
  });

  const list = Object.values(rows).map((r) => ({
    ...r,
    hours: {
      시안: round1(r.hours["시안"]),
      본작업: round1(r.hours["본작업"]),
      수정중: round1(r.hours["수정중"]),
      제작중: round1(r.hours["제작중"]),
    },
    total: round1(
      r.hours["시안"] +
        r.hours["본작업"] +
        r.hours["수정중"] +
        r.hours["제작중"]
    ),
  }));

  list.sort((a, b) => {
    const ra = STAGE_RANK[a.stage] || 0;
    const rb = STAGE_RANK[b.stage] || 0;
    if (ra !== rb) return ra - rb;
    return a.lastDate.localeCompare(b.lastDate);
  });
  return list;
}

export function monthHoursFor(
  entries: WorkEntry[],
  name: string,
  year: number,
  month: number,
  leaveData: Record<string, string>
) {
  const monthPrefix = `${year}-${pad(month)}`;
  let total = 0;
  let ot = 0;
  entries.forEach((e) => {
    if ((e.owner || "") !== name) return;
    if (!e.date.startsWith(monthPrefix)) return;
    const leave = leaveData[`${name}|||${e.date}`] || "";
    total += computeDuration(e.start, e.end, leave);
    ot += computeOvertime(e.start, e.end);
  });
  return { total: round1(total), ot: round1(ot) };
}

export function getLatestEntryDate(
  entries: WorkEntry[],
  name?: string | null
): string | null {
  let latest: string | null = null;
  for (const e of entries) {
    if (name != null && name !== "" && (e.owner || "") !== name) continue;
    if (!latest || e.date > latest) latest = e.date;
  }
  return latest;
}

/** 기록이 있는 최신 연·월 (없으면 오늘 기준) */
export function getDefaultYearMonth(
  entries: WorkEntry[],
  name?: string | null
): { year: number; month: number } {
  const today = new Date();
  const latest = getLatestEntryDate(entries, name);
  if (latest == null) {
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }
  const [y, m] = latest.split("-").map(Number);
  return { year: y, month: m };
}

export function formatUpdatedDate(dateStr: string | null) {
  if (!dateStr) return "기록 없음";
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}월 ${Number(d)}일 업데이트`;
}

/** 실제 입력된 project 값으로 대분류(디자인/동영상)를 판별. 없으면 업체 마스터로 대체. */
export function deriveMajorSub(
  project: string,
  company: string,
  companyCat: Record<string, CompanyInfo>,
  projectTypesByMajor?: Record<string, string[]>
) {
  const types = projectTypesByMajor || DEFAULT_PROJECT_TYPES_BY_MAJOR;
  for (const mj of MAJORS) {
    if ((types[mj] || []).includes(project)) {
      return { major: mj, sub: project };
    }
  }
  if (company === "RGB내부" || project === "RGB내부업무") {
    return { major: "디자인", sub: project || "RGB내부업무" };
  }
  const info = companyCat[company];
  if (info?.major) {
    return {
      major: info.major === "영상" ? "동영상" : info.major,
      sub: info.cat || project || "미분류",
    };
  }
  // 영상 카테고리 키워드 폴백
  if (["모션영상", "3D영상", "촬영영상"].includes(project)) {
    return { major: "동영상", sub: project };
  }
  return { major: "디자인", sub: project || "미분류" };
}
