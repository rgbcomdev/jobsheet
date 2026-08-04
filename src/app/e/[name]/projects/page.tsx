"use client";

import { use } from "react";
import { ProjectsView } from "@/components/ProjectsView";

export default function EmployeeProjectsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  return <ProjectsView name={decodeURIComponent(name)} />;
}
