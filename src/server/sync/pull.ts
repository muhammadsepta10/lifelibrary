import { asc, gte, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  aturanKategori,
  buku,
  eksemplar,
  kategori,
  lokasi,
  peminjam,
  peminjaman,
  templateLabel,
} from "@/server/db/schema";
import { templateDariRow } from "@/server/kelola/template-label";
import type { Db } from "@/server/db/types";
import { eksemplarDto } from "./dto";
import type { AturanKategoriDto, BukuDto, EksemplarDto, KategoriDto, LokasiDto, PullResponse } from "@/lib/sync-protocol";
import { muatKontributor } from "./kontributor";

const PEMISAH = "~";

/**
 * Jendela pengaman kursor. `updatedAt` dicap saat pernyataan jalan, bukan saat
 * commit: baris yang dicap T1 bisa baru terlihat setelah baris yang dicap T2 > T1
 * sudah ditarik. Karena itu pull selalu menarik ulang baris yang dicap dalam
 * jendela ini sebelum waktu terbaru yang pernah diterima, dan kursor mengingat
 * baris mana (id dan cap waktunya) yang sudah diterima supaya tidak diulang.
 * Penerapan di perangkat bersifat upsert, jadi pengiriman ulang tidak berbahaya.
 */
export const JENDELA_KURSOR_MS = 5000;

const kunci = (id: string, waktu: Date) => `${id}@${waktu.getTime()}`;

/**
 * Kursor = `<ISO waktu terbaru yang sudah diterima>~<id@ms>,<id@ms>` berisi baris
 * yang sudah diterima di dalam jendela pengaman sebelum waktu itu.
 */
function bacaKursor(kursor: string | null) {
  if (!kursor) return null;
  const [iso, daftar] = kursor.split(PEMISAH);
  const waktu = new Date(iso);
  if (Number.isNaN(waktu.getTime()) || waktu.toISOString() !== iso) throw new Error("Kursor tidak valid");
  return { waktu, sudah: new Set(daftar ? daftar.split(",") : []) };
}

/** Perubahan sejak kursor (berdasarkan `updatedAt` server). Kursor null = semuanya. */
export async function pull(db: Db, kursor: string | null): Promise<PullResponse> {
  const sejak = bacaKursor(kursor);
  const batas = sejak ? new Date(sejak.waktu.getTime() - JENDELA_KURSOR_MS) : null;

  const baru = (t: { updatedAt: AnyPgColumn }): SQL | undefined => (batas ? gte(t.updatedAt, batas) : undefined);
  const belumDiterima = <R extends { id: string; updatedAt: Date }>(rows: R[]) =>
    sejak ? rows.filter((r) => !sejak.sudah.has(kunci(r.id, r.updatedAt))) : rows;

  const kategoriRows = belumDiterima(
    await db.select().from(kategori).where(baru(kategori)).orderBy(asc(kategori.updatedAt)),
  );
  const lokasiRows = belumDiterima(await db.select().from(lokasi).where(baru(lokasi)).orderBy(asc(lokasi.updatedAt)));
  const aturanRows = belumDiterima(
    await db.select().from(aturanKategori).where(baru(aturanKategori)).orderBy(asc(aturanKategori.updatedAt)),
  );
  const templateRows = belumDiterima(await db.select().from(templateLabel).where(baru(templateLabel)));
  const bukuRows = belumDiterima(await db.select().from(buku).where(baru(buku)).orderBy(asc(buku.updatedAt)));
  const eksemplarRows = belumDiterima(
    await db.select().from(eksemplar).where(baru(eksemplar)).orderBy(asc(eksemplar.updatedAt)),
  );
  const peminjamRows = belumDiterima(
    await db.select().from(peminjam).where(baru(peminjam)).orderBy(asc(peminjam.updatedAt)),
  );
  const peminjamanRows = belumDiterima(
    await db.select().from(peminjaman).where(baru(peminjaman)).orderBy(asc(peminjaman.updatedAt)),
  );

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

  const semua = [
    ...kategoriRows,
    ...lokasiRows,
    ...aturanRows,
    ...templateRows,
    ...bukuRows,
    ...eksemplarRows,
    ...peminjamRows,
    ...peminjamanRows,
  ];
  let kursorBaru = kursor;
  if (semua.length > 0) {
    const terbaruBaris = Math.max(...semua.map((r) => r.updatedAt.getTime()));
    const terbaru = sejak ? Math.max(terbaruBaris, sejak.waktu.getTime()) : terbaruBaris;
    const dalamJendela = (ms: number) => ms >= terbaru - JENDELA_KURSOR_MS;
    const diterima = [
      ...(sejak ? [...sejak.sudah] : []).filter((k) => dalamJendela(Number(k.split("@")[1]))),
      ...semua.filter((r) => dalamJendela(r.updatedAt.getTime())).map((r) => kunci(r.id, r.updatedAt)),
    ];
    kursorBaru = [new Date(terbaru).toISOString(), diterima.join(",")].filter(Boolean).join(PEMISAH);
  }

  return {
    kursor: kursorBaru,
    kategori: kategoriDto,
    lokasi: lokasiDto,
    aturanKategori: aturanDto,
    templateLabel: templateRows[0] ? templateDariRow(templateRows[0]) : null,
    buku: bukuDto,
    eksemplar: eksemplarDtos,
    peminjam: peminjamRows.map((p) => ({ id: p.id, nama: p.nama, kontak: p.kontak })),
    peminjaman: peminjamanRows.map((p) => ({
      id: p.id,
      eksemplarId: p.eksemplarId,
      peminjamId: p.peminjamId,
      tanggalPinjam: p.tanggalPinjam,
      jatuhTempo: p.jatuhTempo,
      tanggalKembali: p.tanggalKembali,
    })),
  };
}
