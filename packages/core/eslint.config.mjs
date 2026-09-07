// @ts-check
import globals from "globals"
import pluginJs from "@eslint/js"
import tseslint from "typescript-eslint"
import eslintReact from "@eslint-react/eslint-plugin"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  { ignores: ["node_modules", "dist"] },
  { files: ["**/*.{js,ts,tsx}"] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
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
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@xyflow/react",
              importNames: ["NodeResizer"],
              message:
                "Import NodeResizer from @/nodes/wrappers. React Flow's renders resize controls on axes a node has pinned, which offers a cursor and a drag that do nothing.",
            },
          ],
          patterns: [
            {
              group: ["@mui/*", "@mui"],
              message:
                "MUI is removed from the library. Use Base UI (@base-ui/react) primitives and lucide-react icons instead.",
            },
            {
              group: ["@emotion/*", "@emotion"],
              message:
                "The library styles with raw CSS + --umlstudio-* tokens, never CSS-in-JS. Do not import Emotion.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "lib/components/collaboration/**/*.tsx",
      "lib/components/popovers/**/*EditPopover.tsx",
      "lib/edges/GenericEdge.tsx",
      "lib/hooks/useRemoteDraggingNodes.ts",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
]
