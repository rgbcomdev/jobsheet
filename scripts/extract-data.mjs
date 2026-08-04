/**
 * Extract seed data from legacy HTML script into data/seed.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(__dirname, "_raw_script.js"), "utf8");

// Pull only data declarations (stop before first substantial function that uses DOM)
const markers = [
  "let entries = ",
  "let projectStatus = ",
  "let leaveData = ",
  "let publicDutyData = ",
  "const EMPLOYEES = ",
  "const STAFF_GRADE = ",
  "let formerEmployees = ",
  "const GRADE_DAILY_RATE = ",
  "const STAFF_DAILY_RATE_OVERRIDE = ",
  "const STAFF_ROLE = ",
  "const HOLIDAYS = ",
  "let RGB_COMPANY_CAT = ",
  "const RGB_COMPANIES = ",
  "const TASK_ITEM_OVERRIDES = ",
  "const MAJOR_CATS = ",
];

function extractAssignment(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return null;
  const after = src.slice(start + startMarker.length);
  // Find matching end: for arrays/objects walk braces
  const first = after.trimStart()[0];
  let i = after.indexOf(first);
  if (i < 0) return null;
  const open = first;
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = null;
  let escape = false;
  for (let j = i; j < after.length; j++) {
    const c = after[j];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === open) depth++;
    if (c === close) {
      depth--;
      if (depth === 0) {
        return after.slice(i, j + 1);
      }
    }
  }
  return null;
}

const sandbox = {};
const assigns = {
  entries: extractAssignment(script, "let entries = "),
  projectStatus: extractAssignment(script, "let projectStatus = "),
  leaveData: extractAssignment(script, "let leaveData = "),
  publicDutyData: extractAssignment(script, "let publicDutyData = "),
  EMPLOYEES: extractAssignment(script, "const EMPLOYEES = "),
  STAFF_GRADE: extractAssignment(script, "const STAFF_GRADE = "),
  formerEmployees: (() => {
    const m = script.match(/let formerEmployees = (\[[^\]]*\])/);
    return m ? m[1] : "[]";
  })(),
  GRADE_DAILY_RATE: extractAssignment(script, "const GRADE_DAILY_RATE = "),
  STAFF_DAILY_RATE_OVERRIDE: extractAssignment(
    script,
    "const STAFF_DAILY_RATE_OVERRIDE = "
  ),
  STAFF_ROLE: extractAssignment(script, "const STAFF_ROLE = "),
  HOLIDAYS: extractAssignment(script, "const HOLIDAYS = "),
  RGB_COMPANY_CAT: extractAssignment(script, "let RGB_COMPANY_CAT = "),
  RGB_COMPANIES: extractAssignment(script, "const RGB_COMPANIES = "),
  TASK_ITEM_OVERRIDES: extractAssignment(script, "const TASK_ITEM_OVERRIDES = "),
  RGB_ESTIMATES: extractAssignment(script, "const RGB_ESTIMATES = "),
  RGB_PERSON_ESTIMATES: extractAssignment(script, "const RGB_PERSON_ESTIMATES = "),
  FIXED_ESTIMATE_SPLIT_RATIO: extractAssignment(
    script,
    "const FIXED_ESTIMATE_SPLIT_RATIO = "
  ),
  PROJECT_TYPES_BY_MAJOR: extractAssignment(
    script,
    "const PROJECT_TYPES_BY_MAJOR = "
  ),
};

for (const [key, code] of Object.entries(assigns)) {
  if (!code) {
    console.warn("Missing:", key);
    sandbox[key] = key.endsWith("s") && key !== "STAFF_GRADE" ? [] : {};
    continue;
  }
  try {
    sandbox[key] = vm.runInNewContext("(" + code + ")", {}, { timeout: 10000 });
    console.log(
      key,
      Array.isArray(sandbox[key])
        ? `array(${sandbox[key].length})`
        : `object(${Object.keys(sandbox[key]).length})`
    );
  } catch (e) {
    console.error("Failed", key, e.message);
    sandbox[key] = {};
  }
}

const payload = {
  version: 2,
  exportedAt: new Date().toISOString(),
  source: "legacy/업무일지_시스템_v11.html",
  entries: sandbox.entries,
  projectStatus: sandbox.projectStatus,
  leaveData: sandbox.leaveData,
  publicDutyData: sandbox.publicDutyData,
  employees: sandbox.EMPLOYEES,
  staffGrade: sandbox.STAFF_GRADE,
  formerEmployees: sandbox.formerEmployees,
  gradeDailyRate: sandbox.GRADE_DAILY_RATE,
  staffDailyRateOverride: sandbox.STAFF_DAILY_RATE_OVERRIDE,
  staffRole: sandbox.STAFF_ROLE,
  holidays: sandbox.HOLIDAYS,
  companyCat: sandbox.RGB_COMPANY_CAT,
  companyMaster: sandbox.RGB_COMPANIES,
  taskItemOverrides: sandbox.TASK_ITEM_OVERRIDES,
  estimates: sandbox.RGB_ESTIMATES,
  personEstimates: sandbox.RGB_PERSON_ESTIMATES,
  fixedEstimateSplitRatio: sandbox.FIXED_ESTIMATE_SPLIT_RATIO,
  projectTypesByMajor: sandbox.PROJECT_TYPES_BY_MAJOR,
};

const outDir = path.join(root, "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "seed.json");
fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");
const publicDir = path.join(root, "public", "data");
fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(outPath, path.join(publicDir, "seed.json"));
console.log("Wrote", outPath, "entries:", payload.entries.length);
console.log("Copied to public/data/seed.json");
