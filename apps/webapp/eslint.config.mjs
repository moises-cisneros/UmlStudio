// @ts-check
import globals from "globals"
import pluginJs from "@eslint/js"
import tseslint from "typescript-eslint"
import eslintReact from "@eslint-react/eslint-plugin"
import reactHooks from "eslint-plugin-react-hooks"
import pluginQuery from "@tanstack/eslint-plugin-query"

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      ".DerivedData*/**",
      "ios/**",
      "android/**",
      "src/routeTree.gen.ts",
    ],
  },
  { files: ["**/*.{js,ts,tsx}"] },
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginQuery.configs["flat/recommended"],
  eslintReact.configs["recommended-typescript"],
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "@eslint-react/error-boundaries": "off",
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/purity": "off",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/set-state-in-render": "off",
      "@eslint-react/static-components": "off",
      "@eslint-react/unsupported-syntax": "off",
      "@eslint-react/use-memo": "off",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mui/*", "@mui"],
              message:
                "MUI is removed from the webapp. Use @umlstudio/ui (Base UI) primitives and lucide-react icons instead.",
            },
            {
              group: ["@emotion/*", "@emotion"],
              message:
                "Emotion is removed from the webapp. Style with Tailwind utilities and the shared --umlstudio-*/--home-* tokens.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/components/home/DiagramCard.tsx",
      "src/components/home/DiagramGallery.tsx",
      "src/components/modals/TemplateThumbnail.tsx",
      "src/components/navbar/Navbar.tsx",
      "src/components/navbar/useDiagramTitle.ts",
      "src/components/navbar/MobileIslands.tsx",
      "src/components/versioning/VersionDrawer.tsx",
      "src/hooks/useRegionHost.ts",
      "src/pages/UmlStudioShared.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
]
