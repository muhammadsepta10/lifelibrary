import type { HasilKandidat, HasilPencarianMetadata } from "@/lib/draf-buku";
import type { MasukanKandidat } from "@/lib/judul-kandidat";
import { bacaRespons } from "./baca-respons";

/** Pencarian metadata ISBN lewat server. Tanpa jaringan fetch melempar TypeError. */
export async function cariMetadataIsbn(isbn13: string): Promise<HasilPencarianMetadata> {
  const res = await fetch(`/api/metadata/isbn?isbn=${encodeURIComponent(isbn13)}`);
  return bacaRespons<HasilPencarianMetadata>(res, "Pencarian gagal");
}

/**
 * Meminta server mengunduh sampul Kandidat dan menyimpannya dengan kunci ISBN
 * hasil scan. `{ kunci: null }` bila unduhan gagal. Tanpa jaringan fetch
 * melempar TypeError.
 */
export async function simpanSampulKandidat(isbn13: string, url: string): Promise<{ kunci: string | null }> {
  const res = await fetch("/api/metadata/sampul", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isbn13, url }),
  });
  return bacaRespons<{ kunci: string | null }>(res, "Unduh sampul gagal");
}

/** Pencarian cadangan lewat judul. Tanpa jaringan fetch melempar TypeError; `signal` membatalkan permintaan lama. */
export async function cariKandidat(masukan: MasukanKandidat, signal?: AbortSignal): Promise<HasilKandidat> {
  const params = new URLSearchParams({ judul: masukan.judul });
  if (masukan.pengarang) params.set("pengarang", masukan.pengarang);
  const res = await fetch(`/api/metadata/judul?${params}`, { signal });
  return bacaRespons<HasilKandidat>(res, "Pencarian judul gagal");
}
