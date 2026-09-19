import { create } from "zustand";
import { serverURL } from "@/constants";

export interface AuthUserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  color?: string;
}

type AuthStatus = "anonymous" | "authenticating" | "authenticated";

interface AuthState {
  /** Access JWT, memory-only by design: never persisted, never logged. */
  token: string | null;
  user: AuthUserProfile | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  loadSession: () => Promise<void>;
  updateProfile: (data: {
    name?: string;
    avatar?: string;
    color?: string;
  }) => Promise<AuthUserProfile>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
}

interface SessionResponse {
  token: string;
  user: AuthUserProfile;
}

interface ErrorResponse {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
}

/** Registration failure carrying HTTP status plus per-field errors. */
export class AuthRegisterError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AuthRegisterError";
    this.status = status;
    if (fields) this.fields = fields;
  }
}

async function readErrorBody(res: Response): Promise<ErrorResponse> {
  try {
    return (await res.json()) as ErrorResponse;
  } catch {
    return {};
  }
}

async function postSession(
  path:
    | "/api/auth/login"
    | "/api/auth/register"
    | "/api/auth/refresh"
    | "/api/auth/logout",
  body?: unknown,
): Promise<Response> {
  return fetch(`${serverURL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });
}

/**
 * Single-boot session restore. The first call performs the refresh; later
 * calls reuse the same promise so router gates never hammer `/refresh`.
 */
let bootPromise: Promise<void> | null = null;

function resetBoot(): void {
  bootPromise = null;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  status: "anonymous",

  login: async (email: string, password: string) => {
    set({ status: "authenticating" });
    try {
      const res = await postSession("/api/auth/login", { email, password });
      if (!res.ok) {
        set({ token: null, user: null, status: "anonymous" });
        if (res.status === 401) {
          throw new Error(
            "Invalid credentials. Check your email and password.",
          );
        }
        throw new Error(
          `Server returned status ${res.status}. Please try again.`,
        );
      }
      const data = (await res.json()) as SessionResponse;
      resetBoot();
      set({ token: data.token, user: data.user, status: "authenticated" });
    } catch (err: unknown) {
      set({ token: null, user: null, status: "anonymous" });
      if (
        err instanceof Error &&
        (err.name === "TypeError" || err.message.includes("fetch"))
      ) {
        throw new Error(
          "Unable to connect to backend server (port 8000). Ensure the backend is running.",
          {
            cause: err,
          },
        );
      }
      throw err;
    }
  },

  /**
   * Registration: submits signup and auto-establishes the returned
   * session — no second login call. 409 carries no field errors (generic
   * duplicate); 400 carries per-field errors for the form.
   */
  register: async (name: string, email: string, password: string) => {
    set({ status: "authenticating" });
    const res = await postSession("/api/auth/register", {
      name,
      email,
      password,
    });
    if (!res.ok) {
      const body = await readErrorBody(res);
      set({ token: null, user: null, status: "anonymous" });
      throw new AuthRegisterError(
        body.message ?? "Registration failed",
        res.status,
        body.fields,
      );
    }
    const data = (await res.json()) as SessionResponse;
    resetBoot();
    set({ token: data.token, user: data.user, status: "authenticated" });
  },

  logout: async () => {
    try {
      await postSession("/api/auth/logout");
    } finally {
      resetBoot();
      set({ token: null, user: null, status: "anonymous" });
    }
  },

  refresh: async () => {
    const res = await postSession("/api/auth/refresh");
    if (!res.ok) {
      set({ token: null, user: null, status: "anonymous" });
      return false;
    }
    const data = (await res.json()) as SessionResponse;
    set({ token: data.token, user: data.user, status: "authenticated" });
    return true;
  },

  loadSession: async () => {
    if (!bootPromise) {
      set({ status: "authenticating" });
      bootPromise = get()
        .refresh()
        .then((ok) => {
          if (!ok) set({ token: null, user: null, status: "anonymous" });
        })
        .catch(() => {
          set({ token: null, user: null, status: "anonymous" });
        });
    }
    await bootPromise;
  },

  updateProfile: async (data: {
    name?: string;
    avatar?: string;
    color?: string;
  }) => {
    const token = get().token;
    const res = await fetch(`${serverURL}/api/users/profile`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      credentials: "include",
    });
    if (!res.ok) {
      const errBody = await readErrorBody(res);
      throw new Error(errBody.message ?? "Failed to update profile");
    }
    const updated = (await res.json()) as AuthUserProfile;
    set((state) => ({
      user: state.user ? { ...state.user, ...updated } : updated,
    }));
    return updated;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const token = get().token;
    const res = await fetch(`${serverURL}/api/users/change-password`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ currentPassword, newPassword }),
      credentials: "include",
    });
    if (!res.ok) {
      const errBody = await readErrorBody(res);
      throw new Error(errBody.message ?? "Failed to change password");
    }
  },
}));

/** Non-React accessor for services (e.g. WebSocketManager) to read the token. */
export function currentAccessToken(): string | null {
  return useAuthStore.getState().token;
}
