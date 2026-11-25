import { tolakJikaBukanPemilik } from "@/server/require-owner";
import { runtime } from "@/server/runtime";

export const dynamic = "force-dynamic";

/**
 * GET /api/buku-induk/ekspor?format=csv|pdf[&tahun=2026]
 * Ekspor Buku Induk, hanya online (ADR 0004).
 */
export async function GET(request: Request) {
  const tolak = await tolakJikaBukanPemilik(request);
  if (tolak) return tolak;

  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  const tahunMentah = params.get("tahun");
  const tahun = tahunMentah ? Number(tahunMentah) : null;
  if ((format !== "csv" && format !== "pdf") || (tahunMentah && !Number.isInteger(tahun))) {
    return Response.json({ galat: "Permintaan tidak valid" }, { status: 400 });
  }

  const { bukuInduk } = runtime();
  const nama = `buku-induk${tahun ? `-${tahun}` : ""}.${format}`;
  const kepala = { "content-disposition": `attachment; filename="${nama}"`, "cache-control": "no-store" };
  try {
    if (format === "csv") {
      return new Response(await bukuInduk.csv({ tahun }), {
        headers: { ...kepala, "content-type": "text/csv; charset=utf-8" },
      });
    }
    return new Response(Buffer.from(await bukuInduk.pdf({ tahun })), {
      headers: { ...kepala, "content-type": "application/pdf" },
    });
  } catch (e) {
    console.error("ekspor Buku Induk gagal", e);
    return Response.json({ galat: "Gagal membuat ekspor" }, { status: 500 });
  }
}
