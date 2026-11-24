import { liveQuery } from "dexie";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import type { Mutasi, PullResponse, SyncTransport } from "@/lib/sync-protocol";
import { LocalDb, type BukuRow, type EksemplarRow, type KategoriRow } from "./db";
import { ValidasiError } from "./errors";
import { isoLokal } from "./waktu";

export { ValidasiError } from "./errors";
export type { KategoriRow } from "./db";

export const NOMOR_INDUK_KOSONG = "——";
const BATCH_PUSH = 50;
const META_KURSOR = "kursor";

export type CreateOptions = {
  /** Nama database IndexedDB; tes memberi nama unik per kasus. */
  dbName?: string;
  /** Jam perangkat; dipakai untuk waktu pencatatan Eksemplar. */
  now?: () => Date;
  uuid?: () => string;
};

export type ItemKoleksi = {
  eksemplarId: string;
  bukuId: string;
  judul: string;
  pengarang: string;
  kategori: { kode: string; nama: string; warna: string };
  nomorInduk: string | null;
  /** Nomor Induk, atau "——" selama belum diberikan server. */
  nomorIndukTampil: string;
  menungguSinkron: boolean;
  waktuDicatat: string;
};

export type StatusSinkronisasi = {
  /** Jumlah perubahan di outbox yang belum diterima server. */
  menunggu: number;
  /** Jumlah perubahan yang ditolak server dan butuh perhatian Pemilik. */
  ditolak: number;
};

/**
 * Seam: Perpustakaan Lokal. Satu-satunya pintu UI untuk membaca dan menulis
 * koleksi. Semua perintah menulis ke IndexedDB lebih dulu, lalu masuk outbox
 * (ADR 0004). Nomor Induk tidak pernah dibuat di perangkat.
 */
