"use client";

import Link from "next/link";
import { useJobsheet } from "@/context/JobsheetContext";
import { DESIGN_GRID } from "@/lib/constants";
import {
  formatUpdatedDate,
  getLatestEntryDate,
} from "@/lib/aggregate";

export function DashboardView() {
  const { loading, activeEmployeesByTeam, data, source } = useJobsheet();

  if (loading) {
    return (
      <div className="wrap">
        <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
          불러오는 중…
        </p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="dash-head dashboard-head">
        <h1>RGB 업무일지</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {source === "local" && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              로컬 시드
            </span>
          )}
          <Link href="/admin" className="backup-btn admin-btn">
            <svg className="btn-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            관리자
          </Link>
        </div>
      </div>
      <div id="dashGroups">
        {Object.keys(activeEmployeesByTeam).map((team) => {
          const activeNames = activeEmployeesByTeam[team];
          if (!activeNames.length) return null;
          return (
            <div className="dash-team" key={team}>
              <h3>
                {team === "미분류" ? "미분류" : team + "팀"} ({activeNames.length}
                명)
              </h3>
              <div
                className={
                  "dash-cards" +
                  (team === "디자인"
                    ? " dash-cards-design"
                    : team === "영상"
                      ? " dash-cards-video"
                      : "")
                }
              >
                {activeNames.map((name, idx) => {
                  const grid =
                    team === "디자인" && DESIGN_GRID[idx]
                      ? {
                          gridRow: String(DESIGN_GRID[idx][0]),
                          gridColumn: String(DESIGN_GRID[idx][1]),
                        }
                      : undefined;
                  return (
                    <Link
                      key={name}
                      href={`/e/${encodeURIComponent(name)}`}
                      className="dash-card"
                      style={grid}
                    >
                      <div className="dc-avatar">{name.slice(-2)}</div>
                      <p className="dc-name">{name}</p>
                      <p className="dc-grade">{data.staffGrade[name] || ""}</p>
                      <p className="dc-updated">
                        {formatUpdatedDate(
                          getLatestEntryDate(data.entries, name)
                        )}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
