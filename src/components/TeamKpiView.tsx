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

  return (
    <div className="wrap">
      <div className="dash-head">
        <Link href="/admin" className="back-btn">
          ← 통합관리
        </Link>
        <h1>전체 직원 통합 보기 (KPI)</h1>
        <div />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"team-tab-btn" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 500 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="team-filters">
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
