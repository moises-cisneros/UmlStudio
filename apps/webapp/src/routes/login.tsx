import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/pages/LoginPage";
import { useAuthStore } from "@/stores/useAuthStore";

type LoginSearch = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
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
  component: LoginRouteComponent,
});

function LoginRouteComponent() {
  const { redirect: redirectTarget } = Route.useSearch();
  return <LoginPage redirect={redirectTarget} />;
}
