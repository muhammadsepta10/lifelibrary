import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSerwistRoute } from "@serwist/turbopack";
import { ALAMAT_WASM_ZXING } from "@/lib/zxing-lokal";

const revisiBuild = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
// WASM pemindai ISBN ikut precache supaya scan kamera jalan offline; revisinya hash isinya.
const revisiWasm = createHash("sha256")
  .update(readFileSync(join(process.cwd(), "public", ALAMAT_WASM_ZXING)))
  .digest("hex");

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [
    { url: "/~offline", revision: revisiBuild },
    { url: ALAMAT_WASM_ZXING, revision: revisiWasm },
  ],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
