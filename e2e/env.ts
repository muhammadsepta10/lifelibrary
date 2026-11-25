import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
const BERKAS = ".data/e2e/env.json";

export type EnvE2E = { authSecret: string; ownerEmail: string; ownerPassword: string };

/**
 * Rahasia E2E dibuat sendiri di mesin ini (acak, disimpan di `.data/e2e`,
 * berkas yang diabaikan git) dan tidak pernah dicetak. Config dievaluasi
 * ulang di tiap worker, jadi nilainya dibaca dari berkas, bukan dibuat ulang.
 */
export function envE2E(): EnvE2E {
  if (!existsSync(BERKAS)) {
    mkdirSync(dirname(BERKAS), { recursive: true });
    const baru: EnvE2E = {
      authSecret: randomBytes(32).toString("base64"),
      ownerEmail: "pemilik-e2e@example.test",
      ownerPassword: randomBytes(18).toString("base64url"),
    };
    writeFileSync(BERKAS, JSON.stringify(baru), { mode: 0o600 });
  }
  return JSON.parse(readFileSync(BERKAS, "utf8")) as EnvE2E;
}
