import { eq, inArray } from "drizzle-orm";
import { NAMA_FIELD_EKSEMPLAR } from "@/lib/buku-fields";
import type { Mutasi } from "@/lib/sync-protocol";
import { buku, eksemplar, kategori, lokasi } from "@/server/db/schema";
import { sekarangServer } from "@/server/kelola/galat";
import { diterima, ditolak, tandaiWaktu, type HasilTanpaId } from "./hasil";
import { alokasiNomorInduk } from "./nomor-induk";
import type { Tx } from "./tx";

async function lokasiAda(tx: Tx, id: string) {
  const [l] = await tx.select({ dihapus: lokasi.dihapus }).from(lokasi).where(eq(lokasi.id, id));
  return !!l && !l.dihapus;
}

export async function catatEksemplar(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "eksemplar.catat" }>,
): Promise<HasilTanpaId> {
  const e = m.eksemplar;

  // Eksemplar yang sama dikirim dengan id mutasi lain: jangan beri nomor kedua.
  const [ada] = await tx.select().from(eksemplar).where(eq(eksemplar.id, e.id));
  if (ada) return diterima({ eksemplarId: ada.id, nomorInduk: ada.nomorInduk ?? undefined });

  const [bukunya] = await tx.select({ id: buku.id }).from(buku).where(eq(buku.id, e.bukuId));
  if (!bukunya) return ditolak("Buku untuk Eksemplar ini belum ada di server");

  const [kat] = await tx.select().from(kategori).where(eq(kategori.id, e.kategoriId));
  if (!kat || kat.dihapus) return ditolak("Kategori tidak dikenal");

  if (e.lokasiId && !(await lokasiAda(tx, e.lokasiId))) return ditolak("Lokasi tidak dikenal");

  const waktu = new Date(e.waktuDicatat);
  if (Number.isNaN(waktu.getTime())) return ditolak("Waktu pencatatan tidak valid");
  // Tahun pencatatan = tahun lokal perangkat (awalan teks ISO), bukan tahun server (ADR 0001).
  const tahun = Number(e.waktuDicatat.slice(0, 4));

  const nomorInduk = await alokasiNomorInduk(tx, kat.kode, tahun);
  await tx.insert(eksemplar).values({
    id: e.id,
    bukuId: e.bukuId,
    kategoriId: e.kategoriId,
    nomorInduk,
    kodeKategoriSaatDicatat: kat.kode,
    tahunPencatatan: tahun,
    waktuDicatatPerangkat: waktu,
    tanggalMasuk: e.tanggalMasuk ?? null,
    asal: e.asal ?? null,
    harga: e.harga ?? null,
    kondisi: e.kondisi ?? null,
    lokasiId: e.lokasiId ?? null,
    // Eksemplar baru belum pernah dicetak: langsung masuk Antrean Cetak.
    perluCetak: true,
  });
  return diterima({ eksemplarId: e.id, nomorInduk });
}

export async function ubahEksemplar(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "eksemplar.ubah" }>,
): Promise<HasilTanpaId> {
  const [ada] = await tx.select().from(eksemplar).where(eq(eksemplar.id, m.eksemplarId));
  if (!ada) return ditolak("Eksemplar tidak ditemukan di server");
  if (m.perubahan.lokasiId && !(await lokasiAda(tx, m.perubahan.lokasiId))) {
    return ditolak("Lokasi tidak dikenal");
  }

  const set: Record<string, unknown> = {};
  const disebut: string[] = [];
  for (const key of NAMA_FIELD_EKSEMPLAR) {
    const nilai = m.perubahan[key];
    if (nilai === undefined) continue;
    set[key] = nilai ?? null;
    disebut.push(key);
  }
  if (disebut.length > 0) {
    await tx
      .update(eksemplar)
      .set({ ...set, fieldWaktu: tandaiWaktu(ada.fieldWaktu, disebut, m.waktuUbah), updatedAt: sekarangServer })
      .where(eq(eksemplar.id, m.eksemplarId));
  }
  return diterima();
}

/** Pemilik menandai Label sudah tercetak; Eksemplar yang tidak dikenal dilewati. */
export async function tandaiTercetak(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "eksemplar.tandaiTercetak" }>,
): Promise<HasilTanpaId> {
  await tx
    .update(eksemplar)
    .set({ perluCetak: false, updatedAt: sekarangServer })
    .where(inArray(eksemplar.id, m.eksemplarIds));
  return diterima();
}

/** Mengganti Kategori; Nomor Induk dan penghitungnya tidak disentuh (ADR 0001). */
export async function koreksiKategori(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "eksemplar.koreksiKategori" }>,
): Promise<HasilTanpaId> {
  const [ada] = await tx.select().from(eksemplar).where(eq(eksemplar.id, m.eksemplarId));
  if (!ada) return ditolak("Eksemplar tidak ditemukan di server");
  const [kat] = await tx.select().from(kategori).where(eq(kategori.id, m.kategoriId));
  if (!kat || kat.dihapus) return ditolak("Kategori tidak dikenal");

  if (ada.kategoriId !== m.kategoriId) {
    await tx
      .update(eksemplar)
      .set({
        kategoriId: m.kategoriId,
        perluCetak: true,
        fieldWaktu: tandaiWaktu(ada.fieldWaktu, ["kategoriId"], m.waktuUbah),
        updatedAt: sekarangServer,
      })
      .where(eq(eksemplar.id, m.eksemplarId));
  }
  return diterima();
}
