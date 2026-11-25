/**
 * Peminjaman di Perpustakaan Lokal (GLOSSARY): satu Eksemplar dipinjamkan ke
 * seorang Peminjam dengan tanggal pinjam, jatuh tempo, dan tanggal kembali.
 * Tanpa denda. Semua perintah menulis ke IndexedDB lalu masuk outbox
 * (ADR 0004), jadi jalan offline dan tersinkron kemudian.
 *
 * Keputusan:
 * - Eksemplar yang belum bernomor (Menunggu Sinkron) BOLEH dipinjamkan di
 *   perangkat. Mutasi pinjam antre sesudah mutasi catat Eksemplarnya, jadi
 *   server memprosesnya berurutan; Nomor Induk tidak dibutuhkan untuk meminjam.
 * - Eksemplar sedang dipinjam = punya Peminjaman tanpa tanggal kembali. Aturan
 *   "tidak bisa dipinjamkan lagi" dijaga di perangkat (dari data lokal) dan di
 *   server (juga untuk dua perangkat yang berpacu); yang kalah ditolak server
 *   dan tampil sebagai Gagal terkirim.
 * - "Hari ini" dan "terlambat" dihitung dari jam perangkat yang bisa disuntik
 *   (`now`), per tanggal kalender lokal: terlambat bila jatuh tempo < hari ini.
 */
import { pesanPengingat, normalisasiNomorWa, tautanWhatsApp } from "@/lib/peminjaman/whatsapp";
import { bacaNomorInduk } from "@/lib/nomor-induk";
import { tanggalKalender } from "@/lib/buku-fields";
import { peminjamSchema } from "@/lib/peminjaman-protocol";
import type { Mutasi } from "@/lib/sync-protocol";
import type { BukuRow, EksemplarRow, LocalDb, PeminjamanRow, PeminjamRow } from "./db";
import { ValidasiError } from "./errors";
import { isoLokal } from "./waktu";

const MS_HARI = 86_400_000;

/** `YYYY-MM-DD` menurut kalender lokal perangkat. */
export const tanggalLokal = (d: Date) => isoLokal(d).slice(0, 10);

