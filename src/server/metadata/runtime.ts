import { singletonGlobal } from "@/server/singleton";
import { createCoverStoreFromEnv, type CoverStore } from "@/server/covers";
import { createMetadataLookup, type MetadataLookup } from "./index";

type Layanan = { cariMetadataIsbn: MetadataLookup; coverStore: CoverStore };

/**
 * Pencarian Metadata ISBN dan storage sampul dengan konfigurasi dari env.
 * GOOGLE_BOOKS_API_KEY hanya dibaca di server dan tidak pernah dikirim ke klien.
 */
export function metadataRuntime(): Layanan {
  return singletonGlobal("__lifelibraryMetadata", () => {
    const coverStore = createCoverStoreFromEnv();
    return {
      coverStore,
      cariMetadataIsbn: createMetadataLookup({
        coverStore,
        googleApiKey: process.env.GOOGLE_BOOKS_API_KEY || undefined,
      }),
    };
  });
}
