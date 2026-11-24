/** Perintah ditolak karena masukan tidak valid; `pesan` siap ditampilkan ke Pemilik. */
export class ValidasiError extends Error {
  constructor(
    public readonly field: string,
    public readonly pesan: string,
  ) {
    super(pesan);
    this.name = "ValidasiError";
  }
}

/**
 * Mengelola Kategori, Lokasi, dan Aturan Kategori hanya bisa online (ADR 0004).
 * Pesannya dipakai apa adanya sebagai keterangan di UI.
 */
export class ButuhKoneksiError extends Error {
  constructor() {
    super("Butuh koneksi");
    this.name = "ButuhKoneksiError";
  }
}
