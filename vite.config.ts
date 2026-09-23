import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: [
      ".t3-live",
      ".intentional/**",
      "CHANGELOG.md",
      "dist",
      "node_modules",
      "pnpm-lock.yaml",
      "*.tsbuildinfo",
    ],
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: [".t3-live", "dist", "node_modules", "pnpm-lock.yaml", "*.tsbuildinfo"],
    plugins: ["eslint", "oxc", "unicorn", "typescript"],
    categories: {
      correctness: "warn",
      suspicious: "warn",
      perf: "warn",
    },
    rules: {
      "unicorn/no-array-sort": "off",
      "unicorn/consistent-function-scoping": "off",
      "oxc/no-map-spread": "off",
      "eslint/no-shadow": "off",
      "eslint/no-await-in-loop": "off",
      "eslint/no-underscore-dangle": "off",
      "typescript/consistent-return": "off",
      "typescript/no-base-to-string": "off",
      "typescript/no-floating-promises": "off",
      "typescript/no-unnecessary-type-assertion": "off",
      "typescript/no-unsafe-type-assertion": "off",
      "typescript/require-array-sort-compare": "off",
      "typescript/restrict-template-expressions": "off",
      "typescript/unbound-method": "off",
    },
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: false,
      typeCheck: false,
    },
  },
});
