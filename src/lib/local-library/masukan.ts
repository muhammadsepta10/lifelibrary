import type { z } from "zod";
import {
  bukuFieldSchemas,
  eksemplarFieldSchemas,
  NAMA_FIELD_BUKU,
  NAMA_FIELD_EKSEMPLAR,
  type FieldBuku,
  type FieldEksemplar,
} from "@/lib/buku-fields";
import { ValidasiError } from "./errors";

/** Isian form yang kosong berarti "tidak diisi" (null). */
const kosongJadiNull = (v: unknown) => {
  if (typeof v === "string" && v.trim() === "") return null;
  if (typeof v === "number" && Number.isNaN(v)) return v;
  return v;
};

function periksa(field: string, schema: z.ZodType, nilai: unknown) {
  const hasil = schema.safeParse(nilai);
  if (hasil.success) return hasil.data;
  throw new ValidasiError(field, hasil.error.issues[0].message);
}

/**
 * Memeriksa field Buku yang disebut (yang `undefined` dilewati) dan
 * mengembalikannya dalam bentuk simpanan: kosong = null, subjek = array.
 */
export function periksaFieldBuku(input: Partial<Record<keyof FieldBuku, unknown>>): Partial<FieldBuku> {
  const hasil: Record<string, unknown> = {};
  for (const key of NAMA_FIELD_BUKU) {
    if (input[key] === undefined) continue;
    let v = kosongJadiNull(input[key]);
    if (key === "judul" && v === null) v = "";
    if (key === "subjek" && v === null) v = [];
    const bersih = periksa(key, bukuFieldSchemas[key], v);
    hasil[key] = key === "subjek" ? (bersih ?? []) : (bersih ?? null);
  }
  return hasil as Partial<FieldBuku>;
}

/** Seperti `periksaFieldBuku`, untuk field Eksemplar di luar Kategori. */
export function periksaFieldEksemplar(
  input: Partial<Record<keyof FieldEksemplar, unknown>>,
): Partial<FieldEksemplar> {
  const hasil: Record<string, unknown> = {};
  for (const key of NAMA_FIELD_EKSEMPLAR) {
    if (input[key] === undefined) continue;
    hasil[key] = periksa(key, eksemplarFieldSchemas[key], kosongJadiNull(input[key])) ?? null;
  }
  return hasil as Partial<FieldEksemplar>;
}

export const samaNilai = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
