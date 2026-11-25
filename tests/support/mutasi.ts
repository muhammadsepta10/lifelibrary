import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { Mutasi } from "@/lib/sync-protocol";

export const KATEGORI_ID = Object.fromEntries(
  PRESET_KATEGORI.map((k) => [k.kode, k.id]),
) as Record<string, string>;

/** Mutasi pinjam satu Eksemplar ke Peminjam (baru, kecuali `peminjamId` diberikan). */
export function mutasiPinjam(opts: {
  eksemplarId: string;
  nama?: string;
  kontak?: string | null;
  peminjamId?: string;
  peminjamanId?: string;
  tanggalPinjam?: string;
  jatuhTempo?: string;
  waktuUbah?: string;
}): Extract<Mutasi, { jenis: "peminjaman.pinjamkan" }> {
  return {
    id: crypto.randomUUID(),
    jenis: "peminjaman.pinjamkan",
    waktuUbah: opts.waktuUbah ?? "2026-11-25T09:00:00+07:00",
    peminjam: {
      id: opts.peminjamId ?? crypto.randomUUID(),
      nama: opts.nama ?? "Rina",
      kontak: opts.kontak ?? "081234567890",
    },
    peminjaman: {
      id: opts.peminjamanId ?? crypto.randomUUID(),
      eksemplarId: opts.eksemplarId,
      tanggalPinjam: opts.tanggalPinjam ?? "2026-11-25",
      jatuhTempo: opts.jatuhTempo ?? "2026-12-09",
    },
  };
}

/** Satu Buku manual + satu Eksemplar, seperti yang dikirim satu perangkat. */
export function mutasiBukuDanEksemplar(opts: {
  judul?: string;
  kode?: string;
  /** Menimpa `kode` bila Kategorinya bukan preset (mis. buatan Pemilik). */
  kategoriId?: string;
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
        kategoriId: opts.kategoriId ?? KATEGORI_ID[opts.kode ?? "FIK"],
        waktuDicatat: opts.waktuDicatat ?? "2026-03-14T10:00:00+07:00",
      },
    },
  ];
  return { bukuId, eksemplarId, mutasi };
}
