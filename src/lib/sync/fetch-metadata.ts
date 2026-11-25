import type { HasilPencarianMetadata } from "@/lib/draf-buku";
import { LoginDiperlukanError } from "./fetch-transport";

/** Pencarian metadata ISBN lewat server. Tanpa jaringan fetch melempar TypeError. */
export async function cariMetadataIsbn(isbn13: string): Promise<HasilPencarianMetadata> {
  const res = await fetch(`/api/metadata/isbn?isbn=${encodeURIComponent(isbn13)}`);
  if (res.status === 401) throw new LoginDiperlukanError();
  if (!res.ok) {
    const badan = (await res.json().catch(() => ({}))) as { galat?: string };
    throw new Error(badan.galat ?? `Pencarian gagal (${res.status})`);
  }
  return (await res.json()) as HasilPencarianMetadata;
}
