import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "design/**",
      "drizzle/meta/**",
      "node_modules/**",
      "playwright-report/**",
      "src/app/.well-known/workflow/**",
      "test-results/**"
    ],
  },
];

export default eslintConfig;
