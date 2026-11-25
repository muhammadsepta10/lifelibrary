import JsBarcode from "jsbarcode";

/**
 * Code 128 sebagai deretan modul: "1" = batang, "0" = spasi, tiap karakter
 * satu modul (lebar sama). Dibuat tanpa DOM supaya bisa dirender di server
 * maupun klien sebagai SVG dan diuji sebagai teks biasa.
 */
export function modulCode128(teks: string): string {
  const hasil: { encodings: { data: string }[] } = { encodings: [] };
  JsBarcode(hasil, teks, { format: "CODE128" });
  return hasil.encodings.map((e) => e.data).join("");
}
