import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, envE2E, PORT } from "./e2e/env";

const e2e = envE2E();

/**
 * Smoke test E2E (`pnpm e2e`, bukan bagian `pnpm test`): `next start` hasil
 * build lokal dengan PGlite di `.data/e2e/pglite` yang selalu dibuat baru.
 * Tanpa Neon, tanpa rahasia dari luar, tanpa jaringan: pencarian metadata
 * dicegat di browser (lihat e2e/*.spec.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-ponsel",
      use: {
        ...devices["Pixel 7"],
        permissions: ["camera"],
        launchOptions: {
          // Kamera palsu supaya getUserMedia berhasil tanpa perangkat keras.
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: `rm -rf .data/e2e/pglite && pnpm db:migrate && pnpm db:seed-owner && pnpm start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Kosong = PGlite. Tidak pernah menyentuh Neon walau shell punya DATABASE_URL.
      DATABASE_URL: "",
      DATABASE_URL_AUTHENTICATOR: "",
      USE_PGLITE: "1",
      PGLITE_DIR: ".data/e2e/pglite",
      AUTH_SECRET: e2e.authSecret,
      BETTER_AUTH_URL: BASE_URL,
      OWNER_EMAIL: e2e.ownerEmail,
      OWNER_PASSWORD: e2e.ownerPassword,
      BLOB_READ_WRITE_TOKEN: "",
      GOOGLE_BOOKS_API_KEY: "",
    },
  },
});
