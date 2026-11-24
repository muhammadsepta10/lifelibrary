import { and, eq } from "drizzle-orm";
import {
  KelolaDitolakError,
  lokasiBaruSchema,
  lokasiUbahSchema,
  type KelolaTransport,
  type LokasiDto,
} from "@/lib/kelola-protocol";
import { eksemplar, lokasi } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { idValid, parse, sekarangServer, tidakDitemukan } from "./galat";

type Row = typeof lokasi.$inferSelect;

const dto = (l: Row): LokasiDto => ({ id: l.id, nama: l.nama, dihapus: l.dihapus });

async function pastikanAda(db: Db, id: string) {
  const [l] = idValid(id) ? await db.select().from(lokasi).where(eq(lokasi.id, id)) : [];
  if (!l || l.dihapus) throw tidakDitemukan("Lokasi");
}

export function lokasiApi(db: Db): KelolaTransport["lokasi"] {
  return {
    async buat(input) {
      const data = parse(lokasiBaruSchema, input);
      const [l] = await db
        .insert(lokasi)
        .values({ id: crypto.randomUUID(), ...data })
        .returning();
      return dto(l);
    },

    async ubah(id, perubahan) {
      const data = parse(lokasiUbahSchema, perubahan);
      await pastikanAda(db, id);
      const [l] = await db
        .update(lokasi)
        .set({ ...data, updatedAt: sekarangServer })
        .where(eq(lokasi.id, id))
        .returning();
      return dto(l);
    },

    /**
     * Baris tetap ada sebagai penanda hapus untuk pull. Lokasi yang masih
     * dipakai Eksemplar aktif tidak bisa dihapus: Pemilik memindahkannya dulu.
     */
    async hapus(id) {
      await pastikanAda(db, id);
      return db.transaction(async (tx) => {
        const dipakai = await tx
          .select({ id: eksemplar.id })
          .from(eksemplar)
          .where(and(eq(eksemplar.lokasiId, id), eq(eksemplar.status, "aktif")));
        if (dipakai.length > 0) {
          throw new KelolaDitolakError(
            "konflik",
            null,
            `Lokasi masih dipakai ${dipakai.length} Eksemplar. Pindahkan Eksemplar itu dulu`,
          );
        }
        const [l] = await tx
          .update(lokasi)
          .set({ dihapus: true, updatedAt: sekarangServer })
          .where(eq(lokasi.id, id))
          .returning();
        return dto(l);
      });
    },
  };
}
