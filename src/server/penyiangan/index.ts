import { and, eq } from "drizzle-orm";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { penyianganSchema, type PenyianganTransport } from "@/lib/penyiangan-protocol";
import { eksemplar } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { eksemplarDto } from "@/server/sync/dto";
import { idValid, parse, sekarangServer, tidakDitemukan } from "@/server/kelola/galat";

/**
 * Seam: API Penyiangan. Mengeluarkan Eksemplar dari koleksi aktif lewat
 * endpoint biasa, hanya online (ADR 0004). Baris Eksemplar tetap ada dan
 * Nomor Induknya tidak disentuh; penghitung Nomor Induk tidak pernah mundur,
 * jadi nomor yang keluar tidak dipakai ulang (ADR 0001).
 */
export function createPenyianganApi(db: Db): PenyianganTransport {
  return {
    async siangi(eksemplarId, input) {
      const data = parse(penyianganSchema, input);
      if (!idValid(eksemplarId)) throw tidakDitemukan("Eksemplar");

      // Pembaruan bersyarat (status aktif) menyerialkan dua Penyiangan bersamaan.
      const [baris] = await db
        .update(eksemplar)
        .set({
          status: "keluar",
          penyianganJenis: data.jenis,
          penyianganTanggal: data.tanggal,
          penyianganAlasan: data.alasan ?? null,
          updatedAt: sekarangServer,
        })
        .where(and(eq(eksemplar.id, eksemplarId), eq(eksemplar.status, "aktif")))
        .returning();
      if (baris) return eksemplarDto(baris);

      const [ada] = await db.select({ id: eksemplar.id }).from(eksemplar).where(eq(eksemplar.id, eksemplarId));
      if (!ada) throw tidakDitemukan("Eksemplar");
      throw new KelolaDitolakError("konflik", null, "Eksemplar ini sudah keluar dari koleksi");
    },
  };
}

export type PenyianganApi = ReturnType<typeof createPenyianganApi>;
