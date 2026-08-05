import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobsheetSeed } from "../types";

async function upsertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  chunk = 500,
  onConflict?: string
) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const { error } = await supabase
      .from(table)
      .upsert(part, onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function clearTable(supabase: SupabaseClient, table: string) {
  // 가능한 키로 전체 삭제 시도 (스키마별로 다를 수 있음)
  const attempts = [
    () =>
      supabase
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"),
    () => supabase.from(table).delete().neq("company", "__never__"),
    () => supabase.from(table).delete().neq("employee_name", "__never__"),
    () => supabase.from(table).delete().neq("date", "1900-01-01"),
    () => supabase.from(table).delete().neq("grade", "__never__"),
  ];
  for (const attempt of attempts) {
    const { error } = await attempt();
    if (!error) return;
  }
}

/** 백업 데이터를 Supabase에 반영 (entries 등은 교체, 마스터는 upsert) */
export async function restoreBackupToSupabase(
  supabase: SupabaseClient,
  seed: JobsheetSeed
) {
  const employees: Record<string, unknown>[] = [];
  Object.entries(seed.employees || {}).forEach(([team, names]) => {
    names.forEach((name, idx) => {
      employees.push({
        name,
        team,
        grade: seed.staffGrade?.[name] || "사원",
        role: seed.staffRole?.[name] || null,
        daily_rate_override: seed.staffDailyRateOverride?.[name] ?? null,
        is_former: (seed.formerEmployees || []).includes(name),
        sort_order: idx,
      });
    });
  });
  if (employees.length) await upsertBatch(supabase, "employees", employees, 500, "name");

  const companies = (seed.companyMaster || Object.keys(seed.companyCat || {}))
    .filter(Boolean)
    .map((name) => {
      const info = seed.companyCat?.[name] || {};
      return {
        name,
        major: info.major || null,
        category: info.cat || null,
        task: info.task || null,
        start_month: info.sm || null,
        assignee: info.assignee || null,
      };
    });
  if (companies.length) await upsertBatch(supabase, "companies", companies, 500, "name");

  await clearTable(supabase, "entries");
  const entries = (seed.entries || []).map((e) => ({
    date: e.date,
    owner: e.owner,
    start_time: e.start,
    end_time: e.end,
    company: e.company || "",
    project: e.project || "",
    stage: e.stage || "본작업",
    note: e.note || "",
  }));
  if (entries.length) await upsertBatch(supabase, "entries", entries);

  await clearTable(supabase, "project_statuses");
  const statuses = Object.entries(seed.projectStatus || {}).map(([k, status]) => {
    const [company, project] = k.split("|||");
    return { company, project, status };
  });
  if (statuses.length) await upsertBatch(supabase, "project_statuses", statuses);

  await clearTable(supabase, "leaves");
  const leaves = Object.entries(seed.leaveData || {}).map(([k, leave_type]) => {
    const [employee_name, date] = k.split("|||");
    return { employee_name, date, leave_type };
  });
  if (leaves.length) await upsertBatch(supabase, "leaves", leaves);

  if (seed.publicDutyData) {
    await clearTable(supabase, "public_duties");
    const duties = Object.entries(seed.publicDutyData).map(([k, duty_type]) => {
      const [employee_name, date] = k.split("|||");
      return { employee_name, date, duty_type };
    });
    if (duties.length) await upsertBatch(supabase, "public_duties", duties);
  }

  if (seed.holidays) {
    const holidays = Object.entries(seed.holidays).map(([date, name]) => ({
      date,
      name,
    }));
    if (holidays.length) await upsertBatch(supabase, "holidays", holidays, 500, "date");
  }

  if (seed.gradeDailyRate) {
    const grades = Object.entries(seed.gradeDailyRate).map(([grade, daily_rate]) => ({
      grade,
      daily_rate,
    }));
    if (grades.length) await upsertBatch(supabase, "grade_rates", grades, 500, "grade");
  }

  if (seed.estimates) {
    await clearTable(supabase, "estimates");
    const estimates = Object.entries(seed.estimates).map(([k, amount_manwon]) => {
      const [company, project] = k.split("|||");
      return { company, project, amount_manwon };
    });
    if (estimates.length) await upsertBatch(supabase, "estimates", estimates);
  }

  if (seed.personEstimates) {
    await clearTable(supabase, "person_estimates");
    const personEstimates = Object.entries(seed.personEstimates).map(
      ([k, amount_manwon]) => {
        const [company, project, person] = k.split("|||");
        return { company, project, person, amount_manwon };
      }
    );
    if (personEstimates.length) {
      await upsertBatch(supabase, "person_estimates", personEstimates);
    }
  }

  if (seed.taskItemOverrides) {
    await clearTable(supabase, "task_item_overrides");
    const overrides = Object.entries(seed.taskItemOverrides).map(([k, label]) => {
      const [owner, company, category, auto_key] = k.split("|||");
      return { owner, company, category, auto_key, label };
    });
    if (overrides.length) {
      await upsertBatch(supabase, "task_item_overrides", overrides);
    }
  }
}
