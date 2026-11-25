import type { CoverStore } from "@/server/covers";
import { buatPanggil, type Panggil } from "./http";

const JENIS_SAMPUL: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MAKS_BYTE_SAMPUL = 5 * 1024 * 1024;

/**
 * Mengunduh satu gambar sampul, memvalidasinya (jenis gambar yang dikenal,
 * tidak kosong, paling besar 5 MB), lalu menyimpannya di cover store dengan
 * kunci ISBN. Kegagalan apa pun menghasilkan null, tidak pernah melempar.
 * Dipakai bersama oleh Pencarian Metadata ISBN dan sampul Kandidat.
 */
export async function unduhDanSimpanSampul(
  panggil: Panggil,
  coverStore: CoverStore,
  isbn13: string,
  url: string,
): Promise<string | null> {
  try {
    const res = await panggil(url, { redirect: "follow" });
    const jenis = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const ekstensi = JENIS_SAMPUL[jenis];
    if (!res.ok || !ekstensi) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAKS_BYTE_SAMPUL) return null;
    const kunci = `${isbn13}.${ekstensi}`;
    await coverStore.put(kunci, bytes, jenis);
    return kunci;
  } catch {
    return null;
  }
}

/** Satu-satunya host sampul yang dikenal (ADR 0007): endpoint unduhan tidak boleh mengambil alamat sembarang. */
const HOST_SAMPUL_DIIZINKAN = new Set(["covers.openlibrary.org", "books.google.com", "books.googleusercontent.com"]);

/** Hanya `https` dari host sampul yang dikenal, tanpa kredensial di alamat. */
export function urlSampulDiizinkan(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && HOST_SAMPUL_DIIZINKAN.has(u.hostname);
  } catch {
    return false;
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
