"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CompanyInfo, JobsheetSeed, WorkEntry } from "@/lib/types";
import { loadJobsheetData } from "@/lib/data/load";
import { GRADE_ORDER, leaveKey, projectKey } from "@/lib/constants";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

type Ctx = {
  loading: boolean;
  source: "supabase" | "local" | null;
  data: JobsheetSeed;
  setData: React.Dispatch<React.SetStateAction<JobsheetSeed>>;
  refresh: () => Promise<void>;
  getStatus: (company: string, project: string) => string;
  setStatus: (company: string, project: string, status: string) => void;
  getLeave: (name: string, date: string) => string;
  setLeave: (name: string, date: string, type: string) => void;
  getPublicDuty: (name: string, date: string) => string;
  setPublicDuty: (name: string, date: string, type: string) => void;
  saveDayEntries: (
    owner: string,
    date: string,
    dayEntries: WorkEntry[]
  ) => Promise<void>;
  upsertEmployee: (emp: {
    name: string;
    team: string;
    grade: string;
    oldName?: string;
    isFormer?: boolean;
  }) => Promise<void>;
  deleteEmployee: (name: string) => Promise<void>;
  upsertCompany: (name: string, info: CompanyInfo) => Promise<void>;
  deleteCompany: (name: string) => Promise<void>;
  replaceFromBackup: (partial: Partial<JobsheetSeed>) => void;
  activeEmployeesByTeam: Record<string, string[]>;
  allEmployeeNames: string[];
  sortByGradeDesc: (names: string[]) => string[];
};

const JobsheetContext = createContext<Ctx | null>(null);

