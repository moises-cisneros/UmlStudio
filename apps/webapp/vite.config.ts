import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";

const umlstudioAliases = [
  { find: "assets", replacement: resolve(__dirname, "assets") },
  { find: "@fonts", replacement: resolve(__dirname, "../../assets/fonts") },
  {
    find: "@umlstudio/core",
    replacement: resolve(__dirname, "../../packages/core/lib"),
  },
  {
    find: "@umlstudio/ui",
    replacement: resolve(__dirname, "../../packages/ui/src"),
  },
];

const ROUTING_KERNEL =
  /packages\/core\/lib\/(?:utils\/geometry\/|utils\/(?:edgeUtils|connectionModes)\.ts|edges\/Connection\.ts)/;

const createUmlStudioAliasResolver = () => {
  const libraryRoot = `${resolve(__dirname, "../../packages/core").replace(/\\/g, "/")}/`;
  const libRoot = resolve(__dirname, "../../packages/core/lib");
  const webappRoot = resolve(__dirname, "src");
  const fontsRoot = resolve(__dirname, "../../assets/fonts");

  return {
    name: "umlstudio-alias-resolver",
    enforce: "pre" as const,
    async resolveId(source: string, importer?: string) {
      if (source.startsWith("@fonts/")) {
        return this.resolve(resolve(fontsRoot, source.slice(7)), importer, {
          skipSelf: true,
        });
      }
      if (source.startsWith("@/assets/fonts/")) {
        return this.resolve(resolve(fontsRoot, source.slice(15)), importer, {
          skipSelf: true,
        });
      }
      if (!source.startsWith("@/")) return null;
      const root =
        importer?.replace(/\\/g, "/").startsWith(libraryRoot) === true
          ? libRoot
          : webappRoot;
      return this.resolve(resolve(root, source.slice(2)), importer, {
        skipSelf: true,
      });
    },
  };
};

const webappPort = Number(process.env.UMLSTUDIO_WEBAPP_PORT || 5173);
const serverPort = Number(process.env.UMLSTUDIO_SERVER_PORT || 8000);
const wsPort = Number(process.env.UMLSTUDIO_WS_PORT || 4444);

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react({
      exclude: ROUTING_KERNEL,
      babel: { plugins: [["babel-plugin-react-compiler", { target: "19" }]] },
    }),
    tailwindcss(),
    createUmlStudioAliasResolver(),
  ],
  worker: {
    plugins: () => [createUmlStudioAliasResolver()],
  },
  resolve: {
    alias: umlstudioAliases,
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: webappPort,
    host: true,
    strictPort: false,
    fs: {
      allow: [
        resolve(__dirname, "..", ".."),
        resolve(__dirname, "..", "..", "packages", "core"),
      ],
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
      "/embed": {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://127.0.0.1:${wsPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@umlstudio/core"],
  },
});
