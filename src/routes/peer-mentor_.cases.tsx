import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MyCases } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/peer-mentor_/cases")({
  component: () => (
    <DashboardPage role="peer_mentor">
      <MyCases role="peer_mentor" />
    </DashboardPage>
  ),
});
