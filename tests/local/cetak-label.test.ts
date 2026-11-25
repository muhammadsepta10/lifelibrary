import { beforeEach, describe, expect, it } from "vitest";
import { KelolaDitolakError, type KelolaTransport } from "@/lib/kelola-protocol";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
import { ButuhKoneksiError, createLocalLibrary, hitungGrid, ValidasiError } from "@/lib/local-library";
import type { Mutasi, PullResponse, PushRequest, SyncTransport } from "@/lib/sync-protocol";

const FIK = PRESET_KATEGORI.find((k) => k.kode === "FIK")!;
const AGM = PRESET_KATEGORI.find((k) => k.kode === "AGM")!;

let lib: ReturnType<typeof createLocalLibrary>;
beforeEach(() => {
  lib = createLocalLibrary({
    dbName: `lifelibrary-test-${crypto.randomUUID()}`,
    now: () => new Date(2026, 2, 14, 10, 0, 0),
  });
});

const kosong: PullResponse = {
  kursor: null,
  kategori: [],
  lokasi: [],
  aturanKategori: [],
  templateLabel: null,
  buku: [],
  eksemplar: [],
};

/** Server palsu: menerima semuanya dan memberi Nomor Induk berurutan per kategori. */
function server() {
  const terkirim: Mutasi[] = [];
  let urut = 0;
  const transport: SyncTransport = {
    async push(req: PushRequest) {
      terkirim.push(...req.mutasi);
      return {
        hasil: req.mutasi.map((m) =>
          m.jenis === "eksemplar.catat"
            ? {
                id: m.id,
                status: "diterima" as const,
                eksemplarId: m.eksemplar.id,
                nomorInduk: `FIK-${String(++urut).padStart(3, "0")}/2026`,
              }
            : { id: m.id, status: "diterima" as const },
        ),
      };
    },
    async pull() {
      return kosong;
    },
  };
  return { terkirim, transport };
}

/** Eksemplar baru yang sudah tersinkron (punya Nomor Induk). */
async function eksemplarSiap(judul: string, pengarang: string, kategoriId = FIK.id) {
  const baru = await lib.tambahBukuManual({ judul, pengarang, kategoriId });
  return baru;
}

const antrean = async () => (await lib.antreanCetak()).map((i) => i.eksemplarId);

