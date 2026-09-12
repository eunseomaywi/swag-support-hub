import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MyAvailability } from "@/components/dashboard/PeerSupportPages";
export const Route = createFileRoute("/swag_/availability")({
  component: () => (
    <DashboardPage role="swag_member">
      <MyAvailability />
    </DashboardPage>
  ),
});
