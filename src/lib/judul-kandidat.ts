/** Panjang judul minimum (setelah dirapikan) sebelum pencarian cadangan lewat judul berjalan. */
export const PANJANG_MIN_JUDUL = 3;

/** Jeda setelah ketikan terakhir sebelum pencarian judul berjalan. */
export const JEDA_PENCARIAN_MS = 800;

export type MasukanKandidat = { judul: string; pengarang?: string };

const rapikan = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Merapikan masukan pencarian Kandidat (spasi ganda dan tepi dibuang).
 * Null bila judul terlalu pendek: pencarian tidak boleh berjalan.
 */
export function masukanKandidat(judul: string | null | undefined, pengarang?: string | null): MasukanKandidat | null {
  const j = rapikan(judul);
  if (j.length < PANJANG_MIN_JUDUL) return null;
  return { judul: j, pengarang: rapikan(pengarang) || undefined };
}
