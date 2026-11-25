import { singletonGlobal } from "@/server/singleton";
import { createCoverStoreFromEnv, type CoverStore } from "@/server/covers";
import { createMetadataLookup, type MetadataLookup } from "./index";
import { createKandidatSearch, type KandidatSearch } from "./kandidat";
import { createSampulKandidat, type SimpanSampulKandidat } from "./sampul";

type Layanan = {
  cariMetadataIsbn: MetadataLookup;
  cariKandidat: KandidatSearch;
  simpanSampulKandidat: SimpanSampulKandidat;
  coverStore: CoverStore;
};

/**
 * Pencarian Metadata ISBN, Pencarian Kandidat, dan storage sampul dengan
 * konfigurasi dari env. GOOGLE_BOOKS_API_KEY hanya dibaca di server dan tidak
 * pernah dikirim ke klien.
 */
export function metadataRuntime(): Layanan {
  return singletonGlobal("__lifelibraryMetadata", () => {
    const coverStore = createCoverStoreFromEnv();
    const opsi = { coverStore, googleApiKey: process.env.GOOGLE_BOOKS_API_KEY || undefined };
    return {
      coverStore,
      cariMetadataIsbn: createMetadataLookup(opsi),
      cariKandidat: createKandidatSearch(opsi),
      simpanSampulKandidat: createSampulKandidat(opsi),
    };
  });
}
