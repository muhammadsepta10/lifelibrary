import { createCoverStoreFromEnv, type CoverStore } from "@/server/covers";
import { createMetadataLookup, type MetadataLookup } from "./index";

type Layanan = { cariMetadataIsbn: MetadataLookup; coverStore: CoverStore };

// globalThis supaya HMR dev tidak membuat ulang layanan.
const g = globalThis as unknown as { __lifelibraryMetadata?: Layanan };

/**
 * Pencarian Metadata ISBN dan storage sampul dengan konfigurasi dari env.
 * GOOGLE_BOOKS_API_KEY hanya dibaca di server dan tidak pernah dikirim ke klien.
 */
export function metadataRuntime(): Layanan {
  if (!g.__lifelibraryMetadata) {
    const coverStore = createCoverStoreFromEnv();
    g.__lifelibraryMetadata = {
      coverStore,
      cariMetadataIsbn: createMetadataLookup({
        coverStore,
        googleApiKey: process.env.GOOGLE_BOOKS_API_KEY || undefined,
      }),
    };
  }
  return g.__lifelibraryMetadata;
}
