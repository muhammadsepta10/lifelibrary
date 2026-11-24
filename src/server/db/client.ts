import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import ws from "ws";
import * as schema from "./schema";
import type { Db } from "./types";

export const PGLITE_DIR = "./.data/pglite";

export type DbHandle = { db: Db; kind: "neon" | "pglite"; close: () => Promise<void> };

/**
 * Produksi/Neon bila DATABASE_URL ada (Pool WebSocket: Nomor Induk butuh
 * transaksi interaktif, yang tidak ada di neon-http). Tanpa DATABASE_URL:
 * PGlite berkas lokal untuk dev. Di produksi tanpa DATABASE_URL kita menolak,
 * karena filesystem Vercel tidak persisten.
 */
export function openDb(databaseUrl: string | undefined): DbHandle {
  if (databaseUrl) {
    if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: databaseUrl });
    return {
      db: drizzleNeon(pool, { schema }) as unknown as Db,
      kind: "neon",
      close: () => pool.end(),
    };
  }
  if (process.env.NODE_ENV === "production" && process.env.USE_PGLITE !== "1") {
    throw new Error("DATABASE_URL wajib diisi di produksi");
  }
  mkdirSync(".data", { recursive: true });
  const client = new PGlite(PGLITE_DIR);
  return {
    db: drizzlePglite(client, { schema }) as unknown as Db,
    kind: "pglite",
    close: () => client.close(),
  };
}
