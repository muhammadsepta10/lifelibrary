import type { HasilKandidat, Kandidat, StatusSumber } from "@/lib/draf-buku";
import { gabungkanKandidat } from "./gabung";
import { cariKandidatGoogle } from "./google-books";
import { buatPanggil, dalamBatas, GalatSumber, type Panggil } from "./http";
import type { MetadataOptions } from "./index";
import { cariKandidatOpenLibrary } from "./open-library";
import type { MasukanKandidat } from "@/lib/judul-kandidat";

/**
 * Seam: Pencarian Kandidat, pencarian cadangan lewat judul (ADR 0007) di
 * sebelah Pencarian Metadata ISBN. Judul (+ pengarang) masuk, Kandidat
 * bersama status tiap sumber keluar. Sumber yang galat atau kehabisan waktu
 * menjadi status `galat`, tidak pernah melempar.
 */
export function createKandidatSearch(opts: MetadataOptions) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const panggil: Panggil = buatPanggil(opts.fetch ?? fetch, timeoutMs);

  async function jalankan(
    sumber: StatusSumber["sumber"],
    kerja: (() => Promise<Kandidat[]>) | null,
  ): Promise<{ status: StatusSumber; kandidat: Kandidat[] }> {
    if (!kerja) return { status: { sumber, status: "dilewati", pesan: "Kunci API belum diatur" }, kandidat: [] };
    try {
      const kandidat = await dalamBatas(kerja(), timeoutMs);
      return { status: { sumber, status: kandidat.length ? "ok" : "kosong" }, kandidat };
    } catch (e) {
      const pesan = e instanceof GalatSumber ? e.message : "Sumber tidak bisa dihubungi";
      return { status: { sumber, status: "galat", pesan }, kandidat: [] };
    }
  }

  return async function cariKandidat({ judul, pengarang }: MasukanKandidat): Promise<HasilKandidat> {
    const masukan = { judul: judul.trim(), pengarang: pengarang?.trim() || undefined };
    const kunci = opts.googleApiKey;
    const hasil = await Promise.all([
      jalankan("openlibrary", () => cariKandidatOpenLibrary(panggil, masukan)),
      jalankan("google", kunci ? () => cariKandidatGoogle(panggil, masukan, kunci) : null),
    ]);
    return { kandidat: gabungkanKandidat(hasil.map((h) => h.kandidat)), sumber: hasil.map((h) => h.status) };
  };
}

export type KandidatSearch = ReturnType<typeof createKandidatSearch>;
