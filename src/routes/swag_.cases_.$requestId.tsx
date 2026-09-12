import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { CaseDetail } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/cases_/$requestId")({ component: Page });
function Page() {
  const { requestId } = Route.useParams();
  return (
    <DashboardPage role="swag_member">
      <CaseDetail role="swag_member" requestId={requestId} />
    </DashboardPage>
  );
}
