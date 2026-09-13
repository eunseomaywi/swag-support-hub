import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherPeerSupport } from "@/components/dashboard/TeacherPeerSupport";
export const Route = createFileRoute("/teacher_/peer-support")({
  component: () => (
    <DashboardPage role="teacher">
      <TeacherPeerSupport />
    </DashboardPage>
  ),
});
