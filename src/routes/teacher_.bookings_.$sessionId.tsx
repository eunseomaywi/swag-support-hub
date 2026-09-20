import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherPeerDetail } from "@/components/dashboard/TeacherPeerDetails";
import { teacherListSearch } from "@/lib/peer-detail";
export const Route = createFileRoute("/teacher_/bookings_/$sessionId")({
  validateSearch: teacherListSearch,
  component: Page,
});
function Page() {
  const { sessionId } = Route.useParams();
  return (
    <DashboardPage role="teacher">
      <TeacherPeerDetail key={sessionId} sessionId={sessionId} />
    </DashboardPage>
  );
}
