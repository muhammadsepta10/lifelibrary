import type { ItemKoleksi } from "./index";

/** Buku di rak punggung dan grid sampul Beranda. */
export type BukuTerbaru = {
  bukuId: string;
  judul: string;
  pengarang: string;
  /** Warna Kategori Eksemplar terbaru Buku itu. */
  warna: string;
  sampul: string | null;
  /** Ada Eksemplar aktif Buku ini yang belum diterima server. */
  menungguSinkron: boolean;
};

export type RingkasanBeranda = {
  /** Buku (judul berbeda) yang punya paling sedikit satu Eksemplar aktif. */
  jumlahBuku: number;
  /** Eksemplar aktif (fisik); dua salinan satu Buku dihitung dua. */
  jumlahEksemplar: number;
  /** Eksemplar aktif yang sedang dipinjam. */
  jumlahDipinjam: number;
  /** Satu entri per Buku, Eksemplar yang dicatat paling akhir dulu. */
  terbaru: BukuTerbaru[];
};

export type ChipBeranda = {
  kunci: "terlambat" | "label" | "menunggu" | "gagal";
  jumlah: number;
  teks: string;
  /** Halaman yang dibuka chip ini. */
  href: string;
};

type JumlahChip = {
  terlambat: number | undefined;
  labelSiapDicetak: number | undefined;
  menungguSinkron: number | undefined;
  gagalTerkirim: number | undefined;
};

/** Chip status Beranda: hanya yang jumlahnya lebih dari nol (atau sudah dimuat), tiap chip menaut ke halamannya. */
export function susunChipBeranda(j: JumlahChip): ChipBeranda[] {
  const semua: ChipBeranda[] = [
    { kunci: "terlambat", jumlah: j.terlambat ?? 0, teks: `${j.terlambat} terlambat`, href: "/peminjaman?tab=terlambat" },
    { kunci: "label", jumlah: j.labelSiapDicetak ?? 0, teks: `${j.labelSiapDicetak} label siap dicetak`, href: "/cetak" },
    { kunci: "menunggu", jumlah: j.menungguSinkron ?? 0, teks: `${j.menungguSinkron} menunggu sinkron`, href: "/sinkron" },
    { kunci: "gagal", jumlah: j.gagalTerkirim ?? 0, teks: `${j.gagalTerkirim} gagal terkirim`, href: "/sinkron" },
  ];
  return semua.filter((c) => c.jumlah > 0);
}

/**
 * Ringkasan Beranda dari Koleksi. Yang dihitung hanya Eksemplar aktif: yang
 * sudah keluar (Penyiangan) tidak ada lagi di rak, jadi Buku yang semua
 * Eksemplarnya keluar juga tidak dihitung. Penyiangan menolak Eksemplar yang
 * sedang dipinjam, sehingga `jumlahDipinjam` sama dengan jumlah Peminjaman aktif.
 */
export function susunRingkasanBeranda(koleksi: ItemKoleksi[]): RingkasanBeranda {
  const aktif = koleksi.filter((k) => k.status === "aktif");
  const perBuku = new Map<string, BukuTerbaru & { waktu: string }>();
  for (const k of aktif) {
    const ada = perBuku.get(k.bukuId);
    if (ada) {
      ada.menungguSinkron ||= k.menungguSinkron;
      if (k.waktuDicatat > ada.waktu) {
        ada.waktu = k.waktuDicatat;
        ada.warna = k.kategori.warna;
      }
    } else {
      perBuku.set(k.bukuId, {
        bukuId: k.bukuId,
        judul: k.judul,
        pengarang: k.pengarang,
        warna: k.kategori.warna,
        sampul: k.sampul,
        menungguSinkron: k.menungguSinkron,
        waktu: k.waktuDicatat,
      });
    }
  }
  const terbaru: BukuTerbaru[] = [...perBuku.values()]
    .sort((a, b) => (a.waktu < b.waktu ? 1 : a.waktu > b.waktu ? -1 : 0))
    .map((b) => ({
      bukuId: b.bukuId,
      judul: b.judul,
      pengarang: b.pengarang,
      warna: b.warna,
      sampul: b.sampul,
      menungguSinkron: b.menungguSinkron,
    }));
  return {
    jumlahBuku: perBuku.size,
    jumlahEksemplar: aktif.length,
    jumlahDipinjam: aktif.filter((k) => k.dipinjam).length,
    terbaru,
  };
}
