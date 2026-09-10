import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AppLoadingScreen } from "@/components/AppLoadingScreen";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingComponent: AppLoadingScreen,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

declare module "@tanstack/history" {
  interface HistoryState {
    from?: string;
  }
}

function App() {
  useEffect(() => {
    const root = document.documentElement;
    const coarse = window.matchMedia?.("(pointer: coarse)");
    const update = () =>
      root.toggleAttribute(
        "data-coarse-pointer",
        Capacitor.isNativePlatform() || Boolean(coarse?.matches),
      );
    update();
    coarse?.addEventListener("change", update);
    return () => coarse?.removeEventListener("change", update);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <RouterProvider router={router} />
    </div>
  );
}

export default App;
