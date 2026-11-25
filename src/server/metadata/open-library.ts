import { bacaJson, GalatSumber, type Panggil } from "./http";
import { ambilSatu, ambilTahun, namaBahasa, normalisasiDdc, rapikan, type Parsial } from "./parsial";

const FIELD_PENCARIAN = [
  "key",
  "title",
  "author_name",
  "first_publish_year",
  "ddc",
  "lcc",
  "subject",
  "cover_i",
  "number_of_pages_median",
  "language",
].join(",");

type Rekam = Record<string, unknown>;
const rekam = (x: unknown): Rekam | null => (x && typeof x === "object" ? (x as Rekam) : null);
const teksArray = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
const teks = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x.trim() : undefined);
const angka = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);
const sampulId = (id: unknown) => (typeof id === "number" && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : undefined);

/**
 * Dua panggilan: pencarian tingkat karya (DDC, subjek, pengarang dari semua
 * edisi karya yang sama) dan rekaman edisi (penerbit, halaman, dll. untuk ISBN
 * ini). Salah satunya gagal tidak masalah; keduanya gagal = galat sumber.
 */
export async function cariOpenLibrary(panggil: Panggil, isbn13: string): Promise<Parsial | null> {
  const [cari, edisi] = await Promise.allSettled([
    (async () => {
      const url = `https://openlibrary.org/search.json?q=isbn:${isbn13}&fields=${FIELD_PENCARIAN}`;
      const badan = rekam(await bacaJson(await panggil(url)));
      const docs = Array.isArray(badan?.docs) ? badan.docs : [];
      return rekam(docs[0]);
    })(),
    (async () => {
      // /isbn/{isbn}.json mengalihkan (302) ke rekaman edisi; fetch mengikutinya.
      return rekam(await bacaJson(await panggil(`https://openlibrary.org/isbn/${isbn13}.json`)));
    })(),
  ]);

  if (cari.status === "rejected" && edisi.status === "rejected") {
    throw cari.reason instanceof GalatSumber ? cari.reason : new GalatSumber("Sumber tidak bisa dihubungi");
  }
  const doc = cari.status === "fulfilled" ? cari.value : null;
  const ed = edisi.status === "fulfilled" ? edisi.value : null;
  if (!doc && !ed) return null;

  const hasil: Parsial = {};
  const judulEdisi = rapikan(teks(ed?.title));
  const subjudul = rapikan(teks(ed?.subtitle));
  hasil.judul = ambilSatu(
    judulEdisi && subjudul && !judulEdisi.toLowerCase().includes(subjudul.toLowerCase())
      ? `${judulEdisi}: ${subjudul}`
      : judulEdisi,
    rapikan(teks(doc?.title)),
  );
  const pengarang = teksArray(doc?.author_name);
  if (pengarang.length) hasil.pengarang = pengarang;
  // publisher[] dan isbn[] di pencarian adalah gabungan semua edisi: tidak dipakai untuk edisi ini.
  hasil.penerbit = teksArray(ed?.publishers)[0];
  hasil.kota = teksArray(ed?.publish_places)[0];
  hasil.tahun = ambilTahun(teks(ed?.publish_date));
  hasil.halaman = angka(ed?.number_of_pages);
  const desk = ed?.description;
  hasil.sinopsis = teks(typeof desk === "string" ? desk : rekam(desk)?.value);

  const bahasaEdisi = Array.isArray(ed?.languages)
    ? ed.languages.map((l) => String(rekam(l)?.key ?? "").split("/").pop() ?? "")
    : [];
  const bahasaKarya = teksArray(doc?.language);
  hasil.bahasa = namaBahasa(bahasaEdisi[0] ?? "") ?? (bahasaKarya.length === 1 ? namaBahasa(bahasaKarya[0]) : undefined);

  // DDC dari semua edisi karya yang sama: ambil yang pertama berbentuk angka DDC.
  hasil.kelasDdc = teksArray(doc?.ddc).map(normalisasiDdc).find(Boolean);
  const subjek = teksArray(doc?.subject);
  if (subjek.length) hasil.subjek = subjek;

  const kandidat = [
    ...(Array.isArray(ed?.covers) ? ed.covers.map(sampulId) : []),
    sampulId(doc?.cover_i),
  ].filter((u): u is string => !!u);
  if (kandidat.length) hasil.sampul = [...new Set(kandidat)];

  return hasil;
}
