// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRegisterError, useAuthStore } from "./useAuthStore";

const USER = {
  id: "user-cu12-001",
  email: "ada@example.com",
  name: "Ada Modeler",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse(401, { error: "UNAUTHORIZED" })),
  );
  useAuthStore.setState({ token: null, user: null, status: "anonymous" });
  // Clear the single-boot cache so each test boots fresh.
  await useAuthStore.getState().logout();
});

describe("useAuthStore register (CU-12)", () => {
  it("auto-establishes the session with no second login call", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(201, { token: "fresh-token", user: USER }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await useAuthStore
      .getState()
      .register("Ada Modeler", "ada@example.com", "Modeler-2026!");

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.token).toBe("fresh-token");
    expect(state.user).toEqual(USER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/auth/register");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Ada Modeler",
      email: "ada@example.com",
      password: "Modeler-2026!",
    });
  });

  it("surfaces a generic 409 without field errors on duplicates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(409, {
          error: "CONFLICT",
          message: "Registration unavailable",
        }),
      ),
    );

    const failure = await useAuthStore
      .getState()
      .register("Someone Else", "ada@example.com", "Modeler-2026!")
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(failure).toBeInstanceOf(AuthRegisterError);
    expect((failure as AuthRegisterError).status).toBe(409);
    expect((failure as AuthRegisterError).fields).toBeUndefined();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("carries 400 field errors for the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(400, {
          error: "INVALID_PARAMS",
          message: "Invalid password: Password must contain a symbol",
          fields: { password: "Password must contain a symbol" },
        }),
      ),
    );

    const failure = await useAuthStore
      .getState()
      .register("Ada Modeler", "ada@example.com", "weakpass1")
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(failure).toBeInstanceOf(AuthRegisterError);
    expect((failure as AuthRegisterError).status).toBe(400);
    expect((failure as AuthRegisterError).fields).toEqual({
      password: "Password must contain a symbol",
    });
    expect(useAuthStore.getState().status).toBe("anonymous");
  });
});

describe("useAuthStore loadSession (single boot)", () => {
  it("restores the session once across concurrent boots", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/auth/refresh")) {
        return jsonResponse(200, { token: "restored-token", user: USER });
      }
      return jsonResponse(401, { error: "UNAUTHORIZED" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = useAuthStore.getState();
    await Promise.all([store.loadSession(), store.loadSession()]);
    await store.loadSession();

    const refreshCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/api/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().token).toBe("restored-token");
  });

  it("stays anonymous when nothing is restorable", async () => {
    await useAuthStore.getState().loadSession();
    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(useAuthStore.getState().token).toBeNull();
  });
});
