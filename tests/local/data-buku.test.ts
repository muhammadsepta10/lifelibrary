import { beforeEach, describe, expect, it } from "vitest";
import { createLocalLibrary } from "@/lib/local-library";
import { PRESET_KATEGORI } from "@/lib/kategori-preset";
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

/** Transport palsu yang merekam apa yang dikirim perangkat; server "menerima" semuanya. */
function perekam() {
  const terkirim: Mutasi[] = [];
  const transport: SyncTransport = {
    async push(req: PushRequest) {
      terkirim.push(...req.mutasi);
      return { hasil: req.mutasi.map((m) => ({ id: m.id, status: "diterima" as const })) };
    },
    async pull() {
      return kosong;
    },
  };
  return { terkirim, transport };
}

/** Lokasi hanya datang dari server (dikelola online); tes menyalinnya lewat pull. */
async function salinLokasi(nama: string) {
  const id = crypto.randomUUID();
  await lib.sinkronkan({
    push: async () => ({ hasil: [] }),
    pull: async () => ({ ...kosong, lokasi: [{ id, nama, dihapus: false }] }),
  });
  return id;
}

const bukuLengkap = {
  judul: "Laut Bercerita",
  penerbit: "Kepustakaan Populer Gramedia",
  kota: "Jakarta",
  tahun: 2017,
  edisi: "Cetakan ke-3",
  seri: "Seri Novel Indonesia",
  jilid: "1",
  bahasa: "Indonesia",
  halaman: 379,
  sinopsis: "Novel tentang aktivis yang hilang.",
  sampul: "covers/laut-bercerita.jpg",
  subjek: ["Fiksi Indonesia", "Aktivis"],
  kelasDdc: "899.221",
  isbn13: "9786024246945",
  kontributor: [
    { nama: "Leila S. Chudori", peran: "pengarang" as const, utama: true },
    { nama: "Ahmad Fauzi", peran: "editor" as const },
  ],
};

