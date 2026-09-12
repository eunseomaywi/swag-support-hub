import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { EscalationDetailPage } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/teacher_/escalations_/$requestId")({ component: Page });
function Page() {
  const { requestId } = Route.useParams();
  return (
    <DashboardPage role="teacher">
      <EscalationDetailPage role="teacher" requestId={requestId} />
    </DashboardPage>
  );
}
