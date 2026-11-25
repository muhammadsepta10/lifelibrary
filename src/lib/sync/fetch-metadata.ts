import type { HasilKandidat, HasilPencarianMetadata } from "@/lib/draf-buku";
import type { MasukanKandidat } from "@/lib/judul-kandidat";
import { bacaRespons } from "./baca-respons";

/** Pencarian metadata ISBN lewat server. Tanpa jaringan fetch melempar TypeError. */
export async function cariMetadataIsbn(isbn13: string): Promise<HasilPencarianMetadata> {
  const res = await fetch(`/api/metadata/isbn?isbn=${encodeURIComponent(isbn13)}`);
  return bacaRespons<HasilPencarianMetadata>(res, "Pencarian gagal");
}

/** Pencarian cadangan lewat judul. Tanpa jaringan fetch melempar TypeError; `signal` membatalkan permintaan lama. */
export async function cariKandidat(masukan: MasukanKandidat, signal?: AbortSignal): Promise<HasilKandidat> {
  const params = new URLSearchParams({ judul: masukan.judul });
  if (masukan.pengarang) params.set("pengarang", masukan.pengarang);
  const res = await fetch(`/api/metadata/judul?${params}`, { signal });
  return bacaRespons<HasilKandidat>(res, "Pencarian judul gagal");
}
