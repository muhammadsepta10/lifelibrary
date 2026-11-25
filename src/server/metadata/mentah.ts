/**
 * Pembaca JSON mentah dari sumber metadata, dipakai bersama Open Library dan
 * Google Books. Apa pun yang tidak sesuai bentuknya menjadi undefined/kosong,
 * tidak pernah melempar.
 */
import type { Kandidat } from "@/lib/draf-buku";

export type Rekam = Record<string, unknown>;

export const rekam = (x: unknown): Rekam | null => (x && typeof x === "object" ? (x as Rekam) : null);

/** Teks tidak kosong, spasi tepi dibuang. */
export const teks = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x.trim() : undefined);

export const teksArray = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

/** Bilangan positif yang hingga. */
export const angka = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);

/** Menyalin hanya field opsional yang terisi ke Kandidat. */
export function isiOpsional(k: Kandidat, opsional: Partial<Omit<Kandidat, "id" | "sumber" | "judul">>): Kandidat {
  for (const [field, nilai] of Object.entries(opsional)) if (nilai !== undefined) Object.assign(k, { [field]: nilai });
  return k;
}
