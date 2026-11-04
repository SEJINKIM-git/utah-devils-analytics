import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 2026-10-23 기준 화면·API 코드에 `any`가 70곳 넘게 남아 있다 (Supabase 행을 any로 받는 오래된 코드).
      // 새 코드에는 쓰지 않되, 기존 코드 정리 전까지는 경고로 둔다. lib/와 tests/는 any 없이 유지한다.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["lib/**/*.ts", "tests/**/*.ts", "middleware.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);
