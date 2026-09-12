import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherBookingsPlaceholder } from "@/components/dashboard/HomePages";
export const Route = createFileRoute("/teacher_/bookings")({
  component: () => (
    <DashboardPage role="teacher">
      <TeacherBookingsPlaceholder />
    </DashboardPage>
  ),
});
