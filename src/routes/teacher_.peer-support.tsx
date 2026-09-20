import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherPeerSupport } from "@/components/dashboard/TeacherPeerSupport";
import { teacherListSearch } from "@/lib/peer-detail";
export const Route = createFileRoute("/teacher_/peer-support")({
  validateSearch: teacherListSearch,
  component: () => (
    <DashboardPage role="teacher">
      <TeacherPeerSupport />
    </DashboardPage>
  ),
});
