import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { EscalationDetailPage } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/escalations_/$requestId")({ component: Page });
function Page() {
  const { requestId } = Route.useParams();
  return (
    <DashboardPage role="swag_member">
      <EscalationDetailPage role="swag_member" requestId={requestId} />
    </DashboardPage>
  );
}
