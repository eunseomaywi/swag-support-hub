import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/swag_/sessions")({
  component: () => <Navigate to="/swag/cases" replace />,
});