describe("Data Buku lengkap", () => {
  it("semua field Buku dan Eksemplar bisa diisi dan terbaca di Detail Buku", async () => {
    const lokasiId = await salinLokasi("Rak A, susun 2");

    const { bukuId } = await lib.tambahBuku({
      ...bukuLengkap,
      eksemplar: {
        kategoriId: FIK.id,
        tanggalMasuk: "2026-03-01",
        asal: "beli",
        harga: 95000,
        kondisi: "baik",
        lokasiId,
      },
    });

    const detail = (await lib.detailBuku(bukuId))!;
    expect(detail).toMatchObject({
      judul: "Laut Bercerita",
      penerbit: "Kepustakaan Populer Gramedia",
      kota: "Jakarta",
      tahun: 2017,
      edisi: "Cetakan ke-3",
      seri: "Seri Novel Indonesia",
      jilid: "1",
      bahasa: "Indonesia",
      halaman: 379,
      sinopsis: "Novel tentang aktivis yang hilang.",
      sampul: "covers/laut-bercerita.jpg",
      subjek: ["Fiksi Indonesia", "Aktivis"],
      kelasDdc: "899.221",
      isbn13: "9786024246945",
    });
    expect(detail.kontributor.map((k) => [k.nama, k.peran, k.utama])).toEqual([
      ["Leila S. Chudori", "pengarang", true],
      ["Ahmad Fauzi", "editor", false],
    ]);
    expect(detail.pengarangUtama).toMatchObject({ nama: "Leila S. Chudori" });
    expect(detail.eksemplar).toHaveLength(1);
    expect(detail.eksemplar[0]).toMatchObject({
      tanggalMasuk: "2026-03-01",
      asal: "beli",
      harga: 95000,
      kondisi: "baik",
      lokasi: { id: lokasiId, nama: "Rak A, susun 2" },
      nomorIndukTampil: "——",
      menungguSinkron: true,
    });
  });

  it("field opsional boleh kosong, termasuk tanggal masuk Eksemplar", async () => {
    const { bukuId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });

    const detail = (await lib.detailBuku(bukuId))!;

    expect(detail).toMatchObject({ penerbit: null, kota: null, tahun: null, kelasDdc: null, subjek: [] });
    expect(detail.eksemplar[0]).toMatchObject({
      tanggalMasuk: null,
      asal: null,
      harga: null,
      kondisi: null,
      lokasi: null,
    });
  });

  it("menolak isian yang tidak masuk akal dan menunjuk field-nya", async () => {
    const coba = (ubah: Record<string, unknown>) =>
      lib.tambahBuku({ ...bukuLengkap, ...ubah, eksemplar: { kategoriId: FIK.id } });

    await expect(coba({ kelasDdc: "abc" })).rejects.toMatchObject({ field: "kelasDdc" });
    await expect(coba({ tahun: -5 })).rejects.toMatchObject({ field: "tahun" });
    await expect(coba({ halaman: 0 })).rejects.toMatchObject({ field: "halaman" });
    await expect(coba({ isbn13: "123" })).rejects.toMatchObject({ field: "isbn13" });
    await expect(
      lib.tambahBuku({ ...bukuLengkap, eksemplar: { kategoriId: FIK.id, tanggalMasuk: "2026-02-31" } }),
    ).rejects.toMatchObject({ field: "tanggalMasuk" });
    await expect(
      lib.tambahBuku({ ...bukuLengkap, eksemplar: { kategoriId: FIK.id, harga: -1 } }),
    ).rejects.toMatchObject({ field: "harga" });
    await expect(
      lib.tambahBuku({ ...bukuLengkap, eksemplar: { kategoriId: FIK.id, lokasiId: crypto.randomUUID() } }),
    ).rejects.toMatchObject({ field: "lokasiId" });
    expect(await lib.daftarKoleksi()).toEqual([]);
  });

  it("ISBN yang sama dengan Buku lain ditolak di perangkat", async () => {
    await lib.tambahBuku({ ...bukuLengkap, eksemplar: { kategoriId: FIK.id } });

    await expect(
      lib.tambahBuku({ ...bukuLengkap, judul: "Lain", eksemplar: { kategoriId: FIK.id } }),
    ).rejects.toMatchObject({ field: "isbn13" });
  });
});

