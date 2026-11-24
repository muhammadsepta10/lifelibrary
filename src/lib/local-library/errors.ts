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
