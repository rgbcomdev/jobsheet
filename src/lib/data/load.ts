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

async function fetchAll(
  supabase: SupabaseClient,
  table: string,
  pageSize = 1000
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

export async function loadFromSupabase(): Promise<JobsheetSeed | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const employees = await fetchAll(supabase, "employees");
  if (!employees.length) return null; // not seeded yet

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
    fetchAll(supabase, "companies"),
    fetchAll(supabase, "entries"),
    fetchAll(supabase, "project_statuses"),
    fetchAll(supabase, "leaves"),
    fetchAll(supabase, "public_duties"),
    fetchAll(supabase, "holidays"),
    fetchAll(supabase, "grade_rates"),
    fetchAll(supabase, "estimates"),
    fetchAll(supabase, "person_estimates"),
    fetchAll(supabase, "task_item_overrides"),
  ]);

  const seed = emptySeed();
  employees.forEach((e) => {
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
    seed.leaveData[`${l.employee_name}|||${l.date}`] = String(l.leave_type);
  });
  duties.forEach((d) => {
    seed.publicDutyData[`${d.employee_name}|||${d.date}`] = String(
      d.duty_type
    );
  });
  holidays.forEach((h) => {
    seed.holidays[String(h.date)] = String(h.name);
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
      const remote = await loadFromSupabase();
      if (remote) return { data: remote, source: "supabase" };
    } catch (e) {
      console.warn("Supabase load failed, falling back to local seed", e);
    }
  }
  const data = await loadSeedFromPublic();
  return { data, source: "local" };
}
