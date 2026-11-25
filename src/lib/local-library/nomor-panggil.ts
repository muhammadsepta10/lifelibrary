/**
 * Nomor Panggil: `KODE / 3 huruf Pengarang Utama / huruf awal judul`
 * (mis. `FIK / CHU / l`). Dihitung dari data terkini, tidak disimpan.
 */
export type NomorPanggil = {
  kode: string;
  /** 3 huruf pertama nama belakang Pengarang Utama, huruf besar. */
  pengarang: string;
  /** Huruf awal judul (tanpa kata sandang), huruf kecil. */
  judul: string;
  teks: string;
};

/** Kata sandang yang dilewati di awal judul (Indonesia dan Inggris). */
const KATA_SANDANG = new Set(["si", "sang", "para", "the", "a", "an"]);

/** Akhiran nama yang bukan nama belakang. */
const AKHIRAN_NAMA = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md"]);

const tanpaAksen = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "");
const hurufAngka = (s: string) => tanpaAksen(s).replace(/[^\p{L}\p{N}]/gu, "");
const sebagaiKata = (s: string) => hurufAngka(s).toLowerCase();

/** 3 huruf pertama nama belakang, huruf besar; "" kalau nama tidak punya huruf. */
export function kodePengarang(nama: string): string {
  const trimmed = nama.trim();
  const koma = trimmed.indexOf(",");
  // "Chudori, Leila S." -> bagian sebelum koma adalah nama belakang.
  const sumber = koma > 0 ? trimmed.slice(0, koma) : trimmed;
  const kata = sumber.split(/\s+/).filter((k) => hurufAngka(k) !== "");
  if (koma <= 0) {
    while (kata.length > 1 && AKHIRAN_NAMA.has(sebagaiKata(kata[kata.length - 1]))) kata.pop();
  }
  const belakang = kata[kata.length - 1];
  return belakang ? hurufAngka(belakang).toUpperCase().slice(0, 3) : "";
}

/** Huruf awal judul, kecil, tanpa kata sandang di depan; "" kalau judul tanpa huruf. */
export function hurufAwalJudul(judul: string): string {
  const mulai = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "");
  let isi = mulai(judul.trim());
  const m = isi.match(/^(\S+)\s+([\s\S]*)$/);
  if (m && KATA_SANDANG.has(sebagaiKata(m[1])) && sebagaiKata(m[1]) === m[1].toLowerCase()) {
    const sisa = mulai(m[2]);
    if (sisa) isi = sisa;
  }
  return tanpaAksen(isi).charAt(0).toLowerCase();
}

export function hitungNomorPanggil(input: {
  kodeKategori: string;
  pengarangUtama: string;
  judul: string;
}): NomorPanggil {
  const pengarang = kodePengarang(input.pengarangUtama);
  const judul = hurufAwalJudul(input.judul);
  return {
    kode: input.kodeKategori,
    pengarang,
    judul,
    teks: `${input.kodeKategori} / ${pengarang} / ${judul}`,
  };
}
