import { drafKosong, type DrafBuku, type FieldDraf, type SumberMetadata } from "@/lib/draf-buku";
import type { Parsial } from "./parsial";

/** Urutan prioritas sumber (ADR 0003): Open Library, Google Books, Library of Congress. */
export const URUTAN_SUMBER: readonly SumberMetadata[] = ["openlibrary", "google", "loc"];

const MAKS_SUBJEK = 20;

type Hasil = Partial<Record<SumberMetadata, Parsial | null>>;

/**
 * Menggabungkan jawaban sumber menjadi draf. Per field, nilai tidak kosong
 * pertama menurut urutan sumber menang dan sumbernya dicatat. Subjek
 * digabung dari semua sumber (tanpa duplikat, huruf besar-kecil diabaikan).
 */
export function gabungkan(isbn13: string, hasil: Hasil): DrafBuku {
  const draf = drafKosong(isbn13);
  const sumber: DrafBuku["sumber"] = {};
  const urut = URUTAN_SUMBER.flatMap((s) => (hasil[s] ? [[s, hasil[s]] as const] : []));

  const pilih = <K extends keyof Parsial & FieldDraf>(field: K): Parsial[K] | undefined => {
    for (const [s, p] of urut) {
      const nilai = p[field];
      const kosong = nilai === undefined || nilai === "" || (Array.isArray(nilai) && nilai.length === 0);
      if (!kosong) {
        sumber[field] = [s];
        return nilai;
      }
    }
    return undefined;
  };

  draf.judul = pilih("judul") ?? "";
  draf.pengarang = pilih("pengarang") ?? [];
  draf.penerbit = pilih("penerbit") ?? null;
  draf.kota = pilih("kota") ?? null;
  draf.tahun = pilih("tahun") ?? null;
  draf.halaman = pilih("halaman") ?? null;
  draf.bahasa = pilih("bahasa") ?? null;
  draf.sinopsis = pilih("sinopsis") ?? null;
  draf.kelasDdc = pilih("kelasDdc") ?? null;

  const lihat = new Set<string>();
  const asalSubjek: SumberMetadata[] = [];
  for (const [s, p] of urut) {
    for (const subjek of p.subjek ?? []) {
      const kunci = subjek.trim().toLowerCase();
      if (!kunci || lihat.has(kunci) || draf.subjek.length >= MAKS_SUBJEK) continue;
      lihat.add(kunci);
      draf.subjek.push(subjek.trim());
      if (!asalSubjek.includes(s)) asalSubjek.push(s);
    }
  }
  if (draf.subjek.length) sumber.subjek = asalSubjek;

  draf.sumber = sumber;
  return draf;
}
