import { and, eq, ne } from "drizzle-orm";
import {
  KelolaDitolakError,
  kategoriBaruSchema,
  kategoriUbahSchema,
  type KategoriDto,
  type KelolaTransport,
} from "@/lib/kelola-protocol";
import { aturanKategori, eksemplar, kategori } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { idValid, masukAntreanCetak, parse, pelanggaranUnik, sekarangServer, tidakDitemukan } from "./galat";

type Row = typeof kategori.$inferSelect;

const dto = (k: Row): KategoriDto => ({
  id: k.id,
  kode: k.kode,
  nama: k.nama,
  warna: k.warna,
  diarsipkan: k.diarsipkan,
  dihapus: k.dihapus,
});

const kodeBentrok = () =>
  new KelolaDitolakError("konflik", "kode", "Kode ini sudah dipakai Kategori lain");

/** Kode harus unik di antara Kategori aktif (belum diarsipkan, belum dihapus). */
async function pastikanKodeBebas(db: Db, kode: string, kecuali?: string) {
  const [ada] = await db
    .select({ id: kategori.id })
    .from(kategori)
    .where(
      and(
        eq(kategori.kode, kode),
        eq(kategori.diarsipkan, false),
        eq(kategori.dihapus, false),
        kecuali ? ne(kategori.id, kecuali) : undefined,
      ),
    );
  if (ada) throw kodeBentrok();
}

async function ambil(db: Db, id: string) {
  const [k] = idValid(id) ? await db.select().from(kategori).where(eq(kategori.id, id)) : [];
  if (!k || k.dihapus) throw tidakDitemukan("Kategori");
  return k;
}

export function kategoriApi(db: Db): KelolaTransport["kategori"] {
  return {
    async buat(input) {
      const data = parse(kategoriBaruSchema, input);
      await pastikanKodeBebas(db, data.kode);
      try {
        const [k] = await db
          .insert(kategori)
          .values({ id: crypto.randomUUID(), ...data })
          .returning();
        return dto(k);
      } catch (e) {
        if (pelanggaranUnik(e)) throw kodeBentrok();
        throw e;
      }
    },

    async ubah(id, perubahan) {
      const data = parse(kategoriUbahSchema, perubahan);
      const sekarang = await ambil(db, id);
      // Kode hanya diperiksa bila akan aktif dengan kode itu (ganti kode atau dipulihkan).
      const jadiAktif = !(data.diarsipkan ?? sekarang.diarsipkan);
      const kode = data.kode ?? sekarang.kode;
      if (jadiAktif && (data.kode !== undefined || sekarang.diarsipkan)) {
        await pastikanKodeBebas(db, kode, id);
      }
      try {
        return await db.transaction(async (tx) => {
          const [k] = await tx
            .update(kategori)
            .set({ ...data, updatedAt: sekarangServer })
            .where(eq(kategori.id, id))
            .returning();
          if (data.kode !== undefined && data.kode !== sekarang.kode) {
            // Kode Kategori ada di Nomor Panggil: Label semua Eksemplar aktifnya
            // jadi usang. Nomor Induk tidak berubah (ADR 0001).
            await tx
              .update(eksemplar)
              .set(masukAntreanCetak())
              .where(and(eq(eksemplar.kategoriId, id), eq(eksemplar.status, "aktif")));
          }
          return dto(k);
        });
      } catch (e) {
        if (pelanggaranUnik(e)) throw kodeBentrok();
        throw e;
      }
    },

    /**
     * Hanya Kategori yang belum pernah dipakai Eksemplar. Baris tetap ada
     * sebagai penanda hapus supaya perangkat ikut menghapusnya lewat pull;
     * Aturan Kategori yang menunjuknya ikut dihapus.
     */
    async hapus(id) {
      await ambil(db, id);
      return db.transaction(async (tx) => {
        const [dipakai] = await tx
          .select({ id: eksemplar.id })
          .from(eksemplar)
          .where(eq(eksemplar.kategoriId, id))
          .limit(1);
        if (dipakai) {
          throw new KelolaDitolakError(
            "konflik",
            null,
            "Kategori sudah dipakai Eksemplar, jadi tidak bisa dihapus. Arsipkan saja",
          );
        }
        await tx
          .update(aturanKategori)
          .set({ dihapus: true, updatedAt: sekarangServer })
          .where(eq(aturanKategori.kategoriId, id));
        const [k] = await tx
          .update(kategori)
          .set({ dihapus: true, updatedAt: sekarangServer })
          .where(eq(kategori.id, id))
          .returning();
        return dto(k);
      });
    },
  };
}
