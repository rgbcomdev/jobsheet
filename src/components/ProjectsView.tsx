"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useJobsheet } from "@/context/JobsheetContext";
import { buildGroups, summarizeTaskItem } from "@/lib/aggregate";
import { STAGES } from "@/lib/constants";
import { round1 } from "@/lib/time";
import { exportProjectsExcel } from "@/lib/excel";

export function ProjectsView({ name }: { name: string }) {
  const { loading, data, getStatus, setStatus } = useJobsheet();
  const [filter, setFilter] = useState<"전체" | "진행중" | "완료">("전체");

  const groups = useMemo(
    () =>
      buildGroups(data.entries, null, name, data.leaveData, data.companyCat),
    [data.entries, data.leaveData, data.companyCat, name]
  );

  const keys = useMemo(() => {
    return Object.keys(groups)
      .filter((k) => {
        const st = getStatus(groups[k].company, groups[k].project);
        if (filter === "전체") return true;
        return st === filter;
      })
      .sort((a, b) => groups[b].total - groups[a].total);
  }, [groups, filter, getStatus]);

  if (loading) {
    return (
      <div className="wrap">
        <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="dash-head">
        <Link href={`/e/${encodeURIComponent(name)}`} className="back-btn">
          ← 개인 캘린더
        </Link>
        <h1>{name} · 전체 프로젝트</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {(["전체", "진행중", "완료"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={"team-tab-btn" + (filter === f ? " active" : "")}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            className="backup-btn"
            onClick={() =>
              exportProjectsExcel(
                name,
                filter,
                keys.map((k) => {
                  const g = groups[k];
                  return {
                    company: g.company,
                    project: g.project,
                    stages: g.stages,
                    total: g.total,
                    status: getStatus(g.company, g.project),
                  };
                })
              )
            }
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="summary-card">
        <table className="agg">
          <thead>
            <tr>
              <th>업체명</th>
              <th>대분류</th>
              <th>세부</th>
              <th>작업항목</th>
              {STAGES.map((s) => (
                <th className="center" key={s}>
                  {s}
                </th>
              ))}
              <th className="center">상태</th>
              <th className="center">합계</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const g = groups[key];
              const done = getStatus(g.company, g.project) === "완료";
              const notes = Array.from(
                new Set(
                  g.notes.map((n) =>
                    summarizeTaskItem(
                      n,
                      g.company,
                      name,
                      g.project,
                      data.taskItemOverrides
                    )
                  )
                )
              ).filter(Boolean);
              return (
                <tr key={key} className={done ? "done" : ""}>
                  <td>{g.company}</td>
                  <td>{g.major || "-"}</td>
                  <td>{g.project}</td>
                  <td>
                    <div className="task-items">
                      {notes.slice(0, 4).map((n, i) => (
                        <div className="task-item-line" key={i}>
                          {n}
                        </div>
                      ))}
                    </div>
                  </td>
                  {STAGES.map((s) => (
                    <td className="center mono" key={s}>
                      {g.stages[s] ? round1(g.stages[s]) : "-"}
                    </td>
                  ))}
                  <td className="center">
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
                  <td className="center mono">{g.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
