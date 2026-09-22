import { lazy, Suspense, useEffect } from "react"
import { createRootRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"
import { AppProviders } from "@/AppProviders"
import { AppLoadingScreen } from "@/components/AppLoadingScreen"
import { DeferredToastContainer } from "@/components/DeferredToastContainer"
import { DiagramFileDropzone } from "@/components/DiagramFileDropzone"
import { ErrorPage } from "@/pages/ErrorPage"
import { useAuthStore } from "@/stores/useAuthStore"
import { resolveAuthGate } from "@/lib/authGate"
import { ensureVersionStoreBootstrapped } from "@/stores/versionStoreBootstrap"

const EditorChromeHeader = lazy(() =>
  import("@/components/navbar/EditorChromeHeader").then((module) => ({
    default: module.EditorChromeHeader,
  }))
)

const EditorChromeRightDock = lazy(() =>
  import("@/components/agentic/EditorChromeRightDock").then((module) => ({
    default: module.EditorChromeRightDock,
  }))
)

function RootLayout() {
  useEffect(() => {
    ensureVersionStoreBootstrapped()
  }, [])

  useEffect(() => {
    void useAuthStore.getState().loadSession()
  }, [])

  const path = useRouterState({ select: (s) => s.location.pathname })
  const isEditorRoute = path.startsWith("/local/") || path.startsWith("/shared/")

  return (
    <AppProviders>
      <Suspense fallback={<AppLoadingScreen />}>
        {isEditorRoute && (
          <a href="#editor-area" className="umlstudio-skip-link">
            Skip to diagram
          </a>
        )}
        {isEditorRoute && (
          <>
            <EditorChromeHeader />
            <EditorChromeRightDock />
          </>
        )}
        <div
          id="editor-area"
          data-testid="editor-area"
          tabIndex={-1}
          style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        >
          <Outlet />
        </div>
      </Suspense>

      <DiagramFileDropzone />
      <DeferredToastContainer />
    </AppProviders>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <ErrorPage />,
  /**
   * Access gate (UX-only). Public auth pages pass through; protected
   * routes suspend on the single-boot `loadSession()` and redirect anonymous
   * visitors to `/login?redirect=<target>`. Authoritative enforcement stays
   * server-side: the shared WS JWT gate (4401/1008) and snapshot authorship.
   * `/local/*` fails open offline local-first boundary: no cached
   * session plus no connectivity still allows cached local editing).
   */
  beforeLoad: async ({ location }) => {
    try {
      await useAuthStore.getState().loadSession()
    } catch {
      // loadSession already falls back to anonymous; gate decides below.
    }
    const decision = resolveAuthGate({
      pathname: location.pathname,
      href: location.href,
      status: useAuthStore.getState().status,
      onLine: typeof navigator === "undefined" ? true : navigator.onLine,
    })
    if (decision.kind === "redirect") {
      throw redirect({
        to: decision.to,
        search: decision.search,
        replace: true,
      })
    }
  },
})
