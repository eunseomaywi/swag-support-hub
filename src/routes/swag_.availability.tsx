import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/swag_/availability")({
  component: () => <Navigate to="/swag/cases" replace />,
});
