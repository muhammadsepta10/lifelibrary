import { defineConfig } from "vitest/config";

/**
 * Pemeriksaan PDF hasil cetak (Chrome headless + poppler). Sengaja di luar
 * `pnpm test` karena butuh Chrome dan pdftoppm di mesin: jalankan `pnpm test:pdf`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/pdf/**/*.test.tsx"],
    setupFiles: ["tests/setup/fake-idb.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
