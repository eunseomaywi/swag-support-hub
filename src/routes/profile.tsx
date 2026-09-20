import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard/DashboardLayout";
import { MyProfile } from "@/components/dashboard/ProfilePages";
import { useAuth } from "@/hooks/useAuth";
export const Route = createFileRoute("/profile")({ component: ProfileRoute });
function ProfileRoute() {
  const { role } = useAuth();
  return (
    <DashboardPage role={role && role !== "student" ? role : "peer_mentor"}>
      <MyProfile />
    </DashboardPage>
  );
}