describe("Kontributor", () => {
  const tambah = (kontributor: { nama: string; peran?: "pengarang" | "penerjemah" | "editor"; utama?: boolean }[]) =>
    lib.tambahBuku({ judul: "X", kontributor, eksemplar: { kategoriId: FIK.id } });

  it("wajib tepat satu Pengarang Utama", async () => {
    await expect(tambah([{ nama: "A" }, { nama: "B" }])).rejects.toMatchObject({ field: "kontributor" });
    await expect(
      tambah([
        { nama: "A", utama: true },
        { nama: "B", utama: true },
      ]),
    ).rejects.toMatchObject({ field: "kontributor" });
    await expect(tambah([])).rejects.toMatchObject({ field: "kontributor" });
    expect(await lib.daftarKoleksi()).toEqual([]);
  });

  it("peran bisa pengarang, penerjemah, atau editor", async () => {
    const { bukuId } = await tambah([
      { nama: "Pramoedya", peran: "pengarang", utama: true },
      { nama: "Max Lane", peran: "penerjemah" },
      { nama: "Sapardi", peran: "editor" },
    ]);

    const detail = (await lib.detailBuku(bukuId))!;
    expect(detail.kontributor.map((k) => k.peran)).toEqual(["pengarang", "penerjemah", "editor"]);
  });

  it("nama yang sama setelah dinormalkan digabung dalam satu Buku", async () => {
    const { bukuId } = await tambah([
      { nama: "Leila S. Chudori", peran: "pengarang", utama: true },
      { nama: "  leila s  chudori ", peran: "pengarang" },
    ]);

    const detail = (await lib.detailBuku(bukuId))!;
    expect(detail.kontributor).toHaveLength(1);
    expect(detail.kontributor[0]).toMatchObject({ nama: "Leila S. Chudori", utama: true });
  });

  it("orang yang sama dengan dua peran tetap satu Kontributor (satu id)", async () => {
    const { bukuId } = await tambah([
      { nama: "Eka Kurniawan", peran: "pengarang", utama: true },
      { nama: "eka kurniawan", peran: "editor" },
    ]);

    const detail = (await lib.detailBuku(bukuId))!;
    expect(detail.kontributor).toHaveLength(2);
    expect(new Set(detail.kontributor.map((k) => k.id)).size).toBe(1);
  });

  it("Kontributor yang sama di Buku lain memakai id dan penulisan nama yang sudah ada", async () => {
    const a = await tambah([{ nama: "Leila S. Chudori", utama: true }]);
    const b = await tambah([{ nama: "LEILA S CHUDORI", utama: true }]);

    const ka = (await lib.detailBuku(a.bukuId))!.kontributor[0];
    const kb = (await lib.detailBuku(b.bukuId))!.kontributor[0];
    expect(kb.id).toBe(ka.id);
    expect(kb.nama).toBe("Leila S. Chudori");
  });

  it("aksen dan tanda baca tidak membedakan nama", async () => {
    const a = await tambah([{ nama: "José Saramago", utama: true }]);
    const b = await tambah([{ nama: "Jose  Saramago.", utama: true }]);

    expect((await lib.detailBuku(b.bukuId))!.kontributor[0].id).toBe(
      (await lib.detailBuku(a.bukuId))!.kontributor[0].id,
    );
  });

  it("nama berbeda tidak digabung", async () => {
    const a = await tambah([{ nama: "Leila Chudori", utama: true }]);
    const b = await tambah([{ nama: "Leila Salikha", utama: true }]);

    expect((await lib.detailBuku(b.bukuId))!.kontributor[0].id).not.toBe(
      (await lib.detailBuku(a.bukuId))!.kontributor[0].id,
    );
  });
});

