/**
 * Router access gate decision (UX-only). Pure and framework-free so the
 * redirect matrix is pinned by unit tests; `__root.tsx` awaits the single-boot
 * `loadSession()` and then applies the decision. Authoritative enforcement
 * stays server-side (shared WS JWT gate, snapshot authorship).
 */
export type AuthGateStatus = "anonymous" | "authenticating" | "authenticated"

export interface AuthGateInput {
  pathname: string
  href: string
  status: AuthGateStatus
  onLine: boolean
}

export type AuthGateDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: "/login"; search: { redirect: string } }

const PUBLIC_PATHS = new Set(["/login", "/register"])

export function resolveAuthGate(input: AuthGateInput): AuthGateDecision {
  if (PUBLIC_PATHS.has(input.pathname)) return { kind: "allow" }
  if (input.status === "authenticated") {
    return { kind: "allow" }
  }
  // local-first boundary: offline cached local diagrams stay editable.
  if (!input.onLine && input.pathname.startsWith("/local/")) {
    return { kind: "allow" }
  }
  return { kind: "redirect", to: "/login", search: { redirect: input.href } }
}
