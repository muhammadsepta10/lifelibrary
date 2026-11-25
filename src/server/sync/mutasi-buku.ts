import { and, eq, ne } from "drizzle-orm";
import { NAMA_FIELD_BUKU } from "@/lib/buku-fields";
import { gabungKontributor, normalisasiNama, periksaPengarangUtama } from "@/lib/kontributor";
import type { Mutasi } from "@/lib/sync-protocol";
import { buku, bukuKontributor, kontributor } from "@/server/db/schema";
import { sekarangServer } from "@/server/kelola/galat";
import type { FieldDitimpa } from "@/lib/sync-protocol";
import { bagiMenangKalah, diterima, ditolak, type HasilTanpaId } from "./hasil";
import { muatKontributor } from "./kontributor";
import type { Tx } from "./tx";

type Kontributor = Extract<Mutasi, { jenis: "buku.tambah" }>["buku"]["kontributor"];

/**
 * Menyimpan Kontributor sebuah Buku (menggantikan yang lama). Nama
 * ternormalisasi yang sama dipakai ulang dari Kontributor yang sudah ada
 * (nama yang tersimpan lebih dulu dipertahankan) dan digabung dalam satu Buku.
 */
async function simpanKontributor(tx: Tx, bukuId: string, daftar: Kontributor) {
  await tx.delete(bukuKontributor).where(eq(bukuKontributor.bukuId, bukuId));
  for (const [urutan, k] of gabungKontributor(daftar).entries()) {
    const normal = normalisasiNama(k.nama);
    const [ada] = await tx
      .select({ id: kontributor.id })
      .from(kontributor)
      .where(eq(kontributor.namaNormal, normal))
      .orderBy(kontributor.id)
      .limit(1);
    let kontributorId = ada?.id;
    if (!kontributorId) {
      await tx.insert(kontributor).values({ id: k.id, nama: k.nama, namaNormal: normal }).onConflictDoNothing();
      kontributorId = k.id;
    }
    await tx
      .insert(bukuKontributor)
      .values({ bukuId, kontributorId, peran: k.peran, urutan, utama: k.utama })
      .onConflictDoNothing();
  }
}

async function isbnDipakaiLain(tx: Tx, isbn13: string, bukuId: string) {
  const [sama] = await tx
    .select({ id: buku.id })
    .from(buku)
    .where(and(eq(buku.isbn13, isbn13), ne(buku.id, bukuId)));
  return !!sama;
}

const galatKontributor = (daftar: Kontributor) => {
  const galat = periksaPengarangUtama(gabungKontributor(daftar));
  return galat ? ditolak(`Kontributor tidak valid: ${galat}`) : null;
};

export async function tambahBuku(tx: Tx, m: Extract<Mutasi, { jenis: "buku.tambah" }>): Promise<HasilTanpaId> {
  const { kontributor: daftar, id, ...field } = m.buku;
  if (field.isbn13 && (await isbnDipakaiLain(tx, field.isbn13, id))) {
    return ditolak("ISBN sudah tercatat pada Buku lain");
  }
  const tolak = galatKontributor(daftar);
  if (tolak) return tolak;

  const baru = await tx
    .insert(buku)
    .values({
      id,
      judul: field.judul,
      penerbit: field.penerbit ?? null,
      kota: field.kota ?? null,
      tahun: field.tahun ?? null,
      edisi: field.edisi ?? null,
      seri: field.seri ?? null,
      jilid: field.jilid ?? null,
      bahasa: field.bahasa ?? null,
      halaman: field.halaman ?? null,
      sinopsis: field.sinopsis ?? null,
      sampul: field.sampul ?? null,
      subjek: field.subjek ?? [],
      kelasDdc: field.kelasDdc ?? null,
      isbn13: field.isbn13 ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: buku.id });
  // Buku yang sama dikirim dengan id mutasi lain: jangan menimpa Kontributornya.
  if (baru.length > 0) await simpanKontributor(tx, id, daftar);
  return diterima();
}

export async function ubahBuku(tx: Tx, m: Extract<Mutasi, { jenis: "buku.ubah" }>): Promise<HasilTanpaId> {
  const [ada] = await tx.select().from(buku).where(eq(buku.id, m.bukuId));
  if (!ada) return ditolak("Buku tidak ditemukan di server");

  const { kontributor: daftar, ...field } = m.perubahan;
  if (daftar) {
    const tolak = galatKontributor(daftar);
    if (tolak) return tolak;
  }

  // Per field, yang terbaru menang (ADR 0004).
  const disebut: string[] = NAMA_FIELD_BUKU.filter((key) => field[key] !== undefined);
  if (daftar) disebut.push("kontributor");
  const { menang, kalah, fieldWaktu } = bagiMenangKalah(ada.fieldWaktu, disebut, m.waktuUbah);

  if (field.isbn13 && menang.includes("isbn13") && (await isbnDipakaiLain(tx, field.isbn13, m.bukuId))) {
    return ditolak("ISBN sudah tercatat pada Buku lain");
  }

  const set: Record<string, unknown> = {};
  for (const key of NAMA_FIELD_BUKU) {
    const nilai = field[key];
    if (nilai === undefined || !menang.includes(key)) continue;
    set[key] = key === "subjek" ? (nilai ?? []) : (nilai ?? null);
  }
  if (daftar && menang.includes("kontributor")) await simpanKontributor(tx, m.bukuId, daftar);
  if (menang.length > 0) {
    await tx
      .update(buku)
      .set({ ...set, fieldWaktu, updatedAt: sekarangServer })
      .where(eq(buku.id, m.bukuId));
  }

  // Field yang kalah dari perubahan lebih baru; dilaporkan bila nilainya memang berbeda.
  const ditimpa: FieldDitimpa[] = [];
  for (const key of kalah) {
    if (key === "kontributor") {
      const kini = (await muatKontributor(tx, [m.bukuId])).get(m.bukuId) ?? [];
      if (!sama(kunciKontributor(kini), kunciKontributor(gabungKontributor(daftar!)))) {
        ditimpa.push({ field: key, nilai: kini });
      }
      continue;
    }
    const kini = ada[key as keyof typeof ada];
    const diminta = key === "subjek" ? (field.subjek ?? []) : (field[key as keyof typeof field] ?? null);
    if (!sama(kini, diminta)) ditimpa.push({ field: key, nilai: kini });
  }
  return diterima({ ditimpa });
}

const sama = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Kontributor dibandingkan menurut nama ternormalisasi, peran, dan Pengarang Utama. */
const kunciKontributor = (daftar: { nama: string; peran: string; utama: boolean }[]) =>
  daftar.map((k) => [normalisasiNama(k.nama), k.peran, k.utama]);
