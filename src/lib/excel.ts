import * as XLSX from "xlsx";
import type { WorkEntry } from "./types";
import {
  computeDuration,
  computeOvertime,
  hoursToTimeValue,
  pad,
  round1,
} from "./time";
import { STAGE_TO_SUMMARY_ROW } from "./constants";

export function exportMonthlyExcel(
  owner: string,
  year: number,
  month: number,
  entries: WorkEntry[],
  leaveData: Record<string, string>,
  holidays: Record<string, string>
) {
  const monthPrefix = `${year}-${pad(month)}`;
  const dayEntries: Record<string, WorkEntry[]> = {};
  entries.forEach((e) => {
    if ((e.owner || "") !== owner) return;
    if (!e.date.startsWith(monthPrefix)) return;
    if (!dayEntries[e.date]) dayEntries[e.date] = [];
    dayEntries[e.date].push(e);
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const allDates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    if (dow === 0 || dow === 6) {
      if (!dayEntries[dateStr] || dayEntries[dateStr].length === 0) continue;
    }
    allDates.push(dateStr);
  }
  const weeks: string[][] = [];
  for (let i = 0; i < allDates.length; i += 5) weeks.push(allDates.slice(i, i + 5));

  const aoa: (string | number)[][] = [];
  aoa.push([`${owner} ${year}년 ${month}월 업무일지`]);
  aoa.push([]);

  weeks.forEach((week, wi) => {
    aoa.push([`주 ${wi + 1}`]);
    const header = ["구분", ...week.map((d) => {
      const day = Number(d.slice(-2));
      const holiday = holidays[d] || "";
      const leave = leaveData[`${owner}|||${d}`] || "";
      return `${month}/${day}${holiday ? ` ${holiday}` : ""}${leave ? ` ${leave}` : ""}`;
    })];
    aoa.push(header);

    const summaryRows = ["기획", "시안", "본작업", "수정"];
    summaryRows.forEach((label) => {
      const row: (string | number)[] = [label];
      week.forEach((dateStr) => {
        const list = dayEntries[dateStr] || [];
        let hours = 0;
        list.forEach((e) => {
          const mapped = STAGE_TO_SUMMARY_ROW[e.stage] || e.stage;
          if (mapped === label) {
            const leave = leaveData[`${owner}|||${dateStr}`] || "";
            hours += computeDuration(e.start, e.end, leave);
          }
        });
        row.push(hours > 0 ? hoursToTimeValue(hours) : "");
      });
      aoa.push(row);
    });

    const detailRow: (string | number)[] = ["작업내용"];
    week.forEach((dateStr) => {
      const list = dayEntries[dateStr] || [];
      detailRow.push(
        list
          .map((e) => `${e.start}-${e.end} ${e.company} ${e.note || ""}`.trim())
          .join("\n")
      );
    });
    aoa.push(detailRow);

    const totalRow: (string | number)[] = ["합계"];
    let weekOt = 0;
    week.forEach((dateStr) => {
      const list = dayEntries[dateStr] || [];
      let hours = 0;
      list.forEach((e) => {
        const leave = leaveData[`${owner}|||${dateStr}`] || "";
        hours += computeDuration(e.start, e.end, leave);
        weekOt += computeOvertime(e.start, e.end, dateStr);
      });
      totalRow.push(hours > 0 ? hoursToTimeValue(hours) : "");
    });
    aoa.push(totalRow);
    aoa.push(["연장", round1(weekOt)]);
    aoa.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${month}월`);
  XLSX.writeFile(wb, `${owner}_${year}년_${month}월_업무일지.xlsx`);
}

export function exportProjectsExcel(
  owner: string,
  statusFilter: string,
  rows: {
    company: string;
    project: string;
    stages: Record<string, number>;
    total: number;
    status: string;
  }[]
) {
  const aoa: (string | number)[][] = [
    ["업체명", "카테고리", "시안", "본작업", "수정중", "제작중", "합계", "상태"],
  ];
  rows.forEach((r) => {
    aoa.push([
      r.company,
      r.project,
      r.stages["시안"] || 0,
      r.stages["본작업"] || 0,
      r.stages["수정중"] || 0,
      r.stages["제작중"] || 0,
      r.total,
      r.status,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "프로젝트");
  XLSX.writeFile(wb, `${owner}_전체프로젝트_${statusFilter}.xlsx`);
}

/** v17 전체 프로젝트 화면과 동일한 엑셀 형식 */
export function exportAllTimeProjectsExcel(
  owner: string,
  statusFilter: string,
  monthFilter: string,
  rows: {
    company: string;
    major: string;
    project: string;
    estimate: string;
    stages: Record<string, number>;
    status: string;
    total: number;
    finishMonth: string;
  }[],
  grandTotal: number
) {
  const aoa: (string | number)[][] = [
    [
      `${owner}님의 전체 프로젝트`,
      `진행상태: ${statusFilter}`,
      `완료월: ${monthFilter}`,
    ],
    [],
    [
      "업체명",
      "대분류",
      "세부",
      "작업항목",
      "견적(만원)",
      "시안(h)",
      "본작업(h)",
      "수정중(h)",
      "제작중(h)",
      "진행상태",
      "합계시간(h)",
      "총계시간(h)",
      "완료월",
    ],
  ];
  rows.forEach((r) => {
    const estNum = Number(
      String(r.estimate).replace(/[^\d.-]/g, "")
    );
    aoa.push([
      r.company,
      r.major,
      r.project,
      "",
      Number.isFinite(estNum) && r.estimate !== "-" ? estNum : r.estimate,
      r.stages["시안"] || 0,
      r.stages["본작업"] || 0,
      r.stages["수정중"] || 0,
      r.stages["제작중"] || 0,
      r.status,
      r.total,
      r.total,
      r.finishMonth,
    ]);
  });
  aoa.push([
    "합계",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    grandTotal,
    "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "전체 프로젝트");
  XLSX.writeFile(wb, `${owner}_전체프로젝트_${statusFilter}.xlsx`);
}

/** 팀 KPI: 한 시트에 월별 가로 집계 (항목/세부/견적/작업자 + 월 컬럼) */
export function exportTeamKpiExcel(opts: {
  startMonth: string;
  endMonth: string;
  tabLabel: string;
  months: string[];
  projects: {
    company: string;
    project: string;
    major: string;
    estimate: number | null;
    status: string;
    workers: {
      name: string;
      byMonth: Record<string, number>;
      total: number;
    }[];
  }[];
}) {
  const { startMonth, endMonth, tabLabel, months, projects } = opts;
  const monthLabels = months.map((ym) => {
    const y = ym.slice(2, 4);
    const m = Number(ym.slice(5, 7));
    const multiYear = startMonth.slice(0, 4) !== endMonth.slice(0, 4);
    return multiYear ? `${y}년${m}월` : `${m}월`;
  });

  const aoa: (string | number)[][] = [
    [
      "전체 직원 KPI",
      `기간: ${startMonth} ~ ${endMonth}`,
      `팀: ${tabLabel}`,
    ],
    [],
    ["항목", "세부항목", "견적(만원)", "작업자", ...monthLabels, "총계(시간)", "총계(영업일)"],
  ];

  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] =
    [];
  // title rows occupy 0..1, header is row 2 → data starts at row 3
  let rowIdx = 3;

  projects.forEach((p) => {
    const blockStart = rowIdx;
    const workers = p.workers.length
      ? p.workers
      : [{ name: "-", byMonth: {}, total: 0 }];

    workers.forEach((w, wi) => {
      const monthVals = months.map((m) => {
        const v = w.byMonth[m] || 0;
        return v > 0 ? round1(v) : "";
      });
      const days = w.total > 0 ? round1(w.total / 8) : "";
      aoa.push([
        wi === 0 ? p.company : "",
        wi === 0 ? p.project : "",
        wi === 0 ? (p.estimate ?? "") : "",
        w.name,
        ...monthVals,
        w.total > 0 ? round1(w.total) : "",
        days,
      ]);
      rowIdx += 1;
    });

    // 합계 row
    const sumByMonth: Record<string, number> = {};
    let sumTotal = 0;
    workers.forEach((w) => {
      months.forEach((m) => {
        sumByMonth[m] = (sumByMonth[m] || 0) + (w.byMonth[m] || 0);
      });
      sumTotal += w.total;
    });
    aoa.push([
      "",
      "",
      "",
      "합계",
      ...months.map((m) =>
        sumByMonth[m] > 0 ? round1(sumByMonth[m]) : ""
      ),
      sumTotal > 0 ? round1(sumTotal) : "",
      sumTotal > 0 ? round1(sumTotal / 8) : "",
    ]);
    rowIdx += 1;

    if (workers.length > 1) {
      const mergeEnd = blockStart + workers.length - 1;
      merges.push({ s: { r: blockStart, c: 0 }, e: { r: mergeEnd, c: 0 } });
      merges.push({ s: { r: blockStart, c: 1 }, e: { r: mergeEnd, c: 1 } });
      merges.push({ s: { r: blockStart, c: 2 }, e: { r: mergeEnd, c: 2 } });
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (merges.length) ws["!merges"] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "팀KPI");
  XLSX.writeFile(wb, `팀KPI_${startMonth}_${endMonth}_${tabLabel}.xlsx`);
}
