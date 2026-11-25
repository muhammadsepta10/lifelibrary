import { and, eq, isNull } from "drizzle-orm";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { penyianganSchema, type PenyianganTransport } from "@/lib/penyiangan-protocol";
import { eksemplar, peminjaman } from "@/server/db/schema";
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

      return db.transaction(async (tx) => {
        // Baris Eksemplar dikunci: Penyiangan dan peminjaman bersamaan saling menunggu,
        // dan dua Penyiangan bersamaan diserialkan.
        const [baris] = await tx.select().from(eksemplar).where(eq(eksemplar.id, eksemplarId)).for("update");
        if (!baris) throw tidakDitemukan("Eksemplar");
        if (baris.status !== "aktif") {
          throw new KelolaDitolakError("konflik", null, "Eksemplar ini sudah keluar dari koleksi");
        }
        const [dipinjam] = await tx
          .select({ id: peminjaman.id })
          .from(peminjaman)
          .where(and(eq(peminjaman.eksemplarId, eksemplarId), isNull(peminjaman.tanggalKembali)))
          .limit(1);
        if (dipinjam) {
          throw new KelolaDitolakError(
            "konflik",
            null,
            "Eksemplar ini sedang dipinjam. Kembalikan dulu sebelum mengeluarkannya",
          );
        }
        const [keluar] = await tx
          .update(eksemplar)
          .set({
            status: "keluar",
            penyianganJenis: data.jenis,
            penyianganTanggal: data.tanggal,
            penyianganAlasan: data.alasan ?? null,
            updatedAt: sekarangServer,
          })
          .where(eq(eksemplar.id, eksemplarId))
          .returning();
        return eksemplarDto(keluar);
      });
    },
  };
}

export type PenyianganApi = ReturnType<typeof createPenyianganApi>;
