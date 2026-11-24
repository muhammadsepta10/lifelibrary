import "./load-env.mts";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { openDb } from "../src/server/db/client";
import { seedKategoriPreset } from "../src/server/db/seed";

// Hanya migrasi maju + seed preset Kategori (idempoten). Tidak ada operasi destruktif.
const handle = openDb(process.env.DATABASE_URL || undefined);
const folder = { migrationsFolder: "./drizzle" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = handle.db as any;
if (handle.kind === "neon") await migrateNeon(db, folder);
else await migratePglite(db, folder);
await seedKategoriPreset(handle.db);

console.log(`Migrasi selesai (${handle.kind}).`);
await handle.close();