describe("Edit Buku dan Eksemplar", () => {
  it("mengubah field Buku langsung terlihat di Detail Buku", async () => {
    const { bukuId } = await lib.tambahBuku({ ...bukuLengkap, eksemplar: { kategoriId: FIK.id } });

    await lib.ubahBuku(bukuId, { judul: "Laut Bercerita (Edisi Revisi)", penerbit: null, tahun: 2020, subjek: ["Fiksi"] });

    expect(await lib.detailBuku(bukuId)).toMatchObject({
      judul: "Laut Bercerita (Edisi Revisi)",
      penerbit: null,
      tahun: 2020,
      subjek: ["Fiksi"],
      kota: "Jakarta",
    });
  });

  it("mengubah Kontributor, termasuk memindahkan Pengarang Utama", async () => {
    const { bukuId } = await lib.tambahBuku({ ...bukuLengkap, eksemplar: { kategoriId: FIK.id } });

    await lib.ubahBuku(bukuId, {
      kontributor: [
        { nama: "Leila S. Chudori", peran: "penerjemah" },
        { nama: "Ahmad Fauzi", peran: "pengarang", utama: true },
      ],
    });

    const detail = (await lib.detailBuku(bukuId))!;
    expect(detail.pengarangUtama).toMatchObject({ nama: "Ahmad Fauzi" });
    expect(detail.eksemplar[0].nomorPanggil.pengarang).toBe("FAU");
    await expect(lib.ubahBuku(bukuId, { kontributor: [{ nama: "Tanpa Utama" }] })).rejects.toMatchObject({
      field: "kontributor",
    });
  });

  it("judul tidak boleh dikosongkan, dan Buku yang tidak ada ditolak", async () => {
    const { bukuId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    await expect(lib.ubahBuku(bukuId, { judul: "  " })).rejects.toMatchObject({ field: "judul" });
    await expect(lib.ubahBuku(crypto.randomUUID(), { judul: "Z" })).rejects.toMatchObject({ field: "bukuId" });
    expect((await lib.detailBuku(bukuId))!.judul).toBe("A");
  });

  it("mengubah judul atau Pengarang Utama mengubah Nomor Panggil (dihitung dari data terkini)", async () => {
    const { bukuId } = await lib.tambahBukuManual({ judul: "Laut Bercerita", pengarang: "Leila Chudori", kategoriId: FIK.id });

    await lib.ubahBuku(bukuId, { judul: "Pulang" });

    expect((await lib.detailBuku(bukuId))!.eksemplar[0].nomorPanggil.teks).toBe("FIK / CHU / p");
  });

  it("mengubah data Eksemplar (tanggal, asal, harga, kondisi, Lokasi) dan mengosongkannya lagi", async () => {
    const lokasiId = await salinLokasi("Rak B");
    const { bukuId, eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    await lib.ubahEksemplar(eksemplarId, {
      tanggalMasuk: "2025-12-24",
      asal: "hadiah",
      harga: 0,
      kondisi: "cukup",
      lokasiId,
    });
    expect((await lib.detailBuku(bukuId))!.eksemplar[0]).toMatchObject({
      tanggalMasuk: "2025-12-24",
      asal: "hadiah",
      harga: 0,
      kondisi: "cukup",
      lokasi: { nama: "Rak B" },
    });

    await lib.ubahEksemplar(eksemplarId, { tanggalMasuk: null, lokasiId: null });
    expect((await lib.detailBuku(bukuId))!.eksemplar[0]).toMatchObject({ tanggalMasuk: null, lokasi: null, asal: "hadiah" });
  });

  it("menambah Eksemplar ke Buku yang ada dengan data penerimaannya sendiri", async () => {
    const { bukuId } = await lib.tambahBuku({
      ...bukuLengkap,
      eksemplar: { kategoriId: FIK.id, asal: "beli", harga: 90000 },
    });

    await lib.catatEksemplar({ bukuId, kategoriId: FIK.id, asal: "hadiah", kondisi: "baru" });

    const detail = (await lib.detailBuku(bukuId))!;
    expect(detail.eksemplar).toHaveLength(2);
    expect(detail.eksemplar.map((e) => e.asal).sort()).toEqual(["beli", "hadiah"]);
    expect(detail.eksemplar.find((e) => e.asal === "hadiah")).toMatchObject({
      kondisi: "baru",
      harga: null,
      menungguSinkron: true,
    });
  });
});

describe("Koreksi Kategori", () => {
  it("mengubah Nomor Panggil Eksemplar itu saja dan menandainya perlu cetak ulang", async () => {
    const { bukuId, eksemplarId } = await lib.tambahBukuManual({ judul: "Sirah", pengarang: "Mubarakfuri", kategoriId: FIK.id });
    const { eksemplarId: kedua } = await lib.catatEksemplar({ bukuId, kategoriId: FIK.id });

    await lib.koreksiKategori(eksemplarId, AGM.id);

    const semua = (await lib.detailBuku(bukuId))!.eksemplar;
    const pertama = semua.find((e) => e.id === eksemplarId);
    const lain = semua.find((e) => e.id === kedua);
    expect(pertama).toMatchObject({ id: eksemplarId, nomorPanggil: { teks: "AGM / MUB / s" }, perluCetak: true });
    // Eksemplar lain tidak berubah Nomor Panggilnya, jadi statusnya tidak disentuh.
    expect(lain).toMatchObject({ id: kedua, nomorPanggil: { teks: "FIK / MUB / s" } });
  });

  it("menolak Kategori kosong atau tidak dikenal, dan Eksemplar yang tidak ada", async () => {
    const { eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });

    await expect(lib.koreksiKategori(eksemplarId, "")).rejects.toMatchObject({ field: "kategoriId" });
    await expect(lib.koreksiKategori(eksemplarId, crypto.randomUUID())).rejects.toMatchObject({ field: "kategoriId" });
    await expect(lib.koreksiKategori(crypto.randomUUID(), AGM.id)).rejects.toMatchObject({ field: "eksemplarId" });
  });

  it("mengoreksi ke Kategori yang sama tidak mengubah apa-apa", async () => {
    const { bukuId, eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });
    const { transport, terkirim } = perekam();
    await lib.sinkronkan(transport);
    terkirim.length = 0;
    const sebelum = (await lib.detailBuku(bukuId))!.eksemplar[0].perluCetak;

    await lib.koreksiKategori(eksemplarId, FIK.id);

    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
    // Status Antrean Cetak tidak disentuh (kasus tercetak -> tetap tercetak ada di cetak-label.test.ts).
    expect((await lib.detailBuku(bukuId))!.eksemplar[0].perluCetak).toBe(sebelum);
  });
});

