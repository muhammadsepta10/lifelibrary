/**
 * Pemindai barcode (ZXing, WASM) memuat berkas `.wasm` dari jsDelivr secara
 * bawaan, sehingga scan tidak jalan offline. Kita menyajikannya dari
 * `public/zxing/` (disalin dari paket `zxing-wasm`; tes menjaga agar hash-nya
 * sama dengan yang diharapkan `barcode-detector`) dan Service Worker
 * menyimpannya lewat precache.
 */
export const ALAMAT_WASM_ZXING = "/zxing/zxing_reader.wasm";

export function locateFileZxing(path: string, prefix: string): string {
  return path.endsWith(".wasm") ? ALAMAT_WASM_ZXING : prefix + path;
}
