import { createAuth, type Auth } from "./auth";
import { openDb, type DbHandle } from "./db/client";
import { env } from "./env";
import { createKelolaApi, type KelolaApi } from "./kelola";
import { createBukuIndukApi, type BukuIndukApi } from "./buku-induk";
import { createPenyianganApi, type PenyianganApi } from "./penyiangan";
import { singletonGlobal } from "./singleton";
import { createSyncApi, type SyncApi } from "./sync";

type Runtime = {
  handle: DbHandle;
  auth: Auth;
  sync: SyncApi;
  kelola: KelolaApi;
  penyiangan: PenyianganApi;
  bukuInduk: BukuIndukApi;
};

export function runtime(): Runtime {
  return singletonGlobal("__lifelibrary", () => {
    const e = env();
    const handle = openDb(e.DATABASE_URL);
    return {
      handle,
      auth: createAuth(handle.db, { secret: e.AUTH_SECRET, baseURL: e.BETTER_AUTH_URL }),
      sync: createSyncApi(handle.db),
      kelola: createKelolaApi(handle.db),
      penyiangan: createPenyianganApi(handle.db),
      bukuInduk: createBukuIndukApi(handle.db),
    };
  });
}
