import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

interface RenderWithRouterOptions {
  initialEntry?: string
  routePaths?: string[]
  wrapper?: (children: ReactNode) => ReactNode
}

export function renderWithRouter(ui: ReactNode, options: RenderWithRouterOptions = {}) {
  const { initialEntry = "/", routePaths = ["/"], wrapper } = options

  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const routes = routePaths.map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: (search: Record<string, unknown>) => search,
      component: () => <>{ui}</>,
    })
  )
  const history = createMemoryHistory({ initialEntries: [initialEntry] })
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history,
  })

  const tree = <RouterProvider router={router} />
  const result = render(wrapper ? <>{wrapper(tree)}</> : tree)
  return { ...result, router, history }
}
