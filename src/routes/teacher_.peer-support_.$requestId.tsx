import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { TeacherPeerDetail } from "@/components/dashboard/TeacherPeerDetails";
import { teacherListSearch } from "@/lib/peer-detail";
export const Route = createFileRoute("/teacher_/peer-support_/$requestId")({
  validateSearch: teacherListSearch,
  component: Page,
});
function Page() {
  const { requestId } = Route.useParams();
  return (
    <DashboardPage role="teacher">
      <TeacherPeerDetail key={requestId} requestId={requestId} />
    </DashboardPage>
  );
}
