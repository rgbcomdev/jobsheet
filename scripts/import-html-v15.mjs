/**
 * Import full work-log from legacy HTML v15 into seed.json (merge) + public copy
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const htmlPath =
  process.argv[2] ||
  "c:\\Users\\USER\\Downloads\\NAVER WORKS\\업무일지_시스템_v15.html";

const html = fs.readFileSync(htmlPath, "utf8");
console.log("HTML bytes", html.length);

const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
const scripts = [];
let m;
while ((m = re.exec(html))) scripts.push(m[1]);
console.log(
  "script tags",
  scripts.length,
  "sizes",
  scripts.map((s) => s.length)
);
const script = scripts.reduce((a, b) => (a.length >= b.length ? a : b), "");
fs.writeFileSync(path.join(__dirname, "_raw_script.js"), script, "utf8");
console.log("wrote _raw_script.js", script.length);

function extractAssignment(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) return null;
  const after = src.slice(start + startMarker.length);
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
      if (depth === 0) return after.slice(i, j + 1);
    }
  }
  return null;
}

const markers = {
  entries: "let entries = ",
  projectStatus: "let projectStatus = ",
  leaveData: "let leaveData = ",
  publicDutyData: "let publicDutyData = ",
  EMPLOYEES: "const EMPLOYEES = ",
  STAFF_GRADE: "const STAFF_GRADE = ",
  formerEmployees: "let formerEmployees = ",
  GRADE_DAILY_RATE: "const GRADE_DAILY_RATE = ",
  STAFF_DAILY_RATE_OVERRIDE: "const STAFF_DAILY_RATE_OVERRIDE = ",
  STAFF_ROLE: "const STAFF_ROLE = ",
  HOLIDAYS: "const HOLIDAYS = ",
  RGB_COMPANY_CAT: "let RGB_COMPANY_CAT = ",
  RGB_COMPANIES: "const RGB_COMPANIES = ",
  TASK_ITEM_OVERRIDES: "const TASK_ITEM_OVERRIDES = ",
  RGB_ESTIMATES: "const RGB_ESTIMATES = ",
  RGB_PERSON_ESTIMATES: "const RGB_PERSON_ESTIMATES = ",
  FIXED_ESTIMATE_SPLIT_RATIO: "const FIXED_ESTIMATE_SPLIT_RATIO = ",
  PROJECT_TYPES_BY_MAJOR: "const PROJECT_TYPES_BY_MAJOR = ",
};

const sandbox = {};
for (const [key, marker] of Object.entries(markers)) {
  let code = extractAssignment(script, marker);
  if (!code && key === "formerEmployees") {
    const mm = script.match(/let formerEmployees = (\[[^\]]*\])/);
    code = mm ? mm[1] : "[]";
  }
  if (!code) {
    console.warn("Missing:", key);
    sandbox[key] = null;
    continue;
  }
  try {
    sandbox[key] = vm.runInNewContext("(" + code + ")", {}, { timeout: 60000 });
    const v = sandbox[key];
    console.log(
      key,
      Array.isArray(v)
        ? `array(${v.length})`
        : typeof v === "object" && v
          ? `object(${Object.keys(v).length})`
          : typeof v
    );
  } catch (e) {
    console.error("Failed", key, e.message);
    sandbox[key] = null;
  }
}

const seedPath = path.join(root, "data", "seed.json");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

function countJuly(entries, owner) {
  const jul = (entries || []).filter((x) =>
    String(x.date || "").startsWith("2026-07")
  );
  return {
    entries: (entries || []).length,
    july: jul.length,
    ib: owner
      ? jul.filter((x) => x.owner === owner).length
      : jul.filter((x) => x.owner === "이보연").length,
  };
}

const before = countJuly(seed.entries);
console.log("BEFORE", before);

function mergePreferHtml(seedVal, htmlVal) {
  if (htmlVal == null) return seedVal;
  if (Array.isArray(htmlVal)) return htmlVal;
  if (typeof htmlVal !== "object") return htmlVal ?? seedVal;
  return {
    ...(seedVal && typeof seedVal === "object" && !Array.isArray(seedVal)
      ? seedVal
      : {}),
    ...htmlVal,
  };
}

const htmlPayload = {
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

const payload = {
  version: seed.version ?? 2,
  exportedAt: new Date().toISOString(),
  source: "업무일지_시스템_v15.html",
};

const allKeys = new Set([...Object.keys(seed), ...Object.keys(htmlPayload)]);
for (const k of allKeys) {
  if (["version", "exportedAt", "source"].includes(k)) continue;
  if (k === "entries") {
    payload.entries = htmlPayload.entries ?? seed.entries;
    continue;
  }
  if (k in htmlPayload) {
    payload[k] = mergePreferHtml(seed[k], htmlPayload[k]);
  } else {
    payload[k] = seed[k];
  }
}

const after = countJuly(payload.entries);
console.log("AFTER", after);

fs.writeFileSync(seedPath, JSON.stringify(payload), "utf8");
const pubDir = path.join(root, "public", "data");
fs.mkdirSync(pubDir, { recursive: true });
fs.copyFileSync(seedPath, path.join(pubDir, "seed.json"));
console.log("Wrote data/seed.json and public/data/seed.json");

for (const k of Object.keys(htmlPayload)) {
  const v = payload[k];
  const desc = Array.isArray(v)
    ? `array(${v.length})`
    : v && typeof v === "object"
      ? `object(${Object.keys(v).length})`
      : String(v);
  console.log("final", k, desc);
}
