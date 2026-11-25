import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBukuIndukApi } from "@/server/buku-induk";
import { createPenyianganApi } from "@/server/penyiangan";
import { createSyncApi } from "@/server/sync";
import type { Mutasi } from "@/lib/sync-protocol";
import { createTestDb } from "../support/test-db";
import { KATEGORI_ID } from "../support/mutasi";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let sync: ReturnType<typeof createSyncApi>;
let induk: ReturnType<typeof createBukuIndukApi>;

beforeEach(async () => {
  ctx = await createTestDb();
  sync = createSyncApi(ctx.db);
  induk = createBukuIndukApi(ctx.db);
});
afterEach(async () => {
  await ctx.close();
});

async function catat(opts: {
  judul: string;
  kode?: string;
  tahun?: number;
  pengarang?: string;
  tanggalMasuk?: string;
  asal?: "beli" | "hadiah" | "lainnya";
  harga?: number;
}) {
  const bukuId = crypto.randomUUID();
  const eksemplarId = crypto.randomUUID();
  const mutasi: Mutasi[] = [
    {
      id: crypto.randomUUID(),
      jenis: "buku.tambah",
      buku: {
        id: bukuId,
        judul: opts.judul,
        kontributor: [{ id: crypto.randomUUID(), nama: opts.pengarang ?? "Leila S. Chudori", peran: "pengarang", utama: true }],
      },
    },
    {
      id: crypto.randomUUID(),
      jenis: "eksemplar.catat",
      eksemplar: {
        id: eksemplarId,
        bukuId,
        kategoriId: KATEGORI_ID[opts.kode ?? "FIK"],
        waktuDicatat: `${opts.tahun ?? 2026}-03-14T10:00:00+07:00`,
        tanggalMasuk: opts.tanggalMasuk,
        asal: opts.asal,
        harga: opts.harga,
      },
    },
  ];
  await sync.push({ mutasi });
  return eksemplarId;
}

/** Memecah CSV sederhana (tanpa baris baru di dalam sel) menjadi baris dan sel. */
function urai(csv: string): string[][] {
  const hasil: string[][] = [];
  let baris: string[] = [];
  let sel = "";
  let kutip = false;
  const teks = csv.replace(/^﻿/, "");
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ",") {
      baris.push(sel);
      sel = "";
    } else if (c === "\r" && teks[i + 1] === "\n") {
      baris.push(sel);
      hasil.push(baris);
      baris = [];
      sel = "";
      i++;
    } else sel += c;
  }
  return hasil;
}

describe("API Buku Induk: ekspor", () => {
  it("CSV: semua Eksemplar urut Nomor Induk termasuk yang keluar, dengan tanggal masuk, asal, harga, status", async () => {
    await catat({ judul: "Laut Bercerita", tanggalMasuk: "2026-01-10", asal: "beli", harga: 90000 });
    const b = await catat({ judul: "Sirah Nabawiyah", kode: "AGM", pengarang: "Muhammad Husain Haekal", asal: "hadiah" });
    await catat({ judul: "Bumi Manusia", tanggalMasuk: "2026-02-20", asal: "beli", harga: 60000 });
    await createPenyianganApi(ctx.db).siangi(b, { jenis: "dihibahkan", tanggal: "2026-06-01", alasan: "Untuk perpustakaan masjid" });

    const baris = urai(await induk.csv());

    expect(baris[0]).toEqual([
      "Nomor Induk", "Judul", "Pengarang Utama", "Kategori", "Tanggal Masuk", "Asal", "Harga",
      "Status", "Tanggal Keluar", "Jenis Keluar", "Alasan Keluar",
    ]);
    expect(baris.slice(1).map((r) => r.slice(0, 2))).toEqual([
      ["AGM-001/2026", "Sirah Nabawiyah"],
      ["FIK-001/2026", "Laut Bercerita"],
      ["FIK-002/2026", "Bumi Manusia"],
    ]);
    expect(baris[1]).toEqual([
      "AGM-001/2026", "Sirah Nabawiyah", "Muhammad Husain Haekal", "Agama", "", "Hadiah", "",
      "Keluar", "2026-06-01", "Dihibahkan", "Untuk perpustakaan masjid",
    ]);
    expect(baris[2]).toEqual([
      "FIK-001/2026", "Laut Bercerita", "Leila S. Chudori", "Fiksi", "2026-01-10", "Beli", "90000",
      "Aktif", "", "", "",
    ]);
  });

  it("CSV: filter tahun pencatatan", async () => {
    await catat({ judul: "Lama", tahun: 2025 });
    await catat({ judul: "Baru", tahun: 2026 });

    const baris = urai(await induk.csv({ tahun: 2025 }));

    expect(baris.slice(1).map((r) => [r[0], r[1]])).toEqual([["FIK-001/2025", "Lama"]]);
  });

  it("CSV: sel dengan koma, tanda kutip, dan awalan rumus aman dibuka di spreadsheet", async () => {
    await catat({ judul: 'Kumpulan "Cerpen", Jilid 1', pengarang: "=HYPERLINK(1)" });

    const csv = await induk.csv();
    const [, baris] = urai(csv);

    expect(baris[1]).toBe('Kumpulan "Cerpen", Jilid 1');
    expect(baris[2]).toBe("'=HYPERLINK(1)");
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("CSV kosong tetap berisi baris judul kolom", async () => {
    expect(urai(await induk.csv())).toHaveLength(1);
  });

  it("PDF: berkas PDF yang sah, memuat tiap baris, dan bersambung ke halaman berikutnya", async () => {
    for (let i = 0; i < 70; i++) await catat({ judul: `Buku nomor ${i}` });

    const pdf = await induk.pdf();

    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
    expect((await PDFDocument.load(await induk.pdf({ tahun: 1999 }))).getPageCount()).toBe(1);
  });

  it("PDF: karakter di luar Latin tidak menggagalkan ekspor", async () => {
    await catat({ judul: "كتاب 日本語 — Écrire", pengarang: "Zoë Ñandú" });

    const pdf = await induk.pdf();

    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
