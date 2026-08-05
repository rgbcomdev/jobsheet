"use client";

import { Suspense, use } from "react";
import { IndividualView } from "@/components/IndividualView";

function EmployeePageInner({ name }: { name: string }) {
  return <IndividualView name={decodeURIComponent(name)} />;
}

export default function EmployeePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <p style={{ color: "var(--text-muted)" }}>불러오는 중…</p>
        </div>
      }
    >
      <EmployeePageInner name={name} />
    </Suspense>
  );
}
