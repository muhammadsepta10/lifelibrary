import { KelolaDitolakError } from "@/lib/kelola-protocol";

const STATUS = { "tidak-valid": 422, konflik: 409, "tidak-ditemukan": 404 } as const;

/**
 * Response untuk galat route Kelola dan Penyiangan: penolakan server dengan
 * status menurut jenisnya, JSON rusak = 400, sisanya 500 (dicatat di log server).
 */
export function responsGalatKelola(e: unknown, konteks: string): Response {
  if (e instanceof KelolaDitolakError) {
    return Response.json({ galat: e.pesan, jenis: e.jenis, field: e.field }, { status: STATUS[e.jenis] });
  }
  if (e instanceof SyntaxError) return Response.json({ galat: "Permintaan tidak valid" }, { status: 400 });
  console.error(`${konteks} gagal`, e);
  return Response.json({ galat: "Gagal menyimpan" }, { status: 500 });
}
