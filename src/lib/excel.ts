import ExcelJS from "exceljs";
import type { JobsheetSeed, WorkEntry } from "./types";
import {
  computeDuration,
  computeOvertime,
  hoursToTimeValue,
  pad,
  round1,
} from "./time";
import { deriveMajorSub, summarizeTaskItem } from "./aggregate";
import {
  MONTHLY_SUMMARY_ROWS,
  STAGE_TO_SUMMARY_ROW,
  WEEKDAYS_KO,
} from "./constants";

type Cell = string | number | null;

/** 엑셀 시간 서식 — 24시간을 넘겨도 누적 표시 */
const HOUR_FMT = "[h]:mm";

const CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};

const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF9C9C9C" } };
const THICK: ExcelJS.Border = { style: "medium", color: { argb: "FF000000" } };

/**
 * 표 영역에 기본 테두리를 두르고, 지정한 경계만 굵게 그린다.
 * thickRightCols: 그 열의 오른쪽 경계를 굵게 / thickBottomRows: 그 행의 아래 경계를 굵게
 */
function applyBorders(
  ws: ExcelJS.Worksheet,
  opts: {
    rows: Iterable<number>;
    lastCol: number;
    thickRightCols?: Set<number>;
    thickBottomRows?: Set<number>;
  }
) {
  const thickRight = opts.thickRightCols ?? new Set<number>();
  const thickBottom = opts.thickBottomRows ?? new Set<number>();
  for (const r of opts.rows) {
    for (let c = 1; c <= opts.lastCol; c++) {
      ws.getCell(r, c).border = {
        top: thickBottom.has(r - 1) ? THICK : THIN,
        bottom: thickBottom.has(r) ? THICK : THIN,
        left: thickRight.has(c - 1) ? THICK : THIN,
        right: thickRight.has(c) ? THICK : THIN,
      };
    }
  }
}

/** 시트 전체를 가운데정렬 + 자동줄바꿈 */
function centerAll(ws: ExcelJS.Worksheet) {
  ws.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { ...CENTER };
    });
  });
}

