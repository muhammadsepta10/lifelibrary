import { join } from "node:path";
import { createBlobCoverStore } from "./blob";
import { createLocalFsCoverStore } from "./local-fs";
import type { CoverStore } from "./store";

export { createLocalFsCoverStore } from "./local-fs";
export { createMemoryCoverStore, KUNCI_SAMPUL, type CoverStore, type SampulTersimpan } from "./store";

/** Vercel Blob bila BLOB_READ_WRITE_TOKEN ada, kalau tidak berkas lokal di .data/covers. */
export function createCoverStoreFromEnv(env: NodeJS.ProcessEnv = process.env): CoverStore {
  const token = env.BLOB_READ_WRITE_TOKEN;
  return token ? createBlobCoverStore(token) : createLocalFsCoverStore(join(process.cwd(), ".data", "covers"));
}
