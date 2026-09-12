import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { AvailableRequests } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/peer-mentor_/requests")({
  component: () => (
    <DashboardPage role="peer_mentor">
      <AvailableRequests role="peer_mentor" />
    </DashboardPage>
  ),
});
