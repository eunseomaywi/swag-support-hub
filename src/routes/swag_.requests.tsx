import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { AvailableRequests } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/requests")({
  component: () => (
    <DashboardPage role="swag_member">
      <AvailableRequests role="swag_member" />
    </DashboardPage>
  ),
});
