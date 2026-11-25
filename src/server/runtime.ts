import { createAuth, type Auth } from "./auth";
import { openDb, type DbHandle } from "./db/client";
import { env } from "./env";
import { createKelolaApi, type KelolaApi } from "./kelola";
import { createPenyianganApi, type PenyianganApi } from "./penyiangan";
import { createSyncApi, type SyncApi } from "./sync";

type Runtime = { handle: DbHandle; auth: Auth; sync: SyncApi; kelola: KelolaApi; penyiangan: PenyianganApi };

// globalThis supaya HMR dev tidak membuka PGlite berkali-kali.
const g = globalThis as unknown as { __lifelibrary?: Runtime };

export function runtime(): Runtime {
  if (!g.__lifelibrary) {
    const e = env();
    const handle = openDb(e.DATABASE_URL);
    g.__lifelibrary = {
      handle,
      auth: createAuth(handle.db, { secret: e.AUTH_SECRET, baseURL: e.BETTER_AUTH_URL }),
      sync: createSyncApi(handle.db),
      kelola: createKelolaApi(handle.db),
      penyiangan: createPenyianganApi(handle.db),
    };
  }
  return g.__lifelibrary;
}
