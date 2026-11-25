import type { HasilPencarianMetadata } from "@/lib/draf-buku";
import { bacaRespons } from "./baca-respons";

/** Pencarian metadata ISBN lewat server. Tanpa jaringan fetch melempar TypeError. */
export async function cariMetadataIsbn(isbn13: string): Promise<HasilPencarianMetadata> {
  const res = await fetch(`/api/metadata/isbn?isbn=${encodeURIComponent(isbn13)}`);
  return bacaRespons<HasilPencarianMetadata>(res, "Pencarian gagal");
}