describe("Edit saat offline tersimpan lokal lalu terkirim saat online", () => {
  it("setiap edit tersimpan lokal dan menunggu dikirim; hanya field yang berubah dikirim", async () => {
    const { bukuId, eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });
    const { transport, terkirim } = perekam();
    await lib.sinkronkan(transport);
    terkirim.length = 0;
    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);

    await lib.ubahBuku(bukuId, { judul: "A", penerbit: "Gramedia", tahun: 2001 });
    await lib.ubahEksemplar(eksemplarId, { harga: 50000, kondisi: "baik" });
    await lib.koreksiKategori(eksemplarId, AGM.id);
    const lokal = (await lib.detailBuku(bukuId))!;
    expect(lokal.penerbit).toBe("Gramedia");
    expect((await lib.statusSinkronisasi()).menunggu).toBe(3);
    expect(terkirim).toEqual([]);

    await lib.sinkronkan(transport);

    expect((await lib.statusSinkronisasi()).menunggu).toBe(0);
    expect(terkirim.map((m) => m.jenis)).toEqual(["buku.ubah", "eksemplar.ubah", "eksemplar.koreksiKategori"]);
    expect(terkirim[0]).toMatchObject({ bukuId, perubahan: { penerbit: "Gramedia", tahun: 2001 } });
    expect(Object.keys((terkirim[0] as Extract<Mutasi, { jenis: "buku.ubah" }>).perubahan).sort()).toEqual(["penerbit", "tahun"]);
    expect(terkirim[1]).toMatchObject({ eksemplarId, perubahan: { harga: 50000, kondisi: "baik" } });
    expect(terkirim[2]).toMatchObject({ eksemplarId, kategoriId: AGM.id });
    for (const m of terkirim.slice(0, 3)) {
      expect(m).toMatchObject({ waktuUbah: "2026-03-14T10:00:00+07:00" });
    }
  });

  it("edit yang tidak mengubah apa pun tidak dikirim", async () => {
    const { bukuId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B", kategoriId: FIK.id });
    const { transport, terkirim } = perekam();
    await lib.sinkronkan(transport);
    terkirim.length = 0;

    await lib.ubahBuku(bukuId, { judul: "A", penerbit: "" });
    await lib.sinkronkan(transport);

    expect(terkirim).toEqual([]);
  });

  it("edit atas Buku yang belum pernah terkirim dikirim setelah pembuatannya, berurutan", async () => {
    const { bukuId, eksemplarId } = await lib.tambahBukuManual({ judul: "A", pengarang: "B C", kategoriId: FIK.id });
    await lib.ubahBuku(bukuId, { penerbit: "Gramedia" });
    await lib.ubahEksemplar(eksemplarId, { asal: "beli" });
    const { transport, terkirim } = perekam();

    await lib.sinkronkan(transport);

    expect(terkirim.map((m) => m.jenis)).toEqual(["buku.tambah", "eksemplar.catat", "buku.ubah", "eksemplar.ubah"]);
  });
});
