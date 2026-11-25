import { and, eq, isNull } from "drizzle-orm";
import { NAMA_FIELD_PEMINJAM, NAMA_FIELD_PEMINJAMAN } from "@/lib/peminjaman-protocol";
import type { FieldDitimpa, Mutasi } from "@/lib/sync-protocol";
import { eksemplar, peminjam, peminjaman } from "@/server/db/schema";
import { sekarangServer } from "@/server/kelola/galat";
import { bagiMenangKalah, diterima, ditolak, type HasilTanpaId } from "./hasil";
import type { Tx } from "./tx";

/**
 * Peminjaman baru. Satu Eksemplar hanya boleh punya satu Peminjaman yang belum
 * kembali: dicek di sini (baris Eksemplar dikunci supaya Penyiangan dan
 * peminjaman bersamaan saling menunggu) dan dijaga indeks unik parsial, jadi dua
 * perangkat yang meminjamkan Eksemplar yang sama hanya satu yang berhasil.
 * Tidak bergantung pada Nomor Induk: mutasi catat Eksemplar sudah diproses
 * lebih dulu (outbox berurutan), jadi Eksemplar sudah ada di server.
 */
export async function pinjamkan(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "peminjaman.pinjamkan" }>,
): Promise<HasilTanpaId> {
  const p = m.peminjaman;

  // Peminjaman yang sama dikirim dengan id mutasi lain: sudah tercatat.
  const [sudah] = await tx.select({ id: peminjaman.id }).from(peminjaman).where(eq(peminjaman.id, p.id));
  if (sudah) return diterima();

  const [e] = await tx.select().from(eksemplar).where(eq(eksemplar.id, p.eksemplarId)).for("update");
  if (!e) return ditolak("Eksemplar tidak ditemukan di server");
  if (e.status === "keluar") return ditolak("Eksemplar ini sudah keluar dari koleksi, jadi tidak bisa dipinjamkan");
  if (p.jatuhTempo < p.tanggalPinjam) return ditolak("Jatuh tempo tidak boleh sebelum tanggal pinjam");

  const sedangDipinjam = () => sedangDipinjamOleh(tx, p.eksemplarId);
  const lain = await sedangDipinjam();
  if (lain) return ditolak(lain);

  await tx
    .insert(peminjam)
    .values({ id: m.peminjam.id, nama: m.peminjam.nama, kontak: m.peminjam.kontak ?? null })
    .onConflictDoNothing();
  const baru = await tx
    .insert(peminjaman)
    .values({
      id: p.id,
      eksemplarId: p.eksemplarId,
      peminjamId: m.peminjam.id,
      tanggalPinjam: p.tanggalPinjam,
      jatuhTempo: p.jatuhTempo,
    })
    .onConflictDoNothing()
    .returning({ id: peminjaman.id });
  if (baru.length === 0) {
    // Kalah berpacu dari perangkat lain yang baru saja meminjamkan Eksemplar ini.
    return ditolak((await sedangDipinjam()) ?? "Eksemplar ini sedang dipinjam");
  }
  return diterima();
}

async function sedangDipinjamOleh(tx: Tx, eksemplarId: string): Promise<string | null> {
  const [aktif] = await tx
    .select({ nama: peminjam.nama })
    .from(peminjaman)
    .innerJoin(peminjam, eq(peminjam.id, peminjaman.peminjamId))
    .where(and(eq(peminjaman.eksemplarId, eksemplarId), isNull(peminjaman.tanggalKembali)));
  return aktif ? `Eksemplar ini sedang dipinjam oleh ${aktif.nama}` : null;
}

/** Perpanjang (jatuh tempo) dan/atau kembalikan (tanggal kembali); per field, yang terbaru menang (ADR 0004). */
export async function ubahPeminjaman(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "peminjaman.ubah" }>,
): Promise<HasilTanpaId> {
  const [ada] = await tx.select().from(peminjaman).where(eq(peminjaman.id, m.peminjamanId));
  if (!ada) return ditolak("Peminjaman tidak ditemukan di server");

  const disebut = NAMA_FIELD_PEMINJAMAN.filter((key) => m.perubahan[key] !== undefined);
  const { menang, kalah, fieldWaktu } = bagiMenangKalah(ada.fieldWaktu, disebut, m.waktuUbah);

  const jatuhTempo = menang.includes("jatuhTempo") ? m.perubahan.jatuhTempo! : ada.jatuhTempo;
  const tanggalKembali = menang.includes("tanggalKembali") ? m.perubahan.tanggalKembali! : ada.tanggalKembali;
  if (jatuhTempo < ada.tanggalPinjam) return ditolak("Jatuh tempo tidak boleh sebelum tanggal pinjam");
  if (tanggalKembali && tanggalKembali < ada.tanggalPinjam) {
    return ditolak("Tanggal kembali tidak boleh sebelum tanggal pinjam");
  }

  if (menang.length > 0) {
    const set = Object.fromEntries(menang.map((key) => [key, m.perubahan[key] ?? null]));
    await tx
      .update(peminjaman)
      .set({ ...set, fieldWaktu, updatedAt: sekarangServer })
      .where(eq(peminjaman.id, m.peminjamanId));
  }
  const ditimpa: FieldDitimpa[] = kalah
    .filter((key) => (ada[key] ?? null) !== (m.perubahan[key] ?? null))
    .map((key) => ({ field: key, nilai: ada[key] ?? null }));
  return diterima({ ditimpa });
}

/** Mengoreksi nama atau kontak Peminjam; per field, yang terbaru menang. */
export async function ubahPeminjam(
  tx: Tx,
  m: Extract<Mutasi, { jenis: "peminjam.ubah" }>,
): Promise<HasilTanpaId> {
  const [ada] = await tx.select().from(peminjam).where(eq(peminjam.id, m.peminjamId));
  if (!ada) return ditolak("Peminjam tidak ditemukan di server");

  const disebut = NAMA_FIELD_PEMINJAM.filter((key) => m.perubahan[key] !== undefined);
  const { menang, kalah, fieldWaktu } = bagiMenangKalah(ada.fieldWaktu, disebut, m.waktuUbah);
  if (menang.length > 0) {
    const set = Object.fromEntries(menang.map((key) => [key, m.perubahan[key] ?? null]));
    await tx
      .update(peminjam)
      .set({ ...set, fieldWaktu, updatedAt: sekarangServer })
      .where(eq(peminjam.id, m.peminjamId));
  }
  const ditimpa: FieldDitimpa[] = kalah
    .filter((key) => (ada[key] ?? null) !== (m.perubahan[key] ?? null))
    .map((key) => ({ field: key, nilai: ada[key] ?? null }));
  return diterima({ ditimpa });
}
