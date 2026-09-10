import { lazy, Suspense, useEffect } from "react";
import {
  createRootRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { AppProviders } from "@/AppProviders";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { DeferredToastContainer } from "@/components/DeferredToastContainer";
import { DiagramFileDropzone } from "@/components/DiagramFileDropzone";
import { ErrorPage } from "@/pages/ErrorPage";
import { ensureVersionStoreBootstrapped } from "@/stores/versionStoreBootstrap";

const EditorChromeHeader = lazy(() =>
  import("@/components/navbar/EditorChromeHeader").then((module) => ({
    default: module.EditorChromeHeader,
  })),
);

function RootLayout() {
  useEffect(() => {
    ensureVersionStoreBootstrapped();
  }, []);

  const path = useRouterState({ select: (s) => s.location.pathname });
  const isEditorRoute =
    path.startsWith("/local/") || path.startsWith("/shared/");

  return (
    <AppProviders>
      <Suspense fallback={<AppLoadingScreen />}>
        {isEditorRoute && (
          <a href="#editor-area" className="umlstudio-skip-link">
            Skip to diagram
          </a>
        )}
        {isEditorRoute && <EditorChromeHeader />}
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
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <ErrorPage />,
});
