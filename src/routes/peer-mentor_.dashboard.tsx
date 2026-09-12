import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { PeerHome } from "@/components/dashboard/PeerSupportPages";

export const Route = createFileRoute("/peer-mentor_/dashboard")({
  head: () => ({
    meta: [{ title: "Peer Mentor Dashboard — SWAG Support Hub" }],
  }),
  component: PeerMentorDashboardRoute,
});

function PeerMentorDashboardRoute() {
  return (
    <DashboardPage role="peer_mentor">
      <PeerHome role="peer_mentor" />
    </DashboardPage>
  );
}
