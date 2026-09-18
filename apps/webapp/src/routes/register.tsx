import { createFileRoute, redirect } from "@tanstack/react-router";
import { RegisterPage } from "@/pages/RegisterPage";
import { useAuthStore } from "@/stores/useAuthStore";

type RegisterSearch = { redirect?: string };

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (useAuthStore.getState().status === "authenticated") {
      throw redirect({
        to: (search.redirect ?? "/") as "/",
        replace: true,
      });
    }
  },
  component: RegisterRouteComponent,
});

function RegisterRouteComponent() {
  const { redirect: redirectTarget } = Route.useSearch();
  return <RegisterPage redirect={redirectTarget} />;
}
