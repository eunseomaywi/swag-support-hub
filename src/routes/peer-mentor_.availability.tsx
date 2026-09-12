import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MyAvailability } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/peer-mentor_/availability")({
  component: () => (
    <DashboardPage role="peer_mentor">
      <MyAvailability />
    </DashboardPage>
  ),
});
