import type { Context, Handler } from "hono";
import type { z, ZodTypeAny } from "zod";
import type { AppEnv } from "../env.js";
import { Errors } from "../errors.js";

export interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export type Validated<S extends Schemas> = {
  [K in "body" | "query" | "params"]: S[K] extends ZodTypeAny
    ? z.infer<S[K]>
    : never;
};

export type TypedHandler<S extends Schemas> = (
  c: Context<AppEnv>,
  valid: Validated<S>,
) => Response | Promise<Response>;

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function validate<S extends Schemas>(
  schemas: S,
  handler: TypedHandler<S>,
): Handler<AppEnv> {
  return async (c) => {
    const valid: Partial<Record<"body" | "query" | "params", unknown>> = {};
    for (const key of ["body", "query", "params"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const input =
        key === "body"
          ? await readJsonBody(c)
          : key === "query"
            ? c.req.query()
            : c.req.param();
      const result = schema.safeParse(input);
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw Errors.invalidParams(`${key}: ${issues}`);
      }
      valid[key] = result.data;
    }
    return handler(c, valid as Validated<S>);
  };
}
