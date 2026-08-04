"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useJobsheet } from "@/context/JobsheetContext";
import {
  computeCategoryBaseline,
  computeStageRatioByCategory,
} from "@/lib/kpi";
import {
  estimateHoursFromBudget,
  estimateStagePlanFromBudget,
  fmWon,
} from "@/lib/estimate";
import { DEFAULT_PROJECT_TYPES_BY_MAJOR } from "@/lib/constants";
import { round1 } from "@/lib/time";

export function EstimatesView() {
  const { loading, data } = useJobsheet();
  const [tab, setTab] = useState<"디자인" | "동영상">("디자인");
  const [calcCategory, setCalcCategory] = useState("홈페이지");
  const [calcBudget, setCalcBudget] = useState("500");

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

  const plan = useMemo(() => {
    const budget = Number(calcBudget) || 0;
    if (!budget) return null;
    return estimateStagePlanFromBudget(
      calcCategory,
      budget,
      data.entries,
      data.projectStatus,
      data.staffRole,
      data.leaveData,
      data.estimates
    );
  }, [calcBudget, calcCategory, data]);

  const hours = useMemo(() => {
    const budget = Number(calcBudget) || 0;
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
  }, [calcBudget, calcCategory, data]);

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
                  <td className="center">{b ? `${b.usedCount}/${b.count}` : "-"}</td>
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
        <p className="admin-sub">
          예상 총 시간:{" "}
          <b>{hours != null ? `${hours}h` : "기준 데이터 부족"}</b>
          {hours != null && ` · 약 ${round1(hours / 8)}일 (8h 기준)`}
        </p>
        {plan && (
          <table className="agg" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>단계</th>
                <th className="center">예상 시간</th>
                <th className="center">예상 일수</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(plan.stages).map(([s, v]) => (
                <tr key={s}>
                  <td>{s}</td>
                  <td className="center mono">{v.hours}h</td>
                  <td className="center mono">{v.days}일</td>
                </tr>
              ))}
              <tr className="grand-total-row">
                <td>합계</td>
                <td className="center mono">{plan.totalHours}h</td>
                <td className="center mono">
                  {round1(plan.totalHours / 8)}일
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-page-section">
        <h4>등록된 견적 샘플</h4>
        <table className="agg">
          <thead>
            <tr>
              <th>업체</th>
              <th>카테고리</th>
              <th className="center">견적</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.estimates)
              .filter(([k]) => {
                const project = k.split("|||")[1];
                return categories.includes(project);
              })
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
