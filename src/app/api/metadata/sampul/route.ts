import { normalisasiIsbn } from "@/lib/isbn";
import { urlSampulDiizinkan } from "@/server/metadata/sampul";
import { metadataRuntime } from "@/server/metadata/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

/**
 * POST /api/metadata/sampul { isbn13, url } -> { kunci } (sampul Kandidat yang
 * dipilih Pemilik diunduh server dan disimpan dengan kunci ISBN hasil scan).
 * Unduhan gagal bukan galat: { kunci: null }.
 */
export async function POST(request: Request) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const body: unknown = await request.json().catch(() => null);
  const mentah = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const isbn = normalisasiIsbn(typeof mentah.isbn13 === "string" ? mentah.isbn13 : "");
  if (!isbn.ok) return Response.json({ galat: isbn.pesan }, { status: 400 });
  const url = mentah.url;
  if (typeof url !== "string" || !urlSampulDiizinkan(url)) {
    return Response.json({ galat: "Alamat sampul tidak diizinkan" }, { status: 400 });
  }

  try {
    const hasil = await metadataRuntime().simpanSampulKandidat({ isbn13: isbn.isbn13, url });
    return Response.json({ kunci: hasil?.kunci ?? null });
  } catch (e) {
    console.error("simpan sampul kandidat gagal", e);
    return Response.json({ kunci: null });
  }
}
