import type { Peran } from "./buku-fields";

/**
 * Nama dibaca sama bila huruf besar-kecil, aksen, tanda baca, dan spasi
 * berlebih diabaikan: "Leila S. Chudori" = "leila  s chudori".
 */
export function normalisasiNama(nama: string): string {
  return nama
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type Peserta = { id: string; nama: string; peran: Peran; utama: boolean };

/**
 * Menggabungkan Kontributor dengan nama ternormalisasi yang sama:
 * - nama yang sama selalu memakai satu id (milik kemunculan pertama);
 * - nama dan peran yang sama dalam satu Buku menjadi satu entri, dan
 *   menjadi Pengarang Utama bila salah satunya begitu.
 * Urutan kemunculan pertama dipertahankan.
 */
export function gabungKontributor<T extends Peserta>(daftar: T[]): T[] {
  const idPerNama = new Map<string, string>();
  const hasil = new Map<string, T>();
  for (const k of daftar) {
    const nama = normalisasiNama(k.nama);
    const id = idPerNama.get(nama) ?? k.id;
    idPerNama.set(nama, id);
    const kunci = `${nama}|${k.peran}`;
    const ada = hasil.get(kunci);
    if (ada) hasil.set(kunci, { ...ada, utama: ada.utama || k.utama });
    else hasil.set(kunci, { ...k, id });
  }
  return [...hasil.values()];
}

/** Pesan galat bila Kontributor tidak punya tepat satu Pengarang Utama; null bila beres. */
export function periksaPengarangUtama(daftar: { utama: boolean }[]): string | null {
  const jumlah = daftar.filter((k) => k.utama).length;
  if (daftar.length === 0) return "Isi minimal satu Kontributor";
  if (jumlah === 0) return "Pilih satu Pengarang Utama";
  if (jumlah > 1) return "Pengarang Utama harus tepat satu";
  return null;
}
