import { eq, inArray } from "drizzle-orm";
import { NAMA_FIELD_EKSEMPLAR } from "@/lib/buku-fields";
import type { Mutasi } from "@/lib/sync-protocol";
import { buku, eksemplar, kategori, lokasi } from "@/server/db/schema";
import { sekarangServer } from "@/server/kelola/galat";
import type { FieldDitimpa } from "@/lib/sync-protocol";
import { bagiMenangKalah, diterima, ditolak, tandaiWaktu, type HasilTanpaId } from "./hasil";
import { alokasiNomorInduk } from "./nomor-induk";
import type { Tx } from "./tx";

async function lokasiAda(tx: Tx, id: string) {
  const [l] = await tx.select({ dihapus: lokasi.dihapus }).from(lokasi).where(eq(lokasi.id, id));
  return !!l && !l.dihapus;
}

/** Waktu pencatatan perangkat yang masih masuk akal (ADR 0001: tahun diambil dari jam perangkat). */
const BATAS_AWAL_PENCATATAN = new Date("2000-01-01T00:00:00Z");
const TOLERANSI_MASA_DEPAN_MS = 24 * 60 * 60 * 1000;

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

  // Kategori yang sudah diarsipkan tetap diterima di sini: perangkat offline bisa
  // saja mencatat Eksemplar sebelum Kategori itu diarsipkan, dan pencatatan itu
  // tidak boleh hilang. Hanya yang sudah dihapus (tidak dikenal) yang ditolak.
  const [kat] = await tx.select().from(kategori).where(eq(kategori.id, e.kategoriId));
  if (!kat || kat.dihapus) return ditolak("Kategori tidak dikenal");

  if (e.lokasiId && !(await lokasiAda(tx, e.lokasiId))) return ditolak("Lokasi tidak dikenal");

  const waktu = new Date(e.waktuDicatat);
  if (Number.isNaN(waktu.getTime())) return ditolak("Waktu pencatatan tidak valid");
  if (waktu.getTime() < BATAS_AWAL_PENCATATAN.getTime() || waktu.getTime() > Date.now() + TOLERANSI_MASA_DEPAN_MS) {
    return ditolak(
      "Jam perangkat tidak masuk akal (sebelum tahun 2000 atau lebih dari sehari di depan jam server). Periksa jam perangkat lalu kirim ulang",
    );
  }
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

  // Per field, yang terbaru menang (ADR 0004).
  const disebut = NAMA_FIELD_EKSEMPLAR.filter((key) => m.perubahan[key] !== undefined);
  const { menang, kalah, fieldWaktu } = bagiMenangKalah(ada.fieldWaktu, disebut, m.waktuUbah);
  if (m.perubahan.lokasiId && menang.includes("lokasiId") && !(await lokasiAda(tx, m.perubahan.lokasiId))) {
    return ditolak("Lokasi tidak dikenal");
  }

  if (menang.length > 0) {
    const set = Object.fromEntries(menang.map((key) => [key, m.perubahan[key] ?? null]));
    await tx
      .update(eksemplar)
      .set({ ...set, fieldWaktu, updatedAt: sekarangServer })
      .where(eq(eksemplar.id, m.eksemplarId));
  }
  const ditimpa: FieldDitimpa[] = kalah
    .filter((key) => (ada[key] ?? null) !== (m.perubahan[key] ?? null))
    .map((key) => ({ field: key, nilai: ada[key] ?? null }));
  return diterima({ ditimpa });
}

/**
 * Pemilik menandai Label sudah tercetak; Eksemplar yang tidak dikenal dilewati.
 * Per field, yang terbaru menang (ADR 0004): penandaan lama yang tiba terlambat
 * tidak menimpa `perluCetak = true` dari koreksi yang lebih baru di perangkat lain.
 */
export async function tandaiTercetak(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "eksemplar.tandaiTercetak" }>,
): Promise<HasilTanpaId> {
  const rows = await tx
    .select({ id: eksemplar.id, fieldWaktu: eksemplar.fieldWaktu })
    .from(eksemplar)
    .where(inArray(eksemplar.id, m.eksemplarIds));
  for (const row of rows) {
    const { menang, fieldWaktu } = bagiMenangKalah(row.fieldWaktu, ["perluCetak"], m.waktuUbah);
    if (menang.length === 0) continue;
    await tx
      .update(eksemplar)
      .set({ perluCetak: false, fieldWaktu, updatedAt: sekarangServer })
      .where(eq(eksemplar.id, row.id));
  }
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
  // Berbeda dengan pencatatan baru: koreksi ke Kategori yang sudah diarsipkan ditolak.
  if (kat.diarsipkan) return ditolak("Kategori sudah diarsipkan, pilih Kategori lain");

  const { menang, fieldWaktu } = bagiMenangKalah(ada.fieldWaktu, ["kategoriId"], m.waktuUbah);
  if (menang.length === 0) {
    // Kalah dari koreksi yang lebih baru dari perangkat lain.
    return diterima(
      ada.kategoriId === m.kategoriId ? {} : { ditimpa: [{ field: "kategoriId", nilai: ada.kategoriId }] },
    );
  }
  if (ada.kategoriId !== m.kategoriId) {
    await tx
      .update(eksemplar)
      .set({
        kategoriId: m.kategoriId,
        perluCetak: true,
        fieldWaktu: tandaiWaktu(fieldWaktu, ["perluCetak"], m.waktuUbah),
        updatedAt: sekarangServer,
      })
      .where(eq(eksemplar.id, m.eksemplarId));
  }
  return diterima();
}
