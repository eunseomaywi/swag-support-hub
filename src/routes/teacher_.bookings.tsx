import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherRequestsPage } from "@/components/dashboard/TeacherPeerDetails";
import { teacherListSearch } from "@/lib/peer-detail";
export const Route = createFileRoute("/teacher_/bookings")({
  validateSearch: (search) => teacherListSearch({ filter: "scheduled", ...search }),
  component: () => (
    <DashboardPage role="teacher">
      <TeacherRequestsPage meetings />
    </DashboardPage>
  ),
});
