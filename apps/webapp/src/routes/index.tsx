import { createFileRoute, redirect } from "@tanstack/react-router"
import { HomePage } from "@/pages/HomePage"
import { useAuthStore } from "@/stores/useAuthStore"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      await useAuthStore.getState().loadSession()
    } catch {
      // Ignored; check status below
    }
    if (useAuthStore.getState().status !== "authenticated") {
      throw redirect({
        to: "/login",
        search: { redirect: "/" },
        replace: true,
      })
    }
  },
  component: HomePage,
})
