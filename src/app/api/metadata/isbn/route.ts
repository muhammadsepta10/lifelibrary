import { normalisasiIsbn } from "@/lib/isbn";
import { metadataRuntime } from "@/server/metadata/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

/** GET /api/metadata/isbn?isbn=... -> HasilPencarianMetadata (draf Buku atau "tidak ditemukan"). */
export async function GET(request: Request) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const isbn = normalisasiIsbn(new URL(request.url).searchParams.get("isbn") ?? "");
  if (!isbn.ok) return Response.json({ galat: isbn.pesan }, { status: 400 });

  try {
    return Response.json(await metadataRuntime().cariMetadataIsbn(isbn.isbn13));
  } catch (e) {
    console.error("pencarian metadata gagal", e);
    return Response.json({ galat: "Pencarian metadata gagal" }, { status: 500 });
  }
}
