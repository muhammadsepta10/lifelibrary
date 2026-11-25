import { and, asc, eq, gt, notInArray, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { aturanKategori, buku, eksemplar, kategori, lokasi } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import { eksemplarDto } from "./dto";
import type { AturanKategoriDto, BukuDto, EksemplarDto, KategoriDto, LokasiDto, PullResponse } from "@/lib/sync-protocol";
import { muatKontributor } from "./kontributor";

const PEMISAH = "~";

/**
 * Kursor = waktu `updatedAt` terbaru yang sudah diterima, ditambah id baris yang
 * sudah diterima pada milidetik persis itu: `<ISO>` atau `<ISO>~id1,id2`.
 * Baris lain yang ditulis pada milidetik yang sama (setelah pull sebelumnya)
 * tetap terambil, dan baris yang sudah diterima tidak diulang.
 */
function bacaKursor(kursor: string | null) {
  if (!kursor) return null;
  const [iso, ids] = kursor.split(PEMISAH);
  const waktu = new Date(iso);
  if (Number.isNaN(waktu.getTime()) || waktu.toISOString() !== iso) throw new Error("Kursor tidak valid");
  return { waktu, sudah: ids ? ids.split(",") : [] };
}

/** Perubahan sejak kursor (berdasarkan `updatedAt` server). Kursor null = semuanya. */
export async function pull(db: Db, kursor: string | null): Promise<PullResponse> {
  const sejak = bacaKursor(kursor);

  const baru = (t: { id: AnyPgColumn; updatedAt: AnyPgColumn }): SQL | undefined => {
    if (!sejak) return undefined;
    const sama = sejak.sudah.length
      ? and(eq(t.updatedAt, sejak.waktu), notInArray(t.id, sejak.sudah))
      : eq(t.updatedAt, sejak.waktu);
    return or(gt(t.updatedAt, sejak.waktu), sama);
  };

  const kategoriRows = await db.select().from(kategori).where(baru(kategori)).orderBy(asc(kategori.updatedAt));
  const lokasiRows = await db.select().from(lokasi).where(baru(lokasi)).orderBy(asc(lokasi.updatedAt));
  const aturanRows = await db
    .select()
    .from(aturanKategori)
    .where(baru(aturanKategori))
    .orderBy(asc(aturanKategori.updatedAt));
  const bukuRows = await db.select().from(buku).where(baru(buku)).orderBy(asc(buku.updatedAt));
  const eksemplarRows = await db
    .select()
    .from(eksemplar)
    .where(baru(eksemplar))
    .orderBy(asc(eksemplar.updatedAt));

  const kontribusi = await muatKontributor(
    db,
    bukuRows.map((b) => b.id),
  );

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
    kontributor: kontribusi.get(b.id) ?? [],
  }));
  const eksemplarDtos: EksemplarDto[] = eksemplarRows.map(eksemplarDto);

  const semua = [...kategoriRows, ...lokasiRows, ...aturanRows, ...bukuRows, ...eksemplarRows];
  const terbaru = semua.reduce<number | null>((max, r) => {
    const t = r.updatedAt.getTime();
    return max === null || t > max ? t : max;
  }, null);

  let kursorBaru = kursor;
  if (terbaru !== null) {
    const iso = new Date(terbaru).toISOString();
    const diTerbaru = semua.filter((r) => r.updatedAt.getTime() === terbaru).map((r) => r.id);
    const lanjutan = sejak && sejak.waktu.getTime() === terbaru ? sejak.sudah : [];
    kursorBaru = [iso, [...lanjutan, ...diTerbaru].join(",")].filter(Boolean).join(PEMISAH);
  }

  return {
    kursor: kursorBaru,
    kategori: kategoriDto,
    lokasi: lokasiDto,
    aturanKategori: aturanDto,
    buku: bukuDto,
    eksemplar: eksemplarDtos,
  };
}
