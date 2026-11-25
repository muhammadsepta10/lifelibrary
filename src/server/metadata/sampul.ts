import type { CoverStore } from "@/server/covers";
import type { Panggil } from "./http";

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
