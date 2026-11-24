import { eq } from "drizzle-orm";
import {
  KelolaDitolakError,
  POLA_DDC,
  aturanBaruSchema,
  aturanUbahSchema,
  type AturanKategoriDto,
  type JenisAturan,
  type KelolaTransport,
} from "@/lib/kelola-protocol";
import { aturanKategori, kategori } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { idValid, parse, sekarangServer, tidakDitemukan } from "./galat";

type Row = typeof aturanKategori.$inferSelect;

const dto = (a: Row): AturanKategoriDto => ({
  id: a.id,
  jenis: a.jenis as JenisAturan,
  pola: a.pola,
  kategoriId: a.kategoriId,
  prioritas: a.prioritas,
  dihapus: a.dihapus,
});

/** Kelas DDC tidak peka huruf besar; kata kunci subjek disimpan apa adanya. */
const normalkan = (jenis: JenisAturan, pola: string) => (jenis === "ddc" ? pola.toLowerCase() : pola);

/** Aturan hanya boleh menunjuk Kategori yang masih aktif. */
async function pastikanKategoriAktif(db: Db, kategoriId: string) {
  const [k] = idValid(kategoriId) ? await db.select().from(kategori).where(eq(kategori.id, kategoriId)) : [];
  if (!k || k.dihapus || k.diarsipkan) {
    throw new KelolaDitolakError("tidak-valid", "kategoriId", "Pilih Kategori yang masih aktif");
  }
}

async function ambil(db: Db, id: string) {
  const [a] = idValid(id) ? await db.select().from(aturanKategori).where(eq(aturanKategori.id, id)) : [];
  if (!a || a.dihapus) throw tidakDitemukan("Aturan Kategori");
  return a;
}

export function aturanApi(db: Db): KelolaTransport["aturanKategori"] {
  return {
    async buat(input) {
      const data = parse(aturanBaruSchema, input);
      await pastikanKategoriAktif(db, data.kategoriId);
      const [a] = await db
        .insert(aturanKategori)
        .values({ id: crypto.randomUUID(), ...data, pola: normalkan(data.jenis, data.pola) })
        .returning();
      return dto(a);
    },

    async ubah(id, perubahan) {
      const data = parse(aturanUbahSchema, perubahan);
      const sekarang = await ambil(db, id);
      const jenis = sekarang.jenis as JenisAturan;
      const pola = data.pola === undefined ? undefined : normalkan(jenis, data.pola);
      if (jenis === "ddc" && pola !== undefined && !POLA_DDC.test(pola)) {
        throw new KelolaDitolakError(
          "tidak-valid",
          "pola",
          "Kelas DDC berupa tiga digit (155) atau dengan x (2xx, 15x)",
        );
      }
      if (data.kategoriId !== undefined) await pastikanKategoriAktif(db, data.kategoriId);
      const [a] = await db
        .update(aturanKategori)
        .set({ ...data, pola, updatedAt: sekarangServer })
        .where(eq(aturanKategori.id, id))
        .returning();
      return dto(a);
    },

    /** Baris tetap ada sebagai penanda hapus untuk pull. */
    async hapus(id) {
      await ambil(db, id);
      const [a] = await db
        .update(aturanKategori)
        .set({ dihapus: true, updatedAt: sekarangServer })
        .where(eq(aturanKategori.id, id))
        .returning();
      return dto(a);
    },
  };
}
