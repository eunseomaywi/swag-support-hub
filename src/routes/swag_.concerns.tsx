import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { ConcernListPage } from "@/components/dashboard/ConcernPages";
export const Route = createFileRoute("/swag_/concerns")({
  component: () => (
    <DashboardPage role="swag_member">
      <ConcernListPage role="swag_member" />
    </DashboardPage>
  ),
});
