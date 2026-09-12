import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MySessions } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/peer-mentor_/sessions")({
  component: () => (
    <DashboardPage role="peer_mentor">
      <MySessions />
    </DashboardPage>
  ),
});
