"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkEntry } from "@/lib/types";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  DEFAULT_PROJECT_TYPES_BY_MAJOR,
  LEAVE_TYPES,
  MAJORS,
  STAGE_BADGE_TEXT,
  STAGES,
  WEEKDAYS_KO,
} from "@/lib/constants";
import { computeDuration, computeOvertime, round1 } from "@/lib/time";
import { summarizeNoteForCell } from "@/lib/aggregate";
import {
  clampEntryToLeaveBounds,
  clampTimeToLeaveBounds,
  computeDayTotalHours,
  findInvertedTimeEntry,
  findOverlappingEntries,
  formatDaySaveOkMessage,
  formatDayValidationError,
  getLeaveTimeBounds,
  getLeaveWorkWindowLabel,
} from "@/lib/dayValidation";
import { stageRuleWarning } from "@/lib/stageRules";
import { CompanyAutocomplete } from "./CompanyAutocomplete";

type Props = {
  owner: string;
  date: string;
  open: boolean;
  onClose: () => void;
};

export function DayModal({ owner, date, open, onClose }: Props) {
  const {
    data,
    getLeave,
    setLeave,
    getStatus,
    setStatus,
    saveDayEntries,
  } = useJobsheet();

  const initial = useMemo(() => {
    const existing = data.entries.filter(
      (e) => e.date === date && (e.owner || "") === owner
    );
    if (existing.length) return existing.map((e) => ({ ...e }));
    return [
      {
        date,
        owner,
        start: "09:00",
        end: "12:00",
        company: "",
        project: "",
        note: "",
        stage: "본작업",
        major: "디자인",
      },
      {
        date,
        owner,
        start: "13:00",
        end: "18:00",
        company: "",
        project: "",
        note: "",
        stage: "본작업",
        major: "디자인",
      },
    ] as WorkEntry[];
  }, [data.entries, date, owner, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState<WorkEntry[]>(initial);
  const [leaveOpen, setLeaveOpen] = useState(!!getLeave(owner, date));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveMsgKind, setSaveMsgKind] = useState<"ok" | "warn" | "error">("ok");

  useEffect(() => {
    if (!open) return;
    const leave = getLeave(owner, date);
    setLeaveOpen(!!leave);
    if (leave === "연차") {
      setRows([]);
      return;
    }
    if (!leave) {
      setRows(initial);
      return;
    }
    const bounds = getLeaveTimeBounds(leave);
    const next = initial
      .map((e) => clampEntryToLeaveBounds(e, bounds))
      .filter((e): e is WorkEntry => !!e);
    if (next.length) {
      setRows(next);
      return;
    }
    // 허용 시간대에 남는 블록이 없으면 휴가 기본 시간대로 채움
    if (leave === "오전반차") {
      setRows([
        {
          date,
          owner,
          start: "14:00",
          end: "18:00",
          company: "",
          project: "",
          note: "",
          stage: "본작업",
          major: "디자인",
        },
      ]);
    } else if (leave === "오후반차") {
      setRows([
        {
          date,
          owner,
          start: "09:00",
          end: "14:00",
          company: "",
          project: "",
          note: "",
          stage: "본작업",
          major: "디자인",
        },
      ]);
    } else if (leave === "오전반반차") {
      setRows([
        {
          date,
          owner,
          start: "11:00",
          end: "12:00",
          company: "",
          project: "",
          note: "",
          stage: "본작업",
          major: "디자인",
        },
        {
          date,
          owner,
          start: "13:00",
          end: "18:00",
          company: "",
          project: "",
          note: "",
          stage: "본작업",
          major: "디자인",
        },
      ]);
    } else if (leave === "오후반반차") {
      setRows([
        {
          date,
          owner,
          start: "09:00",
          end: "12:00",
          company: "",
          project: "",
          note: "",
          stage: "본작업",
          major: "디자인",
        },
        {
          date,
          owner,
          start: "13:00",
          end: "16:00",
          company: "",
          project: "",
          note: "",
          stage: "본작업",
          major: "디자인",
        },
      ]);
    }
  }, [open, initial, getLeave, owner, date]);

  const companyNames = useMemo(() => {
    const names = new Set(data.companyMaster.filter(Boolean));
    data.entries.forEach((e) => {
      if (e.company) names.add(e.company);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [data.companyMaster, data.entries]);

  if (!open) return null;

  const dt = new Date(date);
  const title = `${dt.getMonth() + 1}월 ${dt.getDate()}일 ${WEEKDAYS_KO[dt.getDay()]}요일`;
  const leaveType = getLeave(owner, date);

  const defaultDayRows = (): WorkEntry[] => [
    {
      date,
      owner,
      start: "09:00",
      end: "12:00",
      company: "",
      project: "",
      note: "",
      stage: "본작업",
      major: "디자인",
    },
    {
      date,
      owner,
      start: "13:00",
      end: "18:00",
      company: "",
      project: "",
      note: "",
      stage: "본작업",
      major: "디자인",
    },
  ];

  const updateRow = (i: number, patch: Partial<WorkEntry>) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const bounds = getLeaveTimeBounds(getLeave(owner, date));
        const next = { ...r, ...patch };
        next.start = clampTimeToLeaveBounds(next.start, bounds);
        next.end = clampTimeToLeaveBounds(next.end, bounds);
        if (next.end <= next.start) {
          // 종료가 시작보다 빠르면 허용 구간 끝으로 맞춤
          if (bounds.maxEnd) next.end = bounds.maxEnd;
          if (next.end <= next.start && bounds.minStart) {
            next.start = bounds.minStart;
          }
        }
        return next;
      })
    );
  };

  const showMsg = (
    text: string,
    kind: "ok" | "warn" | "error",
    ms = 3500
  ) => {
    setSaveMsg(text);
    setSaveMsgKind(kind);
    setTimeout(() => setSaveMsg(""), ms);
  };

  const validateRows = (mode: "save" | "close") => {
    const inverted = findInvertedTimeEntry(rows);
    const overlap = findOverlappingEntries(rows);
    const err = formatDayValidationError(inverted, overlap, mode);
    if (err) {
      showMsg(err, "error");
      return false;
    }
    return true;
  };

  const clearLeave = () => {
    setLeave(owner, date, "");
    setRows((prev) => (prev.length ? prev : defaultDayRows()));
  };

  const applyLeaveType = (type: string) => {
    // 같은 유형을 다시 누르면 휴가 해제
    if (type && type === leaveType) {
      clearLeave();
      return;
    }
    setLeave(owner, date, type);
    if (!type) {
      setRows((prev) => (prev.length ? prev : defaultDayRows()));
      return;
    }
    applyLeaveDefaults(type);
  };

  const applyLeaveDefaults = (type: string) => {
    if (type === "연차") {
      setRows([]);
      return;
    }
    const bounds = getLeaveTimeBounds(type);
    if (type === "오전반차") {
      setRows((prev) => {
        let next = prev
          .map((e) => clampEntryToLeaveBounds(e, bounds))
          .filter((e): e is WorkEntry => !!e);
        if (!next.length) {
          next = [
            {
              date,
              owner,
              start: "14:00",
              end: "18:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
          ];
        }
        return next;
      });
    } else if (type === "오후반차") {
      setRows((prev) => {
        let next = prev
          .map((e) => clampEntryToLeaveBounds(e, bounds))
          .filter((e): e is WorkEntry => !!e);
        if (!next.length) {
          next = [
            {
              date,
              owner,
              start: "09:00",
              end: "14:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
          ];
        }
        return next;
      });
    } else if (type === "오전반반차") {
      setRows((prev) => {
        let next = prev
          .map((e) => clampEntryToLeaveBounds(e, bounds))
          .filter((e): e is WorkEntry => !!e);
        if (!next.length) {
          next = [
            {
              date,
              owner,
              start: "11:00",
              end: "12:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
            {
              date,
              owner,
              start: "13:00",
              end: "18:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
          ];
        } else if (
          next.length === 1 &&
          next[0].start === "11:00" &&
          next[0].end === "18:00"
        ) {
          next = [
            { ...next[0], end: "12:00" },
            {
              date,
              owner,
              start: "13:00",
              end: "18:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
          ];
        }
        return next;
      });
    } else if (type === "오후반반차") {
      setRows((prev) => {
        let next = prev
          .map((e) => clampEntryToLeaveBounds(e, bounds))
          .filter((e): e is WorkEntry => !!e);
        if (!next.length) {
          next = [
            {
              date,
              owner,
              start: "09:00",
              end: "12:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
            {
              date,
              owner,
              start: "13:00",
              end: "16:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
          ];
        } else if (
          next.length === 1 &&
          next[0].start === "09:00" &&
          next[0].end === "16:00"
        ) {
          next = [
            { ...next[0], end: "12:00" },
            {
              date,
              owner,
              start: "13:00",
              end: "16:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
              major: "디자인",
            },
          ];
        }
        return next;
      });
    }
  };

  const leaveBounds = getLeaveTimeBounds(leaveType);
  const leaveWindowLabel = getLeaveWorkWindowLabel(leaveType);

  const hoursOptionsAll = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0")
  );
  const minOptionsAll = ["00", "10", "20", "30", "40", "50"];

  const TimeSelect = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => {
    const [h, m] = value.split(":");
    const minT = leaveBounds.minStart;
    const maxT = leaveBounds.maxEnd;
    const minH = minT ? Number(minT.slice(0, 2)) : 0;
    const maxH = maxT ? Number(maxT.slice(0, 2)) : 23;
    const minM = minT ? Number(minT.slice(3, 5)) : 0;
    const maxM = maxT ? Number(maxT.slice(3, 5)) : 50;

    const hoursOptions = hoursOptionsAll.filter((x) => {
      const n = Number(x);
      return n >= minH && n <= maxH;
    });

    const minOptions = minOptionsAll.filter((x) => {
      const n = Number(x);
      const hour = Number(h);
      if (hour === minH && n < minM) return false;
      if (hour === maxH && n > maxM) return false;
      return true;
    });

    return (
      <>
        <select
          className="time-h"
          value={h}
          onChange={(e) => {
            const nh = e.target.value;
            let nm = m;
            const hour = Number(nh);
            if (hour === minH && Number(nm) < minM) nm = String(minM).padStart(2, "0");
            if (hour === maxH && Number(nm) > maxM) nm = String(maxM).padStart(2, "0");
            onChange(`${nh}:${nm}`);
          }}
        >
          {hoursOptions.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span className="colon">:</span>
        <select
          className="time-m"
          value={minOptions.includes(m) ? m : minOptions[0] || m}
          onChange={(e) => onChange(`${h}:${e.target.value}`)}
        >
          {minOptions.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </>
    );
  };

  const handleSave = async () => {
    const toSave = leaveType === "연차" ? [] : rows;
    if (leaveType !== "연차" && !validateRows("save")) return;
    setSaving(true);
    await saveDayEntries(owner, date, toSave);
    const dayTotal = computeDayTotalHours(toSave, leaveType);
    const ok = formatDaySaveOkMessage(dayTotal);
    setSaveMsg(ok.text);
    setSaveMsgKind(ok.kind);
    setTimeout(() => {
      setSaveMsg("");
      setSaving(false);
      onClose();
    }, ok.delay);
  };

  const tryClose = () => {
    if (leaveType === "연차") {
      onClose();
      return;
    }
    if (!validateRows("close")) return;
    onClose();
  };

  const addTimeBlock = () => {
    if (leaveType === "연차") {
      alert(
        "연차로 처리된 날에는 시간대를 추가할 수 없습니다. 먼저 상단의 휴가 처리를 해제해주세요."
      );
      return;
    }
    let start = "09:00";
    let end = "12:00";
    if (leaveType === "오전반차") {
      start = "14:00";
      end = "18:00";
    } else if (leaveType === "오후반차") {
      start = "09:00";
      end = "14:00";
    } else if (leaveType === "오전반반차") {
      const hasFirst = rows.some((e) => e.start === "11:00");
      if (hasFirst) {
        start = "13:00";
        end = "18:00";
      } else {
        start = "11:00";
        end = "12:00";
      }
    } else if (leaveType === "오후반반차") {
      const hasFirst = rows.some((e) => e.start === "09:00");
      if (hasFirst) {
        start = "13:00";
        end = "16:00";
      } else {
        start = "09:00";
        end = "12:00";
      }
    }
    setRows((prev) => [
      ...prev,
      {
        date,
        owner,
        start,
        end,
        company: "",
        project: "",
        note: "",
        stage: "본작업",
        major: "디자인",
      },
    ]);
  };

  const projectTypes =
    Object.keys(data.projectTypesByMajor || {}).length > 0
      ? data.projectTypesByMajor
      : DEFAULT_PROJECT_TYPES_BY_MAJOR;

  const normalizeMajor = (major?: string) => {
    if (major === "영상") return "동영상";
    if (major === "동영상" || major === "디자인") return major;
    return "";
  };

  const resolveMajor = (entry: WorkEntry) => {
    const fromEntry = normalizeMajor(entry.major);
    if (fromEntry) return fromEntry;
    for (const mj of MAJORS) {
      if ((projectTypes[mj] || []).includes(entry.project)) return mj;
    }
    const fromCompany = normalizeMajor(
      data.companyCat[entry.company]?.major
    );
    return fromCompany || "디자인";
  };

  const projectsForMajor = (major: string) => {
    const fromData = projectTypes[major] || [];
    const fromDefault = DEFAULT_PROJECT_TYPES_BY_MAJOR[major] || [];
    return Array.from(new Set([...fromData, ...fromDefault]));
  };

  const applyCompanyPick = (i: number, company: string) => {
    const info = data.companyCat[company.trim()];
    if (info) {
      const nextMajor = normalizeMajor(info.major) || "디자인";
      const list = projectsForMajor(nextMajor);
      const project = info.cat && list.includes(info.cat) ? info.cat : "";
      updateRow(i, { company, major: nextMajor, project });
    } else {
      updateRow(i, { company });
    }
  };

  return (
    <div className="overlay open" onClick={tryClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={tryClose}>
            &times;
          </button>
        </div>
        <p className="modal-sub">{owner} · 업무 기록</p>

        <div className="leave-box">
          <button
            type="button"
            className={"leave-toggle-btn" + (leaveType ? " active" : "")}
            onClick={() => setLeaveOpen((v) => !v)}
          >
            {leaveType
              ? `휴가 처리됨: ${leaveType}`
              : "오늘 연차/반차 처리"}
          </button>
          {leaveType && (
            <button
              type="button"
              className="leave-clear-btn"
              onClick={clearLeave}
            >
              휴가 해제
            </button>
          )}
          {leaveOpen && (
            <div className="leave-panel" style={{ display: "flex" }}>
              <span className="leave-panel-label">휴가</span>
              <div className="leave-type-chips">
                {LEAVE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={
                      "leave-type-chip" + (leaveType === t ? " active" : "")
                    }
                    onClick={() => applyLeaveType(t)}
                    title={
                      leaveType === t
                        ? "다시 누르면 휴가 해제"
                        : `${t} 적용`
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="leave-panel-note">
                같은 휴가 유형을 다시 누르거나 &apos;휴가 해제&apos;로 삭제할 수
                있습니다. 연차/반차는 근무시간 합계에서 제외됩니다.
              </span>
              {leaveWindowLabel && (
                <span className="leave-panel-note leave-window-note">
                  {leaveWindowLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <div id="modalEntries">
          {leaveType === "연차" ? (
            <div className="leave-day-blocked">
              연차로 처리된 날입니다. 업무 시간을 추가할 수 없습니다.
              <br />
              업무를 입력하려면 상단에서 휴가를 해제해주세요.
            </div>
          ) : (
            rows.map((e, i) => {
            const leave = leaveType;
            const dur = computeDuration(e.start, e.end, leave);
            const ot = computeOvertime(e.start, e.end);
            const major = resolveMajor(e);
            const projectOptions = projectsForMajor(major);
            const done =
              e.company && e.project
                ? getStatus(e.company, e.project) === "완료"
                : false;
            const warn = stageRuleWarning(
              owner,
              e.note,
              e.stage,
              data.employees
            );
            return (
              <div
                key={i}
                className={"modal-entry" + (ot > 0 ? " overtime" : "")}
              >
                <div className="me-row1">
                  <TimeSelect
                    value={e.start}
                    onChange={(v) => updateRow(i, { start: v })}
                  />
                  <span className="colon">~</span>
                  <TimeSelect
                    value={e.end}
                    onChange={(v) => updateRow(i, { end: v })}
                  />
                  <span className={"dur" + (ot > 0 ? " ot" : "")}>
                    {round1(dur)}h{ot > 0 ? ` · OT ${round1(ot)}h` : ""}
                  </span>
                  <button
                    type="button"
                    className="del"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    &times;
                  </button>
                </div>
                <div className="me-row2">
                  <CompanyAutocomplete
                    value={e.company}
                    companyNames={companyNames}
                    onChange={(company) => applyCompanyPick(i, company)}
                    onPick={(company) => applyCompanyPick(i, company)}
                  />
                  <select
                    className="major-select"
                    value={major}
                    onChange={(ev) =>
                      updateRow(i, {
                        major: ev.target.value,
                        project: "",
                      })
                    }
                  >
                    {MAJORS.map((mj) => (
                      <option key={mj} value={mj}>
                        {mj}
                      </option>
                    ))}
                  </select>
                  <select
                    className="project-select"
                    value={
                      projectOptions.includes(e.project) ? e.project : ""
                    }
                    onChange={(ev) =>
                      updateRow(i, { project: ev.target.value })
                    }
                  >
                    <option value="" disabled>
                      세부항목 선택
                    </option>
                    {projectOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="me-row2b">
                  <input
                    placeholder="작업항목 (예: 메인 배너 시안 작업)"
                    value={e.note}
                    onChange={(ev) => updateRow(i, { note: ev.target.value })}
                  />
                  {warn && <div className="stage-rule-warn">{warn}</div>}
                </div>
                <div className="me-row3">
                  <select
                    className="me-select"
                    value={e.stage}
                    onChange={(ev) => updateRow(i, { stage: ev.target.value })}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={"me-complete-btn" + (done ? " done" : "")}
                    disabled={!e.company || !e.project}
                    onClick={() =>
                      e.company &&
                      e.project &&
                      setStatus(e.company, e.project, done ? "진행중" : "완료")
                    }
                  >
                    {done ? "완료됨" : "완료 처리"}
                  </button>
                  {e.company && e.project && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {STAGE_BADGE_TEXT[e.stage] || e.stage} ·{" "}
                      {summarizeNoteForCell(e.note, e.company) || "내용 없음"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
          )}
        </div>

        {leaveType !== "연차" && (
          <button type="button" className="modal-add" onClick={addTimeBlock}>
            + 시간대 추가
          </button>
        )}

        <div className="modal-footer">
          <span
            className={
              "save-msg" +
              (saveMsg ? " show" : "") +
              (saveMsgKind === "error" ? " error" : "") +
              (saveMsgKind === "warn" ? " warn" : "")
            }
          >
            {saveMsg}
          </span>
          <button
            type="button"
            className="modal-save"
            disabled={saving}
            onClick={handleSave}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
