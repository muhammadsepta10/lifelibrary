/**
 * Pola Nomor Induk pada Label Barcode: kode Kategori (2-5 huruf besar atau
 * angka, sama dengan `kodeKategori` di kelola-protocol), nomor urut minimal
 * 3 digit, dan tahun pencatatan: `FIK-001/2026`. Nomor urut melebar bila > 999.
 */
export const POLA_NOMOR_INDUK = /^[A-Z0-9]{2,5}-\d{3,}\/\d{4}$/;

/** Teks hasil scan (Code 128) sebagai Nomor Induk, atau null bila bukan. Spasi di tepi dibuang. */
export function bacaNomorInduk(teks: string): string | null {
  const bersih = teks.trim();
  return POLA_NOMOR_INDUK.test(bersih) ? bersih : null;
}
