import { eq } from "drizzle-orm";
import {
  lokasiBaruSchema,
  lokasiUbahSchema,
  type KelolaTransport,
  type LokasiDto,
} from "@/lib/kelola-protocol";
import { lokasi } from "@/server/db/schema";
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
     * Baris tetap ada sebagai penanda hapus untuk pull. Belum ada Eksemplar
     * yang menunjuk Lokasi; saat itu ada, penghapusan Lokasi terpakai harus
     * diatur di sini.
     */
    async hapus(id) {
      await pastikanAda(db, id);
      const [l] = await db
        .update(lokasi)
        .set({ dihapus: true, updatedAt: sekarangServer })
        .where(eq(lokasi.id, id))
        .returning();
      return dto(l);
    },
  };
}
