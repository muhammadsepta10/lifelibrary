import { sql } from "drizzle-orm";
import { z } from "zod";
import { KelolaDitolakError } from "@/lib/kelola-protocol";
import { eksemplar } from "@/server/db/schema";

/** Validasi masukan; pelanggaran pertama jadi penolakan yang menunjuk field-nya. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const res = schema.safeParse(input);
  if (res.success) return res.data;
  const isu = res.error.issues[0];
  throw new KelolaDitolakError(
    "tidak-valid",
    isu.path.length ? String(isu.path[0]) : null,
    isu.message,
  );
}

export const tidakDitemukan = (apa: string) =>
  new KelolaDitolakError("tidak-ditemukan", null, `${apa} tidak ditemukan`);

/** Pembaruan `updatedAt` memakai jam server supaya pull perangkat lain melihat perubahannya. */
export const sekarangServer = sql`clock_timestamp()`;

/**
 * `set` untuk memasukkan Eksemplar ke Antrean Cetak karena sesuatu di server
 * mengubah Nomor Panggilnya (judul, Pengarang Utama, kode Kategori). Cap waktu
 * `perluCetak` memakai jam server, supaya penandaan tercetak yang lebih lama dari
 * perangkat lain tidak menimpanya (LWW per field, ADR 0004).
 */
export const masukAntreanCetak = () => ({
  perluCetak: true,
  fieldWaktu: sql`${eksemplar.fieldWaktu} || ${JSON.stringify({ perluCetak: new Date().toISOString() })}::jsonb`,
  updatedAt: sekarangServer,
});

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const idValid = (id: string) => uuidRe.test(id);

/** Pelanggaran indeks unik Postgres (kode 23505), langsung atau dibungkus drizzle. */
export function pelanggaranUnik(e: unknown): boolean {
  const kode = (x: unknown) => (x as { code?: string } | null)?.code;
  return kode(e) === "23505" || kode((e as { cause?: unknown } | null)?.cause) === "23505";
}
