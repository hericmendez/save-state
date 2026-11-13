import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "tests/e2e-perf/.report/**", "tests/e2e-perf/.results/**", "tests/e2e-perf/.auth/**", "tests/e2e-perf/test-results/**", "lighthouse-report/**"] },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
