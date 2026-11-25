import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium, devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { RUTE_CANGKANG } from "../src/lib/rute-cangkang";
import { masukLewatApi, tambahBukuManual } from "./bantu";
import { BASE_URL } from "./env";

/**
 * Mode offline penuh (tiket #8), diuji pada build produksi dengan Service Worker
 * yang sungguhan dan profil browser yang bertahan di disk:
 *
 *  A. online: login, Service Worker menyimpan cangkang, sampul masuk cache
 *  B. browser DIMULAI ulang saat offline: jaringan benar-benar tak terjangkau
 *     (proxy mati untuk semua permintaan, termasuk milik Service Worker) dan
 *     `navigator.onLine` false. Aplikasi, Koleksi, sampul, tambah/ubah Buku,
 *     scan kamera (WASM dari cache) dan cek duplikat harus jalan
 *  C. online lagi: perubahan terkirim, Eksemplar mendapat Nomor Induk
 */
const PROFIL = ".data/e2e/profil-offline";
const BERKAS_SAMPUL = ".data/covers/sampul-e2e.png";
const KUNCI_SAMPUL = "sampul-e2e.png";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const ISBN_ADA = "9786024246945";
const ISBN_BARU = "9786020633176";

const { defaultBrowserType: _tidakDipakai, ...PONSEL } = devices["Pixel 7"];
void _tidakDipakai;

async function bukaBrowser(opsi: { offline: boolean }): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFIL, {
    ...PONSEL,
    baseURL: BASE_URL,
    serviceWorkers: "allow",
    permissions: ["camera"],
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    ...(opsi.offline
      ? {
          // Jaringan sungguhan putus: semua lalu lintas (juga localhost dan fetch Service Worker) lewat proxy yang mati.
          offline: true,
          proxy: { server: "http://127.0.0.1:9" },
        }
      : {}),
  });
}

const pathCache = (page: Page, nama: string) =>
  page.evaluate(
    async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname),
    nama,
  );

async function idBukuDariKoleksi(page: Page, judul: string) {
  const href = await page.getByRole("link", { name: new RegExp(`^${judul},`) }).getAttribute("href");
  return new URL(href!, BASE_URL).searchParams.get("id")!;
}

