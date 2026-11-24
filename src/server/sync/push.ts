import { eq } from "drizzle-orm";
import {
  buku,
  bukuKontributor,
  eksemplar,
  kategori,
  kontributor,
  syncMutasi,
} from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import {
  pushRequestSchema,
  type HasilMutasi,
  type Mutasi,
  type PushResponse,
} from "@/lib/sync-protocol";
import { alokasiNomorInduk } from "./nomor-induk";
import type { Tx } from "./tx";

type HasilTanpaId = Omit<Extract<HasilMutasi, { status: "diterima" }>, "id"> | Omit<Extract<HasilMutasi, { status: "ditolak" }>, "id">;

const diterima = (extra: { nomorInduk?: string; eksemplarId?: string } = {}): HasilTanpaId => ({
  status: "diterima",
  ...extra,
});
const ditolak = (alasan: string): HasilTanpaId => ({ status: "ditolak", alasan });

export async function push(db: Db, input: unknown): Promise<PushResponse> {
  const { mutasi } = pushRequestSchema.parse(input);
  const hasil: HasilMutasi[] = [];
  // Berurutan: Eksemplar bergantung pada Buku dari mutasi sebelumnya.
  for (const m of mutasi) {
    hasil.push(await db.transaction((tx) => prosesMutasi(tx, m)));
  }
  return { hasil };
}

async function prosesMutasi(tx: Tx, m: Mutasi): Promise<HasilMutasi> {
  // Idempotensi: id mutasi yang sama tidak diproses dua kali. Penulis
  // bersamaan dengan id sama menunggu di indeks unik sampai yang pertama commit.
  const baru = await tx
    .insert(syncMutasi)
    .values({ id: m.id, hasil: {} })
    .onConflictDoNothing()
    .returning({ id: syncMutasi.id });

  if (baru.length === 0) {
    const [ada] = await tx.select().from(syncMutasi).where(eq(syncMutasi.id, m.id));
    return { id: m.id, ...(ada.hasil as HasilTanpaId) };
  }

  const hasil = m.jenis === "buku.tambah" ? await tambahBuku(tx, m) : await catatEksemplar(tx, m);
  await tx.update(syncMutasi).set({ hasil }).where(eq(syncMutasi.id, m.id));
  return { id: m.id, ...hasil } as HasilMutasi;
}

async function tambahBuku(tx: Tx, m: Extract<Mutasi, { jenis: "buku.tambah" }>): Promise<HasilTanpaId> {
  const b = m.buku;
  if (b.isbn13) {
    const [sama] = await tx.select({ id: buku.id }).from(buku).where(eq(buku.isbn13, b.isbn13));
    if (sama && sama.id !== b.id) return ditolak("ISBN sudah tercatat pada Buku lain");
  }
  await tx
    .insert(buku)
    .values({
      id: b.id,
      judul: b.judul,
      penerbit: b.penerbit ?? null,
      tahun: b.tahun ?? null,
      isbn13: b.isbn13 ?? null,
    })
    .onConflictDoNothing();
  for (const [urutan, k] of b.kontributor.entries()) {
    await tx.insert(kontributor).values({ id: k.id, nama: k.nama }).onConflictDoNothing();
    await tx
      .insert(bukuKontributor)
      .values({ bukuId: b.id, kontributorId: k.id, peran: k.peran, urutan, utama: k.utama })
      .onConflictDoNothing();
  }
  return diterima();
}

async function catatEksemplar(
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
  if (!kat) return ditolak("Kategori tidak dikenal");

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
  });
  return diterima({ eksemplarId: e.id, nomorInduk });
}
