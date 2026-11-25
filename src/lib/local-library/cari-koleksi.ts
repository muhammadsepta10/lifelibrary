import type { ItemKoleksi } from "./index";
import type { StatusKoleksi } from "./status-koleksi";

export type KriteriaKoleksi = {
  /** Teks pencarian: judul, Kontributor, ISBN, Nomor Induk, atau Nomor Panggil. */
  q?: string;
  kategoriId?: string | null;
  lokasiId?: string | null;
  /** Kosong = hanya Eksemplar aktif; lihat `STATUS_KOLEKSI`. */
  status?: StatusKoleksi | null;
};

/** Huruf kecil tanpa aksen, spasi dirapatkan: "Éropa  Timur" cocok dengan "eropa timur". */
export const normalisasiTeks = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function cocokTeks(item: ItemKoleksi, q: string) {
  const kueri = normalisasiTeks(q);
  if (!kueri) return true;
  const medan = [
    item.judul,
    ...item.kontributor,
    item.isbn13 ?? "",
    item.nomorInduk ?? "",
    item.nomorPanggil.teks,
  ].map(normalisasiTeks);
  // ISBN sering diketik atau dipindai dengan tanda hubung.
  const isbn = item.isbn13 ?? "";
  const cocokToken = (t: string) =>
    medan.some((m) => m.includes(t)) || (/^[\d-]+$/.test(t) && isbn.includes(t.replaceAll("-", "")));
  // Seluruh teks sebagai satu frasa (mis. "FIK / TER"), atau tiap kata cocok di sebuah medan.
  return medan.some((m) => m.includes(kueri)) || kueri.split(" ").every(cocokToken);
}

function cocokStatus(item: ItemKoleksi, status: StatusKoleksi | null | undefined) {
  switch (status) {
    case "keluar":
      return item.status === "keluar";
    case "tersedia":
      return item.status === "aktif" && !item.dipinjam;
    case "dipinjam":
      return item.status === "aktif" && item.dipinjam;
    case "menunggu-sinkron":
      return item.status === "aktif" && item.menungguSinkron;
    default:
      return item.status === "aktif";
  }
}

/** Pencarian dan filter Koleksi; filter digabung dengan "dan". Murni, jalan dari data lokal. */
export function saringKoleksi(items: ItemKoleksi[], k: KriteriaKoleksi = {}): ItemKoleksi[] {
  return items.filter(
    (i) =>
      cocokStatus(i, k.status) &&
      (!k.kategoriId || i.kategoriId === k.kategoriId) &&
      (!k.lokasiId || i.lokasi?.id === k.lokasiId) &&
      cocokTeks(i, k.q ?? ""),
  );
}
