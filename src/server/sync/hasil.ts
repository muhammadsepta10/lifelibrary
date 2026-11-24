import type { HasilMutasi } from "@/lib/sync-protocol";

export type HasilTanpaId =
  | Omit<Extract<HasilMutasi, { status: "diterima" }>, "id">
  | Omit<Extract<HasilMutasi, { status: "ditolak" }>, "id">;

export const diterima = (extra: { nomorInduk?: string; eksemplarId?: string } = {}): HasilTanpaId => ({
  status: "diterima",
  ...extra,
});
export const ditolak = (alasan: string): HasilTanpaId => ({ status: "ditolak", alasan });

/**
 * Catat waktu ubah (UTC ISO) untuk tiap field yang disebut. Dasar penyelesaian
 * konflik per field (tiket #5); belum dipakai untuk menolak perubahan.
 */
export function tandaiWaktu(lama: Record<string, string>, fields: string[], waktuUbah: string) {
  const waktu = new Date(waktuUbah).toISOString();
  return { ...lama, ...Object.fromEntries(fields.map((f) => [f, waktu])) };
}
