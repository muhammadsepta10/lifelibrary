import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { kategori } from "./schema";
import type { Db } from "./types";

/** Idempoten: tidak menimpa Kategori yang sudah diubah Pemilik. */
export async function seedKategoriPreset(db: Db) {
  await db
    .insert(kategori)
    .values(PRESET_KATEGORI.map((k) => ({ id: k.id, kode: k.kode, nama: k.nama, warna: k.warna })))
    .onConflictDoNothing();
}
