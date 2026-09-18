/**
 * Hono environment for the server. `Variables` are the per-request values our
 * middleware stashes on the context (`c.set` / `c.get`) — the Hono equivalent
 * of the `req.requestId` / `req.isOwner` augmentations the Express build used.
 */
import type { AuthProfile } from "../services/auth-service.js";

export interface AppEnv {
  Variables: {
    requestId: string;
    isOwner: boolean;
    user?: AuthProfile;
  };
}
