"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  computeCategoryBaseline,
  computeStageRatioByCategory,
} from "@/lib/kpi";
import {
  buildGradeEstimateRows,
  computeEstimateSplitRatio,
  estimateHoursFromBudget,
  estimateStagePlanForRole,
  estimateStagePlanFromBudget,
  resolveGradeAssignees,
  fmWon,
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
  ratio1: number;
  ratio2: number;
};

const defaultGrade = (): GradeGroupState => ({
  grade1: "대리",
  grade2: "",
  ratio1: 100,
  ratio2: 0,
});

function GradeControls({
  label,
  state,
  onChange,
}: {
  label: string;
  state: GradeGroupState;
  onChange: (next: GradeGroupState) => void;
}) {
  return (
    <div className="estimate-grade-row">
      <strong style={{ minWidth: 90, fontSize: 13 }}>{label}</strong>
      <label>담당1</label>
      <select
        value={state.grade1}
        onChange={(e) => onChange({ ...state, grade1: e.target.value })}
      >
        {GRADE_OPTIONS_FOR_ESTIMATE.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      {state.grade2 ? (
        <>
          <label>비중%</label>
          <input
            type="number"
            style={{ width: 64 }}
            value={state.ratio1}
            min={0}
            max={100}
            onChange={(e) =>
              onChange({ ...state, ratio1: Number(e.target.value) || 0 })
            }
          />
        </>
      ) : null}
      <label>담당2</label>
      <select
        value={state.grade2}
        onChange={(e) => {
          const grade2 = e.target.value;
          onChange({
            ...state,
            grade2,
            ratio1: grade2 ? state.ratio1 || 50 : 100,
            ratio2: grade2 ? state.ratio2 || 50 : 0,
          });
        }}
      >
        <option value="">없음</option>
        {GRADE_OPTIONS_FOR_ESTIMATE.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      {state.grade2 ? (
        <>
          <label>비중%</label>
          <input
            type="number"
            style={{ width: 64 }}
            value={state.ratio2}
            min={0}
            max={100}
            onChange={(e) =>
              onChange({ ...state, ratio2: Number(e.target.value) || 0 })
            }
          />
        </>
      ) : null}
    </div>
  );
}

export function EstimatesView() {
  const { loading, data } = useJobsheet();
  const [tab, setTab] = useState<"디자인" | "동영상">("디자인");
  const [calcCategory, setCalcCategory] = useState("홈페이지");
  const [calcBudget, setCalcBudget] = useState("500");
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

  const baseline = useMemo(
    () =>
      computeCategoryBaseline(
        data.entries,
        data.projectStatus,
        data.staffRole,
        data.leaveData,
        data.estimates
      ),
    [data]
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
            designGrade.ratio1,
            designGrade.ratio2
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
            publishGrade.ratio1,
            publishGrade.ratio2
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
          singleGrade.ratio1,
          singleGrade.ratio2
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
        <Link href="/admin" className="back-btn">
          ← 통합관리
        </Link>
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
        <h4>카테고리별 기준 시급 (완료 프로젝트 트림평균)</h4>
        <table className="agg">
          <thead>
            <tr>
              <th>카테고리</th>
              <th className="center">표본</th>
              <th className="center">평균(원/h)</th>
              <th className="center">최소</th>
              <th className="center">최대</th>
              <th className="center">단계 비율</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const b = baseline[cat];
              const ratio = computeStageRatioByCategory(
                data.entries,
                data.projectStatus,
                data.leaveData,
                cat
              );
              return (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td className="center">
                    {b ? `${b.usedCount}/${b.count}` : "-"}
                  </td>
                  <td className="center mono">
                    {b ? b.avgWonPerHour.toLocaleString("ko-KR") : "-"}
                  </td>
                  <td className="center mono">
                    {b ? b.minWonPerHour.toLocaleString("ko-KR") : "-"}
                  </td>
                  <td className="center mono">
                    {b ? b.maxWonPerHour.toLocaleString("ko-KR") : "-"}
                  </td>
                  <td className="center" style={{ fontSize: 11 }}>
                    {ratio.total
                      ? `시안 ${ratio.ratios.시안}% · 본작 ${ratio.ratios.본작업}% · 수정 ${ratio.ratios.수정중}% · 제작 ${ratio.ratios.제작중}%`
                      : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="admin-page-section">
        <h4>견적 → 예상 작업시간 계산</h4>
        <div className="reg-row">
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
          <input
            type="number"
            placeholder="견적(만원)"
            value={calcBudget}
            onChange={(e) => setCalcBudget(e.target.value)}
          />
        </div>

        {isSplit ? (
          <>
            <GradeControls
              label="디자인 몫"
              state={designGrade}
              onChange={setDesignGrade}
            />
            <GradeControls
              label="퍼블 몫"
              state={publishGrade}
              onChange={setPublishGrade}
            />
          </>
        ) : (
          <GradeControls
            label="담당"
            state={singleGrade}
            onChange={setSingleGrade}
          />
        )}

        <p className="admin-sub">
          기준 시급 환산 총시간:{" "}
          <b>{hours != null ? `${hours}h` : "기준 데이터 부족"}</b>
          {hours != null && ` · 약 ${round1(hours / 8)}일 (8h 기준)`}
        </p>
        {calcRows.note && <p className="admin-sub">{calcRows.note}</p>}

        {calcRows.rows.length > 0 && (
          <table className="agg" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th className="left">분야</th>
                <th className="center">담당</th>
                <th className="center">견적(배분)</th>
                <th className="center">작업일수</th>
                {STAGES.map((s) => (
                  <th className="center" key={s}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calcRows.rows.map((r, i) => (
                <tr key={`${r.label}-${r.grade}-${i}`}>
                  <td>{r.label}</td>
                  <td className="center">
                    {r.grade}{" "}
                    <span className="admin-sub">({r.ratio}%)</span>
                  </td>
                  <td className="center">
                    {r.amount.toLocaleString("ko-KR")}만
                  </td>
                  {r.error ? (
                    <td colSpan={5} className="center admin-sub">
                      {r.error}
                    </td>
                  ) : (
                    <>
                      <td className="center" style={{ fontWeight: 600 }}>
                        {r.days}일{" "}
                        <span
                          style={{ color: "var(--text-muted)", fontSize: 11 }}
                        >
                          ({r.hours}h)
                        </span>
                      </td>
                      {STAGES.map((s) => {
                        const st = r.stages?.[s];
                        return (
                          <td className="center" key={s}>
                            {st ? (
                              <>
                                {st.days}일{" "}
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: 10.5,
                                  }}
                                >
                                  ({st.hours}h)
                                </span>
                                <div
                                  className="admin-sub"
                                  style={{ fontSize: 10, marginTop: 2 }}
                                >
                                  {st.ratio}%
                                </div>
                              </>
                            ) : (
                              "-"
                            )}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-page-section">
        <h4>등록 견적 샘플</h4>
        <table className="agg">
          <thead>
            <tr>
              <th>업체</th>
              <th>프로젝트</th>
              <th className="center">견적</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.estimates)
              .slice(0, 40)
              .map(([k, amount]) => {
                const [company, project] = k.split("|||");
                return (
                  <tr key={k}>
                    <td>{company}</td>
                    <td>{project}</td>
                    <td className="center">{fmWon(amount)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
