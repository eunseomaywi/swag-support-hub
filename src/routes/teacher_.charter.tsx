import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { CharterModeration } from "@/components/charter/CharterModeration";
export const Route = createFileRoute("/teacher_/charter")({
  component: () => (
    <DashboardPage role="teacher">
      <CharterModeration role="teacher" />
    </DashboardPage>
  ),
});
