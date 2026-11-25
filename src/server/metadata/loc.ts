import { GalatSumber, type Panggil } from "./http";
import { ambilTahun, namaBahasa, normalisasiDdc, rapikan, urutanNormalNama, type Parsial } from "./parsial";

type Subfield = { kode: string; nilai: string };
type Datafield = { tag: string; ind2: string; sub: Subfield[] };

const ENTITAS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const dekode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const kode = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(kode) ? String.fromCodePoint(kode) : m;
    }
    return ENTITAS[e.toLowerCase()] ?? m;
  });

/** Pembaca MARCXML secukupnya (tanpa pustaka XML): datafield, subfield, dan controlfield 008. */
function bacaMarc(xml: string) {
  const datafield: Datafield[] = [];
  for (const m of xml.matchAll(/<datafield\b([^>]*)>([\s\S]*?)<\/datafield>/g)) {
    const tag = m[1].match(/tag="(\d+)"/)?.[1];
    if (!tag) continue;
    const ind2 = m[1].match(/ind2="(.)"/)?.[1] ?? " ";
    const sub = [...m[2].matchAll(/<subfield code="(.)">([\s\S]*?)<\/subfield>/g)].map((s) => ({
      kode: s[1],
      nilai: dekode(s[2]).trim(),
    }));
    datafield.push({ tag, ind2, sub });
  }
  const kontrol008 = xml.match(/<controlfield tag="008">([\s\S]*?)<\/controlfield>/)?.[1];
  return { datafield, kontrol008: kontrol008 ? dekode(kontrol008) : undefined };
}

const sub = (f: Datafield | undefined, kode: string) => f?.sub.find((s) => s.kode === kode)?.nilai;

/** Library of Congress SRU (LCDB), MARCXML. Hanya mengindeks edisi yang diklasifikasi LoC. */
export async function cariLoc(panggil: Panggil, isbn13: string): Promise<Parsial | null> {
  const url =
    "https://lx2.loc.gov/sru/lcdb?version=1.1&operation=searchRetrieve" +
    `&query=bath.isbn%3D${isbn13}&maximumRecords=1&recordSchema=marcxml`;
  const res = await panggil(url);
  if (!res.ok) throw new GalatSumber(`Sumber membalas galat (HTTP ${res.status})`);
  const xml = await res.text();
  if (/<(?:\w+:)?diagnostics\b/.test(xml)) throw new GalatSumber("Sumber membalas galat");
  const jumlah = Number(xml.match(/<(?:\w+:)?numberOfRecords>(\d+)</)?.[1] ?? "0");
  if (!jumlah) return null;

  const { datafield, kontrol008 } = bacaMarc(xml);
  const ambil = (tag: string) => datafield.filter((f) => f.tag === tag);
  const f245 = ambil("245")[0];
  const terbit = ambil("264").find((f) => f.ind2 === "1") ?? ambil("260")[0] ?? ambil("264")[0];

  const hasil: Parsial = {};
  const judul = rapikan(sub(f245, "a"));
  const subjudul = rapikan(sub(f245, "b"));
  hasil.judul = judul && subjudul ? `${judul}: ${subjudul}` : judul;
  const pengarang = urutanNormalNama(sub(ambil("100")[0], "a"));
  if (pengarang) hasil.pengarang = [pengarang];
  hasil.kota = rapikan(sub(terbit, "a"));
  hasil.penerbit = rapikan(sub(terbit, "b"));
  hasil.tahun = ambilTahun(sub(terbit, "c"));
  const halaman = sub(ambil("300")[0], "a")?.match(/(\d+)\s*(?:pages|p\b|hlm|halaman)/i)?.[1];
  hasil.halaman = halaman ? Number(halaman) : undefined;
  hasil.bahasa = kontrol008 ? namaBahasa(kontrol008.slice(35, 38)) : undefined;

  // 082 $a: "155.2/4" -> 155.24. Hanya angkanya; caption DDC bukan milik kita (lisensi OCLC).
  hasil.kelasDdc = ambil("082")
    .map((f) => normalisasiDdc(sub(f, "a") ?? ""))
    .find(Boolean);
  const subjek = ambil("650")
    .map((f) => rapikan(sub(f, "a")?.replace(/\.$/, "")))
    .filter((s): s is string => !!s);
  if (subjek.length) hasil.subjek = subjek;
  return hasil;
}
