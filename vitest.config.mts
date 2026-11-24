import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "local",
          include: ["tests/local/**/*.test.ts"],
          setupFiles: ["tests/setup/fake-idb.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "sync",
          include: ["tests/sync/**/*.test.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
      {
        extends: true,
        test: {
          name: "auth",
          include: ["tests/auth/**/*.test.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/fake-idb.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
    ],
  },
});
