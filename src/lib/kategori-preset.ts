/**
 * Preset Kategori (ADR 0003): 10 kelas utama DDC + Fiksi + Anak.
 * Id tetap supaya server (seed) dan perangkat (salinan lokal awal) memakai
 * identitas yang sama. Pemilik bisa mengubah/menambah Kategori di tiket lain.
 */
export type KategoriPreset = {
  id: string;
  kode: string;
  nama: string;
  warna: string;
};

export const PRESET_KATEGORI: readonly KategoriPreset[] = [
  { id: "7f0c1a10-0000-4000-8000-000000000000", kode: "UMM", nama: "Karya Umum", warna: "#6B7280" },
  { id: "7f0c1a10-0000-4000-8000-000000000100", kode: "FIL", nama: "Filsafat & Psikologi", warna: "#264653" },
  { id: "7f0c1a10-0000-4000-8000-000000000200", kode: "AGM", nama: "Agama", warna: "#5E7C4B" },
  { id: "7f0c1a10-0000-4000-8000-000000000300", kode: "SOS", nama: "Ilmu Sosial", warna: "#B8860B" },
  { id: "7f0c1a10-0000-4000-8000-000000000400", kode: "BHS", nama: "Bahasa", warna: "#3E6C8F" },
  { id: "7f0c1a10-0000-4000-8000-000000000500", kode: "SNS", nama: "Sains", warna: "#0F766E" },
  { id: "7f0c1a10-0000-4000-8000-000000000600", kode: "TEK", nama: "Teknologi", warna: "#475569" },
  { id: "7f0c1a10-0000-4000-8000-000000000700", kode: "SNI", nama: "Seni & Olahraga", warna: "#9D4B6C" },
  { id: "7f0c1a10-0000-4000-8000-000000000800", kode: "SAS", nama: "Sastra", warna: "#8C3B2E" },
  { id: "7f0c1a10-0000-4000-8000-000000000900", kode: "SEJ", nama: "Sejarah & Geografi", warna: "#2A7F78" },
  { id: "7f0c1a10-0000-4000-8000-00000000f1c0", kode: "FIK", nama: "Fiksi", warna: "#E76F51" },
  { id: "7f0c1a10-0000-4000-8000-00000000a4a0", kode: "ANK", nama: "Anak", warna: "#8E5BA8" },
] as const;
