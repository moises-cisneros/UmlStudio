// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveAuthGate } from "./authGate";

describe("resolveAuthGate (CU-12 access gate matrix)", () => {
  const anon = {
    status: "anonymous" as const,
    onLine: true,
  };

  it("redirects anonymous visits to /, /local/:id and /shared/:id", () => {
    for (const target of ["/", "/local/abc", "/shared/xyz"]) {
      expect(
        resolveAuthGate({ ...anon, pathname: target, href: target }),
      ).toEqual({
        kind: "redirect",
        to: "/login",
        search: { redirect: target },
      });
    }
  });

  it("keeps the full original target including search in ?redirect=", () => {
    expect(
      resolveAuthGate({
        ...anon,
        pathname: "/shared/xyz",
        href: "/shared/xyz?view=present",
      }),
    ).toEqual({
      kind: "redirect",
      to: "/login",
      search: { redirect: "/shared/xyz?view=present" },
    });
  });

  it("leaves /login and /register public", () => {
    for (const pathname of ["/login", "/register"]) {
      expect(resolveAuthGate({ ...anon, pathname, href: pathname })).toEqual({
        kind: "allow",
      });
    }
  });

  it("allows every route for authenticated sessions", () => {
    for (const pathname of ["/", "/local/abc", "/shared/xyz", "/login"]) {
      expect(
        resolveAuthGate({
          pathname,
          href: pathname,
          status: "authenticated",
          onLine: true,
        }),
      ).toEqual({ kind: "allow" });
    }
  });

  it("redirects while session is unconfirmed or authenticating", () => {
    expect(
      resolveAuthGate({
        pathname: "/",
        href: "/",
        status: "authenticating",
        onLine: true,
      }),
    ).toEqual({
      kind: "redirect",
      to: "/login",
      search: { redirect: "/" },
    });
  });

  it("fails open for offline /local/:id but keeps /shared/:id gated", () => {
    expect(
      resolveAuthGate({
        pathname: "/local/abc",
        href: "/local/abc",
        status: "anonymous",
        onLine: false,
      }),
    ).toEqual({ kind: "allow" });
    expect(
      resolveAuthGate({
        pathname: "/shared/xyz",
        href: "/shared/xyz",
        status: "anonymous",
        onLine: false,
      }),
    ).toEqual({
      kind: "redirect",
      to: "/login",
      search: { redirect: "/shared/xyz" },
    });
  });
});
