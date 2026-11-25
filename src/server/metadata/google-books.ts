import { normalisasiIsbn } from "@/lib/isbn";
import { bacaJson, type Panggil } from "./http";
import { ambilTahun, namaBahasa, rapikan, type Parsial } from "./parsial";

type Rekam = Record<string, unknown>;
const rekam = (x: unknown): Rekam | null => (x && typeof x === "object" ? (x as Rekam) : null);
const teks = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x.trim() : undefined);
const teksArray = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

const URL_DASAR = "https://www.googleapis.com/books/v1/volumes";

/** Pencarian Google bisa kabur: hanya item yang salah satu ISBN-nya sama persis yang diterima. */
function cocokIsbn(item: Rekam | null, isbn13: string): boolean {
  const ids = rekam(item?.volumeInfo)?.industryIdentifiers;
  if (!Array.isArray(ids)) return false;
  return ids.some((x) => {
    const id = teks(rekam(x)?.identifier);
    if (!id) return false;
    const n = normalisasiIsbn(id);
    return n.ok && n.isbn13 === isbn13;
  });
}

async function ambilItem(panggil: Panggil, kueri: string, isbn13: string, kunci: string): Promise<Rekam | null> {
  const url = `${URL_DASAR}?q=${encodeURIComponent(kueri)}&maxResults=5&key=${encodeURIComponent(kunci)}`;
  const badan = rekam(await bacaJson(await panggil(url)));
  const items = Array.isArray(badan?.items) ? badan.items : [];
  return items.map(rekam).find((i) => cocokIsbn(i, isbn13)) ?? null;
}

/**
 * Google Books (perlu kunci API). Kueri `isbn:` dicoba dulu; kalau kosong,
 * kueri polos, yang pada praktiknya kadang menemukan buku yang `isbn:` lewatkan.
 */
export async function cariGoogleBooks(panggil: Panggil, isbn13: string, kunci: string): Promise<Parsial | null> {
  const item = (await ambilItem(panggil, `isbn:${isbn13}`, isbn13, kunci)) ?? (await ambilItem(panggil, isbn13, isbn13, kunci));
  const v = rekam(item?.volumeInfo);
  if (!v) return null;

  const hasil: Parsial = {};
  const judul = rapikan(teks(v.title));
  const subjudul = rapikan(teks(v.subtitle));
  hasil.judul = judul && subjudul ? `${judul}: ${subjudul}` : judul;
  const pengarang = teksArray(v.authors);
  if (pengarang.length) hasil.pengarang = pengarang;
  hasil.penerbit = teks(v.publisher);
  hasil.tahun = ambilTahun(teks(v.publishedDate));
  hasil.halaman = typeof v.pageCount === "number" && v.pageCount > 0 ? v.pageCount : undefined;
  hasil.sinopsis = teks(v.description)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  hasil.bahasa = namaBahasa(teks(v.language) ?? "");
  const kategori = teksArray(v.categories);
  if (kategori.length) hasil.subjek = kategori;
  const kecil = teks(rekam(v.imageLinks)?.thumbnail) ?? teks(rekam(v.imageLinks)?.smallThumbnail);
  if (kecil) hasil.sampul = [kecil.replace(/^http:\/\//, "https://")];
  return hasil;
}
