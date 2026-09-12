import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherPeerOverview } from "@/components/dashboard/HomePages";
export const Route = createFileRoute("/teacher_/peer-support")({
  component: () => (
    <DashboardPage role="teacher">
      <TeacherPeerOverview />
    </DashboardPage>
  ),
});
