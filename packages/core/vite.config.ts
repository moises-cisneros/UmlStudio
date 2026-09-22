import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import dts from "vite-plugin-dts"
import { resolve } from "path"
import { readFileSync } from "fs"
import type { ExtractorMessage, IExtractorInvokeOptions } from "@microsoft/api-extractor"

const dtsInvokeOptions: IExtractorInvokeOptions = {
  messageCallback(message: ExtractorMessage) {
    if (message.messageId === "console-compiler-version-notice") {
      message.handled = true
    }
  },
}

function emitFontLicense(): Plugin {
  return {
    name: "umlstudio-emit-font-license",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "LICENSE-InterFont",
        source: readFileSync(resolve(__dirname, "../../assets/fonts/LICENSE-InterFont"), "utf8"),
      })
    },
  }
}

const REACT_PEERS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react/compiler-runtime",
  "react-dom/client",
  "@xyflow/react",
  "@xyflow/system",
]

const RUNTIME_DEPS = [
  /^@base-ui\/react(\/.*)?$/,
  "lucide-react",
  /^@dnd-kit\//,
  /^zustand(\/.*)?$/,
  "@chenglou/pretext",
]

const ROUTING_KERNEL =
  /packages\/core\/lib\/(?:utils\/geometry\/|utils\/(?:edgeUtils|connectionModes)\.ts|edges\/Connection\.ts)/

export default defineConfig({
  base: "./",
  plugins: [
    react({
      exclude: ROUTING_KERNEL,
      babel: { plugins: [["babel-plugin-react-compiler", { target: "19" }]] },
    }),
    dts({
      include: ["lib"],
      bundleTypes: {
        bundledPackages: ["@umlstudio/ui"],
        invokeOptions: dtsInvokeOptions,
      },
      aliasesExclude: [/^@umlstudio\/ui/],
    }),
    emitFontLicense(),
  ],
  build: {
    copyPublicDir: false,
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: (filePath) => (/\.woff2?($|\?)/.test(filePath) ? true : undefined),
    lib: {
      entry: {
        index: resolve(__dirname, "lib/index.tsx"),
        internals: resolve(__dirname, "lib/internals.ts"),
        export: resolve(__dirname, "lib/export/index.ts"),
        model: resolve(__dirname, "lib/model.ts"),
      },
      formats: ["es"],
      cssFileName: "style",
    },
    rollupOptions: {
      external: [
        /^@resvg\/resvg-wasm/,
        "yjs",
        /^y-protocols(\/.*)?$/,
        ...REACT_PEERS,
        ...RUNTIME_DEPS,
      ],
      output: {
        assetFileNames: "assets/[name][extname]",
        entryFileNames: "[name].js",
        banner: (chunk) => (chunk.name === "index" ? '"use client";' : ""),
      },
    },
    minify: true,
  },
  resolve: {
    alias: {
      "@/assets/fonts": resolve(__dirname, "../../assets/fonts"),
      "@fonts": resolve(__dirname, "../../assets/fonts"),
      "@": resolve(__dirname, "lib"),
      "@umlstudio/ui": resolve(__dirname, "../ui/src"),
    },
  },
})
