/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
  type SerwistPlugin,
} from "serwist";
import { CACHE_HALAMAN, CACHE_SAMPUL, PESAN_SIMPAN_RUTE, kunciHalaman } from "@/lib/rute-cangkang";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/** Hanya jawaban sukses langsung (bukan pengalihan ke /login) yang boleh menjadi cangkang offline. */
const hanyaHalamanSungguhan: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (response.ok && !response.redirected ? response : null),
  // Satu cangkang per path: /buku?id=1 dan /buku?id=2 adalah halaman yang sama, datanya dari Dexie.
  cacheKeyWillBeUsed: async ({ request }) => new Request(kunciHalaman(request.url)),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Sampul: tidak berubah untuk kunci yang sama (immutable), jadi cache dulu supaya tampil offline.
    // Harus sebelum aturan /api/ di bawah.
    {
      matcher: ({ url, request, sameOrigin }) =>
        sameOrigin && request.method === "GET" && url.pathname.startsWith("/api/covers/"),
      handler: new CacheFirst({
        cacheName: CACHE_SAMPUL,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 2000, purgeOnQuotaError: true }),
        ],
      }),
    },
    // Data pribadi: API (auth, sinkronisasi, metadata) tidak boleh dilayani dari cache.
    { matcher: ({ url }) => url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    // Halaman aplikasi: jaringan dulu supaya selalu terbaru, cache bila offline atau jaringan lambat.
    // Tanpa batas umur: aplikasi harus terbuka walau browser dimulai offline berhari-hari.
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: CACHE_HALAMAN,
        networkTimeoutSeconds: 4,
        plugins: [hanyaHalamanSungguhan],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

/**
 * Halaman menyuruh SW menyimpan cangkang aplikasi setelah dibuka online.
 * Rute di balik login tidak bisa di-precache saat install (belum ada sesi),
 * dan Pemilik mungkin tidak pernah mengunjungi setiap halaman sebelum offline.
 */
self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; urls?: string[] } | undefined;
  if (data?.type !== PESAN_SIMPAN_RUTE || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => typeof u === "string" && u.startsWith("/"));
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_HALAMAN);
      await Promise.all(
        urls.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: "same-origin" });
            if (response.ok && !response.redirected) {
              await cache.put(kunciHalaman(new URL(url, self.location.origin).href), response);
            }
          } catch {
            // offline atau gagal: dicoba lagi saat aplikasi dibuka online berikutnya
          }
        }),
      );
    })(),
  );
});
