import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MySessions } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/sessions")({
  component: () => (
    <DashboardPage role="swag_member">
      <MySessions />
    </DashboardPage>
  ),
});
