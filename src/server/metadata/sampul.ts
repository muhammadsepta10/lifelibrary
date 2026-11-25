import type { CoverStore } from "@/server/covers";
import { buatPanggil, type Panggil } from "./http";

const JENIS_SAMPUL: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAKS_BYTE_SAMPUL = 5 * 1024 * 1024;

/** Host sampul yang dikenal (ADR 0007): endpoint unduhan tidak boleh mengambil alamat sembarang. */
const HOST_SAMPUL_DIIZINKAN = new Set(["covers.openlibrary.org", "books.google.com", "books.googleusercontent.com"]);

/** Open Library mengalihkan sampulnya ke archive.org (dan subdomainnya); hanya sah sebagai tujuan pengalihan. */
const hostArsip = (host: string) => host === "archive.org" || host.endsWith(".archive.org");

const amanDanBerkredensial = (u: URL) => u.protocol === "https:" && !u.username && !u.password;

/** Hanya `https` dari host sampul yang dikenal, tanpa kredensial di alamat. */
export function urlSampulDiizinkan(url: string): boolean {
  try {
    const u = new URL(url);
    return amanDanBerkredensial(u) && HOST_SAMPUL_DIIZINKAN.has(u.hostname);
  } catch {
    return false;
  }
}

/** Tujuan pengalihan: host sampul yang dikenal atau archive.org, selalu `https` tanpa kredensial. */
function tujuanPengalihanDiizinkan(u: URL): boolean {
  return amanDanBerkredensial(u) && (HOST_SAMPUL_DIIZINKAN.has(u.hostname) || hostArsip(u.hostname));
}

const MAKS_LOMPATAN = 3;

/**
 * GET dengan pengalihan manual: setiap `Location` (relatif di-resolve) harus
 * lolos tujuanPengalihanDiizinkan sebelum diambil, paling banyak 3 lompatan.
 * Mengembalikan null bila pengalihan ditolak, berputar, atau terlalu panjang.
 */
async function ambilDenganPengalihanAman(panggil: Panggil, url: string): Promise<Response | null> {
  let sekarang = url;
  for (let lompatan = 0; lompatan <= MAKS_LOMPATAN; lompatan++) {
    const res = await panggil(sekarang, { redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    void res.body?.cancel().catch(() => {});
    const lokasi = res.headers.get("location");
    if (!lokasi) return null;
    const tujuan = new URL(lokasi, sekarang);
    if (!tujuanPengalihanDiizinkan(tujuan)) return null;
    sekarang = tujuan.href;
  }
  return null;
}

/** Membaca isi sampai paling banyak `maks` byte; null bila isi lebih besar (aliran dibatalkan, sisanya tidak dibaca). */
async function bacaIsiTerbatas(res: Response, maks: number): Promise<Uint8Array | null> {
  const panjang = Number(res.headers.get("content-length"));
  if (Number.isFinite(panjang) && panjang > maks) {
    void res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const bagian: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maks) {
      void reader.cancel().catch(() => {});
      return null;
    }
    bagian.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const b of bagian) {
    bytes.set(b, offset);
    offset += b.byteLength;
  }
  return bytes;
}

/**
 * Mengunduh satu gambar sampul, memvalidasinya (jenis gambar yang dikenal,
 * tidak kosong, paling besar 5 MB), lalu menyimpannya di cover store dengan
 * kunci ISBN. Pengalihan diikuti manual (maks. 3 lompatan) dan setiap tujuan
 * diperiksa; batas ukuran ditegakkan saat membaca, bukan setelahnya.
 * Kegagalan apa pun menghasilkan null, tidak pernah melempar.
 * Dipakai bersama oleh Pencarian Metadata ISBN dan sampul Kandidat.
 */
export async function unduhDanSimpanSampul(
  panggil: Panggil,
  coverStore: CoverStore,
  isbn13: string,
  url: string,
): Promise<string | null> {
  try {
    const res = await ambilDenganPengalihanAman(panggil, url);
    if (!res) return null;
    const jenis = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const ekstensi = JENIS_SAMPUL[jenis];
    if (!res.ok || !ekstensi) {
      void res.body?.cancel().catch(() => {});
      return null;
    }
    const bytes = await bacaIsiTerbatas(res, MAKS_BYTE_SAMPUL);
    if (!bytes || bytes.length === 0) return null;
    const kunci = `${isbn13}.${ekstensi}`;
    await coverStore.put(kunci, bytes, jenis);
    return kunci;
  } catch {
    return null;
  }
}

/**
 * Seam: simpanSampulKandidat. Mengunduh sampul Kandidat yang dipilih Pemilik
 * dan menyimpannya dengan kunci ISBN hasil scan. Alamat di luar host yang
 * diizinkan ditolak sebelum ada fetch; kegagalan apa pun menghasilkan null.
 */
export function createSampulKandidat(opts: { fetch?: typeof fetch; coverStore: CoverStore; timeoutMs?: number }) {
  const panggil: Panggil = buatPanggil(opts.fetch ?? fetch, opts.timeoutMs ?? 8000);
  return async function simpanSampulKandidat({ isbn13, url }: { isbn13: string; url: string }): Promise<{ kunci: string } | null> {
    if (!urlSampulDiizinkan(url)) return null;
    const kunci = await unduhDanSimpanSampul(panggil, opts.coverStore, isbn13, url);
    return kunci ? { kunci } : null;
  };
}

export type SimpanSampulKandidat = ReturnType<typeof createSampulKandidat>;
