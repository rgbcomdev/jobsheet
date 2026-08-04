export type WorkEntry = {
  id?: string;
  date: string;
  owner: string;
  start: string;
  end: string;
  company: string;
  project: string;
  stage: string;
  note: string;
  major?: string;
};

export type CompanyInfo = {
  major?: string;
  cat?: string;
  task?: string;
  sm?: string;
  assignee?: string;
};

export type JobsheetSeed = {
  version: number;
  exportedAt?: string;
  entries: WorkEntry[];
  projectStatus: Record<string, string>;
  leaveData: Record<string, string>;
  publicDutyData: Record<string, string>;
  employees: Record<string, string[]>;
  staffGrade: Record<string, string>;
  formerEmployees: string[];
  gradeDailyRate: Record<string, number>;
  staffDailyRateOverride: Record<string, number>;
  staffRole: Record<string, string>;
  holidays: Record<string, string>;
  companyCat: Record<string, CompanyInfo>;
  companyMaster: string[];
  taskItemOverrides: Record<string, string>;
  estimates: Record<string, number>;
  personEstimates: Record<string, number>;
  fixedEstimateSplitRatio: Record<string, unknown>;
  projectTypesByMajor: Record<string, string[]>;
};

export type EmployeeRow = {
  name: string;
  team: string;
  grade: string;
  role?: string | null;
  dailyRateOverride?: number | null;
  isFormer: boolean;
};
