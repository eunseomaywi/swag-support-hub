import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { CharterModeration } from "@/components/charter/CharterModeration";
export const Route = createFileRoute("/swag_/charter")({
  component: () => (
    <DashboardPage role="swag_member">
      <CharterModeration role="swag_member" />
    </DashboardPage>
  ),
});
