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
  // NOTE (diagnóstico suíte): o override anterior
  // `oxc: { jsx: { runtime: "automatic" } }` era ignorado pelo toolchain
  // instalado (vitest 4.1.11 + vite 8.3.0): com tsconfig `jsx: preserve`
  // (exigido pelo Next), arquivos .tsx caíam em transform clássico
  // (`React.createElement`) — invisível enquanto nenhum teste avaliava
  // JSX em runtime. A chave `esbuild.jsx` abaixo é a honrada e tipada.
  esbuild: {
    jsx: "automatic",
  },
} satisfies ViteUserConfig);
