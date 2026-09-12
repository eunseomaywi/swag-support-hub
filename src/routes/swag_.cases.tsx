import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MyCases } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/cases")({
  component: () => (
    <DashboardPage role="swag_member">
      <MyCases role="swag_member" />
    </DashboardPage>
  ),
});