export function createLocalLibrary(opts: CreateOptions = {}) {
  const db = new LocalDb(opts.dbName ?? "lifelibrary");
  const now = opts.now ?? (() => new Date());
  const uuid = opts.uuid ?? (() => crypto.randomUUID());

  // Salinan awal preset Kategori supaya perangkat bisa dipakai sebelum pull pertama.
  const siap = (async () => {
    await db.open();
    if ((await db.kategori.count()) === 0) {
      await db.kategori.bulkPut(PRESET_KATEGORI.map((k) => ({ ...k, diarsipkan: false })));
    }
  })();

  /** Id outbox = id mutasi; server idempoten berdasarkan id ini. */
  const antre = (mutasi: Mutasi) => db.outbox.add({ id: mutasi.id, mutasi });

  async function validasiKategori(kategoriId: string) {
    if (!kategoriId) throw new ValidasiError("kategoriId", "Pilih Kategori dulu sebelum menyimpan");
    const kat = await db.kategori.get(kategoriId);
    if (!kat || kat.diarsipkan) throw new ValidasiError("kategoriId", "Kategori tidak ditemukan");
    return kat;
  }

  async function daftarKategori(): Promise<KategoriRow[]> {
    await siap;
    return (await db.kategori.toArray()).filter((k) => !k.diarsipkan);
  }

  async function tambahBukuManual(input: { judul: string; pengarang: string; kategoriId: string }) {
    await siap;
    const judul = input.judul.trim();
    const pengarang = input.pengarang.trim();
    if (!judul) throw new ValidasiError("judul", "Judul wajib diisi");
    if (!pengarang) throw new ValidasiError("pengarang", "Pengarang wajib diisi");
    await validasiKategori(input.kategoriId);

    const bukuId = uuid();
    const eksemplarId = uuid();
    await db.transaction("rw", [db.buku, db.eksemplar, db.outbox], async () => {
      const buku: BukuRow = {
        id: bukuId,
        judul,
        penerbit: null,
        tahun: null,
        isbn13: null,
        kontributor: [{ id: uuid(), nama: pengarang, peran: "pengarang", utama: true }],
      };
      await db.buku.add(buku);
      await antre({
        id: uuid(),
        jenis: "buku.tambah",
        buku: { id: buku.id, judul, kontributor: buku.kontributor },
      });
      await simpanEksemplar(eksemplarId, bukuId, input.kategoriId);
    });
    return { bukuId, eksemplarId };
  }

  async function simpanEksemplar(eksemplarId: string, bukuId: string, kategoriId: string) {
    const waktuDicatat = isoLokal(now());
    const row: EksemplarRow = {
      id: eksemplarId,
      bukuId,
      kategoriId,
      nomorInduk: null,
      waktuDicatat,
      status: "aktif",
      menungguSinkron: true,
    };
    await db.eksemplar.add(row);
    await antre({
      id: uuid(),
      jenis: "eksemplar.catat",
      eksemplar: { id: eksemplarId, bukuId, kategoriId, waktuDicatat },
    });
  }

  async function catatEksemplar(input: { bukuId: string; kategoriId: string }) {
    await siap;
    await validasiKategori(input.kategoriId);
    if (!(await db.buku.get(input.bukuId))) throw new ValidasiError("bukuId", "Buku tidak ditemukan");
    const eksemplarId = uuid();
    await db.transaction("rw", [db.eksemplar, db.outbox], () =>
      simpanEksemplar(eksemplarId, input.bukuId, input.kategoriId),
    );
    return { eksemplarId };
  }

  async function daftarKoleksi(): Promise<ItemKoleksi[]> {
    await siap;
    return bacaKoleksi();
  }

  // Tanpa `await siap` di dalam: dipakai liveQuery, yang kehilangan pelacakan
  // bila di-await promise non-Dexie.
  async function bacaKoleksi(): Promise<ItemKoleksi[]> {
    const [eksemplar, buku, kategori] = await Promise.all([
      db.eksemplar.toArray(),
      db.buku.toArray(),
      db.kategori.toArray(),
    ]);
    const bukuById = new Map(buku.map((b) => [b.id, b]));
    const katById = new Map(kategori.map((k) => [k.id, k]));
    return eksemplar
      .filter((e) => e.status === "aktif")
      .sort((a, b) => (a.waktuDicatat < b.waktuDicatat ? 1 : a.waktuDicatat > b.waktuDicatat ? -1 : 0))
      .flatMap((e) => {
        const b = bukuById.get(e.bukuId);
        const k = katById.get(e.kategoriId);
        if (!b || !k) return [];
        const utama = b.kontributor.find((c) => c.utama) ?? b.kontributor[0];
        return [
          {
            eksemplarId: e.id,
            bukuId: b.id,
            judul: b.judul,
            pengarang: utama?.nama ?? "",
            kategori: { kode: k.kode, nama: k.nama, warna: k.warna },
            nomorInduk: e.nomorInduk,
            nomorIndukTampil: e.nomorInduk ?? NOMOR_INDUK_KOSONG,
            menungguSinkron: e.menungguSinkron,
            waktuDicatat: e.waktuDicatat,
          },
        ];
      });
  }

  async function statusSinkronisasi(): Promise<StatusSinkronisasi> {
    await siap;
    return bacaStatus();
  }

  async function bacaStatus(): Promise<StatusSinkronisasi> {
    const outbox = await db.outbox.toArray();
    const ditolak = outbox.filter((o) => o.ditolak).length;
    return { menunggu: outbox.length - ditolak, ditolak };
  }

  async function terapkanPull(res: PullResponse) {
    await db.transaction("rw", [db.kategori, db.buku, db.eksemplar, db.meta], async () => {
      await db.kategori.bulkPut(res.kategori);
      await db.buku.bulkPut(res.buku.map((b) => ({ ...b })));
      await db.eksemplar.bulkPut(
        res.eksemplar.map((e) => ({
          id: e.id,
          bukuId: e.bukuId,
          kategoriId: e.kategoriId,
          nomorInduk: e.nomorInduk,
          waktuDicatat: e.waktuDicatat,
          status: e.status,
          menungguSinkron: false,
        })),
      );
      await db.meta.put({ key: META_KURSOR, value: res.kursor });
    });
  }

  /**
   * Kirim outbox (push) lalu ambil perubahan baru (pull). Melempar kalau
   * transport gagal; outbox tetap utuh dan bisa dikirim ulang dengan aman
   * karena server idempoten berdasarkan id mutasi.
   */
  async function sinkronkan(transport: SyncTransport) {
    await siap;
    let dikirim = 0;
    let ditolak = 0;
    for (;;) {
      const batch = (await db.outbox.orderBy("seq").toArray())
        .filter((o) => !o.ditolak)
        .slice(0, BATCH_PUSH);
      if (batch.length === 0) break;
      const res = await transport.push({ mutasi: batch.map((o) => o.mutasi) });
      await db.transaction("rw", [db.outbox, db.eksemplar], async () => {
        for (const h of res.hasil) {
          const entri = batch.find((o) => o.id === h.id);
          if (!entri) continue;
          if (h.status === "ditolak") {
            await db.outbox.update(entri.seq!, { ditolak: h.alasan });
            ditolak++;
            continue;
          }
          if (h.eksemplarId && h.nomorInduk) {
            await db.eksemplar.update(h.eksemplarId, { nomorInduk: h.nomorInduk, menungguSinkron: false });
          }
          await db.outbox.delete(entri.seq!);
          dikirim++;
        }
      });
    }
    const kursor = (await db.meta.get(META_KURSOR))?.value ?? null;
    await terapkanPull(await transport.pull(kursor));
    return { dikirim, ditolak };
  }

  function pantau<T>(baca: () => Promise<T>, cb: (nilai: T) => void) {
    let berhenti = false;
    let sub: { unsubscribe(): void } | undefined;
    void siap.then(() => {
      if (berhenti) return;
      sub = liveQuery(baca).subscribe({ next: cb, error: (e) => console.error("pantau gagal", e) });
    });
    return () => {
      berhenti = true;
      sub?.unsubscribe();
    };
  }

  /** "Keluar & hapus data di perangkat ini" (ADR 0004). */
  async function hapusDataPerangkat() {
    await db.delete();
  }

  return {
    daftarKategori,
    tambahBukuManual,
    catatEksemplar,
    daftarKoleksi,
    statusSinkronisasi,
    sinkronkan,
    hapusDataPerangkat,
    /** Pemantau reaktif untuk UI; mengembalikan fungsi berhenti. */
    pantauKoleksi: (cb: (items: ItemKoleksi[]) => void) => pantau(bacaKoleksi, cb),
    pantauStatus: (cb: (status: StatusSinkronisasi) => void) => pantau(bacaStatus, cb),
  };
}

export type LocalLibrary = ReturnType<typeof createLocalLibrary>;
