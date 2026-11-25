import { penyianganSchema } from "@/lib/penyiangan-protocol";
import { parse } from "@/server/kelola/galat";
import { responsGalatKelola } from "@/server/respons-kelola";
import { tolakJikaBukanPemilik } from "@/server/require-owner";
import { runtime } from "@/server/runtime";

export const dynamic = "force-dynamic";

/** POST /api/penyiangan/{eksemplarId}: Penyiangan, hanya online (ADR 0004). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const { id } = await params;
  try {
    const badan = parse(penyianganSchema, await request.json());
    return Response.json(await runtime().penyiangan.siangi(id, badan));
  } catch (e) {
    return responsGalatKelola(e, "penyiangan");
  }
}
