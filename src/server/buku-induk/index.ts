import { asc, eq } from "drizzle-orm";
import { susunBukuInduk, type BarisBukuInduk } from "@/lib/buku-induk";
import type { Asal } from "@/lib/buku-fields";
import type { JenisPenyiangan } from "@/lib/penyiangan-protocol";
import { buku, bukuKontributor, eksemplar, kategori, kontributor } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { bukuIndukCsv } from "./csv";
import { bukuIndukPdf } from "./pdf";

export type FilterBukuInduk = { tahun?: number | null };

/**
 * Seam: API Buku Induk (ekspor). Hanya online (ADR 0004). Isinya hanya
 * Eksemplar yang sudah ada di server, jadi yang masih Menunggu Sinkron di
 * perangkat belum ikut; mereka belum punya Nomor Induk. Urutan dan filter
 * tahun sama dengan halaman Buku Induk di perangkat (`susunBukuInduk`).
 */
export function createBukuIndukApi(db: Db) {
  async function baris(filter: FilterBukuInduk = {}) {
    const rows = await db
      .select({ e: eksemplar, b: buku, k: kategori })
      .from(eksemplar)
      .innerJoin(buku, eq(buku.id, eksemplar.bukuId))
      .innerJoin(kategori, eq(kategori.id, eksemplar.kategoriId));
    const utama = await db
      .select({ bukuId: bukuKontributor.bukuId, nama: kontributor.nama, urutan: bukuKontributor.urutan, utama: bukuKontributor.utama })
      .from(bukuKontributor)
      .innerJoin(kontributor, eq(kontributor.id, bukuKontributor.kontributorId))
      .orderBy(asc(bukuKontributor.urutan));
    const pengarang = new Map<string, string>();
    for (const u of utama) if (u.utama || !pengarang.has(u.bukuId)) pengarang.set(u.bukuId, u.nama);

    const semua = rows.map(
      ({ e, b, k }): BarisBukuInduk => ({
        eksemplarId: e.id,
        bukuId: b.id,
        nomorInduk: e.nomorInduk,
        judul: b.judul,
        pengarang: pengarang.get(b.id) ?? "",
        kategori: { kode: k.kode, nama: k.nama },
        tahunPencatatan: e.tahunPencatatan,
        waktuDicatat: e.waktuDicatatPerangkat.toISOString(),
        tanggalMasuk: e.tanggalMasuk,
        asal: e.asal as Asal | null,
        harga: e.harga,
        status: e.status as "aktif" | "keluar",
        menungguSinkron: false,
        penyiangan:
          e.status === "keluar" && e.penyianganJenis && e.penyianganTanggal
            ? { jenis: e.penyianganJenis as JenisPenyiangan, tanggal: e.penyianganTanggal, alasan: e.penyianganAlasan }
            : null,
      }),
    );
    return susunBukuInduk(semua, filter).baris;
  }

  const judul = (f: FilterBukuInduk) => (f.tahun ? `Buku Induk ${f.tahun}` : "Buku Induk");

  return {
    baris,
    csv: async (filter: FilterBukuInduk = {}) => bukuIndukCsv(await baris(filter)),
    pdf: async (filter: FilterBukuInduk = {}) => bukuIndukPdf(await baris(filter), judul(filter)),
  };
}

export type BukuIndukApi = ReturnType<typeof createBukuIndukApi>;
