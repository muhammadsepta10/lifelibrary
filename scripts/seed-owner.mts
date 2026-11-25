import "./load-env.mts";
import { createAuth } from "../src/server/auth";
import { seedOwner } from "../src/server/auth-seed";
import { openDb } from "../src/server/db/client";
import { env } from "../src/server/env";

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;
if (!email || !password) {
  console.error("OWNER_EMAIL dan OWNER_PASSWORD wajib diisi.");
  process.exit(1);
}

const e = env();
const handle = openDb(e.DATABASE_URL);
const auth = createAuth(handle.db, { secret: e.AUTH_SECRET, baseURL: e.BETTER_AUTH_URL });

try {
  await seedOwner(auth, { email, password });
  console.log("Akun Pemilik dibuat.");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
await handle.close();
