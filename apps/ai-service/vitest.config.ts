import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

// Plain-object config (no `vitest/config` import): apps/ai-service is a
// pnpm-ignored polyglot app, so workspace module resolution is unavailable
// here. The runner (core workspace vitest) loads this file by path.
export default {
  root: dir,
  resolve: {
    alias: {
      // Reuse core's Ajv build; ai-service has no node_modules of its own.
      ajv: resolve(dir, "../../packages/core/node_modules/ajv/dist/ajv.js"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
};
