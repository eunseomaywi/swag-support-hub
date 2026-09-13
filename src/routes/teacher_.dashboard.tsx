import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherPeerHome } from "@/components/dashboard/TeacherPeerSupport";

export const Route = createFileRoute("/teacher_/dashboard")({
  head: () => ({
    meta: [{ title: "Teacher Dashboard — SWAG Support Hub" }],
  }),
  component: TeacherDashboardRoute,
});

function TeacherDashboardRoute() {
  return (
    <DashboardPage role="teacher">
      <TeacherPeerHome />
    </DashboardPage>
  );
}
