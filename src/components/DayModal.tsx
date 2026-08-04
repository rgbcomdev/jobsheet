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
    getPublicDuty,
    setPublicDuty,
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
  const [saveMsg, setSaveMsg] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(initial);
      setLeaveOpen(!!getLeave(owner, date));
    }
  }, [open, initial, getLeave, owner, date]);

  if (!open) return null;

  const dt = new Date(date);
  const title = `${dt.getMonth() + 1}월 ${dt.getDate()}일 ${WEEKDAYS_KO[dt.getDay()]}요일`;
  const leaveType = getLeave(owner, date);
  const publicDuty = getPublicDuty(owner, date);

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
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
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
    if (type === "오전반차") {
      setRows((prev) => {
        let next = prev
          .filter((e) => !(e.end <= "14:00"))
          .map((e) => (e.start < "14:00" ? { ...e, start: "14:00" } : e));
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
            },
          ];
        }
        return next;
      });
    } else if (type === "오후반차") {
      setRows((prev) => {
        let next = prev
          .filter((e) => !(e.start >= "13:00"))
          .map((e) => (e.end > "13:00" ? { ...e, end: "13:00" } : e));
        if (!next.length) {
          next = [
            {
              date,
              owner,
              start: "09:00",
              end: "13:00",
              company: "",
              project: "",
              note: "",
              stage: "본작업",
            },
          ];
        }
        return next;
      });
    } else if (type === "오전반반차") {
      setRows((prev) => {
        let next = prev
          .filter((e) => !(e.end <= "11:00"))
          .map((e) => (e.start < "11:00" ? { ...e, start: "11:00" } : e));
        if (!next.length) {
          // v17: 점심 제외 두 블록
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
            },
          ];
        }
        return next;
      });
    } else if (type === "오후반반차") {
      setRows((prev) => {
        let next = prev
          .filter((e) => !(e.start >= "16:00"))
          .map((e) => (e.end > "16:00" ? { ...e, end: "16:00" } : e));
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
            },
          ];
        }
        return next;
      });
    }
  };

  const hoursOptions = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, "0")
  );
  const minOptions = ["00", "10", "20", "30", "40", "50"];

  const TimeSelect = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => {
    const [h, m] = value.split(":");
    return (
      <>
        <select
          className="time-h"
          value={h}
          onChange={(e) => onChange(`${e.target.value}:${m}`)}
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
          value={m}
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
    setSaving(true);
    await saveDayEntries(owner, date, rows);
    setSaveMsg(true);
    setTimeout(() => {
      setSaveMsg(false);
      setSaving(false);
      onClose();
    }, 500);
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

  const projectsForMajor = (major: string) =>
    projectTypes[major] || DEFAULT_PROJECT_TYPES_BY_MAJOR[major] || [];

  return (
    <div className="overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={onClose}>
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
              <span className="leave-panel-label">공공업무</span>
              <select
                value={publicDuty}
                onChange={(e) => setPublicDuty(owner, date, e.target.value)}
              >
                <option value="">없음</option>
                <option value="공공업무">공공업무</option>
              </select>
              {publicDuty && (
                <button
                  type="button"
                  className="leave-clear-btn"
                  onClick={() => setPublicDuty(owner, date, "")}
                >
                  공공업무 해제
                </button>
              )}
              <span className="leave-panel-note">
                같은 휴가 유형을 다시 누르거나 &apos;휴가 해제&apos;로 삭제할 수
                있습니다. 연차/반차는 근무시간 합계에서 제외됩니다.
              </span>
            </div>
          )}
        </div>

        <div id="modalEntries">
          {rows.map((e, i) => {
            const leave = leaveType;
            const dur = computeDuration(e.start, e.end, leave);
            const ot = computeOvertime(e.start, e.end);
            const major = resolveMajor(e);
            const projectOptions = projectsForMajor(major);
            const done =
              e.company && e.project
                ? getStatus(e.company, e.project) === "완료"
                : false;
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
                  <input
                    className="company"
                    list="companyList"
                    placeholder="업체명"
                    value={e.company}
                    onChange={(ev) => {
                      const company = ev.target.value;
                      const info = data.companyCat[company.trim()];
                      if (info) {
                        const nextMajor =
                          normalizeMajor(info.major) || "디자인";
                        const list = projectsForMajor(nextMajor);
                        const project =
                          info.cat && list.includes(info.cat) ? info.cat : "";
                        updateRow(i, {
                          company,
                          major: nextMajor,
                          project,
                        });
                      } else {
                        updateRow(i, { company });
                      }
                    }}
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
          })}
        </div>

        <button
          type="button"
          className="modal-add"
          onClick={() =>
            setRows((prev) => [
              ...prev,
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
            ])
          }
        >
          + 시간대 추가
        </button>

        <div className="modal-footer">
          <span className={"save-msg" + (saveMsg ? " show" : "")}>
            저장되었습니다
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
      <datalist id="companyList">
        {data.companyMaster.filter(Boolean).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
