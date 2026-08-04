"use client";

import { use } from "react";
import { IndividualView } from "@/components/IndividualView";

export default function EmployeePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  return <IndividualView name={decodeURIComponent(name)} />;
}
