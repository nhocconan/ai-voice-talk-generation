// @ts-check
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import nextPlugin from "@next/eslint-plugin-next"
import importPlugin from "eslint-plugin-import"

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "apps/web/next.config.ts",
      "apps/web/playwright.config.ts",
      "apps/web/postcss.config.mjs",
      "apps/web/tests/e2e/global-setup.ts",
      "apps/web/vitest.config.ts",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-deprecated": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/dot-notation": "off",
      "no-console": "off",
      "import/no-default-export": "error",
      "import/consistent-type-specifier-style": "off",
    },
  },

  // Next.js app — allow default exports for page/layout/route files
  {
    files: ["apps/web/src/app/**/*.tsx", "apps/web/src/app/**/*.ts", "apps/web/next.config.ts"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "import/no-default-export": "off",
    },
  },

  // Test files
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/e2e/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // Config files at root
  {
    files: [
      "**/*.config.mjs",
      "**/*.config.js",
      "**/*.config.ts",
      "**/global-setup.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "import/no-default-export": "off",
    },
  },

  {
    files: [
      "apps/web/src/i18n/request.ts",
      "apps/web/src/middleware.ts",
      "apps/web/vitest.config.ts",
    ],
    rules: {
      "import/no-default-export": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
)