/** 제목 행·열을 굵은 글씨 + 회색 배경으로 */
function markHeaderCells(
  ws: ExcelJS.Worksheet,
  cells: { row: number; col: number }[]
) {
  cells.forEach(({ row, col }) => {
    const cell = ws.getCell(row, col);
    cell.font = { ...cell.font, bold: true };
    cell.fill = HEADER_FILL;
  });
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 해당 날짜가 속한 주의 월요일 (YYYY-MM-DD) */
function weekStartKey(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** 작업내용 표기: 업체명_세부(카테고리)_작업항목 */
function workLabel(e: WorkEntry, data: JobsheetSeed) {
  const { sub } = deriveMajorSub(
    e.project,
    e.company,
    data.companyCat,
    data.projectTypesByMajor
  );
  const task = summarizeTaskItem(
    e.note,
    e.company,
    e.owner || "",
    e.project,
    data.taskItemOverrides
  );
  return [e.company, sub, task].filter(Boolean).join("_");
}

type DayColumn = {
  /** [시간대, 작업내용] 쌍 — 그 날 작업 건수만큼 */
  rows: [string | null, string | null][];
  /** 요약행 → 작업내용 → 시간 */
  stageTotals: Record<string, Record<string, number>>;
  total: number;
};

export async function exportMonthlyExcel(opts: {
  owner: string;
  year: number;
  month: number;
  data: JobsheetSeed;
}) {
  const { owner, year, month, data } = opts;
  const { entries, leaveData, holidays, publicDutyData } = data;

  const monthPrefix = `${year}-${pad(month)}`;
  const dayEntries: Record<string, WorkEntry[]> = {};
  entries.forEach((e) => {
    if ((e.owner || "") !== owner) return;
    if (!e.date.startsWith(monthPrefix)) return;
    if (!dayEntries[e.date]) dayEntries[e.date] = [];
    dayEntries[e.date].push(e);
  });
  Object.values(dayEntries).forEach((list) =>
    list.sort((a, b) => a.start.localeCompare(b.start))
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const allDates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    if (dow === 0 || dow === 6) {
      if (!dayEntries[dateStr]?.length) continue;
    }
    allDates.push(dateStr);
  }

  // 실제 달력 주(월~일) 기준으로 묶는다
  const weeks: string[][] = [];
  let currentKey: string | null = null;
  allDates.forEach((dateStr) => {
    const key = weekStartKey(dateStr);
    if (key !== currentKey) {
      currentKey = key;
      weeks.push([]);
    }
    weeks[weeks.length - 1].push(dateStr);
  });

  // 날짜당 2열. total 열은 모든 주에서 같은 자리에 오도록 최대 일수 기준으로 고정한다.
  const maxDays = Math.max(1, ...weeks.map((w) => w.length));
  const TOTAL_COL = 2 + maxDays * 2;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${month}월`);
  const hourCells: { row: number; col: number }[] = [];
  const headerCells: { row: number; col: number }[] = [];

  /** 테두리를 두를 표 본문 행 (제목·구분용 빈 행 제외) */
  const bodyRows = new Set<number>();
  const headerRowIndexes = new Set<number>();
  const addRow = (values: Cell[], body = true) => {
    const n = ws.addRow(values).number;
    if (body) bodyRows.add(n);
    return n;
  };
  const markRow = (row: number, cols: number) => {
    for (let c = 1; c <= cols; c++) headerCells.push({ row, col: c });
  };

  let monthOt = 0;

  const titleRow = addRow([`${year}년 ${month}월 업무일지`], false);
  ws.getCell(titleRow, TOTAL_COL).value = `${owner}.RGBcom`;
  ws.getCell(titleRow, 1).font = { bold: true, size: 14 };
  ws.mergeCells(titleRow, 1, titleRow, TOTAL_COL - 1);
  addRow([], false);

  weeks.forEach((week) => {
    const headerRow: Cell[] = ["업체 및 진행상황"];
    week.forEach((dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dow = WEEKDAYS_KO[new Date(y, m - 1, d).getDay()];
      headerRow.push(`${m}월 ${d}일 ${dow}요일`, null);
    });
    while (headerRow.length < TOTAL_COL - 1) headerRow.push(null);
    headerRow.push("total");
    const hdrIdx = addRow(headerRow);
    headerRowIndexes.add(hdrIdx);
    markRow(hdrIdx, TOTAL_COL);
    ws.getRow(hdrIdx).height = 22;
    week.forEach((_, i) => ws.mergeCells(hdrIdx, 2 + i * 2, hdrIdx, 3 + i * 2));

    const perDay: DayColumn[] = week.map((dateStr) => {
      const es = dayEntries[dateStr] || [];
      const leaveType = leaveData[`${owner}|||${dateStr}`] || "";
      const holidayName = holidays[dateStr];
      const publicDuty = publicDutyData[`${owner}|||${dateStr}`] || "";
      // 공휴일·휴가 이름을 첫 줄에 두고, 근무 기록이 있으면 그 아래로 이어붙인다
      const rows: [string | null, string | null][] = [];
      if (holidayName) rows.push([holidayName, null]);
      else if (leaveType) rows.push([leaveType, null]);
      if (publicDuty) rows.push([publicDuty, null]);
      es.forEach((e) =>
        rows.push([`${e.start} ~ ${e.end}`, workLabel(e, data)])
      );
      const stageTotals: Record<string, Record<string, number>> = {};
      let total = 0;
      es.forEach((e) => {
        const dur = computeDuration(e.start, e.end, leaveType);
        const summary = STAGE_TO_SUMMARY_ROW[e.stage] || "본작업";
        const label = workLabel(e, data);
        if (!stageTotals[summary]) stageTotals[summary] = {};
        stageTotals[summary][label] = (stageTotals[summary][label] || 0) + dur;
        total += dur;
      });
      return { rows, stageTotals, total };
    });

    /** 라벨은 블록 첫 행에만 두고 A열을 세로 병합한다 */
    const pushBlock = (
      label: string,
      lineCount: number,
      fill: (
        row: Cell[],
        dayIdx: number,
        line: number,
        hourCols: number[]
      ) => void
    ) => {
      let blockStart = 0;
      for (let line = 0; line < lineCount; line++) {
        const row: Cell[] = [line === 0 ? label : null];
        const hourCols: number[] = [];
        perDay.forEach((_, dayIdx) => fill(row, dayIdx, line, hourCols));
        const idx = addRow(row);
        hourCols.forEach((col) => hourCells.push({ row: idx, col }));
        if (line === 0) blockStart = idx;
        headerCells.push({ row: idx, col: 1 });
      }
      if (lineCount > 1) {
        ws.mergeCells(blockStart, 1, blockStart + lineCount - 1, 1);
      }
    };

    pushBlock(
      "작업내용",
      Math.max(1, ...perDay.map((d) => d.rows.length)),
      (row, dayIdx, line) => {
        const cell = perDay[dayIdx].rows[line] || [null, null];
        row.push(cell[0], cell[1]);
      }
    );

    MONTHLY_SUMMARY_ROWS.forEach((stageName) => {
      const perDayStage = perDay.map((d) =>
        Object.entries(d.stageTotals[stageName] || {})
      );
      pushBlock(
        stageName,
        Math.max(1, ...perDayStage.map((x) => x.length)),
        (row, dayIdx, line, hourCols) => {
          const item = perDayStage[dayIdx][line];
          if (!item) {
            row.push(null, null);
            return;
          }
          hourCols.push(2 + dayIdx * 2);
          row.push(hoursToTimeValue(item[1]), item[0]);
        }
      );
    });

    const totalRow: Cell[] = ["총계"];
    perDay.forEach((day) => totalRow.push(hoursToTimeValue(day.total), null));
    const totalIdx = addRow(totalRow);
    perDay.forEach((_, dayIdx) =>
      hourCells.push({ row: totalIdx, col: 2 + dayIdx * 2 })
    );
    headerCells.push({ row: totalIdx, col: 1 });

    const otRow: Cell[] = ["연장근로"];
    let weekOt = 0;
    week.forEach((dateStr) => {
      let ot = 0;
      (dayEntries[dateStr] || []).forEach((e) => {
        ot += computeOvertime(e.start, e.end, dateStr);
      });
      otRow.push(hoursToTimeValue(ot), null);
      weekOt += ot;
    });
    while (otRow.length < TOTAL_COL - 1) otRow.push(null);
    otRow.push(hoursToTimeValue(weekOt));
    const otIdx = addRow(otRow);
    week.forEach((_, dayIdx) =>
      hourCells.push({ row: otIdx, col: 2 + dayIdx * 2 })
    );
    hourCells.push({ row: otIdx, col: TOTAL_COL });
    headerCells.push({ row: otIdx, col: 1 });
    monthOt += weekOt;
    addRow([], false);
  });

  const monthRow: Cell[] = ["이번달 연장근로 합계"];
  while (monthRow.length < TOTAL_COL - 1) monthRow.push(null);
  monthRow.push(hoursToTimeValue(monthOt));
  const monthIdx = addRow(monthRow);
  hourCells.push({ row: monthIdx, col: TOTAL_COL });
  headerCells.push({ row: monthIdx, col: 1 });
  ws.mergeCells(monthIdx, 1, monthIdx, 2);

  for (let c = 1; c <= TOTAL_COL; c++) {
    if (c === 1) ws.getColumn(c).width = 16;
    else if (c === TOTAL_COL) ws.getColumn(c).width = 12;
    else ws.getColumn(c).width = c % 2 === 0 ? 13 : 26;
  }
  hourCells.forEach(({ row, col }) => {
    ws.getCell(row, col).numFmt = HOUR_FMT;
  });
  centerAll(ws);
  // 항목 열 / 날짜 세트 사이 / total 열 경계를 굵게
  const thickRightCols = new Set<number>([1, TOTAL_COL]);
  for (let i = 0; i < maxDays; i++) thickRightCols.add(3 + i * 2);
  applyBorders(ws, {
    rows: bodyRows,
    lastCol: TOTAL_COL,
    thickRightCols,
    thickBottomRows: headerRowIndexes,
  });
  markHeaderCells(ws, headerCells);

  await downloadWorkbook(wb, `${owner}_${year}년_${month}월_업무일지.xlsx`);
}

export type ProjectExportItem = {
  task: string;
  role: string | null;
  stages: Record<string, number>;
  total: number;
};

export type ProjectExportRow = {
  category: string;
  company: string;
  major: string;
  sub: string;
  estimate: number | null;
  estimateScope: "개인" | "전체" | null;
  stages: Record<string, number>;
  status: string;
  total: number;
  finishMonth: string;
  items: ProjectExportItem[];
};

/** 전체 프로젝트 화면과 동일한 구조 — 카테고리 그룹 → 작업항목 행 → 프로젝트 소계 */
export async function exportAllTimeProjectsExcel(
  owner: string,
  statusFilter: string,
  monthFilter: string,
  rows: ProjectExportRow[],
  grandTotal: number
) {
  const header = [
    "업체명",
    "대분류",
    "세부",
    "작업항목",
    "구분",
    "견적(만원)",
    "견적기준",
    "시안(h)",
    "본작업(h)",
    "수정중(h)",
    "제작중(h)",
    "진행상태",
    "합계시간(h)",
    "프로젝트 총계(h)",
    "완료월",
  ];
  const TOTAL_COL = 14;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("전체 프로젝트");
  const headerCells: { row: number; col: number }[] = [];
  const bodyRows = new Set<number>();

  const titleIdx = ws.addRow([
    `${owner}님의 전체 프로젝트`,
    `진행상태: ${statusFilter}`,
    `완료월: ${monthFilter}`,
  ]).number;
  ws.getCell(titleIdx, 1).font = { bold: true, size: 14 };
  ws.addRow([]);
  const headerIdx = ws.addRow(header).number;
  bodyRows.add(headerIdx);
  for (let c = 1; c <= header.length; c++) {
    headerCells.push({ row: headerIdx, col: c });
  }
  ws.getRow(headerIdx).height = 22;

  let lastCategory: string | null = null;
  rows.forEach((r) => {
    if (r.category !== lastCategory) {
      lastCategory = r.category;
      const catIdx = ws.addRow([r.category]).number;
      bodyRows.add(catIdx);
      ws.mergeCells(catIdx, 1, catIdx, header.length);
      headerCells.push({ row: catIdx, col: 1 });
    }
    r.items.forEach((it, idx) => {
      const first = idx === 0;
      const row = ws.addRow([
        first ? r.company : null,
        first ? r.major : null,
        first ? r.sub : null,
        it.task,
        it.role,
        first ? r.estimate : null,
        first ? r.estimateScope : null,
        it.stages["시안"] || null,
        it.stages["본작업"] || null,
        it.stages["수정중"] || null,
        it.stages["제작중"] || null,
        first ? r.status : null,
        it.total || null,
        r.items.length === 1 ? r.total : null,
        first ? r.finishMonth : null,
      ]);
      bodyRows.add(row.number);
      if (first) headerCells.push({ row: row.number, col: 1 });
    });
    if (r.items.length > 1) {
      const sub = ws.addRow([
        null,
        null,
        null,
        "합계",
        null,
        null,
        null,
        r.stages["시안"] || null,
        r.stages["본작업"] || null,
        r.stages["수정중"] || null,
        r.stages["제작중"] || null,
        null,
        r.total,
        r.total,
        null,
      ]);
      bodyRows.add(sub.number);
      headerCells.push({ row: sub.number, col: 4 });
    }
  });

  const totalValues: Cell[] = Array(header.length).fill(null);
  totalValues[0] = "총계";
  totalValues[TOTAL_COL - 1] = grandTotal;
  const totalIdx = ws.addRow(totalValues).number;
  bodyRows.add(totalIdx);
  for (let c = 1; c <= header.length; c++) {
    headerCells.push({ row: totalIdx, col: c });
  }

  const widths = [20, 9, 14, 28, 8, 12, 10, 10, 11, 11, 11, 10, 13, 15, 13];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  centerAll(ws);
  // 프로젝트 정보 / 시간 / 집계 구역 경계를 굵게
  applyBorders(ws, {
    rows: bodyRows,
    lastCol: header.length,
    thickRightCols: new Set([1, 7, 11, header.length]),
    thickBottomRows: new Set([headerIdx]),
  });
  markHeaderCells(ws, headerCells);

  await downloadWorkbook(wb, `${owner}_전체프로젝트_${statusFilter}.xlsx`);
}

/** 팀 KPI: 한 시트에 월별 가로 집계 (항목/세부/견적/작업자 + 월 컬럼) */
export async function exportTeamKpiExcel(opts: {
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
  const multiYear = startMonth.slice(0, 4) !== endMonth.slice(0, 4);
  const monthLabels = months.map((ym) => {
    const y = ym.slice(2, 4);
    const m = Number(ym.slice(5, 7));
    return multiYear ? `${y}년${m}월` : `${m}월`;
  });
  const header = [
    "항목",
    "세부항목",
    "견적(만원)",
    "진행상태",
    "작업자",
    ...monthLabels,
    "총계(시간)",
    "총계(영업일)",
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("팀KPI");
  const headerCells: { row: number; col: number }[] = [];
  const bodyRows = new Set<number>();

  const titleIdx = ws.addRow([
    `전체 직원 KPI · ${tabLabel} · ${startMonth} ~ ${endMonth}`,
  ]).number;
  ws.getCell(titleIdx, 1).font = { bold: true, size: 14 };
  ws.mergeCells(titleIdx, 1, titleIdx, header.length);
  ws.addRow([]);
  const headerIdx = ws.addRow(header).number;
  bodyRows.add(headerIdx);
  for (let c = 1; c <= header.length; c++) {
    headerCells.push({ row: headerIdx, col: c });
  }
  ws.getRow(headerIdx).height = 22;

  const blockEndRows = new Set<number>();
  projects.forEach((p) => {
    const workers = p.workers.length
      ? p.workers
      : [{ name: "-", byMonth: {} as Record<string, number>, total: 0 }];
    let blockStart = 0;

    workers.forEach((w, wi) => {
      const row = ws.addRow([
        wi === 0 ? p.company : null,
        wi === 0 ? p.project : null,
        wi === 0 ? p.estimate : null,
        wi === 0 ? p.status : null,
        w.name,
        ...months.map((m) => (w.byMonth[m] > 0 ? round1(w.byMonth[m]) : null)),
        w.total > 0 ? round1(w.total) : null,
        w.total > 0 ? round1(w.total / 8) : null,
      ]);
      bodyRows.add(row.number);
      if (wi === 0) blockStart = row.number;
    });

    const sumByMonth: Record<string, number> = {};
    let sumTotal = 0;
    workers.forEach((w) => {
      months.forEach((m) => {
        sumByMonth[m] = (sumByMonth[m] || 0) + (w.byMonth[m] || 0);
      });
      sumTotal += w.total;
    });
    const sumRow = ws.addRow([
      null,
      null,
      null,
      null,
      "합계",
      ...months.map((m) => (sumByMonth[m] > 0 ? round1(sumByMonth[m]) : null)),
      sumTotal > 0 ? round1(sumTotal) : null,
      sumTotal > 0 ? round1(sumTotal / 8) : null,
    ]);
    bodyRows.add(sumRow.number);
    blockEndRows.add(sumRow.number);
    headerCells.push({ row: sumRow.number, col: 5 });

    // 합계 행까지 포함해 한 프로젝트 블록으로 병합
    const mergeEnd = sumRow.number;
    if (mergeEnd > blockStart) {
      for (let c = 1; c <= 4; c++) ws.mergeCells(blockStart, c, mergeEnd, c);
    }
    for (let c = 1; c <= 4; c++) headerCells.push({ row: blockStart, col: c });
  });

  for (let c = 1; c <= header.length; c++) {
    ws.getColumn(c).width = c === 1 ? 20 : c <= 5 ? 13 : 11;
  }
  centerAll(ws);
  // 프로젝트 정보 / 월별 / 총계 구역 경계와 프로젝트 블록 사이를 굵게
  blockEndRows.add(headerIdx);
  applyBorders(ws, {
    rows: bodyRows,
    lastCol: header.length,
    thickRightCols: new Set([4, 5, 5 + months.length, header.length]),
    thickBottomRows: blockEndRows,
  });
  markHeaderCells(ws, headerCells);

  await downloadWorkbook(wb, `팀KPI_${startMonth}_${endMonth}_${tabLabel}.xlsx`);
}
