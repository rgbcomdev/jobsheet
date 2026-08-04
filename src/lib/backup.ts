import type { JobsheetSeed, WorkEntry } from "./types";

export function buildBackupPayload(
  data: JobsheetSeed,
  currentEmployee: string
): JobsheetSeed & { employee: string } {
  return {
    ...data,
    version: 2,
    employee: currentEmployee,
    exportedAt: new Date().toISOString(),
  };
}

export function downloadBackup(payload: object, year: number, month: number) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `업무일지_백업_전체_${year}${String(month).padStart(2, "0")}_${String(new Date().getDate()).padStart(2, "0")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(raw: string): Partial<JobsheetSeed> {
  const data = JSON.parse(raw);
  if (!Array.isArray(data.entries)) throw new Error("invalid file");
  return {
    version: data.version || 2,
    exportedAt: data.exportedAt,
    entries: data.entries as WorkEntry[],
    projectStatus: data.projectStatus || {},
    leaveData: data.leaveData || {},
    publicDutyData: data.publicDutyData || {},
    employees: data.employees,
    staffGrade: data.staffGrade,
    formerEmployees: data.formerEmployees,
    companyCat: data.companyCat,
    companyMaster: data.companyMaster,
    estimates: data.estimates,
    personEstimates: data.personEstimates,
    staffRole: data.staffRole,
    gradeDailyRate: data.gradeDailyRate,
    staffDailyRateOverride: data.staffDailyRateOverride,
    holidays: data.holidays,
    taskItemOverrides: data.taskItemOverrides,
    projectTypesByMajor: data.projectTypesByMajor,
    fixedEstimateSplitRatio: data.fixedEstimateSplitRatio,
  };
}