describe("Antrean Cetak", () => {
  it("Eksemplar baru langsung masuk antrean, tapi yang Menunggu Sinkron belum bisa dicetak karena belum punya Nomor Induk", async () => {
    const { eksemplarId } = await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");

    const [item] = await lib.antreanCetak();

    expect(item).toMatchObject({
      eksemplarId,
      judul: "Laut Bercerita",
      nomorInduk: null,
      bisaDicetak: false,
      alasanTidakBisa: "belum punya Nomor Induk",
      kategori: { kode: "FIK", nama: "Fiksi" },
      nomorPanggil: { teks: "FIK / CHU / l" },
    });
    expect(await lib.jumlahAntreanCetak()).toEqual({ total: 1, siapDicetak: 0, menungguNomorInduk: 1 });
  });

  it("setelah tersinkron dan mendapat Nomor Induk, Eksemplar siap dicetak", async () => {
    await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");
    await eksemplarSiap("Bumi Manusia", "Pramoedya Ananta Toer");
    const { transport } = server();

    await lib.sinkronkan(transport);

    const items = await lib.antreanCetak();
    const urut = [...items].sort((a, b) => a.nomorInduk!.localeCompare(b.nomorInduk!));
    expect(urut.map((i) => [i.nomorInduk, i.bisaDicetak, i.alasanTidakBisa])).toEqual([
      ["FIK-001/2026", true, null],
      ["FIK-002/2026", true, null],
    ]);
    expect(await lib.jumlahAntreanCetak()).toEqual({ total: 2, siapDicetak: 2, menungguNomorInduk: 0 });
  });

  it("menandai tercetak mengeluarkan Eksemplar dari antrean dan mengirimkannya lewat outbox", async () => {
    const a = await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");
    const b = await eksemplarSiap("Bumi Manusia", "Pramoedya Ananta Toer");
    const { transport, terkirim } = server();
    await lib.sinkronkan(transport);
    terkirim.length = 0;

    await lib.tandaiTercetak([a.eksemplarId]);

    expect(await antrean()).toEqual([b.eksemplarId]);
    await lib.sinkronkan(transport);
    expect(terkirim).toMatchObject([{ jenis: "eksemplar.tandaiTercetak", eksemplarIds: [a.eksemplarId] }]);
  });

  it("Eksemplar Menunggu Sinkron tidak bisa ditandai tercetak", async () => {
    const { eksemplarId } = await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");

    const gagal = lib.tandaiTercetak([eksemplarId]);

    await expect(gagal).rejects.toBeInstanceOf(ValidasiError);
    await expect(gagal).rejects.toMatchObject({ pesan: expect.stringContaining("belum punya Nomor Induk") });
    expect(await antrean()).toEqual([eksemplarId]);
  });

  it("Nomor Panggil berubah (koreksi Kategori, judul, atau Pengarang Utama) memasukkan Eksemplar ke antrean lagi", async () => {
    const a = await eksemplarSiap("Sirah Nabawiyah", "Safiyyurrahman Mubarakfuri");
    const { transport } = server();
    await lib.sinkronkan(transport);
    const tandai = async () => {
      await lib.tandaiTercetak([a.eksemplarId]);
      expect(await antrean()).toEqual([]);
    };

    await tandai();
    await lib.koreksiKategori(a.eksemplarId, FIK.id); // Kategori sama: tidak berubah
    expect(await antrean()).toEqual([]);
    await lib.koreksiKategori(a.eksemplarId, AGM.id);
    expect(await antrean()).toEqual([a.eksemplarId]);

    await tandai();
    await lib.ubahBuku(a.bukuId, { penerbit: "Pustaka Al-Kautsar" }); // tidak memengaruhi Nomor Panggil
    await lib.ubahBuku(a.bukuId, { judul: "Sirah Nabawiyah (Revisi)" }); // huruf awal sama
    expect(await antrean()).toEqual([]);
    await lib.ubahBuku(a.bukuId, { judul: "Rahiq Makhtum" });
    expect(await antrean()).toEqual([a.eksemplarId]);

    await tandai();
    await lib.ubahBuku(a.bukuId, { kontributor: [{ nama: "Pramoedya Ananta Toer", utama: true }] });
    expect(await antrean()).toEqual([a.eksemplarId]);
  });
});

describe("Antrean Cetak: kode Kategori berganti", () => {
  const ubahKode = (kode: string) =>
    ({
      kategori: {
        ubah: async (id: string, p: { kode?: string }) => ({
          id,
          kode: p.kode ?? kode,
          nama: "Fiksi",
          warna: FIK.warna,
          diarsipkan: false,
          dihapus: false,
        }),
      },
    }) as unknown as KelolaTransport;

  it("semua Eksemplar aktif Kategori itu masuk antrean lagi, Eksemplar Kategori lain tidak", async () => {
    const a = await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");
    const b = await eksemplarSiap("Bumi Manusia", "Pramoedya Ananta Toer");
    const lain = await eksemplarSiap("Sirah Nabawiyah", "Safiyyurrahman Mubarakfuri", AGM.id);
    await lib.sinkronkan(server().transport);
    await lib.tandaiTercetak([a.eksemplarId, b.eksemplarId, lain.eksemplarId]);
    expect(await antrean()).toEqual([]);

    await lib.kelola(ubahKode("NVL")).kategori.ubah(FIK.id, { kode: "NVL" });

    expect((await antrean()).sort()).toEqual([a.eksemplarId, b.eksemplarId].sort());
    const [item] = (await lib.antreanCetak()).filter((i) => i.eksemplarId === a.eksemplarId);
    expect(item).toMatchObject({ nomorPanggil: { teks: "NVL / CHU / l" }, nomorInduk: "FIK-001/2026" });
  });

  it("mengganti nama atau warna saja tidak mengubah antrean", async () => {
    const a = await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");
    await lib.sinkronkan(server().transport);
    await lib.tandaiTercetak([a.eksemplarId]);

    await lib.kelola(ubahKode(FIK.kode)).kategori.ubah(FIK.id, { nama: "Fiksi umum" });

    expect(await antrean()).toEqual([]);
  });
});

