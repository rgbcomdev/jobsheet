/**
 * Seed Supabase from data/seed.json
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 *
 * Usage: node --env-file=.env.local scripts/seed-to-supabase.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon key)"
  );
  process.exit(1);
}

const supabase = createClient(url, key);
const seed = JSON.parse(
  fs.readFileSync(path.join(root, "data", "seed.json"), "utf8")
);

async function upsertBatch(table, rows, chunk = 500, onConflict) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const opts = onConflict ? { onConflict } : undefined;
    const { error } = await supabase.from(table).upsert(part, opts);
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`${table}: ${Math.min(i + chunk, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const employees = [];
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
  await upsertBatch("employees", employees, 500, "name");

  const companies = (seed.companyMaster || [])
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
  await upsertBatch("companies", companies, 500, "name");

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
  // clear then insert for idempotent-ish seed
  await supabase.from("entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await upsertBatch("entries", entries);

  const statuses = Object.entries(seed.projectStatus || {}).map(([k, status]) => {
    const [company, project] = k.split("|||");
    return { company, project, status };
  });
  await upsertBatch("project_statuses", statuses);

  const leaves = Object.entries(seed.leaveData || {}).map(([k, leave_type]) => {
    const [employee_name, date] = k.split("|||");
    return { employee_name, date, leave_type };
  });
  await upsertBatch("leaves", leaves);

  const duties = Object.entries(seed.publicDutyData || {}).map(([k, duty_type]) => {
    const [employee_name, date] = k.split("|||");
    return { employee_name, date, duty_type };
  });
  await upsertBatch("public_duties", duties);

  const holidays = Object.entries(seed.holidays || {}).map(([date, name]) => ({
    date,
    name,
  }));
  await upsertBatch("holidays", holidays);

  const grades = Object.entries(seed.gradeDailyRate || {}).map(
    ([grade, daily_rate]) => ({ grade, daily_rate })
  );
  await upsertBatch("grade_rates", grades);

  const estimates = Object.entries(seed.estimates || {}).map(([k, amount_manwon]) => {
    const [company, project] = k.split("|||");
    return { company, project, amount_manwon };
  });
  await upsertBatch("estimates", estimates);

  const personEstimates = Object.entries(seed.personEstimates || {}).map(
    ([k, amount_manwon]) => {
      const [company, project, person] = k.split("|||");
      return { company, project, person, amount_manwon };
    }
  );
  await upsertBatch("person_estimates", personEstimates);

  const overrides = Object.entries(seed.taskItemOverrides || {}).map(
    ([k, label]) => {
      const [owner, company, category, auto_key] = k.split("|||");
      return { owner, company, category, auto_key, label };
    }
  );
  await upsertBatch("task_item_overrides", overrides);

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
