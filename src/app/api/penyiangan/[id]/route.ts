import { KelolaDitolakError } from "@/lib/kelola-protocol";
import type { PenyianganInput } from "@/lib/penyiangan-protocol";
import { tolakJikaBukanPemilik } from "@/server/require-owner";
import { runtime } from "@/server/runtime";

export const dynamic = "force-dynamic";

const STATUS = { "tidak-valid": 422, konflik: 409, "tidak-ditemukan": 404 } as const;

/** POST /api/penyiangan/{eksemplarId}: Penyiangan, hanya online (ADR 0004). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const { id } = await params;
  try {
    // Masukan divalidasi di dalam API Penyiangan.
    const body = (await request.json()) as PenyianganInput;
    return Response.json(await runtime().penyiangan.siangi(id, body));
  } catch (e) {
    if (e instanceof KelolaDitolakError) {
      return Response.json({ galat: e.pesan, jenis: e.jenis, field: e.field }, { status: STATUS[e.jenis] });
    }
    if (e instanceof SyntaxError) return Response.json({ galat: "Permintaan tidak valid" }, { status: 400 });
    console.error("penyiangan gagal", e);
    return Response.json({ galat: "Gagal menyimpan" }, { status: 500 });
  }
}
