import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { periksaKunci, type CoverStore } from "./store";

const EKSTENSI: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const JENIS: Record<string, string> = Object.fromEntries(Object.entries(EKSTENSI).map(([j, e]) => [e, j]));

/** Sampul di berkas lokal (dev tanpa BLOB_READ_WRITE_TOKEN). Jenis isi dibaca dari ekstensi kunci. */
export function createLocalFsCoverStore(folder: string): CoverStore {
  return {
    async put(kunci, bytes) {
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, periksaKunci(kunci)), bytes);
    },
    async get(kunci) {
      const nama = periksaKunci(kunci);
      try {
        const bytes = new Uint8Array(await readFile(join(folder, nama)));
        const ekstensi = nama.split(".").pop() ?? "";
        return { bytes, contentType: JENIS[ekstensi] ?? "application/octet-stream" };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
  };
}
