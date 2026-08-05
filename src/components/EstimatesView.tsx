"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  computeStageRatioByCategory,
} from "@/lib/kpi";
import {
  buildGradeEstimateRows,
  computeEstimateSplitRatio,
  estimateHoursFromBudget,
  estimateStagePlanForRole,
  estimateStagePlanFromBudget,
  resolveGradeAssignees,
} from "@/lib/estimate";
import {
  DEFAULT_GRADE_DAILY_RATE,
  DEFAULT_PROJECT_TYPES_BY_MAJOR,
  GRADE_OPTIONS_FOR_ESTIMATE,
  SPLIT_DESIGN_PUBLISH,
  STAGES,
} from "@/lib/constants";
import { round1 } from "@/lib/time";

type GradeGroupState = {
  grade1: string;
  grade2: string;
  grade3: string;
  ratio1: number;
  ratio2: number;
  ratio3: number;
};

const defaultGrade = (): GradeGroupState => ({
  grade1: "대리",
  grade2: "",
  grade3: "",
  ratio1: 100,
  ratio2: 0,
  ratio3: 0,
});

function GradeSlot({
  index,
  grade,
  ratio,
  showRatio,
  canClear,
  onGrade,
  onRatio,
}: {
  index: number;
  grade: string;
  ratio: number;
  showRatio: boolean;
  canClear: boolean;
  onGrade: (v: string) => void;
  onRatio: (v: number) => void;
}) {
  return (
    <div className="estimate-slot">
      <span className="estimate-slot-label">담당 {index}</span>
      <select value={grade} onChange={(e) => onGrade(e.target.value)}>
        {canClear && <option value="">없음</option>}
        {GRADE_OPTIONS_FOR_ESTIMATE.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      {showRatio ? (
        <div className="estimate-slot-ratio">
          <input
            type="number"
            min={0}
            max={100}
            value={ratio}
            onChange={(e) => onRatio(Number(e.target.value) || 0)}
          />
          <span>%</span>
        </div>
      ) : (
        <span className="estimate-slot-ratio-fixed">100%</span>
      )}
    </div>
  );
}

function GradeControls({
  label,
  tone,
  state,
  onChange,
}: {
  label: string;
  tone?: "design" | "publish" | "single";
  state: GradeGroupState;
  onChange: (next: GradeGroupState) => void;
}) {
  const multi = !!(state.grade2 || state.grade3);
  return (
    <div className={"estimate-panel" + (tone ? ` tone-${tone}` : "")}>
      <div className="estimate-panel-head">{label}</div>
      <div className="estimate-slots">
        <GradeSlot
          index={1}
          grade={state.grade1}
          ratio={state.ratio1}
          showRatio={multi}
          canClear={false}
          onGrade={(grade1) => onChange({ ...state, grade1 })}
          onRatio={(ratio1) => onChange({ ...state, ratio1 })}
        />
        <GradeSlot
          index={2}
          grade={state.grade2}
          ratio={state.ratio2}
          showRatio={!!state.grade2}
          canClear
          onGrade={(grade2) => {
            if (!grade2) {
              onChange({
                ...state,
                grade2: "",
                grade3: "",
                ratio1: 100,
                ratio2: 0,
                ratio3: 0,
              });
              return;
            }
            onChange({
              ...state,
              grade2,
              ratio1: state.grade3 ? state.ratio1 || 34 : state.ratio1 || 50,
              ratio2: state.grade3 ? state.ratio2 || 33 : state.ratio2 || 50,
              ratio3: state.grade3 ? state.ratio3 || 33 : 0,
            });
          }}
          onRatio={(ratio2) => onChange({ ...state, ratio2 })}
        />
        {state.grade2 ? (
          <GradeSlot
            index={3}
            grade={state.grade3}
            ratio={state.ratio3}
            showRatio={!!state.grade3}
            canClear
            onGrade={(grade3) => {
              if (!grade3) {
                onChange({
                  ...state,
                  grade3: "",
                  ratio1: state.ratio1 || 50,
                  ratio2: state.ratio2 || 50,
                  ratio3: 0,
                });
                return;
              }
              onChange({
                ...state,
                grade3,
                ratio1: state.ratio1 || 34,
                ratio2: state.ratio2 || 33,
                ratio3: state.ratio3 || 33,
              });
            }}
            onRatio={(ratio3) => onChange({ ...state, ratio3 })}
          />
        ) : null}
      </div>
    </div>
  );
}

export function EstimatesView() {
  const { loading, data } = useJobsheet();
  const [tab, setTab] = useState<"디자인" | "동영상">("디자인");
  const [calcCategory, setCalcCategory] = useState("홈페이지");
  const [calcBudget, setCalcBudget] = useState("500");
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [singleGrade, setSingleGrade] = useState(defaultGrade);
  const [designGrade, setDesignGrade] = useState(defaultGrade);
  const [publishGrade, setPublishGrade] = useState(() => ({
    ...defaultGrade(),
    grade1: "사원",
  }));

  const gradeRates = useMemo(
    () => ({
      ...DEFAULT_GRADE_DAILY_RATE,
      ...data.gradeDailyRate,
    }),
    [data.gradeDailyRate]
  );

  const categories =
    data.projectTypesByMajor?.[tab] ||
    DEFAULT_PROJECT_TYPES_BY_MAJOR[tab] ||
    [];

  const isSplit = SPLIT_DESIGN_PUBLISH.has(calcCategory);
  const budget = Number(calcBudget) || 0;

  const calcRows = useMemo(() => {
    if (!budget) return { note: "", rows: [] as ReturnType<typeof buildGradeEstimateRows> };

    if (isSplit) {
      const ratio = computeEstimateSplitRatio(
        calcCategory,
        data.entries,
        data.projectStatus,
        data.staffRole,
        data.leaveData
      );
      if (!ratio) {
        return {
          note: "이 카테고리는 완료된 프로젝트 데이터가 없어 디자인/퍼블 배분 비율을 계산할 수 없습니다.",
          rows: [],
        };
      }
      const designAmount = round1(budget * ratio.designRatio);
      const publishAmount = round1(budget * ratio.publishRatio);
      const designPlan = estimateStagePlanForRole(
        calcCategory,
        "디자인",
        designAmount,
        data.entries,
        data.projectStatus,
        data.staffRole,
        data.leaveData,
        data.estimates
      );
      const publishPlan = estimateStagePlanForRole(
        calcCategory,
        "퍼블",
        publishAmount,
        data.entries,
        data.projectStatus,
        data.staffRole,
        data.leaveData,
        data.estimates
      );
      const rows = [
        ...buildGradeEstimateRows(
          `${calcCategory} 디자인`,
          designAmount,
          designPlan?.stages || null,
          resolveGradeAssignees(
            designGrade.grade1,
            designGrade.grade2,
            designGrade.grade3,
            designGrade.ratio1,
            designGrade.ratio2,
            designGrade.ratio3
          ),
          gradeRates
        ),
        ...buildGradeEstimateRows(
          `${calcCategory} 퍼블`,
          publishAmount,
          publishPlan?.stages || null,
          resolveGradeAssignees(
            publishGrade.grade1,
            publishGrade.grade2,
            publishGrade.grade3,
            publishGrade.ratio1,
            publishGrade.ratio2,
            publishGrade.ratio3
          ),
          gradeRates
        ),
      ];
      return {
        note: `견적 ${budget.toLocaleString("ko-KR")}만원을 디자인 ${ratio.designPct}%(${designAmount.toLocaleString("ko-KR")}만) : 퍼블 ${ratio.publishPct}%(${publishAmount.toLocaleString("ko-KR")}만)로 자동 배분했습니다.`,
        rows,
      };
    }

    const plan = estimateStagePlanFromBudget(
      calcCategory,
      budget,
      data.entries,
      data.projectStatus,
      data.staffRole,
      data.leaveData,
      data.estimates
    );
    if (!plan) {
      return {
        note: "이 카테고리는 완료된 프로젝트 데이터가 없어 기준선을 계산할 수 없습니다.",
        rows: [],
      };
    }
    return {
      note: "",
      rows: buildGradeEstimateRows(
        calcCategory,
        budget,
        plan.stages,
        resolveGradeAssignees(
          singleGrade.grade1,
          singleGrade.grade2,
          singleGrade.grade3,
          singleGrade.ratio1,
          singleGrade.ratio2,
          singleGrade.ratio3
        ),
        gradeRates
      ),
    };
  }, [
    budget,
    isSplit,
    calcCategory,
    data,
    designGrade,
    publishGrade,
    singleGrade,
    gradeRates,
  ]);

  const hours = useMemo(() => {
    if (!budget) return null;
    return estimateHoursFromBudget(
      calcCategory,
      budget,
      data.entries,
      data.projectStatus,
      data.staffRole,
      data.leaveData,
      data.estimates
    );
  }, [calcBudget, calcCategory, data, budget]);

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
        <div className="back-btn-group">
          <Link href="/admin" className="back-btn">
            ← 통합관리
          </Link>
          <Link href="/" className="back-btn">
            ← 대시보드
          </Link>
        </div>
        <h1>견적·작업시간 분석</h1>
        <div />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={"team-tab-btn" + (tab === "디자인" ? " active" : "")}
          onClick={() => setTab("디자인")}
        >
          디자인팀
        </button>
        <button
          type="button"
          className={"team-tab-btn" + (tab === "동영상" ? " active" : "")}
          onClick={() => setTab("동영상")}
        >
          영상팀
        </button>
      </div>

      <div className="admin-page-section">
        <h4>카테고리별 단계 비율</h4>
        <table className="agg stage-ratio-table">
          <thead>
            <tr>
              <th>카테고리</th>
              <th className="center">표본</th>
              <th className="center">시안</th>
              <th className="center">본작업</th>
              <th className="center">수정중</th>
              <th className="center">제작중</th>
              <th className="center stage-ratio-toggle-col" />
            </tr>
          </thead>
          <tbody>
            {categories.flatMap((cat) => {
              const split = SPLIT_DESIGN_PUBLISH.has(cat);
              const expanded = !!expandedCats[cat];
              const totalRatio = computeStageRatioByCategory(
                data.entries,
                data.projectStatus,
                data.leaveData,
                cat
              );
              const mainRow = (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td className="center">{totalRatio.sampleCount || "-"}</td>
                  <td className="center mono">
                    {totalRatio.total ? `${totalRatio.ratios.시안}%` : "-"}
                  </td>
                  <td className="center mono">
                    {totalRatio.total ? `${totalRatio.ratios.본작업}%` : "-"}
                  </td>
                  <td className="center mono">
                    {totalRatio.total ? `${totalRatio.ratios.수정중}%` : "-"}
                  </td>
                  <td className="center mono">
                    {totalRatio.total ? `${totalRatio.ratios.제작중}%` : "-"}
                  </td>
                  <td className="center stage-ratio-toggle-col">
                    {split ? (
                      <button
                        type="button"
                        className={
                          "stage-ratio-toggle" + (expanded ? " open" : "")
                        }
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? `${cat} 디자인/퍼블 접기`
                            : `${cat} 디자인/퍼블 펼치기`
                        }
                        onClick={() =>
                          setExpandedCats((prev) => ({
                            ...prev,
                            [cat]: !prev[cat],
                          }))
                        }
                      >
                        {expanded ? "접기 ▴" : "디자인/퍼블 ▾"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
              if (!split || !expanded) return [mainRow];

              const childRows = (["디자인", "퍼블"] as const).map((role) => {
                const ratio = computeStageRatioByCategory(
                  data.entries,
                  data.projectStatus,
                  data.leaveData,
                  cat,
                  data.staffRole,
                  role
                );
                return (
                  <tr
                    key={`${cat}-${role}`}
                    className={
                      role === "디자인"
                        ? "stage-ratio-design"
                        : "stage-ratio-publish"
                    }
                  >
                    <td className="stage-ratio-child-cat">
                      <span className={`role-badge role-${role}`}>{role}</span>
                    </td>
                    <td className="center">{ratio.sampleCount || "-"}</td>
                    <td className="center mono">
                      {ratio.total ? `${ratio.ratios.시안}%` : "-"}
                    </td>
                    <td className="center mono">
                      {ratio.total ? `${ratio.ratios.본작업}%` : "-"}
                    </td>
                    <td className="center mono">
                      {ratio.total ? `${ratio.ratios.수정중}%` : "-"}
                    </td>
                    <td className="center mono">
                      {ratio.total ? `${ratio.ratios.제작중}%` : "-"}
                    </td>
                    <td className="center stage-ratio-toggle-col" />
                  </tr>
                );
              });
              return [mainRow, ...childRows];
            })}
          </tbody>
        </table>
      </div>

      <div className="admin-page-section">
        <h4>견적 → 예상 작업시간 계산</h4>

        <div className="estimate-calc-layout">
          <div className="estimate-calc-inputs">
            <label className="estimate-field">
              <span>카테고리</span>
              <select
                value={calcCategory}
                onChange={(e) => setCalcCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="estimate-field">
              <span>견적 (만원)</span>
              <input
                type="number"
                placeholder="예: 500"
                value={calcBudget}
                onChange={(e) => setCalcBudget(e.target.value)}
              />
            </label>
          </div>

          <div className={"estimate-panels" + (isSplit ? " split" : "")}>
            {isSplit ? (
              <>
                <GradeControls
                  label="디자인 몫"
                  tone="design"
                  state={designGrade}
                  onChange={setDesignGrade}
                />
                <GradeControls
                  label="퍼블 몫"
                  tone="publish"
                  state={publishGrade}
                  onChange={setPublishGrade}
                />
              </>
            ) : (
              <GradeControls
                label="담당 직급"
                tone="single"
                state={singleGrade}
                onChange={setSingleGrade}
              />
            )}
          </div>

          <div className="estimate-summary">
            <div className="estimate-summary-item">
              <span className="estimate-summary-label">기준 시급 환산</span>
              <strong>
                {hours != null ? `${hours}h` : "데이터 부족"}
                {hours != null && (
                  <span className="estimate-summary-sub">
                    {" "}
                    · 약 {round1(hours / 8)}일
                  </span>
                )}
              </strong>
            </div>
            {calcRows.note ? (
              <p className="estimate-summary-note">{calcRows.note}</p>
            ) : null}
          </div>

          {calcRows.rows.length > 0 && (
            <div className="estimate-result-wrap">
              <table className="agg estimate-result-table">
                <thead>
                  <tr>
                    <th className="left">분야</th>
                    <th className="center">담당</th>
                    <th className="center">견적</th>
                    <th className="center">작업일수</th>
                    {STAGES.map((s) => (
                      <th className="center" key={s}>
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calcRows.rows.map((r, i) => {
                    return (
                      <tr key={`${r.label}-${r.grade}-${i}`}>
                        <td className="left">{r.label}</td>
                        <td className="center">
                          <span className="estimate-result-grade">{r.grade}</span>
                          <span className="estimate-result-pct">{r.ratio}%</span>
                        </td>
                        <td className="center mono">
                          {r.amount.toLocaleString("ko-KR")}만
                        </td>
                        {r.error ? (
                          <td colSpan={5} className="center admin-sub">
                            {r.error}
                          </td>
                        ) : (
                          <>
                            <td className="center">
                              <div className="estimate-result-days">
                                <b>{r.days}일</b>
                                <span>{r.hours}h</span>
                              </div>
                            </td>
                            {STAGES.map((s) => {
                              const st = r.stages?.[s];
                              return (
                                <td className="center" key={s}>
                                  {st ? (
                                    <div className="estimate-stage-cell">
                                      <b>{st.days}일</b>
                                      <span>{st.hours}h</span>
                                      <em>{st.ratio}%</em>
                                    </div>
                                  ) : (
                                    "-"
                                  )}
                                </td>
                              );
                            })}
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