test.describe.serial("mode offline penuh", () => {
  test.beforeAll(() => {
    rmSync(PROFIL, { recursive: true, force: true });
    mkdirSync(".data/covers", { recursive: true });
    writeFileSync(BERKAS_SAMPUL, PNG_1X1);
  });

  test("A. online: Service Worker menyimpan cangkang dan sampul", async () => {
    const ctx = await bukaBrowser({ offline: false });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await masukLewatApi(ctx);
    await page.goto("/");
    await expect(page).toHaveURL("/");

    // Service Worker aktif dan mengendalikan halaman.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 20_000 });

    // Setiap rute cangkang tersimpan, dan WASM pemindai ada di precache (bukan dari CDN).
    await expect
      .poll(async () => {
        const ada = await pathCache(page, "halaman-aplikasi");
        return RUTE_CANGKANG.filter((r) => !ada.includes(r));
      }, { timeout: 30_000 })
      .toEqual([]);
    expect(await page.evaluate(async () => !!(await caches.match("/zxing/zxing_reader.wasm", { ignoreSearch: true })))).toBe(true);

    // Buku dengan sampul dan ISBN, dibuat online dan disinkronkan.
    await tambahBukuManual(page, "Buku Daring", "Penulis Daring");
    const id = await idBukuDariKoleksi(page, "Buku Daring");
    await page.goto(`/buku/ubah?id=${id}`);
    await page.getByLabel("ISBN-13").fill(ISBN_ADA);
    await page.getByLabel("Sampul (alamat gambar)").fill(`/api/covers/${KUNCI_SAMPUL}`);
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/buku\?id=/);
    await page.goto("/koleksi");
    const kartu = page.getByTestId("eksemplar").filter({ hasText: "Buku Daring" });
    await expect(kartu.getByTestId("nomor-induk")).toHaveText(/^FIK-\d{3}\/\d{4}$/, { timeout: 30_000 });

    // Sampul yang sudah dilihat masuk cache.
    const sampul = page.getByAltText("Sampul Buku Daring");
    await expect(sampul).toBeVisible();
    await expect.poll(() => sampul.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await expect
      .poll(() => pathCache(page, "sampul"), { timeout: 15_000 })
      .toContain(`/api/covers/${KUNCI_SAMPUL}`);
    await ctx.close();
  });

  test("B. browser dimulai offline: aplikasi, Koleksi, sampul, tambah/ubah Buku, scan, cek duplikat", async () => {
    const ctx = await bukaBrowser({ offline: true });
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    // Jaringan memang putus: server tidak terjangkau dari halaman maupun Service Worker.
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    // Aplikasi terbuka dari cache; strip offline tampil dengan teks persis.
    await page.goto("/");
    await expect(page.getByTestId("strip-offline")).toHaveText("Offline · perubahan disimpan di perangkat ini");
    expect(await page.evaluate(() => fetch("/api/sync/pull").then(() => "terjangkau", () => "putus"))).toBe("putus");

    // Koleksi dan sampul yang pernah dimuat tampil.
    await page.goto("/koleksi");
    const kartuDaring = page.getByTestId("eksemplar").filter({ hasText: "Buku Daring" });
    await expect(kartuDaring).toBeVisible();
    await expect(kartuDaring.getByTestId("nomor-induk")).toHaveText(/^FIK-\d{3}\/\d{4}$/);
    const sampul = page.getByAltText("Sampul Buku Daring");
    await expect.poll(() => sampul.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

    // Tambah Buku manual offline: tersimpan di perangkat, belum bernomor (Menunggu Sinkron).
    await tambahBukuManual(page, "Buku Luring", "Penulis Luring");
    const kartuLuring = page.getByTestId("eksemplar").filter({ hasText: "Buku Luring" });
    await expect(kartuLuring.getByTestId("nomor-induk")).toHaveText("——");

    // Edit Buku offline (halaman /buku/ubah?id=... dari cache, datanya dari Dexie).
    const id = await idBukuDariKoleksi(page, "Buku Luring");
    await page.goto(`/buku/ubah?id=${id}`);
    await page.getByLabel("Penerbit").fill("Penerbit Luring");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/buku\?id=/);
    await expect(page.getByText("Penerbit Luring")).toBeVisible();

    // Aksi yang hanya bisa online tetap terlihat dengan "Butuh koneksi".
    await page.goto("/lainnya");
    await expect(page.getByText("Butuh koneksi")).toHaveCount(4); // Kategori, Lokasi, Aturan Kategori, ekspor Buku Induk
    await expect(page.getByTestId("strip-offline")).toBeVisible();
    await page.goto("/buku-induk");
    await expect(page.getByRole("button", { name: "Ekspor CSV" })).toBeDisabled();
    await expect(page.getByText("Butuh koneksi")).toBeVisible();
    await page.goto("/cetak");
    await expect(page.getByText("Butuh koneksi").first()).toBeVisible();

    // Scan offline: WASM dari cache, tanpa CDN. ISBN yang sudah ada -> cek duplikat dari data lokal.
    await page.goto("/tambah/sesi");
    await page.getByRole("button", { name: "Mulai Sesi dan nyalakan kamera" }).click();
    const layar = page.getByTestId("layar-sesi");
    await expect(layar.getByText("Arahkan barcode ISBN ke dalam kotak")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name)), { timeout: 20_000 })
      .toContainEqual(expect.stringContaining("/zxing/zxing_reader.wasm"));
    expect(
      await page.evaluate(() => performance.getEntriesByType("resource").some((e) => e.name.includes("jsdelivr"))),
    ).toBe(false);
    await layar.getByLabel("ISBN", { exact: true }).fill(ISBN_ADA);
    await layar.getByLabel("ISBN", { exact: true }).press("Enter");
    await expect(page.getByRole("alertdialog")).toContainText("Tambah eksemplar baru?");
    await page.getByRole("button", { name: "Batal" }).click();

    // ISBN baru offline -> draf "Menunggu data" di perangkat.
    await page.waitForTimeout(1600);
    await layar.getByLabel("ISBN", { exact: true }).fill(ISBN_BARU);
    await layar.getByLabel("ISBN", { exact: true }).press("Enter");
    const kartu = layar.getByRole("list", { name: "Hasil scan" }).getByRole("listitem").first();
    await expect(kartu.getByTestId("status-kartu")).toHaveText("Menunggu data");
    await ctx.close();
  });

  test("C. online lagi: perubahan terkirim dan Eksemplar mendapat Nomor Induk", async () => {
    const ctx = await bukaBrowser({ offline: false });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto("/koleksi");
    await expect(page.getByTestId("strip-offline")).toHaveCount(0);
    const kartuLuring = page.getByTestId("eksemplar").filter({ hasText: "Buku Luring" });
    await expect(kartuLuring.getByTestId("nomor-induk")).toHaveText(/^FIK-\d{3}\/\d{4}$/, { timeout: 30_000 });
    await ctx.close();
  });
});

/**
 * Perilaku di browser yang butuh jawaban server yang dikendalikan tes
 * (Service Worker diblokir supaya `page.route` berlaku). Offline dilakukan
 * dengan `setOffline` (mengubah `navigator.onLine` dan memutus halaman) dan
 * handler route yang menolak permintaan saat offline.
 */
