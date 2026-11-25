/**
 * "Keluar & hapus data di perangkat ini" (ADR 0004): menghapus salinan lokal
 * (IndexedDB) dan semua cache Service Worker, lalu keluar dari akun. Data
 * dihapus lebih dulu: keluar butuh koneksi, padahal tujuan aksi ini (mis.
 * perangkat dijual atau dipinjamkan) harus tercapai juga saat offline.
 */

export type RingkasanDataPerangkat = {
  /** Perubahan di outbox yang belum diterima server, termasuk yang Gagal terkirim. */
  belumTerkirim: number;
  /** Draf scan ISBN yang masih menunggu metadata. */
  drafMenunggu: number;
};

export function pesanKonfirmasiHapus({ belumTerkirim, drafMenunggu }: RingkasanDataPerangkat): string {
  const hilang: string[] = [];
  if (belumTerkirim > 0) hilang.push(`${belumTerkirim} perubahan belum terkirim`);
  if (drafMenunggu > 0) hilang.push(`${drafMenunggu} draf menunggu data`);
  const akibat =
    hilang.length > 0
      ? `${hilang.join(" dan ")} akan hilang dan tidak bisa dipulihkan.`
      : "Tidak ada perubahan yang belum terkirim, jadi tidak ada yang hilang dari koleksi di server.";
  return `Hapus semua data di perangkat ini dan keluar? ${akibat}`;
}

type PenyimpananCache = { keys(): Promise<string[]>; delete(nama: string): Promise<boolean> };

export async function keluarDanHapusData(deps: {
  library: { hapusDataPerangkat(): Promise<void> };
  /** `caches` browser; undefined bila tidak tersedia. */
  cacheStorage: PenyimpananCache | undefined;
  signOut: () => Promise<unknown>;
  /** Dipanggil bila keluar gagal (offline): keluar diulang saat aplikasi dibuka online lagi. */
  tandaiKeluarTertunda: () => void;
}): Promise<{ keluar: boolean }> {
  await deps.library.hapusDataPerangkat();
  if (deps.cacheStorage) {
    for (const nama of await deps.cacheStorage.keys()) await deps.cacheStorage.delete(nama);
  }
  try {
    await deps.signOut();
    return { keluar: true };
  } catch {
    deps.tandaiKeluarTertunda();
    return { keluar: false };
  }
}
