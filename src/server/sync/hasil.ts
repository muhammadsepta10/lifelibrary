import type { FieldDitimpa, HasilMutasi } from "@/lib/sync-protocol";

export type HasilTanpaId =
  | Omit<Extract<HasilMutasi, { status: "diterima" }>, "id">
  | Omit<Extract<HasilMutasi, { status: "ditolak" }>, "id">;

export const diterima = (
  extra: { nomorInduk?: string; eksemplarId?: string; ditimpa?: FieldDitimpa[] } = {},
): HasilTanpaId => {
  const { ditimpa, ...sisa } = extra;
  return { status: "diterima", ...sisa, ...(ditimpa?.length ? { ditimpa } : {}) };
};
export const ditolak = (alasan: string): HasilTanpaId => ({ status: "ditolak", alasan });

/**
 * Catat waktu ubah (UTC ISO) untuk tiap field yang disebut. Dasar penyelesaian
 * konflik per field (ADR 0004).
 */
export function tandaiWaktu(lama: Record<string, string>, fields: string[], waktuUbah: string) {
  const waktu = new Date(waktuUbah).toISOString();
  return { ...lama, ...Object.fromEntries(fields.map((f) => [f, waktu])) };
}

/**
 * Last-write-wins per field: sebuah field menang bila waktu ubahnya tidak lebih
 * awal daripada waktu terakhir field itu di server. Field yang belum pernah
 * diubah (tanpa kunci) berwaktu epoch.
 */
export function bagiMenangKalah<F extends string>(lama: Record<string, string>, fields: F[], waktuUbah: string) {
  const waktu = new Date(waktuUbah).getTime();
  const menang: F[] = [];
  const kalah: F[] = [];
  for (const f of fields) {
    const tercatat = lama[f] ? new Date(lama[f]).getTime() : 0;
    (waktu >= tercatat ? menang : kalah).push(f);
  }
  return { menang, kalah, fieldWaktu: tandaiWaktu(lama, menang, waktuUbah) };
}
