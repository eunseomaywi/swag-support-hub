import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { CaseDetail } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/peer-mentor_/cases_/$requestId")({ component: Page });
function Page() {
  const { requestId } = Route.useParams();
  return (
    <DashboardPage role="peer_mentor">
      <CaseDetail role="peer_mentor" requestId={requestId} />
    </DashboardPage>
  );
}