describe("Template Label dan grid", () => {
  it("bawaan: 66×26 mm, margin 5,5 / 6, kertas A4 dengan 3 kolom × 11 baris = 33 sel", async () => {
    const t = await lib.templateLabel();

    expect(t).toMatchObject({ kertas: "A4", w: 66, h: 26, mt: 5.5, ml: 6, gx: 0, gy: 0 });
    expect(t).toMatchObject({ kolom: 3, baris: 11, perLembar: 33, lebarKertas: 210, tinggiKertas: 297 });
  });

  it("F4 (215 × 330 mm) dengan ukuran bawaan memuat 3 × 12 = 36 sel", () => {
    expect(hitungGrid({ kertas: "F4", w: 66, h: 26, mt: 5.5, ml: 6, gx: 0, gy: 0 })).toMatchObject({
      kolom: 3,
      baris: 12,
      perLembar: 36,
      lebarKertas: 215,
      tinggiKertas: 330,
    });
  });

  it("memperhitungkan margin dan jarak antar sel, dan selalu memuat minimal satu sel", () => {
    expect(hitungGrid({ kertas: "A4", w: 60, h: 30, mt: 10, ml: 5, gx: 2, gy: 3 })).toMatchObject({
      kolom: 3,
      baris: 8,
      perLembar: 24,
    });
    expect(hitungGrid({ kertas: "F4", w: 40, h: 20, mt: 5.5, ml: 5, gx: 0, gy: 0 })).toMatchObject({
      kolom: 5,
      baris: 15,
      perLembar: 75,
    });
    expect(hitungGrid({ kertas: "A4", w: 205, h: 290, mt: 3, ml: 2, gx: 0, gy: 0 }).perLembar).toBe(1);
  });

  it("disimpan lewat server (online), lalu terbaca dari salinan lokal, juga setelah perangkat dibuka ulang", async () => {
    const dbName = `lifelibrary-test-${crypto.randomUUID()}`;
    const a = createLocalLibrary({ dbName });
    const f4 = { kertas: "F4", w: 70, h: 30, mt: 8, ml: 7, gx: 1, gy: 2 } as const;
    const transport = { templateLabel: { simpan: async (t) => t } } as KelolaTransport;

    await a.kelola(transport).templateLabel.simpan(f4);

    expect(await a.templateLabel()).toMatchObject({ ...f4, kolom: 2, baris: 9, perLembar: 18 });
    const dibukaLagi = createLocalLibrary({ dbName });
    expect(await dibukaLagi.templateLabel()).toMatchObject(f4);
  });

  it("Template Label dari server ikut tersalin lewat pull", async () => {
    const f4 = { kertas: "F4", w: 70, h: 30, mt: 8, ml: 7, gx: 1, gy: 2 } as const;

    await lib.sinkronkan({
      push: async () => ({ hasil: [] }),
      pull: async () => ({ ...kosong, templateLabel: f4 }),
    });

    expect(await lib.templateLabel()).toMatchObject(f4);
  });

  it("tanpa koneksi gagal dengan 'Butuh koneksi' dan Template Label lokal tidak berubah; penolakan server diteruskan", async () => {
    const offline = {
      templateLabel: {
        simpan: async () => {
          throw new TypeError("Failed to fetch");
        },
      },
    } as unknown as KelolaTransport;
    const gagal = lib.kelola(offline).templateLabel.simpan({ kertas: "F4", w: 70, h: 30, mt: 8, ml: 7, gx: 1, gy: 2 });
    await expect(gagal).rejects.toBeInstanceOf(ButuhKoneksiError);
    await expect(gagal).rejects.toThrow("Butuh koneksi");
    expect(await lib.templateLabel()).toMatchObject({ kertas: "A4", w: 66 });

    const tolak = {
      templateLabel: {
        simpan: async () => {
          throw new KelolaDitolakError("tidak-valid", "w", "Lebar Label harus lebih dari 0 mm");
        },
      },
    } as unknown as KelolaTransport;
    await expect(
      lib.kelola(tolak).templateLabel.simpan({ kertas: "A4", w: 0, h: 26, mt: 5.5, ml: 6, gx: 0, gy: 0 }),
    ).rejects.toMatchObject({ field: "w" });
  });
});

