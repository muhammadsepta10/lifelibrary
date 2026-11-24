import { sql } from "drizzle-orm";
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
  const res = await tx.execute(sql`
    insert into nomor_induk_counter (kode, tahun, last) values (${kode}, ${tahun}, 1)
    on conflict (kode, tahun) do update set last = nomor_induk_counter.last + 1
    returning last
  `);
  const last = (res as unknown as { rows: { last: number }[] }).rows[0].last;
  return formatNomorInduk(kode, last, tahun);
}
