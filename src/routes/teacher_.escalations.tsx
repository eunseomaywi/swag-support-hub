import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { EscalationsList } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/teacher_/escalations")({
  component: () => (
    <DashboardPage role="teacher">
      <EscalationsList role="teacher" />
    </DashboardPage>
  ),
});
