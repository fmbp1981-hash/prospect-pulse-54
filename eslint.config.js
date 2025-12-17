import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      // Projeto duplicado dentro do repo (não deve ser lintado)
      "prospect-pulse-54/**",
      // Backend/edge functions (Deno) e arquivos de suporte
      "supabase/**",
      "**/*.backup.ts",
      "vite.config.ts.timestamp-*",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Este repo exporta HOCs/helpers junto com componentes (padrão shadcn).
      // A regra gera muitos falsos positivos e não afeta o build/runtime.
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
