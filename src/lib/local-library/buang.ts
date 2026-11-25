import type { Mutasi } from "@/lib/sync-protocol";
import type { LocalDb, OutboxRow } from "./db";

/**
 * "Buang" perubahan yang Gagal terkirim (ditolak permanen oleh server). Yang
 * ikut dibuang: semua perubahan lain yang bergantung padanya (mis. Buku baru
 * yang ditolak membawa Eksemplarnya, perubahan atas Eksemplar itu, dan
 * Peminjamannya), lalu baris lokal yang dibuat oleh perubahan-perubahan itu
 * dihapus supaya perangkat kembali sama dengan server.
 */

export class TidakBisaDibuangError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "TidakBisaDibuangError";
  }
}

type Rencana = {
  /** Perubahan di outbox yang dibuang; yang pertama adalah yang ditolak. */
  outbox: OutboxRow[];
  bukuIds: Set<string>;
  eksemplarIds: Set<string>;
  peminjamanIds: Set<string>;
  peminjamIds: Set<string>;
  /** Perubahan edit/pinjam: salinan lokal perlu ditarik ulang dari server. */
  tarikUlang: boolean;
};

export function buatBuang(deps: {
  db: LocalDb;
  ringkasan: (m: Mutasi) => Promise<string>;
  /** Lupakan kursor pull supaya Sinkronisasi berikutnya mengambil ulang semuanya dari server. */
  lupakanKursor: () => Promise<void>;
}) {
  const { db } = deps;

  async function susunRencana(id: string): Promise<Rencana> {
    const semua = await db.outbox.orderBy("seq").toArray();
    const akar = semua.find((o) => o.id === id);
    if (!akar) throw new TidakBisaDibuangError("Perubahan tidak ditemukan");
    if (!akar.ditolak) throw new TidakBisaDibuangError("Hanya perubahan yang Gagal terkirim yang bisa dibuang");

    const bukuIds = new Set<string>();
    const eksemplarIds = new Set<string>();
    const peminjamanIds = new Set<string>();
    const peminjamIds = new Set<string>();
    const dibuang = new Set<number>([akar.seq!]);

    const m0 = akar.mutasi;
    if (m0.jenis === "buku.tambah") bukuIds.add(m0.buku.id);
    if (m0.jenis === "eksemplar.catat") eksemplarIds.add(m0.eksemplar.id);
    if (m0.jenis === "peminjaman.pinjamkan") {
      peminjamanIds.add(m0.peminjaman.id);
      peminjamIds.add(m0.peminjam.id);
    }

    for (let berubah = true; berubah; ) {
      berubah = false;
      const ambil = (o: OutboxRow, f: () => void) => {
        if (dibuang.has(o.seq!)) return;
        dibuang.add(o.seq!);
        f();
        berubah = true;
      };
      for (const o of semua) {
        const m = o.mutasi;
        if (dibuang.has(o.seq!)) continue;
        switch (m.jenis) {
          case "eksemplar.catat":
            if (bukuIds.has(m.eksemplar.bukuId)) ambil(o, () => eksemplarIds.add(m.eksemplar.id));
            break;
          case "buku.ubah":
            if (bukuIds.has(m.bukuId)) ambil(o, () => {});
            break;
          case "eksemplar.ubah":
          case "eksemplar.koreksiKategori":
            if (eksemplarIds.has(m.eksemplarId)) ambil(o, () => {});
            break;
          case "eksemplar.tandaiTercetak":
            if (m.eksemplarIds.every((e) => eksemplarIds.has(e))) ambil(o, () => {});
            break;
          case "peminjaman.pinjamkan":
            if (eksemplarIds.has(m.peminjaman.eksemplarId)) {
              ambil(o, () => {
                peminjamanIds.add(m.peminjaman.id);
                peminjamIds.add(m.peminjam.id);
              });
            }
            break;
          case "peminjaman.ubah":
            if (peminjamanIds.has(m.peminjamanId)) ambil(o, () => {});
            break;
          case "peminjam.ubah":
            // Peminjam yang hanya ada karena Peminjaman yang dibuang: perubahannya ikut.
            if (peminjamIds.has(m.peminjamId)) ambil(o, () => {});
            break;
        }
      }
    }

    return {
      outbox: semua.filter((o) => dibuang.has(o.seq!)),
      bukuIds,
      eksemplarIds,
      peminjamanIds,
      peminjamIds,
      tarikUlang: m0.jenis !== "buku.tambah" && m0.jenis !== "eksemplar.catat",
    };
  }

  /** Daftar perubahan yang akan hilang bila perubahan ini dibuang, untuk teks konfirmasi. */
  async function pratinjau(id: string): Promise<string[]> {
    const rencana = await susunRencana(id);
    return Promise.all(rencana.outbox.map((o) => deps.ringkasan(o.mutasi)));
  }

  async function buang(id: string): Promise<void> {
    await db.transaction("rw", [db.outbox, db.buku, db.eksemplar, db.peminjam, db.peminjaman, db.meta], async () => {
      const rencana = await susunRencana(id);
      await db.outbox.bulkDelete(rencana.outbox.map((o) => o.seq!));
      await db.peminjaman.bulkDelete([...rencana.peminjamanIds]);
      // Hanya Eksemplar yang belum pernah diterima server yang dihapus lokal.
      const eksemplar = (await db.eksemplar.bulkGet([...rencana.eksemplarIds])).filter((e) => e?.menungguSinkron);
      await db.eksemplar.bulkDelete(eksemplar.map((e) => e!.id));
      await db.buku.bulkDelete([...rencana.bukuIds]);
      for (const peminjamId of rencana.peminjamIds) {
        const dipakaiLokal = (await db.peminjaman.where("peminjamId").equals(peminjamId).count()) > 0;
        const dipakaiAntrean = (await db.outbox.toArray()).some(
          (o) => o.mutasi.jenis === "peminjaman.pinjamkan" && o.mutasi.peminjam.id === peminjamId,
        );
        // Bila ternyata sudah ada di server, penarikan ulang di bawah mengembalikannya.
        if (!dipakaiLokal && !dipakaiAntrean) await db.peminjam.delete(peminjamId);
      }
      if (rencana.tarikUlang || rencana.peminjamIds.size > 0) await deps.lupakanKursor();
    });
  }

  return { pratinjau, buang };
}
