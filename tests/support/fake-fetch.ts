import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Isi berkas rekaman di tests/fixtures/metadata. */
export const fixture = (nama: string) => readFileSync(fileURLToPath(new URL(`../fixtures/metadata/${nama}`, import.meta.url)), "utf8");

export type Balasan =
  | Response
  | Error
  /** Tidak pernah selesai dan mengabaikan AbortSignal, seperti fetch yang macet. */
  | "macet";

type Aturan = { cocok: string | RegExp; balas: Balasan | ((url: string, init?: RequestInit) => Balasan) };

export const json = (isi: string, status = 200) =>
  new Response(isi, { status, headers: { "content-type": "application/json" } });
export const xml = (isi: string) => new Response(isi, { headers: { "content-type": "text/xml" } });
export const tidakAda = () => new Response("", { status: 404 });
export const gambar = (byte = 1) =>
  new Response(new Uint8Array([0xff, 0xd8, 0xff, byte]), { headers: { "content-type": "image/jpeg" } });

/**
 * fetch palsu tanpa jaringan: aturan diperiksa berurutan, yang pertama cocok
 * dengan URL menang. URL tanpa aturan melempar galat supaya tes tidak diam-diam
 * mengandalkan jaringan.
 */
export function fakeFetch(aturan: Aturan[]) {
  const permintaan: { url: string; headers: Headers }[] = [];
  const fetchPalsu = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    permintaan.push({ url, headers: new Headers(init?.headers) });
    const a = aturan.find((x) => (typeof x.cocok === "string" ? url.includes(x.cocok) : x.cocok.test(url)));
    if (!a) throw new Error(`fakeFetch: tidak ada aturan untuk ${url}`);
    const balas = typeof a.balas === "function" ? a.balas(url, init) : a.balas;
    if (balas === "macet") return new Promise<Response>(() => {});
    if (balas instanceof Error) throw balas;
    // Balasan dari fungsi sudah segar per panggilan (boleh berisi stream yang diamati tes); yang statis disalin.
    return typeof a.balas === "function" ? balas : balas.clone();
  }) as typeof fetch;
  return { fetch: fetchPalsu, permintaan };
}
