"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  buildGroups,
  buildTaskStageBreakdown,
  deriveMajorSub,
  type AggGroup,
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

  const estimateInfo = (
    company: string,
    project: string
  ): { value: number | null; scope: "개인" | "전체" | null } => {
    const person = data.personEstimates[`${company}|||${project}|||${name}`];
    if (person != null) return { value: person, scope: "개인" };
    const all = data.estimates[`${company}|||${project}`];
    if (all != null) return { value: all, scope: "전체" };
    return { value: null, scope: null };
  };

  const estimateText = (company: string, project: string) => {
    const { value, scope } = estimateInfo(company, project);
    if (value == null) return "-";
    return `${value.toLocaleString("ko-KR")}만${scope === "전체" ? "(전체)" : ""}`;
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

  /** 화면 표와 엑셀이 공유하는 작업항목 블록 (디자인/퍼블 분리 포함) */
  const buildBlocks = (
    g: AggGroup
  ): { rows: TaskStageRow[]; role: "디자인" | "퍼블" | null }[] => {
    const fallback: TaskStageRow[] = [
      {
        task: "-",
        stage: "본작업",
        hours: { ...g.stages },
        total: g.total,
        lastDate: g.lastDate,
      },
    ];
    if (SPLIT_DESIGN_PUBLISH.has(g.project)) {
      const designRows = getBreakdown(g.company, g.project, "디자인");
      const publishRows = getBreakdown(g.company, g.project, "퍼블");
      if (!designRows.length && !publishRows.length) {
        return [{ rows: fallback, role: null }];
      }
      const blocks: { rows: TaskStageRow[]; role: "디자인" | "퍼블" | null }[] =
        [];
      if (designRows.length) blocks.push({ rows: designRows, role: "디자인" });
      if (publishRows.length) blocks.push({ rows: publishRows, role: "퍼블" });
      return blocks;
    }
    const plainRows = getBreakdown(g.company, g.project);
    return [{ rows: plainRows.length ? plainRows : fallback, role: null }];
  };

  const handleExport = () => {
    void exportAllTimeProjectsExcel(
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
        const { value, scope } = estimateInfo(g.company, g.project);
        return {
          category: g.project,
          company: g.company,
          major: catInfo.major === "동영상" ? "영상" : catInfo.major || "",
          sub: catInfo.sub || g.project,
          estimate: value,
          estimateScope: scope,
          stages: g.stages,
          status: done ? "완료" : "진행중",
          total: g.total,
          finishMonth:
            done && g.lastDate
              ? `${g.lastDate.slice(0, 7).replace("-", "년 ")}월`
              : "-",
          items: buildBlocks(g).flatMap((b) =>
            b.rows.map((r) => ({
              task: r.task,
              role: b.role,
              stages: r.hours,
              total: r.total,
            }))
          ),
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

    const blocks = buildBlocks(g);
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
            <td className="left company">{isFirst ? g.company : ""}</td>
            <td className="left">{isFirst ? majorLabel : ""}</td>
            <td className="left">{isFirst ? catInfo.sub || g.project : ""}</td>
            <td className="left">
              {showRole && (
                <span className={`role-badge role-${block.role}`}>
                  {block.role}
                </span>
              )}
              {br.task}
            </td>
            <td className="right">{idx === 0 ? est : ""}</td>
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

        <table className="agg projects-agg-table">
          <thead>
            <tr>
              <th className="left">업체명</th>
              <th className="left">대분류</th>
              <th className="left">세부</th>
              <th className="left">작업항목</th>
              <th className="right">견적</th>
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
