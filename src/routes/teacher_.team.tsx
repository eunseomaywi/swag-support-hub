import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { SupportTeam } from "@/components/dashboard/ProfilePages";
export const Route = createFileRoute("/teacher_/team")({
  component: () => (
    <DashboardPage role="teacher">
      <SupportTeam />
    </DashboardPage>
  ),
});
