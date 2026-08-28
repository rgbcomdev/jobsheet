"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  buildGroups,
  deriveMajorSub,
  getDefaultYearMonth,
} from "@/lib/aggregate";
import { classifyDesignOrPublish, computeDuration, round1 } from "@/lib/time";
import {
  DEFAULT_PROJECT_TYPES_BY_MAJOR,
  STAGES,
} from "@/lib/constants";
import { fmWon } from "@/lib/estimate";
import { exportTeamKpiExcel } from "@/lib/excel";

type TeamTab = "전체" | "디자인" | "동영상";

export function TeamKpiView() {
  const { loading, data, getStatus, setStatus, activeEmployeesByTeam } =
    useJobsheet();
  const router = useRouter();
  const [monthSynced, setMonthSynced] = useState(false);
  const [tab, setTab] = useState<TeamTab>("전체");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState("전체");
  const [employeeFilter, setEmployeeFilter] = useState("전체");
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");

  useEffect(() => {
    if (loading || monthSynced) return;
    const { year: y, month: m } = getDefaultYearMonth(data.entries);
    setMonthFilter(`${y}-${String(m).padStart(2, "0")}`);
    setMonthSynced(true);
  }, [loading, data.entries, monthSynced]);

  const allMonths = useMemo(() => {
    return [...new Set(data.entries.map((e) => e.date.slice(0, 7)))]
      .filter(Boolean)
      .sort()
      .reverse();
  }, [data.entries]);

  const monthsAsc = useMemo(
    () => [...allMonths].sort(),
    [allMonths]
  );

  useEffect(() => {
    if (!monthsAsc.length) return;
    setExportStart((prev) => prev || monthsAsc[0]);
    setExportEnd((prev) => prev || monthsAsc[monthsAsc.length - 1]);
  }, [monthsAsc]);

  const monthPrefix = monthFilter === "전체" || !monthFilter ? null : monthFilter;

  const groups = useMemo(
    () =>
      buildGroups(
        data.entries,
        monthPrefix,
        null,
        data.leaveData,
        data.companyCat
      ),
    [data.entries, data.leaveData, data.companyCat, monthPrefix]
  );

  const projectOptions = useMemo(() => {
    if (tab === "전체") {
      const all = new Set<string>();
      Object.values(
        data.projectTypesByMajor || DEFAULT_PROJECT_TYPES_BY_MAJOR
      ).forEach((list) => list.forEach((c) => all.add(c)));
      return [...all].filter((c) => c !== "RGB내부업무");
    }
    const list =
      data.projectTypesByMajor?.[tab] ||
      DEFAULT_PROJECT_TYPES_BY_MAJOR[tab] ||
      [];
    return list.filter((c) => c !== "RGB내부업무");
  }, [tab, data.projectTypesByMajor]);

  const employeeOptions = useMemo(() => {
    if (tab === "디자인") return activeEmployeesByTeam["디자인"] || [];
    if (tab === "동영상") return activeEmployeesByTeam["영상"] || [];
    return [
      ...(activeEmployeesByTeam["디자인"] || []),
      ...(activeEmployeesByTeam["영상"] || []),
    ];
  }, [tab, activeEmployeesByTeam]);

  useEffect(() => {
    setProjectFilter("전체");
    setEmployeeFilter("전체");
  }, [tab]);

  const filteredKeys = useMemo(() => {
    return Object.keys(groups)
      .filter((k) => {
        const g = groups[k];
        const { major } = deriveMajorSub(
          g.project,
          g.company,
          data.companyCat,
          data.projectTypesByMajor
        );
        if (tab !== "전체") {
          if (g.project !== "RGB내부업무" && major !== tab) return false;
        }
        if (projectFilter !== "전체" && g.project !== projectFilter) return false;
        if (employeeFilter !== "전체") {
          const worked = data.entries.some(
            (e) =>
              e.company === g.company &&
              e.project === g.project &&
              e.owner === employeeFilter &&
              (!monthPrefix || e.date.startsWith(monthPrefix))
          );
          if (!worked) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ga = groups[a];
        const gb = groups[b];
        const ma = deriveMajorSub(
          ga.project,
          ga.company,
          data.companyCat,
          data.projectTypesByMajor
        ).major;
        const mb = deriveMajorSub(
          gb.project,
          gb.company,
          data.companyCat,
          data.projectTypesByMajor
        ).major;
        if (tab === "전체" && ma !== mb) {
          return ma === "디자인" ? -1 : 1;
        }
        return gb.total - ga.total;
      });
  }, [
    groups,
    tab,
    projectFilter,
    employeeFilter,
    monthPrefix,
    data.companyCat,
    data.projectTypesByMajor,
    data.entries,
  ]);

  const counts = useMemo(() => {
    let all = 0;
    let design = 0;
    let video = 0;
    Object.values(groups).forEach((g) => {
      all++;
      const { major } = deriveMajorSub(
        g.project,
        g.company,
        data.companyCat,
        data.projectTypesByMajor
      );
      if (g.project === "RGB내부업무" || major === "디자인") design++;
      if (g.project === "RGB내부업무" || major === "동영상") video++;
    });
    return { all, design, video };
  }, [groups, data.companyCat, data.projectTypesByMajor]);

  if (loading) {
    return (
      <div className="wrap">
        <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
      </div>
    );
  }

  const goToPerson = (name: string, company: string, project: string) => {
    const personEntries = data.entries.filter(
      (e) =>
        e.owner === name && e.company === company && e.project === project
    );
    let lastDate: string | null = null;
    personEntries.forEach((e) => {
      if (!lastDate || e.date > lastDate) lastDate = e.date;
    });
    const q = lastDate ? `?date=${lastDate}` : "";
    router.push(`/e/${encodeURIComponent(name)}${q}`);
  };

  const tabs: { key: TeamTab; label: string; count: number }[] = [
    { key: "전체", label: "전체", count: counts.all },
    { key: "디자인", label: "디자인팀", count: counts.design },
    { key: "동영상", label: "영상팀", count: counts.video },
  ];

  const handleExportExcel = () => {
    let start = exportStart;
    let end = exportEnd;
    if (!start || !end) {
      alert("시작월과 종료월을 선택해주세요.");
      return;
    }
    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    const months: string[] = [];
    {
      let y = Number(start.slice(0, 4));
      let m = Number(start.slice(5, 7));
      const ey = Number(end.slice(0, 4));
      const em = Number(end.slice(5, 7));
      while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, "0")}`);
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }

    // key: company|||project → worker → month → hours
    const byProject: Record<
      string,
      {
        company: string;
        project: string;
        major: string;
        workers: Record<string, Record<string, number>>;
      }
    > = {};

    data.entries.forEach((e) => {
      if (!e.company || !e.project) return;
      const ym = e.date.slice(0, 7);
      if (ym < start || ym > end) return;
      if (employeeFilter !== "전체" && e.owner !== employeeFilter) return;
      if (projectFilter !== "전체" && e.project !== projectFilter) return;
      const { major } = deriveMajorSub(
        e.project,
        e.company,
        data.companyCat,
        data.projectTypesByMajor
      );
      if (tab !== "전체") {
        if (e.project !== "RGB내부업무" && major !== tab) return;
      }
      const leave = data.leaveData[`${e.owner}|||${e.date}`] || "";
      const dur = computeDuration(e.start, e.end, leave);
      if (dur <= 0) return;
      const key = `${e.company}|||${e.project}`;
      if (!byProject[key]) {
        byProject[key] = {
          company: e.company,
          project: e.project,
          major,
          workers: {},
        };
      }
      const owner = e.owner || "-";
      if (!byProject[key].workers[owner]) byProject[key].workers[owner] = {};
      byProject[key].workers[owner][ym] =
        (byProject[key].workers[owner][ym] || 0) + dur;
    });

    const projects = Object.values(byProject)
      .map((p) => {
        const workers = Object.entries(p.workers)
          .map(([name, byMonth]) => {
            const total = Object.values(byMonth).reduce((a, b) => a + b, 0);
            return { name, byMonth, total };
          })
          .sort((a, b) => b.total - a.total);
        const estimate =
          data.estimates[`${p.company}|||${p.project}`] ?? null;
        return {
          company: p.company,
          project: p.project,
          major: p.major === "동영상" ? "영상" : p.major,
          estimate,
          status:
            getStatus(p.company, p.project) === "완료" ? "완료" : "진행중",
          workers,
        };
      })
      .filter((p) => p.workers.length > 0)
      .sort((a, b) => {
        const ta = a.workers.reduce((s, w) => s + w.total, 0);
        const tb = b.workers.reduce((s, w) => s + w.total, 0);
        return tb - ta;
      });

    if (!projects.length) {
      alert("선택한 기간에 내보낼 데이터가 없습니다.");
      return;
    }

    const tabLabel =
      tab === "전체" ? "전체" : tab === "디자인" ? "디자인팀" : "영상팀";
    void exportTeamKpiExcel({
      startMonth: start,
      endMonth: end,
      tabLabel,
      months,
      projects,
    });
  };

  return (
    <div className="wrap">
      <div className="dash-head team-kpi-head">
        <div className="back-btn-group">
          <Link href="/admin" className="back-btn">
            ← 통합관리
          </Link>
          <Link href="/" className="back-btn">
            ← 대시보드
          </Link>
        </div>
        <h1>전체 직원 통합 보기 (KPI)</h1>
        <div />
      </div>

      <div className="team-toolbar">
        <div className="team-toolbar-row">
          <div className="team-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={"team-tab-btn" + (tab === t.key ? " active" : "")}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                <span className="team-tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="team-export-bar">
            <span className="team-export-label">엑셀</span>
            <select
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
              aria-label="시작월"
            >
              {monthsAsc.map((m) => (
                <option key={m} value={m}>
                  {m.replace("-", "년 ")}월
                </option>
              ))}
            </select>
            <span className="team-export-tilde">~</span>
            <select
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
              aria-label="종료월"
            >
              {monthsAsc.map((m) => (
                <option key={m} value={m}>
                  {m.replace("-", "년 ")}월
                </option>
              ))}
            </select>
            <button
              type="button"
              className="backup-btn"
              onClick={handleExportExcel}
            >
              다운로드
            </button>
          </div>
        </div>

        <div className="team-filters">
          <label className="team-filter-field">
            <span>보기 기간</span>
            <select
              value={monthFilter || "전체"}
              onChange={(e) => setMonthFilter(e.target.value)}
            >
              <option value="전체">전체 기간</option>
              {allMonths.map((m) => (
                <option key={m} value={m}>
                  {m.replace("-", "년 ")}월
                </option>
              ))}
            </select>
          </label>
          <label className="team-filter-field">
            <span>프로젝트</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="전체">
                {tab === "디자인"
                  ? "디자인 전체"
                  : tab === "동영상"
                    ? "영상 전체"
                    : "프로젝트 전체"}
              </option>
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="team-filter-field">
            <span>담당자</span>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
            >
              <option value="전체">담당자 전체</option>
              {employeeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="team-full-table-wrap">
        <table className="agg team-full-table">
          <thead>
            <tr>
              <th>업체</th>
              <th>대분류</th>
              <th>카테고리</th>
              <th>역할</th>
              <th>담당</th>
              {STAGES.map((s) => (
                <th className="center" key={s}>
                  {s}
                </th>
              ))}
              <th className="center">합계</th>
              <th className="center">견적</th>
              <th className="center">상태</th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    textAlign: "center",
                    color: "var(--text-muted)",
                    padding: 24,
                  }}
                >
                  해당 조건의 프로젝트가 없습니다.
                </td>
              </tr>
            )}
            {filteredKeys.map((key) => {
              const g = groups[key];
              const catInfo = deriveMajorSub(
                g.project,
                g.company,
                data.companyCat,
                data.projectTypesByMajor
              );
              const done = getStatus(g.company, g.project) === "완료";
              const byRole: Record<
                string,
                {
                  hours: number;
                  owners: Set<string>;
                  stages: Record<string, number>;
                }
              > = {
                디자인: {
                  hours: 0,
                  owners: new Set(),
                  stages: { 시안: 0, 본작업: 0, 수정중: 0, 제작중: 0 },
                },
                퍼블: {
                  hours: 0,
                  owners: new Set(),
                  stages: { 시안: 0, 본작업: 0, 수정중: 0, 제작중: 0 },
                },
              };
              data.entries.forEach((e) => {
                if (e.company !== g.company || e.project !== g.project) return;
                if (monthPrefix && !e.date.startsWith(monthPrefix)) return;
                if (employeeFilter !== "전체" && e.owner !== employeeFilter)
                  return;
                const role = classifyDesignOrPublish(
                  e.owner,
                  e.note,
                  e.stage,
                  data.staffRole
                );
                const leave = data.leaveData[`${e.owner}|||${e.date}`] || "";
                const dur = computeDuration(e.start, e.end, leave);
                byRole[role].hours += dur;
                byRole[role].owners.add(e.owner);
                if (e.stage in byRole[role].stages) {
                  byRole[role].stages[e.stage] += dur;
                }
              });

              const estimate =
                data.personEstimates && employeeFilter !== "전체"
                  ? data.personEstimates[
                      `${g.company}|||${g.project}|||${employeeFilter}`
                    ] ?? data.estimates[`${g.company}|||${g.project}`]
                  : data.estimates[`${g.company}|||${g.project}`];
              const roles = (["디자인", "퍼블"] as const).filter(
                (r) => byRole[r].hours > 0
              );
              if (!roles.length) roles.push("디자인");

              return roles.map((role, idx) => (
                <tr key={key + role} className={done ? "done" : ""}>
                  {idx === 0 && (
                    <>
                      <td rowSpan={roles.length}>{g.company}</td>
                      <td rowSpan={roles.length} className="center">
                        {catInfo.major === "동영상" ? "영상" : catInfo.major}
                      </td>
                      <td rowSpan={roles.length}>{g.project}</td>
                    </>
                  )}
                  <td>
                    <span className={`role-badge role-${role}`}>{role}</span>
                  </td>
                  <td>
                    {[...byRole[role].owners].map((name, i) => (
                      <span key={name}>
                        {i > 0 ? ", " : ""}
                        <button
                          type="button"
                          className="linkish"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--accent)",
                            cursor: "pointer",
                            padding: 0,
                            font: "inherit",
                          }}
                          onClick={() =>
                            goToPerson(name, g.company, g.project)
                          }
                        >
                          {name}
                        </button>
                      </span>
                    )) || "-"}
                  </td>
                  {STAGES.map((s) => (
                    <td className="center mono" key={s}>
                      {byRole[role].stages[s]
                        ? round1(byRole[role].stages[s])
                        : "-"}
                    </td>
                  ))}
                  <td className="center mono">
                    {round1(byRole[role].hours)}
                  </td>
                  {idx === 0 && (
                    <>
                      <td className="center" rowSpan={roles.length}>
                        {fmWon(estimate)}
                      </td>
                      <td className="center" rowSpan={roles.length}>
                        <button
                          type="button"
                          className={"status-btn" + (done ? " done" : "")}
                          onClick={() =>
                            setStatus(
                              g.company,
                              g.project,
                              done ? "진행중" : "완료"
                            )
                          }
                        >
                          {done ? "완료" : "진행중"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
