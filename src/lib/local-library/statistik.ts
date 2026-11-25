export type Statistik = {
  /** Eksemplar aktif (belum keluar). */
  totalEksemplar: number;
  /** Eksemplar aktif per Kategori terkini; hanya Kategori yang berisi, terbanyak dulu. */
  perKategori: { kategoriId: string; kode: string; nama: string; warna: string; jumlah: number }[];
  /**
   * Eksemplar yang masuk per bulan (`2026-03`) menurut tanggal masuk, termasuk
   * yang kemudian keluar karena yang diukur adalah pemasukan. Bulan tanpa
   * pemasukan di antara bulan pertama dan terakhir tetap tampil dengan 0.
   */
  perBulan: { bulan: string; jumlah: number }[];
  /** Eksemplar (aktif atau keluar) yang tanggal masuknya tidak diketahui; tidak masuk `perBulan`. */
  tanpaTanggalMasuk: number;
  /** Jumlah harga Eksemplar aktif, rupiah utuh. */
  totalNilai: number;
  /** Eksemplar aktif yang harganya kosong; tidak ikut `totalNilai`. */
  tanpaHarga: number;
};

export type MasukanStatistik = {
  status: "aktif" | "keluar";
  kategoriId: string;
  tanggalMasuk: string | null;
  harga: number | null;
};

const bulanBerikut = (b: string) => {
  const [t, m] = b.split("-").map(Number);
  return m === 12 ? `${t + 1}-01` : `${t}-${String(m + 1).padStart(2, "0")}`;
};

export function hitungStatistik(
  eksemplar: MasukanStatistik[],
  kategori: { id: string; kode: string; nama: string; warna: string }[],
): Statistik {
  const aktif = eksemplar.filter((e) => e.status === "aktif");

  const katById = new Map(kategori.map((k) => [k.id, k]));
  const jumlahKategori = new Map<string, number>();
  for (const e of aktif) jumlahKategori.set(e.kategoriId, (jumlahKategori.get(e.kategoriId) ?? 0) + 1);
  const perKategori = [...jumlahKategori]
    .flatMap(([id, jumlah]) => {
      const k = katById.get(id);
      return k ? [{ kategoriId: id, kode: k.kode, nama: k.nama, warna: k.warna, jumlah }] : [];
    })
    .sort((a, b) => b.jumlah - a.jumlah || a.kode.localeCompare(b.kode));

  const bulanHitung = new Map<string, number>();
  let tanpaTanggalMasuk = 0;
  for (const e of eksemplar) {
    if (!e.tanggalMasuk) {
      tanpaTanggalMasuk++;
      continue;
    }
    const bulan = e.tanggalMasuk.slice(0, 7);
    bulanHitung.set(bulan, (bulanHitung.get(bulan) ?? 0) + 1);
  }
  const perBulan: Statistik["perBulan"] = [];
  const bulanTerurut = [...bulanHitung.keys()].sort();
  if (bulanTerurut.length > 0) {
    const akhir = bulanTerurut[bulanTerurut.length - 1];
    for (let b = bulanTerurut[0]; b <= akhir; b = bulanBerikut(b)) {
      perBulan.push({ bulan: b, jumlah: bulanHitung.get(b) ?? 0 });
    }
  }

  return {
    totalEksemplar: aktif.length,
    perKategori,
    perBulan,
    tanpaTanggalMasuk,
    totalNilai: aktif.reduce((jumlah, e) => jumlah + (e.harga ?? 0), 0),
    tanpaHarga: aktif.filter((e) => e.harga === null).length,
  };
}
