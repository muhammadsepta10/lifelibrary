import { KUNCI_SAMPUL } from "@/server/covers";
import { metadataRuntime } from "@/server/metadata/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string[] }> };

/** GET /api/covers/{kunci}: sampul dari storage aplikasi, hanya untuk Pemilik yang login. */
export async function GET(request: Request, { params }: Ctx) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const { key } = await params;
  const kunci = key.length === 1 ? key[0] : "";
  if (!KUNCI_SAMPUL.test(kunci)) {
    return Response.json({ galat: "Tidak ditemukan" }, { status: 404 });
  }
  const sampul = await metadataRuntime().coverStore.get(kunci);
  if (!sampul) return Response.json({ galat: "Tidak ditemukan" }, { status: 404 });
  return new Response(new Uint8Array(sampul.bytes), {
    headers: {
      "content-type": sampul.contentType,
      // Sampul tidak berubah untuk kunci yang sama; boleh disimpan lama di perangkat Pemilik.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
