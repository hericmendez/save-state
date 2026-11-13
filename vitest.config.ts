import path from "node:path";
import { defineConfig, type ViteUserConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // .tsx entra só para os testes de regressão de navegação do catálogo
    // (jsdom por arquivo via `// @vitest-environment jsdom`); o restante
    // da suíte segue em node, sem DOM.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  // JSX sob vitest 4.1.11 + vite 8.3.0: o Vitest injeta `oxc: { target }`
  // por padrão, e com `oxc` presente o Vite IGNORA `esbuild` por completo
  // (warning "Both esbuild and oxc options were set"). Resultado: .tsx de
  // src (ex. components/RPGUI/Button.tsx) chegava sem transform no
  // vite:import-analysis — "Failed to parse source", com tsconfig
  // `jsx: preserve` (exigido pelo Next, intocado). A correção é declarar
  // o JSX no canal que o toolchain realmente usa (`oxc.jsx`), não no
  // `esbuild` morto.
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
      development: false,
    },
  },
} satisfies ViteUserConfig);
