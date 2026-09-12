import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { StaffHome } from "@/components/dashboard/HomePages";

export const Route = createFileRoute("/swag_/dashboard")({
  head: () => ({
    meta: [{ title: "SWAG Member Dashboard — SWAG Support Hub" }],
  }),
  component: SwagDashboardRoute,
});

function SwagDashboardRoute() {
  return (
    <DashboardPage role="swag_member">
      <StaffHome role="swag_member" />
    </DashboardPage>
  );
}
