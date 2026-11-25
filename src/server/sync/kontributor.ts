import { eq, inArray } from "drizzle-orm";
import type { KontributorDto } from "@/lib/buku-fields";
import { bukuKontributor, kontributor } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import type { Tx } from "./tx";

/** Kontributor tiap Buku, terurut menurut urutan tampil. */
export async function muatKontributor(db: Db | Tx, bukuIds: string[]): Promise<Map<string, KontributorDto[]>> {
  const hasil = new Map<string, KontributorDto[]>();
  if (bukuIds.length === 0) return hasil;
  const baris = await db
    .select({
      bukuId: bukuKontributor.bukuId,
      id: kontributor.id,
      nama: kontributor.nama,
      peran: bukuKontributor.peran,
      urutan: bukuKontributor.urutan,
      utama: bukuKontributor.utama,
    })
    .from(bukuKontributor)
    .innerJoin(kontributor, eq(kontributor.id, bukuKontributor.kontributorId))
    .where(inArray(bukuKontributor.bukuId, bukuIds));
  for (const k of baris.sort((a, b) => a.urutan - b.urutan)) {
    const daftar = hasil.get(k.bukuId) ?? [];
    daftar.push({ id: k.id, nama: k.nama, peran: k.peran as KontributorDto["peran"], utama: k.utama });
    hasil.set(k.bukuId, daftar);
  }
  return hasil;
}
