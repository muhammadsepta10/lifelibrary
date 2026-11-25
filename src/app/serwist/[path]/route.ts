import { createSerwistRoute } from "@serwist/turbopack";

// Berkas di public/ (ikon, dan /zxing/zxing_reader.wasm untuk scan offline) ikut precache
// otomatis dengan revisi hash isinya; hanya halaman offline yang perlu ditambahkan.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [
    { url: "/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  ],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
