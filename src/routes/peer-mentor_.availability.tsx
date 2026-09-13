import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/peer-mentor_/availability")({
  component: () => <Navigate to="/peer-mentor/cases" replace />,
});
