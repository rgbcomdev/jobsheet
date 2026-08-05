"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useJobsheet } from "@/context/JobsheetContext";
import { MAJORS, DEFAULT_PROJECT_TYPES_BY_MAJOR } from "@/lib/constants";
import { buildBackupPayload, downloadBackup, parseBackupFile } from "@/lib/backup";

const TEAM_ORDER = ["디자인", "영상"] as const;

export function AdminView() {
  const {
    loading,
    data,
    upsertEmployee,
    deleteEmployee,
    upsertCompany,
    reorderEmployees,
    replaceFromBackup,
  } = useJobsheet();

  const [showFormer, setShowFormer] = useState(false);
  const [regName, setRegName] = useState("");
  const [regTeam, setRegTeam] = useState("디자인");
  const [editName, setEditName] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    team: "디자인",
    grade: "사원",
    isFormer: false,
  });
  const [dragName, setDragName] = useState<string | null>(null);
  const [dragTeam, setDragTeam] = useState<string | null>(null);
  const [dragOverName, setDragOverName] = useState<string | null>(null);

  const [regCompany, setRegCompany] = useState("");
  const [regMajor, setRegMajor] = useState("디자인");
  const [regProject, setRegProject] = useState("");
  const [regTask, setRegTask] = useState("");
  const [regStartMonth, setRegStartMonth] = useState("");

  const employeesByTeam = useMemo(() => {
    const out: Record<
      string,
      { name: string; team: string; grade: string; isFormer: boolean }[]
    > = {};
    for (const team of TEAM_ORDER) {
      const names = data.employees[team] || [];
      out[team] = names
        .filter((name) => {
          const isFormer = data.formerEmployees.includes(name);
          return showFormer || !isFormer;
        })
        .map((name) => ({
          name,
          team,
          grade: data.staffGrade[name] || "사원",
          isFormer: data.formerEmployees.includes(name),
        }));
    }
    // 기타 팀
    Object.entries(data.employees).forEach(([team, names]) => {
      if ((TEAM_ORDER as readonly string[]).includes(team)) return;
      out[team] = names
        .filter((name) => {
          const isFormer = data.formerEmployees.includes(name);
          return showFormer || !isFormer;
        })
        .map((name) => ({
          name,
          team,
          grade: data.staffGrade[name] || "사원",
          isFormer: data.formerEmployees.includes(name),
        }));
    });
    return out;
  }, [data.employees, data.staffGrade, data.formerEmployees, showFormer]);

  const employeeCount = useMemo(
    () => Object.values(employeesByTeam).reduce((n, rows) => n + rows.length, 0),
    [employeesByTeam]
  );

  const moveEmployee = async (
    team: string,
    fromName: string,
    toName: string
  ) => {
    if (fromName === toName) return;
    const rows = employeesByTeam[team] || [];
    const names = rows.map((r) => r.name);
    const fromIdx = names.indexOf(fromName);
    const toIdx = names.indexOf(toName);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...names];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await reorderEmployees(team, next);
  };

  const projectOptions =
    data.projectTypesByMajor?.[regMajor] ||
    DEFAULT_PROJECT_TYPES_BY_MAJOR[regMajor] ||
    [];

  const months = useMemo(() => {
    const out: string[] = [];
    const y = new Date().getFullYear();
    for (let m = 1; m <= 12; m++) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
    }
    return out;
  }, []);

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
        <Link href="/" className="back-btn">
          ← 대시보드
        </Link>
        <h1>통합관리</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/manual" className="backup-btn">
            매뉴얼 보기
          </Link>
          <Link href="/admin/team" className="backup-btn">
            전체 직원 통합 보기 (KPI)
          </Link>
          <Link href="/admin/estimates" className="backup-btn">
            견적·작업시간 분석
          </Link>
          <button
            type="button"
            className="backup-btn"
            onClick={() => {
              const now = new Date();
              downloadBackup(
                buildBackupPayload(data, "admin"),
                now.getFullYear(),
                now.getMonth() + 1
              );
              alert(
                `백업 저장 완료\n- 업무일지 기록: ${data.entries.length}건\n- 등록 직원: ${Object.values(data.employees).flat().length}명`
              );
            }}
          >
            백업저장
          </button>
          <label className="backup-btn" style={{ cursor: "pointer" }}>
            백업가져오기
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const parsed = parseBackupFile(await file.text());
                  if (
                    confirm(
                      `백업을 불러오면 현재 데이터가 대체됩니다.\n기록 ${parsed.entries?.length || 0}건\n계속할까요?`
                    )
                  ) {
                    replaceFromBackup(parsed);
                  }
                } catch {
                  alert("유효하지 않은 백업 파일입니다.");
                }
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="backup-btn"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/";
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      <div className="admin-page-section">
        <h4>
          직원 관리{" "}
          <span className="admin-count-pill">
            <span>{employeeCount}</span>명
          </span>
        </h4>
        <p className="admin-sub">+ 신규 직원 등록</p>
        <div className="reg-row">
          <input
            placeholder="이름"
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
          />
          <select value={regTeam} onChange={(e) => setRegTeam(e.target.value)}>
            <option value="디자인">디자인팀</option>
            <option value="영상">영상팀</option>
          </select>
          <button
            type="button"
            className="backup-btn"
            onClick={async () => {
              if (!regName.trim()) return;
              await upsertEmployee({
                name: regName.trim(),
                team: regTeam,
                grade: "사원",
              });
              setRegName("");
            }}
          >
            확정
          </button>
        </div>
        <div className="reg-row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className={"backup-btn" + (showFormer ? " active" : "")}
            id="toggleFormerBtn"
            onClick={() => setShowFormer((v) => !v)}
          >
            퇴사자 보기
          </button>
        </div>
        <p className="admin-sub" style={{ marginTop: 12 }}>
          ⋮⋮ 핸들을 드래그해 팀 내 순서를 바꿀 수 있습니다. (대시보드 카드
          순서에 반영)
        </p>
        {Object.entries(employeesByTeam).map(([team, rows]) => {
          if (!rows.length) return null;
          return (
            <div key={team} className="admin-team-block">
              <h5 className="admin-team-title">{team}팀</h5>
              <div className="admin-list-wrap">
                <table className="agg admin-list-table">
                  <thead>
                    <tr>
                      <th className="col-drag" aria-label="순서" />
                      <th>이름</th>
                      <th>직급</th>
                      <th>KPI</th>
                      <th>수정</th>
                      <th>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.name}
                        className={
                          (r.isFormer ? "row-former " : "") +
                          (dragName === r.name ? "is-dragging " : "") +
                          (dragOverName === r.name ? "drag-over " : "")
                        }
                        onDragOver={(e) => {
                          if (dragTeam !== team) return;
                          e.preventDefault();
                          setDragOverName(r.name);
                        }}
                        onDragLeave={() => {
                          if (dragOverName === r.name) setDragOverName(null);
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          if (dragTeam !== team || !dragName) return;
                          await moveEmployee(team, dragName, r.name);
                          setDragName(null);
                          setDragTeam(null);
                          setDragOverName(null);
                        }}
                      >
                        <td className="col-drag">
                          <button
                            type="button"
                            className="drag-handle"
                            title="드래그하여 순서 변경"
                            draggable
                            onDragStart={(e) => {
                              setDragName(r.name);
                              setDragTeam(team);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", r.name);
                            }}
                            onDragEnd={() => {
                              setDragName(null);
                              setDragTeam(null);
                              setDragOverName(null);
                            }}
                          >
                            ⋮⋮
                          </button>
                        </td>
                        <td>{r.name}</td>
                        <td>{r.grade}</td>
                        <td>
                          <Link
                            href={`/e/${encodeURIComponent(r.name)}`}
                            className="edit-row-btn"
                          >
                            KPI 보기
                          </Link>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="edit-row-btn"
                            onClick={() => {
                              setEditName(r.name);
                              setEditForm({
                                name: r.name,
                                team: r.team,
                                grade: r.grade,
                                isFormer: r.isFormer,
                              });
                            }}
                          >
                            수정
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="del-row-btn"
                            onClick={async () => {
                              if (confirm(`${r.name} 직원을 삭제할까요?`)) {
                                await deleteEmployee(r.name);
                              }
                            }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      <div className="admin-page-section">
        <h4>
          업체 관리{" "}
          <span className="admin-count-pill">
            {Object.keys(data.companyCat).length}곳
          </span>
        </h4>
        <p className="admin-sub">+ 신규 업체 등록</p>
        <div className="reg-row">
          <input
            placeholder="업체명"
            value={regCompany}
            onChange={(e) => setRegCompany(e.target.value)}
          />
          <select
            value={regMajor}
            onChange={(e) => {
              setRegMajor(e.target.value);
              setRegProject("");
            }}
          >
            {MAJORS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={regProject}
            onChange={(e) => setRegProject(e.target.value)}
          >
            <option value="">카테고리</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            placeholder="작업항목"
            style={{ flex: "0 0 22%" }}
            value={regTask}
            onChange={(e) => setRegTask(e.target.value)}
          />
          <select
            value={regStartMonth}
            onChange={(e) => setRegStartMonth(e.target.value)}
          >
            <option value="">시작월</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="backup-btn"
            onClick={async () => {
              if (!regCompany.trim()) return;
              await upsertCompany(regCompany.trim(), {
                major: regMajor,
                cat: regProject,
                task: regTask,
                sm: regStartMonth,
              });
              setRegCompany("");
              setRegTask("");
            }}
          >
            확정
          </button>
        </div>
        <div className="admin-list-wrap" style={{ marginTop: 16 }}>
          <table className="agg admin-list-table">
            <thead>
              <tr>
                <th className="col-name">업체</th>
                <th>대분류</th>
                <th>카테고리</th>
                <th>담당</th>
                <th>작업항목</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.companyCat)
                .sort(([a], [b]) => a.localeCompare(b, "ko"))
                .map(([name, info]) => (
                  <tr key={name}>
                    <td className="col-name">{name}</td>
                    <td>{info.major || "-"}</td>
                    <td>{info.cat || "-"}</td>
                    <td>{info.assignee || "-"}</td>
                    <td>{info.task || "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {editName && (
        <div className="overlay open" onClick={() => setEditName(null)}>
          <div
            className="modal admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>직원 정보 수정</h3>
              <button type="button" onClick={() => setEditName(null)}>
                &times;
              </button>
            </div>
            <p className="modal-sub">
              이름·팀·직급을 바꾼 뒤 확정을 누르면 저장됩니다.
            </p>
            <div className="emp-edit-form">
              <div className="emp-edit-row">
                <label>이름</label>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="emp-edit-row">
                <label>팀</label>
                <select
                  value={editForm.team}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, team: e.target.value }))
                  }
                >
                  <option value="디자인">디자인팀</option>
                  <option value="영상">영상팀</option>
                </select>
              </div>
              <div className="emp-edit-row">
                <label>직급</label>
                <select
                  value={editForm.grade}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, grade: e.target.value }))
                  }
                >
                  {[
                    "사원",
                    "주임",
                    "대리",
                    "대리과장",
                    "과장",
                    "차장",
                    "팀장",
                  ].map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="emp-edit-row emp-edit-retire-row">
                <button
                  type="button"
                  className={
                    "emp-retire-btn" + (editForm.isFormer ? " is-former" : "")
                  }
                  onClick={() =>
                    setEditForm((f) => ({ ...f, isFormer: !f.isFormer }))
                  }
                >
                  {editForm.isFormer ? "재직으로 복구" : "퇴직 처리"}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="modal-save"
                onClick={async () => {
                  await upsertEmployee({
                    name: editForm.name.trim(),
                    team: editForm.team,
                    grade: editForm.grade,
                    oldName: editName,
                    isFormer: editForm.isFormer,
                  });
                  setEditName(null);
                }}
              >
                확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