const HASIL_METADATA = {
  ditemukan: true,
  draf: {
    isbn13: ISBN_BARU,
    judul: "Buku Dilengkapi Online",
    pengarang: ["Penulis Uji"],
    penerbit: null,
    kota: null,
    tahun: 2024,
    halaman: null,
    bahasa: "id",
    sinopsis: null,
    sampul: null,
    subjek: [],
    kelasDdc: null,
    sumber: { judul: ["openlibrary"], pengarang: ["openlibrary"] },
  },
  sumber: [{ sumber: "openlibrary", status: "ok" }],
};

test.describe("tanpa Service Worker: server dikendalikan tes", () => {
  test.use({ serviceWorkers: "block" });

  test("scan offline: Menunggu data, lalu otomatis Siap ditinjau setelah online; strip hanya saat offline", async ({ page, context }) => {
    let offline = false;
    await page.route("**/api/metadata/isbn*", (route) =>
      offline ? route.abort("internetdisconnected") : route.fulfill({ json: HASIL_METADATA }),
    );
    await masukLewatApi(context);
    await page.goto("/");
    await expect(page.getByTestId("strip-offline")).toHaveCount(0);

    await page.goto("/tambah/sesi");
    await page.getByRole("button", { name: "Mulai Sesi dan nyalakan kamera" }).click();
    const layar = page.getByTestId("layar-sesi");
    await expect(layar).toBeVisible();

    offline = true;
    await context.setOffline(true);
    await expect(page.getByTestId("strip-offline")).toHaveText("Offline · perubahan disimpan di perangkat ini");

    await layar.getByLabel("ISBN", { exact: true }).fill(ISBN_BARU);
    await layar.getByLabel("ISBN", { exact: true }).press("Enter");
    const kartu = layar.getByRole("list", { name: "Hasil scan" }).getByRole("listitem").first();
    await expect(kartu.getByTestId("status-kartu")).toHaveText("Menunggu data");

    offline = false;
    await context.setOffline(false);
    await expect(page.getByTestId("strip-offline")).toHaveCount(0);
    await expect(kartu.getByTestId("status-kartu")).toHaveText("Siap ditinjau", { timeout: 15_000 });
    await expect(kartu).toContainText("Buku Dilengkapi Online");
  });

  test("sesi login kedaluwarsa: strip 'masuk lagi', data lokal tetap bisa diubah, Sinkronisasi jalan lagi setelah login", async ({ page, context }) => {
    let sesiHabis = false;
    await page.route("**/api/sync/**", (route) =>
      sesiHabis ? route.fulfill({ status: 401, json: { galat: "Belum login" } }) : route.continue(),
    );
    await masukLewatApi(context);
    await page.goto("/");
    await expect(page.getByTestId("strip-login")).toHaveCount(0);

    sesiHabis = true;
    await page.goto("/sinkron");
    await page.getByRole("button", { name: "Sinkronkan sekarang" }).click();
    await expect(page.getByTestId("strip-login")).toContainText("masuk lagi untuk Sinkronisasi");

    // Data lokal tidak terkunci.
    await tambahBukuManual(page, "Buku Saat Login Habis", "Penulis");
    const kartu = page.getByTestId("eksemplar").filter({ hasText: "Buku Saat Login Habis" });
    await expect(kartu).toBeVisible();
    await expect(kartu.getByTestId("nomor-induk")).toHaveText("——");

    // Sesi pulih: Sinkronisasi menunggu sampai dipicu, lalu Nomor Induk datang.
    sesiHabis = false;
    await page.goto("/sinkron");
    await page.getByRole("button", { name: "Sinkronkan sekarang" }).click();
    await expect(page.getByTestId("strip-login")).toHaveCount(0);
    await page.goto("/koleksi");
    await expect(kartu.getByTestId("nomor-induk")).toHaveText(/^FIK-\d{3}\/\d{4}$/, { timeout: 30_000 });
  });

  test("Keluar & hapus data: konfirmasi menyebut perubahan belum terkirim, lalu IndexedDB dan cache terhapus", async ({ page, context }) => {
    await masukLewatApi(context);
    await page.goto("/");
    // Tahan Sinkronisasi supaya perubahan tetap menunggu.
    await page.route("**/api/sync/**", (route) => route.abort("internetdisconnected"));
    await tambahBukuManual(page, "Buku Belum Terkirim", "Penulis");
    await page.evaluate(() => caches.open("sampul").then((c) => c.put("/api/covers/x.png", new Response("x"))));

    await page.goto("/lainnya");
    await page.getByRole("button", { name: "Keluar & hapus data di perangkat ini" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByTestId("isi-konfirmasi-hapus")).toContainText("2 perubahan belum terkirim");

    await dialog.getByRole("button", { name: "Hapus dan keluar" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);
    const basisData = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(basisData).not.toContain("lifelibrary");
  });
});
