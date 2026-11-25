/**
 * Tombol simpan di layar tinjau draf aktif hanya bila Kategori sudah dipilih
 * dan dikonfirmasi Pemilik. Saran yang terpilih otomatis belum terhitung
 * sebagai konfirmasi (Nomor Induk memuat kode Kategori, ADR 0001).
 */
export function bisaSimpanDraf(s: { kategoriId: string; dikonfirmasi: boolean }): boolean {
  return s.kategoriId !== "" && s.dikonfirmasi;
}

/** Buku yang sudah tercatat dengan ISBN yang sama; dasar prompt "Tambah eksemplar baru?". */
export type BukuDuplikat = {
  bukuId: string;
  judul: string;
  pengarang: string;
  /** Kategori Eksemplar terakhir, dipakai sebagai isian awal Eksemplar baru. */
  kategoriId: string | null;
  jumlahEksemplar: number;
};
