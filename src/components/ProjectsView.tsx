"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  buildGroups,
  buildTaskStageBreakdown,
  deriveMajorSub,
  type TaskStageRow,
} from "@/lib/aggregate";
import {
  FULL_CATEGORY_ORDER,
  SPLIT_DESIGN_PUBLISH,
  STAGES,
} from "@/lib/constants";
import { round1 } from "@/lib/time";
import { exportAllTimeProjectsExcel } from "@/lib/excel";

function fmtHours(n: number) {
  return n ? `${round1(n)}h` : "-";
}

function catRank(cat: string) {
  const idx = (FULL_CATEGORY_ORDER as readonly string[]).indexOf(cat);
  return idx === -1 ? FULL_CATEGORY_ORDER.length : idx;
}

export function ProjectsView({ name }: { name: string }) {
  const router = useRouter();
  const { loading, data, getStatus } = useJobsheet();
  const [statusFilter, setStatusFilter] = useState<"전체" | "진행중" | "완료">(
    "전체"
  );
  const [monthFilter, setMonthFilter] = useState("전체");

  const groups = useMemo(
    () =>
      buildGroups(data.entries, null, name, data.leaveData, data.companyCat),
    [data.entries, data.leaveData, data.companyCat, name]
  );

  const monthsAvailable = useMemo(() => {
    const months = new Set<string>();
    Object.values(groups).forEach((g) => {
      if (getStatus(g.company, g.project) !== "완료") return;
      if (g.lastDate) months.add(g.lastDate.slice(0, 7));
    });
    return [...months].sort().reverse();
  }, [groups, getStatus]);

  const filteredKeys = useMemo(() => {
    let keys = Object.keys(groups).filter((k) => {
      const g = groups[k];
      const status = getStatus(g.company, g.project);
      if (statusFilter === "진행중" && status === "완료") return false;
      if (statusFilter === "완료" && status !== "완료") return false;
      if (
        monthFilter !== "전체" &&
        status === "완료" &&
        g.lastDate.slice(0, 7) !== monthFilter
      ) {
        return false;
      }
      return true;
    });

    keys.sort((a, b) => {
      const ga = groups[a];
      const gb = groups[b];
      const sa = getStatus(ga.company, ga.project) === "완료" ? 1 : 0;
      const sb = getStatus(gb.company, gb.project) === "완료" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      const ca = catRank(ga.project);
      const cb = catRank(gb.project);
      if (ca !== cb) return ca - cb;
      return (
        gb.lastDate.localeCompare(ga.lastDate) || gb.total - ga.total
      );
    });
    return keys;
  }, [groups, statusFilter, monthFilter, getStatus]);

  const grandTotal = useMemo(
    () => round1(filteredKeys.reduce((sum, k) => sum + groups[k].total, 0)),
    [filteredKeys, groups]
  );

  const jumpToDate = (dateStr: string) => {
    if (!dateStr) return;
    router.push(
      `/e/${encodeURIComponent(name)}?date=${encodeURIComponent(dateStr)}`
    );
  };

  const estimateText = (company: string, project: string) => {
    const personKey = `${company}|||${project}|||${name}`;
    const person = data.personEstimates[personKey];
    if (person != null) return `${person.toLocaleString("ko-KR")}만`;
    const all = data.estimates[`${company}|||${project}`];
    if (all != null) return `${all.toLocaleString("ko-KR")}만(전체)`;
    return "-";
  };

  const getBreakdown = (
    company: string,
    project: string,
    role?: "디자인" | "퍼블" | null
  ) =>
    buildTaskStageBreakdown(
      data.entries,
      name,
      company,
      project,
      data.leaveData,
      data.taskItemOverrides,
      data.staffRole,
      role
    );

  const handleExport = () => {
    exportAllTimeProjectsExcel(
      name,
      statusFilter,
      monthFilter,
      filteredKeys.map((k) => {
        const g = groups[k];
        const catInfo = deriveMajorSub(
          g.project,
          g.company,
          data.companyCat,
          data.projectTypesByMajor
        );
        const done = getStatus(g.company, g.project) === "완료";
        return {
          company: g.company,
          major:
            catInfo.major === "동영상" ? "영상" : catInfo.major || "",
          project: g.project,
          estimate: estimateText(g.company, g.project),
          stages: g.stages,
          status: done ? "완료" : "진행중",
          total: g.total,
          finishMonth:
            done && g.lastDate
              ? `${g.lastDate.slice(0, 7).replace("-", "년 ")}월`
              : "-",
        };
      }),
      grandTotal
    );
  };

  if (loading) {
    return (
      <div className="wrap">
        <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
      </div>
    );
  }

  const doneCountForFilter = Object.values(groups).filter(
    (g) => getStatus(g.company, g.project) === "완료"
  ).length;

  const tableRows: ReactNode[] = [];
  let lastCatShown: string | null = null;

  filteredKeys.forEach((key) => {
    const g = groups[key];
    const done = getStatus(g.company, g.project) === "완료";
    const catInfo = deriveMajorSub(
      g.project,
      g.company,
      data.companyCat,
      data.projectTypesByMajor
    );
    const finishMonth =
      done && g.lastDate
        ? `${g.lastDate.slice(0, 7).replace("-", "년 ")}월`
        : "-";
    const est = estimateText(g.company, g.project);
    const majorLabel =
      catInfo.major === "동영상" ? "영상" : catInfo.major || "-";

    if (g.project !== lastCatShown) {
      lastCatShown = g.project;
      tableRows.push(
        <tr key={`cat-${g.project}-${key}`} className="cat-group-row">
          <td colSpan={13}>{g.project}</td>
        </tr>
      );
    }

    const split = SPLIT_DESIGN_PUBLISH.has(g.project);
    let designRows: TaskStageRow[] = [];
    let publishRows: TaskStageRow[] = [];
    let plainRows: TaskStageRow[] = [];

    if (split) {
      designRows = getBreakdown(g.company, g.project, "디자인");
      publishRows = getBreakdown(g.company, g.project, "퍼블");
      if (!designRows.length && !publishRows.length) {
        plainRows = [
          {
            task: "-",
            stage: "본작업",
            hours: { ...g.stages },
            total: g.total,
            lastDate: g.lastDate,
          },
        ];
      }
    } else {
      plainRows = getBreakdown(g.company, g.project);
      if (!plainRows.length) {
        plainRows = [
          {
            task: "-",
            stage: "본작업",
            hours: { ...g.stages },
            total: g.total,
            lastDate: g.lastDate,
          },
        ];
      }
    }

    const blocks: { rows: TaskStageRow[]; role: string | null }[] = [];
    if (split) {
      if (designRows.length) blocks.push({ rows: designRows, role: "디자인" });
      if (publishRows.length) blocks.push({ rows: publishRows, role: "퍼블" });
      if (plainRows.length) blocks.push({ rows: plainRows, role: null });
    } else {
      blocks.push({ rows: plainRows, role: null });
    }

    const totalRowCount = blocks.reduce((n, b) => n + b.rows.length, 0);
    let projectFirst = true;

    blocks.forEach((block) => {
      block.rows.forEach((br, idx) => {
        const isFirst = projectFirst && idx === 0;
        if (isFirst) projectFirst = false;
        const showRole = idx === 0 && block.role;
        tableRows.push(
          <tr
            key={`${key}-${block.role || "all"}-${br.task}-${br.stage}-${idx}`}
            className={done ? "done clickable-row" : "clickable-row"}
            title="클릭하면 마지막 진행달로 이동합니다"
            onClick={() => jumpToDate(br.lastDate || g.lastDate)}
          >
            <td className="company">{isFirst ? g.company : ""}</td>
            <td className="center">{isFirst ? majorLabel : ""}</td>
            <td className="center">{isFirst ? catInfo.sub || g.project : ""}</td>
            <td className="left">
              {showRole && (
                <span className={`role-badge role-${block.role}`}>
                  {block.role}
                </span>
              )}
              {br.task}
            </td>
            <td className="center">{idx === 0 ? est : ""}</td>
            {STAGES.map((s) => (
              <td className="center mono" key={s}>
                {fmtHours(br.hours[s] || 0)}
              </td>
            ))}
            <td className="center">
              {isFirst ? (
                <span
                  className={"status-btn" + (done ? " done" : "")}
                  style={{ cursor: "default" }}
                >
                  {done ? "완료" : "진행중"}
                </span>
              ) : null}
            </td>
            <td className="center mono" style={{ fontWeight: 600 }}>
              {fmtHours(br.total)}
            </td>
            <td className="center" />
            <td
              className="center"
              style={{ color: "var(--text-muted)", fontSize: 11 }}
            >
              {isFirst ? finishMonth : ""}
            </td>
          </tr>
        );
      });
    });

    if (totalRowCount > 1) {
      tableRows.push(
        <tr
          key={`${key}-subtotal`}
          className={"project-subtotal-row" + (done ? " done" : "")}
        >
          <td />
          <td />
          <td />
          <td className="left" style={{ fontWeight: 700 }}>
            합계
          </td>
          <td />
          {STAGES.map((s) => (
            <td className="center mono" key={s} style={{ fontWeight: 700 }}>
              {fmtHours(g.stages[s] || 0)}
            </td>
          ))}
          <td />
          <td className="center mono" style={{ fontWeight: 700 }}>
            {fmtHours(g.total)}
          </td>
          <td
            className="center mono"
            style={{ fontWeight: 700, color: "var(--accent)" }}
          >
            {fmtHours(g.total)}
          </td>
          <td />
        </tr>
      );
    }
  });

  return (
    <div className="wrap">
      <div className="dash-head">
        <Link href={`/e/${encodeURIComponent(name)}`} className="back-btn">
          ← 개별 화면
        </Link>
        <h1>{name}님의 전체 프로젝트</h1>
        <span />
      </div>

      <div className="admin-page-section projects-toolbar-section" style={{ maxWidth: 1600 }}>
        <div className="projects-toolbar">
          <div className="projects-toolbar-main">
            <div className="projects-filter-group">
              <span className="projects-filter-label">진행상태</span>
              <div className="projects-seg">
                {(["전체", "진행중", "완료"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={
                      "projects-seg-btn" + (statusFilter === f ? " active" : "")
                    }
                    onClick={() => setStatusFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="projects-filter-group">
              <span className="projects-filter-label">완료월</span>
              <select
                className="projects-month-select"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              >
                <option value="전체">전체 ({doneCountForFilter}건)</option>
                {monthsAvailable.map((m) => {
                  const cnt = Object.values(groups).filter(
                    (g) =>
                      getStatus(g.company, g.project) === "완료" &&
                      g.lastDate.slice(0, 7) === m
                  ).length;
                  return (
                    <option key={m} value={m}>
                      {m.replace("-", "년 ")}월 ({cnt}건)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="backup-btn projects-excel-btn"
            onClick={handleExport}
          >
            <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
            </svg>
            엑셀 저장
          </button>
        </div>
        <p className="projects-toolbar-hint">
          전체 기간 합산 · 완료월은 완료 항목에만 적용 · 행을 누르면 마지막
          진행달로 이동
        </p>

        <table className="agg">
          <thead>
            <tr>
              <th>업체명</th>
              <th className="center">대분류</th>
              <th className="center">세부</th>
              <th>작업항목</th>
              <th className="center">견적</th>
              {STAGES.map((s) => (
                <th className="center" key={s}>
                  {s}
                </th>
              ))}
              <th className="center">진행상태</th>
              <th className="center">합계시간</th>
              <th className="center">총계시간</th>
              <th className="center">완료월</th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  style={{
                    textAlign: "center",
                    color: "var(--text-muted)",
                    padding: 24,
                  }}
                >
                  표시할 프로젝트가 없습니다.
                </td>
              </tr>
            ) : (
              tableRows
            )}
          </tbody>
          <tfoot>
            <tr className="grand-total-row">
              <td
                colSpan={10}
                style={{ textAlign: "right", fontWeight: 700 }}
              >
                합계
              </td>
              <td className="center" style={{ fontWeight: 700 }} />
              <td className="center mono" style={{ fontWeight: 700 }}>
                {fmtHours(grandTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
