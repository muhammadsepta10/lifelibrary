import { MAKS_KANDIDAT, MAKS_SUBJEK, type Kandidat } from "@/lib/draf-buku";
import { normalisasiIsbn } from "@/lib/isbn";
import type { MasukanKandidat } from "@/lib/judul-kandidat";
import { bacaJson, type Panggil } from "./http";
import { angka, isiOpsional, rekam, teks, teksArray, type Rekam } from "./mentah";
import { ambilTahun, namaBahasa, rapikan, type Parsial } from "./parsial";

/** Deskripsi Google berisi HTML ringan: tag dibuang, spasi dirapatkan. */
const sinopsisBersih = (x: unknown) => teks(x)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Thumbnail Google kadang `http://`; unduhan sampul hanya menerima https. */
function sampulKecil(imageLinks: unknown): string | undefined {
  const l = rekam(imageLinks);
  return (teks(l?.thumbnail) ?? teks(l?.smallThumbnail))?.replace(/^http:\/\//, "https://");
}

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
  // seriesInfo hanya ada pada sebagian volume: judul pendek seri dan nomor tampilnya.
  const infoSeri = rekam(v.seriesInfo);
  hasil.seri = rapikan(teks(infoSeri?.shortSeriesBookTitle));
  hasil.jilid = teks(infoSeri?.bookDisplayNumber);
  hasil.tahun = ambilTahun(teks(v.publishedDate));
  hasil.halaman = angka(v.pageCount);
  hasil.sinopsis = sinopsisBersih(v.description);
  hasil.bahasa = namaBahasa(teks(v.language) ?? "");
  const kategori = teksArray(v.categories);
  if (kategori.length) hasil.subjek = kategori;
  const kecil = sampulKecil(v.imageLinks);
  if (kecil) hasil.sampul = [kecil];
  return hasil;
}

/** Tanda kutip dibuang dari masukan supaya frasa `intitle:"..."` tidak pecah. */
const frasa = (s: string) => s.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();

/**
 * Pencarian lewat judul (+ pengarang) dengan `intitle:` dan `inauthor:`.
 * Hasilnya Kandidat tingkat terbitan tanpa ISBN (ISBN hasil scan tidak
 * pernah diganti). Volume tanpa judul dibuang.
 */
export async function cariKandidatGoogle(
  panggil: Panggil,
  { judul, pengarang }: MasukanKandidat,
  kunci: string,
): Promise<Kandidat[]> {
  const kueri = [`intitle:"${frasa(judul)}"`, pengarang && frasa(pengarang) ? `inauthor:"${frasa(pengarang)}"` : ""]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({ q: kueri, maxResults: String(MAKS_KANDIDAT), key: kunci });
  const badan = rekam(await bacaJson(await panggil(`${URL_DASAR}?${params}`)));
  const items = Array.isArray(badan?.items) ? badan.items : [];

  const hasil: Kandidat[] = [];
  for (const mentah of items) {
    const item = rekam(mentah);
    const v = rekam(item?.volumeInfo);
    const id = teks(item?.id);
    const utama = rapikan(teks(v?.title));
    if (!v || !id || !utama) continue;
    const subjudul = rapikan(teks(v.subtitle));
    const k: Kandidat = { id: `google:${id}`, sumber: "google", judul: subjudul ? `${utama}: ${subjudul}` : utama };
    const nama = teksArray(v.authors);
    if (nama.length) k.pengarang = nama;
    const subjek = teksArray(v.categories).slice(0, MAKS_SUBJEK);
    if (subjek.length) k.subjek = subjek;
    isiOpsional(k, {
      penerbit: rapikan(teks(v.publisher)),
      tahun: ambilTahun(teks(v.publishedDate)),
      halaman: angka(v.pageCount),
      sinopsis: sinopsisBersih(v.description),
      bahasa: namaBahasa(teks(v.language) ?? ""),
      sampulUrl: sampulKecil(v.imageLinks),
    });
    hasil.push(k);
  }
  return hasil.slice(0, MAKS_KANDIDAT);
}
