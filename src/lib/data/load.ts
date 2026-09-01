import type { JobsheetSeed } from "../types";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import {
  DEFAULT_GRADE_DAILY_RATE,
  DEFAULT_PROJECT_TYPES_BY_MAJOR,
} from "../constants";
import type { SupabaseClient } from "@supabase/supabase-js";

function emptySeed(): JobsheetSeed {
  return {
    version: 2,
    entries: [],
    projectStatus: {},
    leaveData: {},
    publicDutyData: {},
    employees: { 디자인: [], 영상: [] },
    staffGrade: {},
    formerEmployees: [],
    gradeDailyRate: { ...DEFAULT_GRADE_DAILY_RATE },
    staffDailyRateOverride: {},
    staffRole: {},
    holidays: {},
    companyCat: {},
    companyMaster: [],
    taskItemOverrides: {},
    estimates: {},
    personEstimates: {},
    fixedEstimateSplitRatio: {},
    projectTypesByMajor: { ...DEFAULT_PROJECT_TYPES_BY_MAJOR },
  };
}

export async function loadSeedFromPublic(): Promise<JobsheetSeed> {
  const res = await fetch("/data/seed.json");
  if (!res.ok) throw new Error("seed.json load failed");
  return res.json();
}

/**
 * 페이지네이션. 무한루프 방지용 maxPages 포함.
 * orderCols 마지막에는 항상 id를 두어 정렬을 유일하게 만든다 (페이지 경계에서 중복·누락 방지).
 */
async function fetchAllById(
  supabase: SupabaseClient,
  table: string,
  pageSize = 1000,
  orderCols: string[] = ["id"]
) {
  const rows: Record<string, unknown>[] = [];
  const maxPages = 50;
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let query = supabase.from(table).select("*");
    for (const col of orderCols) {
      query = query.order(col, { ascending: true });
    }
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

/** 행 수가 적은 테이블 — 한 번에 조회 */
async function fetchOnce(supabase: SupabaseClient, table: string) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data || []) as Record<string, unknown>[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function loadFromSupabase(): Promise<JobsheetSeed | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const employees = await fetchOnce(supabase, "employees");
  if (!employees.length) return null;

  const [
    companies,
    entries,
    statuses,
    leaves,
    duties,
    holidays,
    grades,
    estimates,
    personEstimates,
    overrides,
  ] = await Promise.all([
    fetchOnce(supabase, "companies"),
    fetchAllById(supabase, "entries", 1000, ["date", "start_time", "id"]),
    fetchOnce(supabase, "project_statuses"),
    fetchOnce(supabase, "leaves"),
    fetchOnce(supabase, "public_duties"),
    fetchOnce(supabase, "holidays"),
    fetchOnce(supabase, "grade_rates"),
    fetchOnce(supabase, "estimates"),
    fetchOnce(supabase, "person_estimates"),
    fetchOnce(supabase, "task_item_overrides"),
  ]);

  const seed = emptySeed();
  const teamRank = (team: string) =>
    team === "디자인" ? 0 : team === "영상" ? 1 : 2;
  const sortedEmployees = [...employees].sort((a, b) => {
    const ta = teamRank(String(a.team));
    const tb = teamRank(String(b.team));
    if (ta !== tb) return ta - tb;
    const sa = Number(a.sort_order ?? 999);
    const sb = Number(b.sort_order ?? 999);
    if (sa !== sb) return sa - sb;
    return String(a.name).localeCompare(String(b.name), "ko");
  });
  sortedEmployees.forEach((e) => {
    const team = String(e.team);
    const name = String(e.name);
    if (!seed.employees[team]) seed.employees[team] = [];
    seed.employees[team].push(name);
    seed.staffGrade[name] = String(e.grade);
    if (e.role) seed.staffRole[name] = String(e.role);
    if (e.daily_rate_override != null) {
      seed.staffDailyRateOverride[name] = Number(e.daily_rate_override);
    }
    if (e.is_former) seed.formerEmployees.push(name);
  });

  companies.forEach((c) => {
    const name = String(c.name);
    seed.companyMaster.push(name);
    seed.companyCat[name] = {
      major: (c.major as string) || undefined,
      cat: (c.category as string) || undefined,
      task: (c.task as string) || undefined,
      sm: (c.start_month as string) || undefined,
      assignee: (c.assignee as string) || undefined,
    };
  });

  seed.entries = entries.map((e) => ({
    id: e.id as string | undefined,
    date: String(e.date),
    owner: String(e.owner),
    start: String(e.start_time),
    end: String(e.end_time),
    company: String(e.company || ""),
    project: String(e.project || ""),
    stage: String(e.stage || "본작업"),
    note: String(e.note || ""),
  }));

  statuses.forEach((s) => {
    seed.projectStatus[`${s.company}|||${s.project}`] = String(s.status);
  });
  leaves.forEach((l) => {
    const date = String(l.date).slice(0, 10);
    seed.leaveData[`${l.employee_name}|||${date}`] = String(l.leave_type);
  });
  duties.forEach((d) => {
    const date = String(d.date).slice(0, 10);
    seed.publicDutyData[`${d.employee_name}|||${date}`] = String(d.duty_type);
  });
  holidays.forEach((h) => {
    seed.holidays[String(h.date).slice(0, 10)] = String(h.name);
  });
  grades.forEach((g) => {
    seed.gradeDailyRate[String(g.grade)] = Number(g.daily_rate);
  });
  estimates.forEach((e) => {
    seed.estimates[`${e.company}|||${e.project}`] = Number(e.amount_manwon);
  });
  personEstimates.forEach((e) => {
    seed.personEstimates[`${e.company}|||${e.project}|||${e.person}`] = Number(
      e.amount_manwon
    );
  });
  overrides.forEach((o) => {
    seed.taskItemOverrides[
      `${o.owner}|||${o.company}|||${o.category}|||${o.auto_key}`
    ] = String(o.label);
  });

  return seed;
}

export async function loadJobsheetData(): Promise<{
  data: JobsheetSeed;
  source: "supabase" | "local";
}> {
  if (isSupabaseConfigured()) {
    try {
      const remote = await withTimeout(
        loadFromSupabase(),
        20000,
        "Supabase load"
      );
      if (remote) return { data: remote, source: "supabase" };
    } catch (e) {
      console.warn("Supabase load failed, falling back to local seed", e);
    }
  }
  const data = await loadSeedFromPublic();
  return { data, source: "local" };
}
