import { sql } from "drizzle-orm";
import { nomorIndukCounter } from "@/server/db/schema";
import type { Tx } from "./tx";

/** `{KODE}-{urut 3 digit, melebar bila > 999}/{tahun}` (ADR 0001). */
export function formatNomorInduk(kode: string, urut: number, tahun: number) {
  return `${kode}-${String(urut).padStart(3, "0")}/${tahun}`;
}

/**
 * Memberi nomor urut berikutnya untuk (kode Kategori, tahun pencatatan).
 * Harus dipanggil di dalam transaksi pemanggil: upsert atomik pada baris
 * penghitung menyerialkan penulis bersamaan dan tidak meninggalkan lubang
 * kalau transaksi pemanggil dibatalkan.
 */
export async function alokasiNomorInduk(tx: Tx, kode: string, tahun: number) {
  const [{ last }] = await tx
    .insert(nomorIndukCounter)
    .values({ kode, tahun, last: 1 })
    .onConflictDoUpdate({
      target: [nomorIndukCounter.kode, nomorIndukCounter.tahun],
      set: { last: sql`${nomorIndukCounter.last} + 1` },
    })
    .returning({ last: nomorIndukCounter.last });
  return formatNomorInduk(kode, last, tahun);
}
