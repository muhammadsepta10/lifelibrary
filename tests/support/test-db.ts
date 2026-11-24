import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import { seedKategoriPreset } from "@/server/db/seed";

/** Postgres sungguhan di memori (PGlite), sudah dimigrasi dan berisi preset Kategori. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedKategoriPreset(db);
  return { db, close: () => client.close() };
}
