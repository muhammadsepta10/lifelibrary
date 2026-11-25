import type { Kandidat } from "@/lib/draf-buku";
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
  hasil.edisi = rapikan(teks(ed?.edition_name));
  hasil.seri = rapikan(teksArray(ed?.series)[0]);
  // Kontributor edisi berbentuk "Nama (Translator)"; hanya peran yang dikenal yang dipakai.
  const peranKontribusi = (kata: RegExp) =>
    teksArray(ed?.contributions)
      .filter((c) => kata.test(c.match(/\(([^)]*)\)\s*$/)?.[1] ?? ""))
      .map((c) => rapikan(c.replace(/\s*\([^)]*\)\s*$/, "")))
      .filter((n): n is string => !!n);
  const penerjemah = peranKontribusi(/translator|penerjemah/i);
  const editor = peranKontribusi(/editor/i);
  if (penerjemah.length) hasil.penerjemah = penerjemah;
  if (editor.length) hasil.editor = editor;
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

const FIELD_KANDIDAT = [
  "key",
  "title",
  "author_name",
  "first_publish_year",
  "publisher",
  "language",
  "subject",
  "ddc",
  "cover_i",
  "number_of_pages_median",
].join(",");

export const MAKS_KANDIDAT = 5;
const MAKS_SUBJEK_KANDIDAT = 20;

/**
 * Pencarian tingkat karya lewat judul (+ pengarang bila ada). Hasilnya
 * Kandidat: hanya field bibliografis, tanpa ISBN (ISBN hasil scan tidak
 * pernah diganti). Penerbit dan tahun mengikuti edisi yang dikenal sumber,
 * jadi Pemilik perlu mencocokkannya dengan buku fisik.
 */
export async function cariKandidatOpenLibrary(
  panggil: Panggil,
  { judul, pengarang }: { judul: string; pengarang?: string },
): Promise<Kandidat[]> {
  const params = new URLSearchParams({ title: judul });
  if (pengarang) params.set("author", pengarang);
  params.set("fields", FIELD_KANDIDAT);
  params.set("limit", String(MAKS_KANDIDAT));
  const badan = rekam(await bacaJson(await panggil(`https://openlibrary.org/search.json?${params}`)));
  const docs = Array.isArray(badan?.docs) ? badan.docs : [];

  const hasil: Kandidat[] = [];
  for (const mentah of docs) {
    const doc = rekam(mentah);
    const kunci = teks(doc?.key)?.split("/").pop();
    const judulKandidat = rapikan(teks(doc?.title));
    if (!doc || !kunci || !judulKandidat) continue;
    const k: Kandidat = { id: `openlibrary:${kunci}`, sumber: "openlibrary", judul: judulKandidat };
    const nama = teksArray(doc.author_name);
    if (nama.length) k.pengarang = nama;
    const bahasa = teksArray(doc.language);
    const subjek = teksArray(doc.subject).slice(0, MAKS_SUBJEK_KANDIDAT);
    if (subjek.length) k.subjek = subjek;
    const opsional = {
      penerbit: rapikan(teksArray(doc.publisher)[0]),
      tahun: angka(doc.first_publish_year),
      halaman: angka(doc.number_of_pages_median),
      bahasa: bahasa.length === 1 ? namaBahasa(bahasa[0]) : undefined,
      kelasDdc: teksArray(doc.ddc).map(normalisasiDdc).find(Boolean),
      sampulUrl: sampulId(doc.cover_i),
    };
    for (const [field, nilai] of Object.entries(opsional)) if (nilai !== undefined) Object.assign(k, { [field]: nilai });
    hasil.push(k);
  }
  return hasil.slice(0, MAKS_KANDIDAT);
}
