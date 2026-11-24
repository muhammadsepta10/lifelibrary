import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { Mutasi } from "@/lib/sync-protocol";

export const KATEGORI_ID = Object.fromEntries(
  PRESET_KATEGORI.map((k) => [k.kode, k.id]),
) as Record<string, string>;

/** Satu Buku manual + satu Eksemplar, seperti yang dikirim satu perangkat. */
export function mutasiBukuDanEksemplar(opts: {
  judul?: string;
  kode?: string;
  waktuDicatat?: string;
}) {
  const bukuId = crypto.randomUUID();
  const eksemplarId = crypto.randomUUID();
  const mutasi: Mutasi[] = [
    {
      id: crypto.randomUUID(),
      jenis: "buku.tambah",
      buku: {
        id: bukuId,
        judul: opts.judul ?? "Laut Bercerita",
        kontributor: [
          { id: crypto.randomUUID(), nama: "Leila S. Chudori", peran: "pengarang", utama: true },
        ],
      },
    },
    {
      id: crypto.randomUUID(),
      jenis: "eksemplar.catat",
      eksemplar: {
        id: eksemplarId,
        bukuId,
        kategoriId: KATEGORI_ID[opts.kode ?? "FIK"],
        waktuDicatat: opts.waktuDicatat ?? "2026-03-14T10:00:00+07:00",
      },
    },
  ];
  return { bukuId, eksemplarId, mutasi };
}
