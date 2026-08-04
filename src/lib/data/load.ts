import type { JobsheetSeed } from "../types";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import {
  DEFAULT_GRADE_DAILY_RATE,
  DEFAULT_PROJECT_TYPES_BY_MAJOR,
} from "../constants";

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

export async function loadFromSupabase(): Promise<JobsheetSeed | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const [
    employees,
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
    supabase.from("employees").select("*"),
    supabase.from("companies").select("*"),
    supabase.from("entries").select("*"),
    supabase.from("project_statuses").select("*"),
    supabase.from("leaves").select("*"),
    supabase.from("public_duties").select("*"),
    supabase.from("holidays").select("*"),
    supabase.from("grade_rates").select("*"),
    supabase.from("estimates").select("*"),
    supabase.from("person_estimates").select("*"),
    supabase.from("task_item_overrides").select("*"),
  ]);

  if (employees.error) throw employees.error;
  if (!employees.data?.length) return null; // not seeded yet

  const seed = emptySeed();
  employees.data.forEach((e) => {
    if (!seed.employees[e.team]) seed.employees[e.team] = [];
    seed.employees[e.team].push(e.name);
    seed.staffGrade[e.name] = e.grade;
    if (e.role) seed.staffRole[e.name] = e.role;
    if (e.daily_rate_override != null) {
      seed.staffDailyRateOverride[e.name] = Number(e.daily_rate_override);
    }
    if (e.is_former) seed.formerEmployees.push(e.name);
  });

  (companies.data || []).forEach((c) => {
    seed.companyMaster.push(c.name);
    seed.companyCat[c.name] = {
      major: c.major || undefined,
      cat: c.category || undefined,
      task: c.task || undefined,
      sm: c.start_month || undefined,
      assignee: c.assignee || undefined,
    };
  });

  seed.entries = (entries.data || []).map((e) => ({
    id: e.id,
    date: e.date,
    owner: e.owner,
    start: e.start_time,
    end: e.end_time,
    company: e.company || "",
    project: e.project || "",
    stage: e.stage || "본작업",
    note: e.note || "",
  }));

  (statuses.data || []).forEach((s) => {
    seed.projectStatus[`${s.company}|||${s.project}`] = s.status;
  });
  (leaves.data || []).forEach((l) => {
    seed.leaveData[`${l.employee_name}|||${l.date}`] = l.leave_type;
  });
  (duties.data || []).forEach((d) => {
    seed.publicDutyData[`${d.employee_name}|||${d.date}`] = d.duty_type;
  });
  (holidays.data || []).forEach((h) => {
    seed.holidays[h.date] = h.name;
  });
  (grades.data || []).forEach((g) => {
    seed.gradeDailyRate[g.grade] = Number(g.daily_rate);
  });
  (estimates.data || []).forEach((e) => {
    seed.estimates[`${e.company}|||${e.project}`] = Number(e.amount_manwon);
  });
  (personEstimates.data || []).forEach((e) => {
    seed.personEstimates[`${e.company}|||${e.project}|||${e.person}`] = Number(
      e.amount_manwon
    );
  });
  (overrides.data || []).forEach((o) => {
    seed.taskItemOverrides[
      `${o.owner}|||${o.company}|||${o.category}|||${o.auto_key}`
    ] = o.label;
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
