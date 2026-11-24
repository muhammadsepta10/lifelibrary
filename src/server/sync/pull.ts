import { asc, eq, gt, inArray } from "drizzle-orm";
import { aturanKategori, buku, bukuKontributor, eksemplar, kategori, kontributor, lokasi } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import type { AturanKategoriDto, BukuDto, EksemplarDto, KategoriDto, LokasiDto, PullResponse } from "@/lib/sync-protocol";

/** Perubahan sejak kursor (berdasarkan `updatedAt` server). Kursor null = semuanya. */
export async function pull(db: Db, kursor: string | null): Promise<PullResponse> {
  const sejak = kursor ? new Date(kursor) : null;
  if (sejak && Number.isNaN(sejak.getTime())) throw new Error("Kursor tidak valid");

  const kategoriRows = await db
    .select()
    .from(kategori)
    .where(sejak ? gt(kategori.updatedAt, sejak) : undefined)
    .orderBy(asc(kategori.updatedAt));
  const lokasiRows = await db
    .select()
    .from(lokasi)
    .where(sejak ? gt(lokasi.updatedAt, sejak) : undefined)
    .orderBy(asc(lokasi.updatedAt));
  const aturanRows = await db
    .select()
    .from(aturanKategori)
    .where(sejak ? gt(aturanKategori.updatedAt, sejak) : undefined)
    .orderBy(asc(aturanKategori.updatedAt));
  const bukuRows = await db
    .select()
    .from(buku)
    .where(sejak ? gt(buku.updatedAt, sejak) : undefined)
    .orderBy(asc(buku.updatedAt));
  const eksemplarRows = await db
    .select()
    .from(eksemplar)
    .where(sejak ? gt(eksemplar.updatedAt, sejak) : undefined)
    .orderBy(asc(eksemplar.updatedAt));

  const kontribusi = bukuRows.length
    ? await db
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
        .where(
          inArray(
            bukuKontributor.bukuId,
            bukuRows.map((b) => b.id),
          ),
        )
    : [];

  const kategoriDto: KategoriDto[] = kategoriRows.map((k) => ({
    id: k.id,
    kode: k.kode,
    nama: k.nama,
    warna: k.warna,
    diarsipkan: k.diarsipkan,
    dihapus: k.dihapus,
  }));
  const lokasiDto: LokasiDto[] = lokasiRows.map((l) => ({ id: l.id, nama: l.nama, dihapus: l.dihapus }));
  const aturanDto: AturanKategoriDto[] = aturanRows.map((a) => ({
    id: a.id,
    jenis: a.jenis as AturanKategoriDto["jenis"],
    pola: a.pola,
    kategoriId: a.kategoriId,
    prioritas: a.prioritas,
    dihapus: a.dihapus,
  }));
  const bukuDto: BukuDto[] = bukuRows.map((b) => ({
    id: b.id,
    judul: b.judul,
    penerbit: b.penerbit,
    kota: b.kota,
    tahun: b.tahun,
    edisi: b.edisi,
    seri: b.seri,
    jilid: b.jilid,
    bahasa: b.bahasa,
    halaman: b.halaman,
    sinopsis: b.sinopsis,
    sampul: b.sampul,
    subjek: b.subjek,
    kelasDdc: b.kelasDdc,
    isbn13: b.isbn13,
    kontributor: kontribusi
      .filter((k) => k.bukuId === b.id)
      .sort((a, b2) => a.urutan - b2.urutan)
      .map((k) => ({
        id: k.id,
        nama: k.nama,
        peran: k.peran as BukuDto["kontributor"][number]["peran"],
        utama: k.utama,
      })),
  }));
  const eksemplarDto: EksemplarDto[] = eksemplarRows.map((e) => ({
    id: e.id,
    bukuId: e.bukuId,
    kategoriId: e.kategoriId,
    nomorInduk: e.nomorInduk,
    tahunPencatatan: e.tahunPencatatan,
    waktuDicatat: e.waktuDicatatPerangkat.toISOString(),
    status: e.status as EksemplarDto["status"],
    lokasiId: e.lokasiId,
    tanggalMasuk: e.tanggalMasuk,
    asal: e.asal as EksemplarDto["asal"],
    harga: e.harga,
    kondisi: e.kondisi as EksemplarDto["kondisi"],
    perluCetak: e.perluCetak,
  }));

  const terbaru = [...kategoriRows, ...lokasiRows, ...aturanRows, ...bukuRows, ...eksemplarRows]
    .map((r) => r.updatedAt.getTime())
    .reduce<number | null>((max, t) => (max === null || t > max ? t : max), null);

  return {
    kursor: terbaru === null ? kursor : new Date(terbaru).toISOString(),
    kategori: kategoriDto,
    lokasi: lokasiDto,
    aturanKategori: aturanDto,
    buku: bukuDto,
    eksemplar: eksemplarDto,
  };
}
