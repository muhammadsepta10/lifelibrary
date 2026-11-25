/**
 * Pemeriksaan build (bukan tes perilaku): `pnpm check:build`, aman dijalankan di CI.
 *
 * 1. `public/zxing/zxing_reader.wasm` identik dengan .wasm yang dipakai paket
 *    `barcode-detector` (hash SHA-256), supaya scan offline tidak melenceng saat
 *    paket dinaikkan.
 * 2. `RUTE_CANGKANG` memuat setiap halaman di `src/app/(app)` dan tidak memuat
 *    rute yang tidak ada, supaya halaman terbuka saat browser dimulai offline.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ZXING_WASM_SHA256 } from "barcode-detector/ponyfill";
import { RUTE_CANGKANG } from "../src/lib/rute-cangkang";
import { ALAMAT_WASM_ZXING } from "../src/lib/zxing-lokal";

const galat: string[] = [];

const hash = createHash("sha256")
  .update(readFileSync(join(process.cwd(), "public", ALAMAT_WASM_ZXING)))
  .digest("hex");
if (hash !== ZXING_WASM_SHA256) {
  galat.push(`public${ALAMAT_WASM_ZXING} (sha256 ${hash}) berbeda dari yang diharapkan barcode-detector (${ZXING_WASM_SHA256})`);
}

function rutePadaDisk(): string[] {
  const hasil: string[] = [];
  const telusuri = (dir: string, rute: string) => {
    for (const nama of readdirSync(dir)) {
      const jalur = join(dir, nama);
      if (statSync(jalur).isDirectory()) telusuri(jalur, `${rute}/${nama}`);
      else if (nama === "page.tsx") hasil.push(rute === "" ? "/" : rute);
    }
  };
  telusuri(join(process.cwd(), "src/app/(app)"), "");
  return hasil.sort();
}

const ada = rutePadaDisk();
for (const rute of ada) {
  if (!RUTE_CANGKANG.includes(rute)) galat.push(`RUTE_CANGKANG belum memuat halaman ${rute}`);
}
if (!RUTE_CANGKANG.includes("/login")) galat.push("RUTE_CANGKANG harus memuat /login (Keluar tanpa koneksi)");
const dikenal = new Set([...ada, "/login"]);
for (const rute of RUTE_CANGKANG) {
  if (!dikenal.has(rute)) galat.push(`RUTE_CANGKANG memuat rute yang tidak ada: ${rute}`);
}

if (galat.length > 0) {
  console.error(`check:build gagal:\n- ${galat.join("\n- ")}`);
  process.exit(1);
}
console.log(`check:build ok (wasm ZXING sesuai, ${ada.length} halaman (app) ada di RUTE_CANGKANG)`);
