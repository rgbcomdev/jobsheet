"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  LEAVE_LABEL_SHORT,
  STAGE_BADGE_TEXT,
  STAGES,
} from "@/lib/constants";
import {
  buildGroups,
  getDefaultYearMonth,
  summarizeNoteForCell,
  summarizeTaskItem,
} from "@/lib/aggregate";
import { computeDuration, computeOvertime, pad, round1 } from "@/lib/time";
import { exportMonthlyExcel } from "@/lib/excel";
import { DayModal } from "./DayModal";

export function IndividualView({ name }: { name: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    loading,
    data,
    allEmployeeNames,
    getStatus,
    setStatus,
    getLeave,
    getPublicDuty,
  } = useJobsheet();

  const activeEmployeeNames = useMemo(
    () =>
      allEmployeeNames.filter((n) => !data.formerEmployees.includes(n)),
    [allEmployeeNames, data.formerEmployees]
  );

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthSynced, setMonthSynced] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [flashDate, setFlashDate] = useState<string | null>(null);

  useEffect(() => {
    setMonthSynced(false);
  }, [name]);

  useEffect(() => {
    if (loading || monthSynced) return;
    const dateParam = searchParams.get("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m] = dateParam.split("-").map(Number);
      setYear(y);
      setMonth(m);
      setFlashDate(dateParam);
      setMonthSynced(true);
      const t = window.setTimeout(() => setFlashDate(null), 1800);
      return () => window.clearTimeout(t);
    }
    const { year: y, month: m } = getDefaultYearMonth(data.entries, name);
    setYear(y);
    setMonth(m);
    setMonthSynced(true);
  }, [loading, data.entries, name, monthSynced, searchParams]);

  const monthPrefix = `${year}-${pad(month)}`;

  const monthStats = useMemo(() => {
    let total = 0;
    let ot = 0;
    data.entries.forEach((e) => {
      if ((e.owner || "") !== name) return;
      if (!e.date.startsWith(monthPrefix)) return;
      const leave = getLeave(name, e.date);
      total += computeDuration(e.start, e.end, leave);
      ot += computeOvertime(e.start, e.end, e.date);
    });
    return { total: round1(total), ot: round1(ot) };
  }, [data.entries, name, monthPrefix, getLeave]);

  const groups = useMemo(
    () =>
      buildGroups(
        data.entries,
        monthPrefix,
        name,
        data.leaveData,
        data.companyCat
      ),
    [data.entries, data.leaveData, data.companyCat, monthPrefix, name]
  );

  const allTimeGroups = useMemo(
    () =>
      buildGroups(data.entries, null, name, data.leaveData, data.companyCat),
    [data.entries, data.leaveData, data.companyCat, name]
  );

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    setMonth(m);
    setYear(y);
  };

  const calendarCells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: ReactNode[] = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push(<div className="cal-cell empty" key={`e${i}`} />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;
      const dow = new Date(year, month - 1, d).getDay();
      const dayEntries = data.entries.filter(
        (e) => e.date === dateStr && (e.owner || "") === name
      );
      const leaveType = getLeave(name, dateStr);
      const publicDutyType = getPublicDuty(name, dateStr);
      const holidayName = data.holidays[dateStr];
      const seen: string[] = [];
      const keyStage: Record<string, string> = {};
      const keyNote: Record<string, string> = {};
      dayEntries.forEach((e) => {
        const key = `${e.company}|||${e.project}`;
        if (e.company && !seen.includes(key)) seen.push(key);
        keyStage[key] = e.stage;
        if (e.note) keyNote[key] = e.note;
      });
      cells.push(
        <div
          key={dateStr}
          className={
            "cal-cell" +
            (dow === 0 || dow === 6 ? " weekend" : "") +
            (holidayName ? " holiday" : "") +
            (leaveType ? " has-leave" : "") +
            (publicDutyType ? " has-public-duty" : "") +
            (flashDate === dateStr ? " flash-jump" : "")
          }
          onClick={() => setModalDate(dateStr)}
        >
          <div className="cnum">
            {d}
            {holidayName && (
              <span className="holiday-label">{holidayName}</span>
            )}
            {leaveType && (
              <span className="leave-label">
                {LEAVE_LABEL_SHORT[leaveType] || leaveType}
              </span>
            )}
            {publicDutyType && (
              <span className="public-duty-label">{publicDutyType}</span>
            )}
          </div>
          {dayEntries.length > 0 && (
            <div className="ctags">
              {seen.slice(0, 4).map((key) => {
                const comp = key.split("|||")[0];
                const done = getStatus(comp, key.split("|||")[1]) === "완료";
                const badgeText = done
                  ? "완료"
                  : STAGE_BADGE_TEXT[keyStage[key]] || "";
                const noteText = summarizeNoteForCell(keyNote[key], comp);
                return (
                  <div className="ctag" key={key}>
                    <span
                      className={
                        "cdotstatus " + (done ? "done" : "s-" + keyStage[key])
                      }
                    >
                      {badgeText}
                    </span>
                    {comp}
                    {noteText && (
                      <span className="ctag-note">{noteText}</span>
                    )}
                  </div>
                );
              })}
              {seen.length > 4 && (
                <div className="ctag more">+{seen.length - 4}건 더</div>
              )}
            </div>
          )}
        </div>
      );
    }
    return cells;
  }, [
    year,
    month,
    data.entries,
    data.holidays,
    name,
    getLeave,
    getPublicDuty,
    getStatus,
    flashDate,
    data.taskItemOverrides,
  ]);

  if (loading) {
    return (
      <div className="wrap">
        <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
      </div>
    );
  }

  let team = "미분류";
  for (const t of Object.keys(data.employees)) {
    if (data.employees[t].includes(name)) {
      team = t;
      break;
    }
  }

  const activeKeys = Object.keys(groups).filter(
    (k) => getStatus(groups[k].company, groups[k].project) !== "완료"
  );
  const doneKeys = Object.keys(groups).filter(
    (k) => getStatus(groups[k].company, groups[k].project) === "완료"
  );

  const renderAggRows = (keys: string[], gmap: typeof groups) =>
    keys.map((key) => {
      const g = gmap[key];
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
              {notes.slice(0, 3).map((n, i) => (
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
                setStatus(g.company, g.project, done ? "진행중" : "완료")
              }
            >
              {done ? "완료" : "진행중"}
            </button>
          </td>
          <td className="center mono">{g.total}</td>
          <td className="center mono">
            {allTimeGroups[key] ? allTimeGroups[key].total : g.total}
          </td>
        </tr>
      );
    });

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="who">
          <Link href="/" className="back-btn">
            ← 대시보드
          </Link>
          <div className="avatar">{name.slice(-2)}</div>
          <div>
            <select
              className="employee-select"
              value={name}
              onChange={(e) =>
                router.push(`/e/${encodeURIComponent(e.target.value)}`)
              }
            >
              {activeEmployeeNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="role">
              {team}팀 · {data.staffGrade[name] || ""}
            </p>
          </div>
        </div>
        <div className="monthnav">
          <button type="button" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <span className="label">
            {year}년 {month}월
          </span>
          <button type="button" onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
        <div className="topbar-right">
          <div className="stats">
            <span className="sl">이번달 총 근무</span>{" "}
            <span className="sv">{monthStats.total}h</span>
            <span className="divider">·</span>
            <span className="sl">추가근무</span>{" "}
            <span className="sv ot">{monthStats.ot}h</span>
          </div>
          <div className="backup-actions">
            <Link href="/manual" className="backup-btn">
              매뉴얼 보기
            </Link>
            <button
              type="button"
              className="backup-btn"
              onClick={() =>
                exportMonthlyExcel(
                  name,
                  year,
                  month,
                  data.entries,
                  data.leaveData,
                  data.holidays
                )
              }
            >
              이달 엑셀 다운로드
            </button>
          </div>
        </div>
      </div>

      <div className="cal-card">
        <div className="cal-weekdays">
          <div className="sun">일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div className="sat">토</div>
        </div>
        <div className="cal-grid">{calendarCells}</div>
      </div>

      <div className="summary-card">
        <div className="summary-title">
          <h2>{month}월 진행 프로젝트 누적 현황</h2>
          <div className="agg-right">
            <Link
              href={`/e/${encodeURIComponent(name)}/projects`}
              className="backup-btn"
            >
              전체 프로젝트
            </Link>
            <div className="agg-counts">
              진행중 <b>{activeKeys.length}건</b> · 완료{" "}
              <b>{doneKeys.length}건</b>
            </div>
          </div>
        </div>
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
              <th className="center">진행상태</th>
              <th className="center">합계시간</th>
              <th className="center">누적합계시간</th>
            </tr>
          </thead>
          <tbody>{renderAggRows(activeKeys, groups)}</tbody>
        </table>
      </div>

      <details className="done-card">
        <summary>완료된 프로젝트 ({doneKeys.length}건)</summary>
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
              <th className="center">진행상태</th>
              <th className="center">합계시간</th>
              <th className="center">누적합계시간</th>
            </tr>
          </thead>
          <tbody>{renderAggRows(doneKeys, groups)}</tbody>
        </table>
      </details>

      {modalDate && (
        <DayModal
          key={modalDate}
          owner={name}
          date={modalDate}
          open={!!modalDate}
          onClose={() => setModalDate(null)}
        />
      )}
    </div>
  );
}