describe("Rencana cetak: posisi awal, pratinjau, halaman uji", () => {
  /** n Eksemplar yang sudah tersinkron; mengembalikan id-nya. */
  async function antreanSiap(n: number) {
    for (let i = 0; i < n; i++) await eksemplarSiap(`Judul ${i + 1}`, "Leila S. Chudori");
    await lib.sinkronkan(server().transport);
    return antrean();
  }

  it("posisi awal N melewati N-1 sel pertama; pratinjau menghitung sel dilewati, label, kosong, dan lembar", async () => {
    const ids = await antreanSiap(5);

    const r = await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 3 });

    expect(r).toMatchObject({ posisiAwal: 3, jumlahDilewati: 2, jumlahLabel: 5, jumlahLembar: 1, jumlahKosong: 26 });
    expect(r.lembar).toHaveLength(1);
    const jenis = r.lembar[0].sel.map((s) => s.jenis);
    expect(jenis).toHaveLength(33);
    expect(jenis.slice(0, 2)).toEqual(["dilewati", "dilewati"]);
    expect(jenis.slice(2, 7)).toEqual(Array(5).fill("label"));
    expect(jenis.slice(7)).toEqual(Array(26).fill("kosong"));
  });

  it("Label mengisi sel berurutan sesuai urutan pilihan, mulai dari sel pertama yang tidak dilewati", async () => {
    const ids = await antreanSiap(3);

    const r = await lib.rencanaCetak({ eksemplarIds: [ids[2], ids[0]], posisiAwal: 2 });

    const label = r.lembar[0].sel.filter((s) => s.jenis === "label");
    expect(label.map((s) => [s.indeks, s.label?.eksemplarId])).toEqual([
      [1, ids[2]],
      [2, ids[0]],
    ]);
  });

  it("koordinat sel dalam mm: kiri = ml + kolom*(w+gx), atas = mt + baris*(h+gy)", async () => {
    const ids = await antreanSiap(1);

    const bawaan = await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 1 });
    expect(bawaan.lembar[0].sel[0]).toMatchObject({ kolom: 0, baris: 0, x: 6, y: 5.5, lebar: 66, tinggi: 26 });
    expect(bawaan.lembar[0].sel[4]).toMatchObject({ kolom: 1, baris: 1, x: 72, y: 31.5 });
    expect(bawaan.lembar[0].sel[32]).toMatchObject({ kolom: 2, baris: 10, x: 138, y: 265.5 });

    const renggang = await lib.rencanaCetak({
      eksemplarIds: ids,
      posisiAwal: 1,
      template: { kertas: "A4", w: 60, h: 30, mt: 10, ml: 5, gx: 2, gy: 3 },
    });
    expect(renggang.lembar[0].sel[4]).toMatchObject({ kolom: 1, baris: 1, x: 67, y: 43 });
  });

  it("lebih banyak Label dari satu lembar: lembar berikutnya dimulai dari sel pertama, posisi awal hanya berlaku di lembar pertama", async () => {
    const ids = await antreanSiap(31);

    const r = await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 5 });

    // 4 dilewati + 31 label = 35 sel => 2 lembar x 33 = 66, sisa 31 kosong
    expect(r).toMatchObject({ jumlahDilewati: 4, jumlahLabel: 31, jumlahLembar: 2, jumlahKosong: 31 });
    expect(r.lembar[0].sel.filter((s) => s.jenis === "label")).toHaveLength(29);
    expect(r.lembar[1].sel.filter((s) => s.jenis === "label")).toHaveLength(2);
    expect(r.lembar[1].sel.filter((s) => s.jenis === "dilewati")).toHaveLength(0);
    expect(r.lembar[1].sel[0].jenis).toBe("label");
  });

  it("posisi awal di luar rentang dirapikan ke 1..sel per lembar; F4 memakai 36 sel per lembar", async () => {
    const ids = await antreanSiap(1);
    const f4 = { kertas: "F4", w: 66, h: 26, mt: 5.5, ml: 6, gx: 0, gy: 0 } as const;

    expect((await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 0 })).posisiAwal).toBe(1);
    expect((await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 99 })).posisiAwal).toBe(33);
    const r = await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 99, template: f4 });
    expect(r).toMatchObject({ posisiAwal: 36, perLembar: 36, lebarKertas: 215, tinggiKertas: 330 });
  });

  it("tanpa Eksemplar tetap satu lembar kosong", async () => {
    const r = await lib.rencanaCetak({ eksemplarIds: [], posisiAwal: 1 });

    expect(r).toMatchObject({ jumlahLabel: 0, jumlahLembar: 1, jumlahKosong: 33 });
  });

  it("Eksemplar Menunggu Sinkron tidak ikut dicetak dan dilaporkan dengan alasannya", async () => {
    const [siap] = await antreanSiap(1);
    const menunggu = await eksemplarSiap("Baru Dicatat", "Leila S. Chudori");

    const r = await lib.rencanaCetak({ eksemplarIds: [siap, menunggu.eksemplarId], posisiAwal: 1 });

    expect(r.jumlahLabel).toBe(1);
    expect(r.tidakBisaDicetak).toEqual([
      { eksemplarId: menunggu.eksemplarId, judul: "Baru Dicatat", alasan: "belum punya Nomor Induk" },
    ]);
  });

  it("isi Label: pita Kategori, Nomor Panggil 3 baris, judul, Nomor Induk, dan barcode Code 128 dari Nomor Induk", async () => {
    const ids = await antreanSiap(1);

    const r = await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 1 });

    const { label } = r.lembar[0].sel[0];
    expect(label).toMatchObject({
      nomorInduk: "FIK-001/2026",
      judul: "Judul 1",
      kategori: { kode: "FIK", nama: "Fiksi", warna: "#E76F51" },
      nomorPanggil: { kode: "FIK", pengarang: "CHU", judul: "j" },
    });
    // "FIK-001/2026" dalam Code 128 (set B untuk "FIK-001/", set C untuk "2026"): 156 modul.
    expect(label!.barcode).toHaveLength(156);
    expect(label!.barcode.startsWith("11010010000")).toBe(true); // start code B
    expect(label!.barcode.endsWith("1100011101011")).toBe(true); // stop
  });

  it("halaman uji: satu lembar, semua sel hanya garis tepi tanpa isi Label", async () => {
    const r = await lib.rencanaCetak({ eksemplarIds: [], posisiAwal: 1, halamanUji: true });

    expect(r).toMatchObject({ halamanUji: true, jumlahLembar: 1, jumlahLabel: 0 });
    expect(r.lembar[0].sel).toHaveLength(33);
    expect(r.lembar[0].sel.every((s) => s.jenis === "uji" && s.label === undefined)).toBe(true);
  });
});

describe("Mencetak hanya online", () => {
  it("offline: siapkanCetak gagal dengan 'Butuh koneksi'; online: mengembalikan rencana yang sama dengan pratinjau", async () => {
    await eksemplarSiap("Laut Bercerita", "Leila S. Chudori");
    await lib.sinkronkan(server().transport);
    const ids = await antrean();

    const offline = lib.siapkanCetak({ eksemplarIds: ids, posisiAwal: 1, online: false });
    await expect(offline).rejects.toBeInstanceOf(ButuhKoneksiError);
    await expect(offline).rejects.toThrow("Butuh koneksi");

    const online = await lib.siapkanCetak({ eksemplarIds: ids, posisiAwal: 1, online: true });
    expect(online).toEqual(await lib.rencanaCetak({ eksemplarIds: ids, posisiAwal: 1 }));
    // Halaman uji juga dicetak, jadi juga butuh koneksi.
    await expect(lib.siapkanCetak({ eksemplarIds: [], posisiAwal: 1, halamanUji: true, online: false })).rejects.toBeInstanceOf(
      ButuhKoneksiError,
    );
  });
});