export function JobsheetProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"supabase" | "local" | null>(null);
  const [data, setData] = useState<JobsheetSeed>({
    version: 2,
    entries: [],
    projectStatus: {},
    leaveData: {},
    publicDutyData: {},
    employees: {},
    staffGrade: {},
    formerEmployees: [],
    gradeDailyRate: {},
    staffDailyRateOverride: {},
    staffRole: {},
    holidays: {},
    companyCat: {},
    companyMaster: [],
    taskItemOverrides: {},
    estimates: {},
    personEstimates: {},
    fixedEstimateSplitRatio: {},
    projectTypesByMajor: {},
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadJobsheetData();
      setData(res.data);
      setSource(res.source);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getStatus = useCallback(
    (company: string, project: string) =>
      data.projectStatus[projectKey(company, project)] || "진행중",
    [data.projectStatus]
  );

  const setStatus = useCallback(
    (company: string, project: string, status: string) => {
      const key = projectKey(company, project);
      setData((prev) => ({
        ...prev,
        projectStatus: { ...prev.projectStatus, [key]: status },
      }));
      const sb = getSupabase();
      if (sb) {
        void sb
          .from("project_statuses")
          .upsert({ company, project, status });
      }
    },
    []
  );

  const getLeave = useCallback(
    (name: string, date: string) => data.leaveData[leaveKey(name, date)] || "",
    [data.leaveData]
  );

  const setLeave = useCallback((name: string, date: string, type: string) => {
    setData((prev) => {
      const next = { ...prev.leaveData };
      const k = leaveKey(name, date);
      if (type) next[k] = type;
      else delete next[k];
      return { ...prev, leaveData: next };
    });
    const sb = getSupabase();
    if (sb) {
      if (type) {
        void sb
          .from("leaves")
          .upsert({ employee_name: name, date, leave_type: type });
      } else {
        void sb.from("leaves").delete().eq("employee_name", name).eq("date", date);
      }
    }
  }, []);

  const getPublicDuty = useCallback(
    (name: string, date: string) =>
      data.publicDutyData[leaveKey(name, date)] || "",
    [data.publicDutyData]
  );

  const setPublicDuty = useCallback(
    (name: string, date: string, type: string) => {
      setData((prev) => {
        const next = { ...prev.publicDutyData };
        const k = leaveKey(name, date);
        if (type) next[k] = type;
        else delete next[k];
        return { ...prev, publicDutyData: next };
      });
      const sb = getSupabase();
      if (sb) {
        if (type) {
          void sb
            .from("public_duties")
            .upsert({ employee_name: name, date, duty_type: type });
        } else {
          void sb
            .from("public_duties")
            .delete()
            .eq("employee_name", name)
            .eq("date", date);
        }
      }
    },
    []
  );

  const saveDayEntries = useCallback(
    async (owner: string, date: string, dayEntries: WorkEntry[]) => {
      setData((prev) => {
        const others = prev.entries.filter(
          (e) => !(e.date === date && (e.owner || "") === owner)
        );
        const cleaned = dayEntries.filter((e) => e.company || e.project);
        const companyCat = { ...prev.companyCat };
        const companyMaster = [...prev.companyMaster];
        cleaned.forEach((e) => {
          const company = (e.company || "").trim();
          if (!company || company === "RGB내부") return;
          let info = companyCat[company];
          if (!info) {
            info = { major: e.major || "디자인", cat: e.project || "" };
            companyCat[company] = info;
            if (!companyMaster.includes(company)) companyMaster.push(company);
          }
          if (!info.assignee) info.assignee = owner;
        });
        return {
          ...prev,
          entries: [...others, ...cleaned],
          companyCat,
          companyMaster,
        };
      });

      const sb = getSupabase();
      if (sb) {
        await sb.from("entries").delete().eq("owner", owner).eq("date", date);
        const rows = dayEntries
          .filter((e) => e.company || e.project)
          .map((e) => ({
            date: e.date,
            owner,
            start_time: e.start,
            end_time: e.end,
            company: e.company || "",
            project: e.project || "",
            stage: e.stage || "본작업",
            note: e.note || "",
          }));
        if (rows.length) await sb.from("entries").insert(rows);
      }
    },
    []
  );

  const upsertEmployee = useCallback(
    async (emp: {
      name: string;
      team: string;
      grade: string;
      oldName?: string;
      isFormer?: boolean;
    }) => {
      setData((prev) => {
        const employees = { ...prev.employees };
        Object.keys(employees).forEach((t) => {
          employees[t] = employees[t].filter(
            (n) => n !== emp.name && n !== emp.oldName
          );
        });
        if (!employees[emp.team]) employees[emp.team] = [];
        employees[emp.team].push(emp.name);

        const staffGrade = { ...prev.staffGrade };
        if (emp.oldName && emp.oldName !== emp.name) {
          delete staffGrade[emp.oldName];
        }
        staffGrade[emp.name] = emp.grade;

        let formerEmployees = [...prev.formerEmployees];
        if (emp.oldName && emp.oldName !== emp.name) {
          formerEmployees = formerEmployees.map((n) =>
            n === emp.oldName ? emp.name : n
          );
        }
        if (emp.isFormer) {
          if (!formerEmployees.includes(emp.name))
            formerEmployees.push(emp.name);
        } else {
          formerEmployees = formerEmployees.filter((n) => n !== emp.name);
        }

        let entries = prev.entries;
        if (emp.oldName && emp.oldName !== emp.name) {
          entries = entries.map((e) =>
            e.owner === emp.oldName ? { ...e, owner: emp.name } : e
          );
        }

        return {
          ...prev,
          employees,
          staffGrade,
          formerEmployees,
          entries,
        };
      });

      const sb = getSupabase();
      if (sb) {
        if (emp.oldName && emp.oldName !== emp.name) {
          await sb.from("employees").delete().eq("name", emp.oldName);
          await sb
            .from("entries")
            .update({ owner: emp.name })
            .eq("owner", emp.oldName);
        }
        await sb.from("employees").upsert({
          name: emp.name,
          team: emp.team,
          grade: emp.grade,
          is_former: !!emp.isFormer,
        });
      }
    },
    []
  );

  const deleteEmployee = useCallback(async (name: string) => {
    setData((prev) => {
      const employees = { ...prev.employees };
      Object.keys(employees).forEach((t) => {
        employees[t] = employees[t].filter((n) => n !== name);
      });
      const staffGrade = { ...prev.staffGrade };
      delete staffGrade[name];
      return {
        ...prev,
        employees,
        staffGrade,
        formerEmployees: prev.formerEmployees.filter((n) => n !== name),
      };
    });
    const sb = getSupabase();
    if (sb) await sb.from("employees").delete().eq("name", name);
  }, []);

  const upsertCompany = useCallback(
    async (name: string, info: CompanyInfo) => {
      setData((prev) => {
        const companyMaster = prev.companyMaster.includes(name)
          ? prev.companyMaster
          : [...prev.companyMaster, name];
        return {
          ...prev,
          companyMaster,
          companyCat: { ...prev.companyCat, [name]: info },
        };
      });
      const sb = getSupabase();
      if (sb) {
        await sb.from("companies").upsert({
          name,
          major: info.major || null,
          category: info.cat || null,
          task: info.task || null,
          start_month: info.sm || null,
          assignee: info.assignee || null,
        });
      }
    },
    []
  );

  const deleteCompany = useCallback(async (name: string) => {
    setData((prev) => {
      const companyCat = { ...prev.companyCat };
      delete companyCat[name];
      return {
        ...prev,
        companyCat,
        companyMaster: prev.companyMaster.filter((n) => n !== name),
      };
    });
    const sb = getSupabase();
    if (sb) await sb.from("companies").delete().eq("name", name);
  }, []);

  const replaceFromBackup = useCallback((partial: Partial<JobsheetSeed>) => {
    setData((prev) => ({
      ...prev,
      ...partial,
      entries: partial.entries || prev.entries,
      projectStatus: partial.projectStatus || {},
      leaveData: partial.leaveData || {},
      version: 2,
    }));
  }, []);

  const sortByGradeDesc = useCallback(
    (names: string[]) =>
      names.slice().sort((a, b) => {
        const ga = GRADE_ORDER[data.staffGrade[a]] ?? 99;
        const gb = GRADE_ORDER[data.staffGrade[b]] ?? 99;
        if (ga !== gb) return ga - gb;
        return a.localeCompare(b, "ko");
      }),
    [data.staffGrade]
  );

  const activeEmployeesByTeam = useMemo(() => {
    const out: Record<string, string[]> = {};
    Object.entries(data.employees).forEach(([team, names]) => {
      out[team] = names.filter((n) => !data.formerEmployees.includes(n));
    });
    return out;
  }, [data.employees, data.formerEmployees]);

  const allEmployeeNames = useMemo(
    () => Object.values(data.employees).flat(),
    [data.employees]
  );

  const value: Ctx = {
    loading,
    source,
    data,
    setData,
    refresh,
    getStatus,
    setStatus,
    getLeave,
    setLeave,
    getPublicDuty,
    setPublicDuty,
    saveDayEntries,
    upsertEmployee,
    deleteEmployee,
    upsertCompany,
    deleteCompany,
    replaceFromBackup,
    activeEmployeesByTeam,
    allEmployeeNames,
    sortByGradeDesc,
  };

  return (
    <JobsheetContext.Provider value={value}>{children}</JobsheetContext.Provider>
  );
}

export function useJobsheet() {
  const ctx = useContext(JobsheetContext);
  if (!ctx) throw new Error("useJobsheet must be used within JobsheetProvider");
  return ctx;
}

export function useSupabaseFlag() {
  return isSupabaseConfigured();
}
