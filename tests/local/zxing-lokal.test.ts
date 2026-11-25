import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZXING_WASM_SHA256 } from "barcode-detector/ponyfill";
import { ALAMAT_WASM_ZXING, locateFileZxing } from "@/lib/zxing-lokal";

describe("pemindai ZXing dihosting sendiri supaya scan jalan offline", () => {
  it("berkas .wasm diminta dari aplikasi sendiri, bukan dari CDN", () => {
    expect(locateFileZxing("zxing_reader.wasm", "https://cdn.example/")).toBe(ALAMAT_WASM_ZXING);
    expect(ALAMAT_WASM_ZXING.startsWith("/")).toBe(true);
  });

  it("berkas selain .wasm tetap memakai awalan bawaan", () => {
    expect(locateFileZxing("zxing_reader.js", "/awalan/")).toBe("/awalan/zxing_reader.js");
  });

  it("berkas di public/ identik dengan .wasm yang dipakai paket barcode-detector (versi tidak melenceng)", () => {
    const bytes = readFileSync(join(process.cwd(), "public", ALAMAT_WASM_ZXING));

    expect(createHash("sha256").update(bytes).digest("hex")).toBe(ZXING_WASM_SHA256);
  });
});
