import { masukanKandidat, PANJANG_MIN_JUDUL } from "@/lib/judul-kandidat";
import { metadataRuntime } from "@/server/metadata/runtime";
import { tolakJikaBukanPemilik } from "@/server/require-owner";

export const dynamic = "force-dynamic";

/** GET /api/metadata/judul?judul=...&pengarang=... -> { kandidat, sumber } (pencarian cadangan saat ISBN tidak ditemukan). */
export async function GET(request: Request) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const params = new URL(request.url).searchParams;
  const masukan = masukanKandidat(params.get("judul"), params.get("pengarang"));
  if (!masukan) return Response.json({ galat: `Judul minimal ${PANJANG_MIN_JUDUL} karakter` }, { status: 400 });

  try {
    return Response.json(await metadataRuntime().cariKandidat(masukan));
  } catch (e) {
    console.error("pencarian kandidat gagal", e);
    return Response.json({ galat: "Pencarian judul gagal" }, { status: 500 });
  }
}