const selisihHari = (dari: string, ke: string) =>
  Math.round((Date.parse(`${ke}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / MS_HARI);

/** Peminjam: yang sudah ada (pilih Peminjam lama) atau yang baru (nama, kontak boleh kosong). */
export type InputPeminjam = { id: string } | { nama: string; kontak?: string | null };

export type InputPinjamkan = {
  eksemplarId: string;
  peminjam: InputPeminjam;
  /** Bawaan: hari ini. */
  tanggalPinjam?: string;
  /** `YYYY-MM-DD`, tidak boleh sebelum tanggal pinjam. */
  jatuhTempo: string;
};

/** Satu baris di daftar Peminjaman (aktif, terlambat, riwayat). */
export type ItemPeminjaman = {
  id: string;
  eksemplarId: string;
  bukuId: string;
  judul: string;
  pengarang: string;
  sampul: string | null;
  nomorInduk: string | null;
  /** Nomor Induk, atau "——" selama Eksemplar Menunggu Sinkron. */
  nomorIndukTampil: string;
  peminjam: PeminjamRow;
  tanggalPinjam: string;
  jatuhTempo: string;
  tanggalKembali: string | null;
  /** Aktif dan jatuh tempo sebelum hari ini. */
  terlambat: boolean;
  /** Hari lewat jatuh tempo (0 bila belum terlambat atau sudah kembali). */
  hariTerlambat: number;
};

export type DaftarPeminjaman = {
  /** Semua yang belum kembali, termasuk yang terlambat; jatuh tempo terdekat dulu. */
  aktif: ItemPeminjaman[];
  /** Bagian dari `aktif` yang sudah lewat jatuh tempo; paling terlambat dulu. */
  terlambat: ItemPeminjaman[];
  /** Yang sudah kembali; terbaru dikembalikan dulu. */
  riwayat: ItemPeminjaman[];
};

/** Untuk "Pilih Peminjam lama". */
export type ItemPeminjam = PeminjamRow & {
  /** Jumlah buku yang sedang dipinjam. */
  sedangMeminjam: number;
  /** Jumlah Peminjaman sepanjang waktu. */
  totalPeminjaman: number;
};

/** Pinjaman yang berlaku pada sebuah Eksemplar (kartu Eksemplar, hasil scan). */
export type PinjamanAktif = {
  peminjamanId: string;
  peminjam: PeminjamRow;
  tanggalPinjam: string;
  jatuhTempo: string;
  terlambat: boolean;
  hariTerlambat: number;
};

/** Hasil scan Label Barcode: Eksemplar yang cocok dan keadaannya. */
export type HasilCariEksemplar = {
  eksemplarId: string;
  bukuId: string;
  judul: string;
  pengarang: string;
  nomorInduk: string;
  status: "aktif" | "keluar";
  /** Null bila tersedia. */
  dipinjam: PinjamanAktif | null;
};

export type HasilPindaiLabel =
  | { jenis: "eksemplar"; eksemplar: HasilCariEksemplar }
  /** Teks terbaca tapi bukan Nomor Induk (mis. ISBN, atau barcode lain). */
  | { jenis: "bukanNomorInduk"; pesan: string }
  /** Nomor Induk sah tapi tidak ada di salinan lokal (belum tersinkron ke perangkat ini). */
  | { jenis: "tidakDitemukan"; nomorInduk: string; pesan: string };

type Dep = {
  db: LocalDb;
  now: () => Date;
  uuid: () => string;
  antre: (m: Mutasi) => Promise<unknown>;
};

const pengarangUtama = (b: BukuRow) => (b.kontributor.find((c) => c.utama) ?? b.kontributor[0])?.nama ?? "";

function periksaTanggal(field: string, nilai: string) {
  const hasil = tanggalKalender.safeParse(nilai);
  if (!hasil.success) throw new ValidasiError(field, hasil.error.issues[0].message);
  return hasil.data;
}

const kontakBersih = (k: string | null | undefined) => {
  const t = k?.trim();
  return t ? t : null;
};

export function buatPeminjaman({ db, now, uuid, antre }: Dep) {
  const hariIni = () => tanggalLokal(now());

  const hitung = (jatuhTempo: string, tanggalKembali: string | null) => {
    const lewat = tanggalKembali === null ? selisihHari(jatuhTempo, hariIni()) : 0;
    return { terlambat: lewat > 0, hariTerlambat: Math.max(0, lewat) };
  };

  const pinjamanAktifEksemplar = async (eksemplarId: string): Promise<PeminjamanRow | undefined> =>
    db.peminjaman
      .where("eksemplarId")
      .equals(eksemplarId)
      .filter((p) => p.tanggalKembali === null)
      .first();

  async function pinjamkan(input: InputPinjamkan) {
    const tanggalPinjam = periksaTanggal("tanggalPinjam", input.tanggalPinjam ?? hariIni());
    const jatuhTempo = periksaTanggal("jatuhTempo", input.jatuhTempo);
    if (jatuhTempo < tanggalPinjam) {
      throw new ValidasiError("jatuhTempo", "Jatuh tempo tidak boleh sebelum tanggal pinjam");
    }
    const peminjamanId = uuid();
    let peminjamId = "";
    await db.transaction("rw", [db.peminjam, db.peminjaman, db.eksemplar, db.outbox], async () => {
      const e = await db.eksemplar.get(input.eksemplarId);
      if (!e) throw new ValidasiError("eksemplarId", "Eksemplar tidak ditemukan");
      if (e.status === "keluar") {
        throw new ValidasiError("eksemplarId", "Eksemplar ini sudah keluar dari koleksi, jadi tidak bisa dipinjamkan");
      }
      const sedang = await pinjamanAktifEksemplar(e.id);
      if (sedang) {
        const siapa = (await db.peminjam.get(sedang.peminjamId))?.nama;
        throw new ValidasiError(
          "eksemplarId",
          `Eksemplar ini sedang dipinjam${siapa ? ` oleh ${siapa}` : ""}. Kembalikan dulu sebelum dipinjamkan lagi`,
        );
      }

      let peminjam: PeminjamRow | undefined;
      if ("id" in input.peminjam) {
        peminjam = await db.peminjam.get(input.peminjam.id);
        if (!peminjam) throw new ValidasiError("peminjam", "Peminjam tidak ditemukan");
      } else {
        const baru = peminjamSchema.safeParse({
          id: uuid(),
          nama: input.peminjam.nama,
          kontak: kontakBersih(input.peminjam.kontak),
        });
        if (!baru.success) {
          const isu = baru.error.issues[0];
          throw new ValidasiError(String(isu.path[0] ?? "peminjam"), isu.message);
        }
        peminjam = { id: baru.data.id, nama: baru.data.nama, kontak: baru.data.kontak ?? null };
        await db.peminjam.add(peminjam);
      }
      peminjamId = peminjam.id;
      await db.peminjaman.add({
        id: peminjamanId,
        eksemplarId: e.id,
        peminjamId: peminjam.id,
        tanggalPinjam,
        jatuhTempo,
        tanggalKembali: null,
      });
      await antre({
        id: uuid(),
        jenis: "peminjaman.pinjamkan",
        waktuUbah: isoLokal(now()),
        peminjam,
        peminjaman: { id: peminjamanId, eksemplarId: e.id, tanggalPinjam, jatuhTempo },
      });
    });
    return { peminjamanId, peminjamId };
  }

  async function ubahPeminjaman(
    peminjamanId: string,
    ubah: (p: PeminjamanRow) => Partial<PeminjamanRow>,
  ) {
    await db.transaction("rw", [db.peminjaman, db.outbox], async () => {
      const p = await db.peminjaman.get(peminjamanId);
      if (!p) throw new ValidasiError("peminjamanId", "Peminjaman tidak ditemukan");
      const perubahan = ubah(p);
      const beda = Object.fromEntries(
        Object.entries(perubahan).filter(([k, v]) => p[k as keyof PeminjamanRow] !== v),
      );
      if (Object.keys(beda).length === 0) return;
      await db.peminjaman.update(peminjamanId, beda);
      await antre({
        id: uuid(),
        jenis: "peminjaman.ubah",
        peminjamanId,
        waktuUbah: isoLokal(now()),
        perubahan: beda,
      });
    });
  }

  /** Mengembalikan Eksemplar: mencatat tanggal kembali (bawaan: hari ini). Tanpa denda. */
  async function kembalikan(peminjamanId: string, tanggalKembali?: string) {
    const tanggal = periksaTanggal("tanggalKembali", tanggalKembali ?? hariIni());
    await ubahPeminjaman(peminjamanId, (p) => {
      if (tanggal < p.tanggalPinjam) {
        throw new ValidasiError("tanggalKembali", "Tanggal kembali tidak boleh sebelum tanggal pinjam");
      }
      // Sudah kembali: biarkan tanggal pertama.
      return p.tanggalKembali ? {} : { tanggalKembali: tanggal };
    });
  }

  /** Mengubah jatuh tempo (perpanjang) Peminjaman yang masih aktif. */
  async function ubahJatuhTempo(peminjamanId: string, jatuhTempo: string) {
    const tanggal = periksaTanggal("jatuhTempo", jatuhTempo);
    await ubahPeminjaman(peminjamanId, (p) => {
      if (p.tanggalKembali) throw new ValidasiError("jatuhTempo", "Peminjaman ini sudah dikembalikan");
      if (tanggal < p.tanggalPinjam) {
        throw new ValidasiError("jatuhTempo", "Jatuh tempo tidak boleh sebelum tanggal pinjam");
      }
      return { jatuhTempo: tanggal };
    });
  }

  /** Mengoreksi nama atau kontak Peminjam (mis. nomor WhatsApp salah). */
  async function ubahPeminjam(peminjamId: string, perubahan: { nama?: string; kontak?: string | null }) {
    await db.transaction("rw", [db.peminjam, db.outbox], async () => {
      const p = await db.peminjam.get(peminjamId);
      if (!p) throw new ValidasiError("peminjamId", "Peminjam tidak ditemukan");
      const beda: { nama?: string; kontak?: string | null } = {};
      if (perubahan.nama !== undefined) {
        const nama = perubahan.nama.trim();
        if (!nama) throw new ValidasiError("nama", "Nama Peminjam wajib diisi");
        if (nama.length > 120) throw new ValidasiError("nama", "Nama maksimal 120 karakter");
        if (nama !== p.nama) beda.nama = nama;
      }
      if (perubahan.kontak !== undefined) {
        const kontak = kontakBersih(perubahan.kontak);
        if (kontak && kontak.length > 120) throw new ValidasiError("kontak", "Kontak maksimal 120 karakter");
        if (kontak !== p.kontak) beda.kontak = kontak;
      }
      if (Object.keys(beda).length === 0) return;
      await db.peminjam.update(peminjamId, beda);
      await antre({
        id: uuid(),
        jenis: "peminjam.ubah",
        peminjamId,
        waktuUbah: isoLokal(now()),
        perubahan: beda,
      });
    });
  }

  // Pembaca tanpa `await siap`, supaya bisa dipakai liveQuery.

  async function bacaPeminjaman(): Promise<DaftarPeminjaman> {
    const [daftar, peminjam, eksemplar, buku] = await Promise.all([
      db.peminjaman.toArray(),
      db.peminjam.toArray(),
      db.eksemplar.toArray(),
      db.buku.toArray(),
    ]);
    const peminjamById = new Map(peminjam.map((p) => [p.id, p]));
    const eksemplarById = new Map(eksemplar.map((e) => [e.id, e]));
    const bukuById = new Map(buku.map((b) => [b.id, b]));
    const item = daftar.flatMap((p): ItemPeminjaman[] => {
      const pem = peminjamById.get(p.peminjamId);
      const e = eksemplarById.get(p.eksemplarId);
      const b = e && bukuById.get(e.bukuId);
      if (!pem || !e || !b) return [];
      return [
        {
          id: p.id,
          eksemplarId: e.id,
          bukuId: b.id,
          judul: b.judul,
          pengarang: pengarangUtama(b),
          sampul: b.sampul,
          nomorInduk: e.nomorInduk,
          nomorIndukTampil: e.nomorInduk ?? "——",
          peminjam: pem,
          tanggalPinjam: p.tanggalPinjam,
          jatuhTempo: p.jatuhTempo,
          tanggalKembali: p.tanggalKembali,
          ...hitung(p.jatuhTempo, p.tanggalKembali),
        },
      ];
    });
    const aktif = item
      .filter((i) => i.tanggalKembali === null)
      .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo) || a.judul.localeCompare(b.judul, "id"));
    return {
      aktif,
      terlambat: aktif.filter((i) => i.terlambat),
      riwayat: item
        .filter((i) => i.tanggalKembali !== null)
        .sort((a, b) => b.tanggalKembali!.localeCompare(a.tanggalKembali!) || a.judul.localeCompare(b.judul, "id")),
    };
  }

  /** Jumlah Peminjaman terlambat: isi badge di nav dan chip di Beranda. */
  async function bacaJumlahTerlambat(): Promise<number> {
    const hari = hariIni();
    return db.peminjaman.filter((p) => p.tanggalKembali === null && p.jatuhTempo < hari).count();
  }

  async function bacaPeminjam(): Promise<ItemPeminjam[]> {
    const [peminjam, daftar] = await Promise.all([db.peminjam.toArray(), db.peminjaman.toArray()]);
    return peminjam
      .map((p) => {
        const milik = daftar.filter((d) => d.peminjamId === p.id);
        return {
          ...p,
          sedangMeminjam: milik.filter((d) => d.tanggalKembali === null).length,
          totalPeminjaman: milik.length,
        };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  }

  async function pinjamanAktif(eksemplarId: string): Promise<PinjamanAktif | null> {
    const p = await pinjamanAktifEksemplar(eksemplarId);
    if (!p) return null;
    const peminjam = await db.peminjam.get(p.peminjamId);
    if (!peminjam) return null;
    return {
      peminjamanId: p.id,
      peminjam,
      tanggalPinjam: p.tanggalPinjam,
      jatuhTempo: p.jatuhTempo,
      ...hitung(p.jatuhTempo, null),
    };
  }

  async function cariByNomorInduk(nomorInduk: string): Promise<HasilCariEksemplar | null> {
    const e: EksemplarRow | undefined = (await db.eksemplar.toArray()).find((x) => x.nomorInduk === nomorInduk);
    if (!e) return null;
    const b = await db.buku.get(e.bukuId);
    if (!b) return null;
    return {
      eksemplarId: e.id,
      bukuId: b.id,
      judul: b.judul,
      pengarang: pengarangUtama(b),
      nomorInduk,
      status: e.status,
      dipinjam: await pinjamanAktif(e.id),
    };
  }

  /**
   * Teks hasil scan Label Barcode (Code 128 berisi Nomor Induk) menjadi Eksemplar
   * yang cocok. Teks lain (mis. ISBN dari barcode buku) ditolak dengan pesan ramah.
   */
  async function cariDariPindai(teks: string): Promise<HasilPindaiLabel> {
    const nomorInduk = bacaNomorInduk(teks);
    if (!nomorInduk) {
      return { jenis: "bukanNomorInduk", pesan: "Ini bukan Label Barcode. Pindai barcode di Label yang ditempel di buku" };
    }
    const eksemplar = await cariByNomorInduk(nomorInduk);
    if (!eksemplar) {
      return {
        jenis: "tidakDitemukan",
        nomorInduk,
        pesan: `Nomor Induk ${nomorInduk} belum ada di perangkat ini. Sinkronkan dulu, lalu pindai lagi`,
      };
    }
    return { jenis: "eksemplar", eksemplar };
  }

  /**
   * Tautan pengingat WhatsApp untuk Peminjaman aktif, atau null bila Peminjam tidak
   * punya nomor yang bisa dipakai atau Peminjaman sudah kembali.
   */
  async function bacaTautanPengingat(peminjamanId: string): Promise<string | null> {
    const p = await db.peminjaman.get(peminjamanId);
    if (!p || p.tanggalKembali) return null;
    const [peminjam, e] = await Promise.all([db.peminjam.get(p.peminjamId), db.eksemplar.get(p.eksemplarId)]);
    const nomor = normalisasiNomorWa(peminjam?.kontak);
    const b = e && (await db.buku.get(e.bukuId));
    if (!peminjam || !nomor || !b) return null;
    const { terlambat } = hitung(p.jatuhTempo, null);
    return tautanWhatsApp(nomor, pesanPengingat({ nama: peminjam.nama, judul: b.judul, jatuhTempo: p.jatuhTempo, terlambat }));
  }

  return {
    pinjamkan,
    kembalikan,
    ubahJatuhTempo,
    ubahPeminjam,
    bacaPeminjaman,
    bacaJumlahTerlambat,
    bacaPeminjam,
    pinjamanAktif,
    cariDariPindai,
    bacaTautanPengingat,
  };
}
