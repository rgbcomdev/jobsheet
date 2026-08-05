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
import { restoreBackupToSupabase } from "@/lib/data/restore";
import { GRADE_ORDER, leaveKey, projectKey } from "@/lib/constants";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

type Ctx = {
  loading: boolean;
  loadError: string | null;
  source: "supabase" | "local" | null;
  data: JobsheetSeed;
  setData: React.Dispatch<React.SetStateAction<JobsheetSeed>>;
  refresh: () => Promise<void>;
  getStatus: (company: string, project: string) => string;
  setStatus: (
    company: string,
    project: string,
    status: string
  ) => Promise<void>;
  getLeave: (name: string, date: string) => string;
  setLeave: (name: string, date: string, type: string) => Promise<void>;
  getPublicDuty: (name: string, date: string) => string;
  setPublicDuty: (name: string, date: string, type: string) => Promise<void>;
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
  reorderEmployees: (team: string, orderedNames: string[]) => Promise<void>;
  replaceFromBackup: (partial: Partial<JobsheetSeed>) => Promise<void>;
  activeEmployeesByTeam: Record<string, string[]>;
  allEmployeeNames: string[];
  sortByGradeDesc: (names: string[]) => string[];
};

const JobsheetContext = createContext<Ctx | null>(null);

export function JobsheetProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
    try {
      const res = await loadJobsheetData();
      setData(res.data);
      setSource(res.source);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await loadJobsheetData();
        if (cancelled) return;
        setData(res.data);
        setSource(res.source);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setLoadError(e instanceof Error ? e.message : "데이터 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getStatus = useCallback(
    (company: string, project: string) =>
      data.projectStatus[projectKey(company, project)] || "진행중",
    [data.projectStatus]
  );

  const setStatus = useCallback(
    async (company: string, project: string, status: string) => {
      const key = projectKey(company, project);
      setData((prev) => ({
        ...prev,
        projectStatus: { ...prev.projectStatus, [key]: status },
      }));
      const sb = getSupabase();
      if (!sb) return;
      const { error } = await sb
        .from("project_statuses")
        .upsert(
          { company, project, status },
          { onConflict: "company,project" }
        );
      if (error) console.error("project_statuses upsert failed", error);
    },
    []
  );

  const getLeave = useCallback(
    (name: string, date: string) => data.leaveData[leaveKey(name, date)] || "",
    [data.leaveData]
  );

  const setLeave = useCallback(async (name: string, date: string, type: string) => {
    setData((prev) => {
      const next = { ...prev.leaveData };
      const k = leaveKey(name, date);
      if (type) next[k] = type;
      else delete next[k];
      return { ...prev, leaveData: next };
    });
    const sb = getSupabase();
    if (!sb) return;
    if (type) {
      const { error } = await sb.from("leaves").upsert(
        { employee_name: name, date, leave_type: type },
        { onConflict: "employee_name,date" }
      );
      if (error) console.error("leaves upsert failed", error);
    } else {
      const { error } = await sb
        .from("leaves")
        .delete()
        .eq("employee_name", name)
        .eq("date", date);
      if (error) console.error("leaves delete failed", error);
    }
  }, []);

  const getPublicDuty = useCallback(
    (name: string, date: string) =>
      data.publicDutyData[leaveKey(name, date)] || "",
    [data.publicDutyData]
  );

  const setPublicDuty = useCallback(
    async (name: string, date: string, type: string) => {
      setData((prev) => {
        const next = { ...prev.publicDutyData };
        const k = leaveKey(name, date);
        if (type) next[k] = type;
        else delete next[k];
        return { ...prev, publicDutyData: next };
      });
      const sb = getSupabase();
      if (!sb) return;
      if (type) {
        const { error } = await sb.from("public_duties").upsert(
          { employee_name: name, date, duty_type: type },
          { onConflict: "employee_name,date" }
        );
        if (error) console.error("public_duties upsert failed", error);
      } else {
        const { error } = await sb
          .from("public_duties")
          .delete()
          .eq("employee_name", name)
          .eq("date", date);
        if (error) console.error("public_duties delete failed", error);
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
          const major =
            e.major === "영상" ? "동영상" : e.major || info?.major || "디자인";
          if (!info) {
            info = { major, cat: e.project || "" };
            companyCat[company] = info;
            if (!companyMaster.includes(company)) companyMaster.push(company);
          } else {
            if (major) info.major = major;
            if (e.project) info.cat = e.project;
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

        const companyUpdates = new Map<
          string,
          { major: string; category: string; assignee: string }
        >();
        dayEntries.forEach((e) => {
          const company = (e.company || "").trim();
          if (!company || company === "RGB내부") return;
          const major =
            e.major === "영상" ? "동영상" : e.major || "디자인";
          companyUpdates.set(company, {
            major,
            category: e.project || "",
            assignee: owner,
          });
        });
        for (const [name, info] of companyUpdates) {
          await sb.from("companies").upsert(
            {
              name,
              major: info.major,
              category: info.category || null,
              assignee: info.assignee,
            },
            { onConflict: "name" }
          );
        }
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
        const { count } = await sb
          .from("employees")
          .select("*", { count: "exact", head: true })
          .eq("team", emp.team);
        await sb.from("employees").upsert({
          name: emp.name,
          team: emp.team,
          grade: emp.grade,
          is_former: !!emp.isFormer,
          ...(!emp.oldName
            ? { sort_order: count ?? 0 }
            : {}),
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

  /** 팀 내 직원 표시 순서 변경 (대시보드 카드 순서 = sort_order) */
  const reorderEmployees = useCallback(
    async (team: string, orderedNames: string[]) => {
      setData((prev) => {
        const current = prev.employees[team] || [];
        const orderedSet = new Set(orderedNames);
        const remaining = current.filter((n) => !orderedSet.has(n));
        return {
          ...prev,
          employees: {
            ...prev.employees,
            [team]: [...orderedNames, ...remaining],
          },
        };
      });

      const sb = getSupabase();
      if (sb) {
        await Promise.all(
          orderedNames.map((name, idx) =>
            sb.from("employees").update({ sort_order: idx }).eq("name", name)
          )
        );
      }
    },
    []
  );

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

  const replaceFromBackup = useCallback(async (partial: Partial<JobsheetSeed>) => {
    let next: JobsheetSeed | null = null;
    setData((prev) => {
      next = {
        ...prev,
        version: 2,
        entries: partial.entries || [],
        projectStatus: partial.projectStatus || {},
        leaveData: partial.leaveData || {},
        publicDutyData: partial.publicDutyData ?? prev.publicDutyData,
        employees: partial.employees ?? prev.employees,
        staffGrade: partial.staffGrade ?? prev.staffGrade,
        formerEmployees: partial.formerEmployees ?? prev.formerEmployees,
        gradeDailyRate: partial.gradeDailyRate ?? prev.gradeDailyRate,
        staffDailyRateOverride:
          partial.staffDailyRateOverride ?? prev.staffDailyRateOverride,
        staffRole: partial.staffRole ?? prev.staffRole,
        holidays: partial.holidays ?? prev.holidays,
        companyCat: partial.companyCat ?? prev.companyCat,
        companyMaster: partial.companyMaster ?? prev.companyMaster,
        taskItemOverrides: partial.taskItemOverrides ?? prev.taskItemOverrides,
        estimates: partial.estimates ?? prev.estimates,
        personEstimates: partial.personEstimates ?? prev.personEstimates,
        fixedEstimateSplitRatio:
          partial.fixedEstimateSplitRatio ?? prev.fixedEstimateSplitRatio,
        projectTypesByMajor:
          partial.projectTypesByMajor ?? prev.projectTypesByMajor,
        exportedAt: partial.exportedAt ?? prev.exportedAt,
      };
      return next;
    });
    const sb = getSupabase();
    if (sb && next) {
      await restoreBackupToSupabase(sb, next);
    }
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
    loadError,
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
    reorderEmployees,
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
