import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { EscalationsList } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/escalations")({
  component: () => (
    <DashboardPage role="swag_member">
      <EscalationsList role="swag_member" />
    </DashboardPage>
  ),
});
