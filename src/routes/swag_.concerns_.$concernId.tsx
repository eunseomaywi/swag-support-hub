import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { ConcernDetailPage } from "@/components/dashboard/ConcernPages";
export const Route = createFileRoute("/swag_/concerns_/$concernId")({ component: Page });
function Page() {
  const { concernId } = Route.useParams();
  return (
    <DashboardPage role="swag_member">
      <ConcernDetailPage role="swag_member" concernId={concernId} />
    </DashboardPage>
  );
}
