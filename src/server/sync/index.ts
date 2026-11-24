import type { Db } from "@/server/db/types";
import { pull } from "./pull";
import { push } from "./push";

/** Seam: API Sinkronisasi. Dipakai route handler dan tes integrasi. */
export function createSyncApi(db: Db) {
  return {
    push: (input: unknown) => push(db, input),
    pull: (kursor: string | null) => pull(db, kursor),
  };
}

export type SyncApi = ReturnType<typeof createSyncApi>;
