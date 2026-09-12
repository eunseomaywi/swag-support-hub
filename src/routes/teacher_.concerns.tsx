import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { ConcernListPage } from "@/components/dashboard/ConcernPages";
export const Route = createFileRoute("/teacher_/concerns")({
  component: () => (
    <DashboardPage role="teacher">
      <ConcernListPage role="teacher" />
    </DashboardPage>
  ),
});
