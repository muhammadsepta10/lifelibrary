import { expect, test, type Page } from "@playwright/test";
import { masuk } from "./bantu";

/** ISBN-13 sah berawalan 978602. Tiap tes memakai ISBN sendiri karena Buku yang tersimpan bertahan di basis data e2e. */
function isbn13(n: number) {
  const dua12 = `978602${String(n).padStart(6, "0")}`;
  const jumlah = [...dua12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return dua12 + ((10 - (jumlah % 10)) % 10);
}
const ISBN_ADA = isbn13(200_001);
const ISBN_TAK_ADA = isbn13(200_002);
const ISBN_KETIGA = isbn13(200_003);
const ISBN_MENUNGGU = isbn13(200_004);
const ISBN_TINJAU = isbn13(200_005);

const SUMBER_KOSONG = [
  { sumber: "openlibrary", status: "kosong" },
  { sumber: "google", status: "dilewati", pesan: "Kunci API belum diatur" },
  { sumber: "loc", status: "kosong" },
];

const KANDIDAT_BUMI = {
  id: "openlibrary:OL23233727W",
  sumber: "openlibrary",
  judul: "Bumi (edisi lain)",
  pengarang: ["Tere Liye"],
  penerbit: "PT Gramedia Pustaka Utama",
  tahun: 2014,
  halaman: 438,
  bahasa: "Indonesia",
  subjek: ["Fantasi"],
};
const KANDIDAT_LAIN = {
  id: "openlibrary:OL307247W",
  sumber: "openlibrary",
  judul: "Bumi Manusia",
  pengarang: ["Pramoedya Ananta Toer"],
  penerbit: "Hasta Mitra",
  tahun: 1980,
};
const SUMBER_OK = [{ sumber: "openlibrary", status: "ok" }];

/** Pencarian ISBN palsu: satu ISBN ditemukan, sisanya tidak ada di sumber manapun. */
async function tiruMetadataIsbn(page: Page) {
  await page.route("**/api/metadata/isbn*", async (route) => {
    const isbn = new URL(route.request().url()).searchParams.get("isbn") ?? "";
    await route.fulfill({
      json:
        isbn === ISBN_ADA
          ? {
              ditemukan: true,
              draf: {
                isbn13: isbn,
                judul: "Buku Sudah Ketemu",
                pengarang: ["Penulis Ada"],
                penerbit: null,
                kota: null,
                tahun: 2024,
                halaman: null,
                bahasa: null,
                sinopsis: null,
                sampul: null,
                subjek: [],
                kelasDdc: null,
                sumber: { judul: ["openlibrary"] },
              },
              sumber: SUMBER_OK,
            }
          : { ditemukan: false, isbn13: isbn, sumber: SUMBER_KOSONG, semuaGalat: false },
    });
  });
}

/** Tinjau ISBN yang tidak ditemukan di /tambah/isbn: layar tinjau kosong dengan Cari lewat judul. */
async function keLayarTinjau(page: Page) {
  await tiruMetadataIsbn(page);
  await masuk(page);
  await page.goto("/tambah/isbn");
  await page.getByLabel("ISBN", { exact: true }).fill(ISBN_TINJAU);
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page.getByText(`ISBN ${ISBN_TINJAU}`, { exact: true })).toBeVisible();
  return page.getByTestId("kandidat-judul");
}

test("Sesi Penerimaan: dua kartu, hanya yang ISBN-nya tidak ditemukan menawarkan Kandidat; kartu lain dan scan berikutnya tidak terganggu", async ({
  page,
}) => {
  await tiruMetadataIsbn(page);
  const permintaanJudul: URL[] = [];
  await page.route("**/api/metadata/judul*", async (route) => {
    permintaanJudul.push(new URL(route.request().url()));
    await route.fulfill({ json: { kandidat: [KANDIDAT_BUMI, KANDIDAT_LAIN], sumber: SUMBER_OK } });
  });

  await masuk(page);
  await page.goto("/tambah/sesi");
  await page.getByRole("button", { name: "Mulai Sesi dan nyalakan kamera" }).click();
  const layar = page.getByTestId("layar-sesi");
  const isian = layar.getByLabel("ISBN", { exact: true });
  const daftarKartu = layar.getByRole("list", { name: "Hasil scan" });
  const kartuAda = daftarKartu.getByRole("listitem").filter({ hasText: "Buku Sudah Ketemu" });
  const kartuTakAda = daftarKartu.getByRole("listitem").filter({ hasText: ISBN_TAK_ADA });

  for (const isbn of [ISBN_ADA, ISBN_TAK_ADA]) {
    await isian.fill(isbn);
    await isian.press("Enter");
  }
  await expect(kartuAda.getByTestId("status-kartu")).toHaveText("Siap ditinjau");
  await expect(kartuTakAda.getByTestId("status-kartu")).toHaveText("Siap ditinjau");

  // Kartu yang ditemukan: tidak ada pencarian cadangan, walau judulnya diubah.
  await kartuAda.getByRole("button", { name: /Tinjau draf/ }).click();
  const lembar = page.getByRole("dialog", { name: "Tinjau draf Buku" });
  await expect(lembar.locator("#judul")).toHaveValue("Buku Sudah Ketemu");
  await lembar.locator("#judul").fill("Judul diubah Pemilik");
  await lembar.locator("#judul").press("Enter");
  await page.waitForTimeout(1200);
  await expect(lembar.getByTestId("kandidat-judul")).toHaveCount(0);
  expect(permintaanJudul).toHaveLength(0);
  await lembar.getByRole("button", { name: "Kembali ke kamera" }).click();

  // Kartu yang tidak ditemukan: Kandidat muncul, dipilih, field terisi.
  await kartuTakAda.getByRole("button", { name: /Tinjau draf/ }).click();
  const kandidat = lembar.getByTestId("kandidat-judul");
  await expect(kandidat).toBeVisible();
  await lembar.locator("#judul").fill("Bumi");
  await expect(kandidat.getByRole("listitem")).toHaveCount(2);
  expect(permintaanJudul).toHaveLength(1);
  await kandidat.getByRole("button", { name: /Bumi \(edisi lain\)/ }).click();
  await expect(kandidat.getByRole("button", { name: /Bumi \(edisi lain\)/ })).toHaveCount(0);
  await expect(lembar.locator("#penerbit")).toHaveValue("PT Gramedia Pustaka Utama");
  await expect(lembar.locator("label[for=penerbit]").getByText("dari edisi lain, cek")).toBeVisible();
  await expect(lembar.locator("#judul")).toHaveValue("Bumi");
  await expect(lembar.getByText(`ISBN ${ISBN_TAK_ADA}`, { exact: true })).toBeVisible();

  // Simpan kartu yang memakai Kandidat; kartu lain tidak berubah.
  await lembar.getByRole("radiogroup", { name: "Kategori" }).locator("label", { hasText: "FIK" }).click();
  await expect(lembar.getByRole("radio", { name: /^FIK/ })).toBeChecked();
  // Bila FIK sudah disarankan (Buku lain karya Pengarang yang sama ada di perangkat), pilihan itu masih perlu dikonfirmasi.
  const pakai = lembar.getByRole("button", { name: "Pakai Kategori ini" });
  if (await pakai.isVisible()) await pakai.click();
  await lembar.getByRole("button", { name: "Simpan" }).click();
  await expect(kartuTakAda.getByTestId("status-kartu")).toHaveText("Tersimpan");
  await expect(kartuAda).toContainText("Buku Sudah Ketemu");
  await expect(kartuAda.getByTestId("status-kartu")).toHaveText("Siap ditinjau");

  // Scan berikutnya tetap jalan; kartu barunya mulai tanpa Kandidat sebelumnya.
  await page.waitForTimeout(1600);
  await isian.fill(ISBN_KETIGA);
  await isian.press("Enter");
  await expect(daftarKartu.getByRole("listitem")).toHaveCount(3);
  const kartuKetiga = daftarKartu.getByRole("listitem").filter({ hasText: ISBN_KETIGA });
  await expect(kartuKetiga.getByTestId("status-kartu")).toHaveText("Siap ditinjau");
  await kartuKetiga.getByRole("button", { name: /Tinjau draf/ }).click();
  await expect(lembar.getByTestId("kandidat-judul").getByRole("button", { name: /Bumi \(edisi lain\)/ })).toHaveCount(0);
  await expect(lembar.locator("#penerbit")).toHaveValue("");
  await lembar.getByRole("button", { name: "Kembali ke kamera" }).click();
  expect(permintaanJudul).toHaveLength(1);

  await layar.getByRole("button", { name: "Selesai" }).click();
  await expect(page).toHaveURL(/\/koleksi$/);
  await expect(page.getByText("Bumi", { exact: true }).first()).toBeVisible();
});

test("draf 'menunggu data' yang dilengkapi online dan tidak ditemukan juga mendapat Kandidat", async ({ page, context }) => {
  let offline = false;
  await page.route("**/api/metadata/isbn*", (route) =>
    offline
      ? route.abort("internetdisconnected")
      : route.fulfill({ json: { ditemukan: false, isbn13: ISBN_MENUNGGU, sumber: SUMBER_KOSONG, semuaGalat: false } }),
  );
  await page.route("**/api/metadata/judul*", (route) => route.fulfill({ json: { kandidat: [KANDIDAT_BUMI], sumber: SUMBER_OK } }));

  await masuk(page);
  await page.goto("/tambah/sesi");
  await page.getByRole("button", { name: "Mulai Sesi dan nyalakan kamera" }).click();
  const layar = page.getByTestId("layar-sesi");

  offline = true;
  await context.setOffline(true);
  await layar.getByLabel("ISBN", { exact: true }).fill(ISBN_MENUNGGU);
  await layar.getByLabel("ISBN", { exact: true }).press("Enter");
  const kartu = layar.getByRole("list", { name: "Hasil scan" }).getByRole("listitem").first();
  await expect(kartu.getByTestId("status-kartu")).toHaveText("Menunggu data");

  offline = false;
  await context.setOffline(false);
  await expect(kartu.getByTestId("status-kartu")).toHaveText("Siap ditinjau", { timeout: 15_000 });
  await kartu.getByRole("button", { name: /Tinjau draf/ }).click();
  const lembar = page.getByRole("dialog", { name: "Tinjau draf Buku" });
  await lembar.locator("#judul").fill("Bumi");
  await expect(lembar.getByTestId("kandidat-judul").getByRole("button", { name: /Bumi \(edisi lain\)/ })).toBeVisible();
});

test("Bukan salah satunya menutup daftar; judul atau pengarang berubah memunculkannya lagi; pasangan yang sama tidak dikirim ulang", async ({
  page,
}) => {
  const permintaan: URL[] = [];
  await page.route("**/api/metadata/judul*", async (route) => {
    permintaan.push(new URL(route.request().url()));
    await route.fulfill({ json: { kandidat: [KANDIDAT_LAIN, KANDIDAT_BUMI], sumber: SUMBER_OK } });
  });
  const kandidat = await keLayarTinjau(page);
  const judul = page.locator("#judul");

  await judul.fill("Bumi");
  await expect(kandidat.getByRole("button", { name: /Bumi Manusia/ })).toBeVisible();
  expect(permintaan).toHaveLength(1);

  // Keyboard: tombol terjangkau lewat Tab dan bisa diaktifkan dengan Enter; fokus kembali ke judul.
  const tutup = kandidat.getByRole("button", { name: "Bukan salah satunya" });
  await tutup.focus();
  await page.keyboard.press("Enter");
  await expect(kandidat.getByRole("list")).toHaveCount(0);
  await expect(judul).toBeFocused();

  // Tidak muncul lagi sendiri.
  await page.waitForTimeout(1200);
  await expect(kandidat.getByRole("list")).toHaveCount(0);
  expect(permintaan).toHaveLength(1);

  // Judul berubah: daftar baru.
  await judul.fill("Bumi Manusia");
  await expect(kandidat.getByRole("list")).toBeVisible();
  expect(permintaan).toHaveLength(2);

  // Tutup lagi, lalu ubah pengarang: muncul lagi dengan permintaan judul + pengarang.
  await tutup.click();
  await expect(kandidat.getByRole("list")).toHaveCount(0);
  await page.getByLabel("Pengarang Utama").fill("Pramoedya");
  await expect(kandidat.getByRole("list")).toBeVisible();
  expect(permintaan).toHaveLength(3);
  expect(permintaan[2].searchParams.get("pengarang")).toBe("Pramoedya");

  // Kembali ke pasangan yang pernah dicari: daftar muncul dari cache, tanpa permintaan baru.
  await page.getByLabel("Pengarang Utama").fill("");
  await expect(kandidat.getByRole("list")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(permintaan).toHaveLength(3);
});

test("keadaan pencarian: mencari, tidak ada yang cocok, dan sumber gagal dibedakan, diumumkan lewat aria-live tanpa modal", async ({ page }) => {
  let tahan: (() => void) | null = null;
  await page.route("**/api/metadata/judul*", async (route) => {
    const judul = new URL(route.request().url()).searchParams.get("judul");
    if (judul === "Tertahan") await new Promise<void>((lanjut) => (tahan = lanjut));
    if (judul === "Tidakada") return route.fulfill({ json: { kandidat: [], sumber: [{ sumber: "openlibrary", status: "kosong" }] } });
    if (judul === "Sumbergagal") {
      return route.fulfill({
        json: { kandidat: [], sumber: [{ sumber: "openlibrary", status: "galat", pesan: "timeout" }, { sumber: "google", status: "dilewati" }] },
      });
    }
    return route.fulfill({ json: { kandidat: [KANDIDAT_BUMI], sumber: SUMBER_OK } });
  });
  const kandidat = await keLayarTinjau(page);
  const status = kandidat.getByRole("status");
  await expect(status).toHaveAttribute("aria-live", "polite");

  await page.locator("#judul").fill("Tertahan");
  await expect(status).toHaveText("Mencari…");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => tahan !== null).toBe(true);
  tahan!();
  await expect(status).toContainText("Mungkin edisi lain");

  await page.locator("#judul").fill("Tidakada");
  await expect(status).toHaveText("Tidak ada data yang cocok, isi manual saja.");
  await expect(kandidat.getByRole("list")).toHaveCount(0);

  await page.locator("#judul").fill("Sumbergagal");
  await expect(status).toContainText("sumber tidak bisa dihubungi");
  await expect(status).not.toContainText("Tidak ada data yang cocok");

  // Form tetap bisa diisi dan dikirim selama keadaan apa pun: tidak ada yang menghalangi.
  await page.locator("#penerbit").fill("Penerbit Manual");
  await expect(page.locator("#penerbit")).toHaveValue("Penerbit Manual");
});

test("permintaan lama dibatalkan saat input berubah dan hasilnya tidak pernah menimpa hasil baru", async ({ page }) => {
  const KANDIDAT_LAMA = { ...KANDIDAT_LAIN, id: "openlibrary:LAMA", judul: "Hasil Lama" };
  const KANDIDAT_BARU = { ...KANDIDAT_BUMI, id: "openlibrary:BARU", judul: "Hasil Baru" };
  let lamaDijawab = false;
  await page.route("**/api/metadata/judul*", async (route) => {
    const judul = new URL(route.request().url()).searchParams.get("judul");
    if (judul === "Alfa") {
      // Jawaban lama datang terlambat, sesudah jawaban baru.
      await new Promise((r) => setTimeout(r, 2500));
      lamaDijawab = true;
      await route.fulfill({ json: { kandidat: [KANDIDAT_LAMA], sumber: SUMBER_OK } }).catch(() => undefined);
      return;
    }
    await route.fulfill({ json: { kandidat: [KANDIDAT_BARU], sumber: SUMBER_OK } });
  });
  const kandidat = await keLayarTinjau(page);

  await page.locator("#judul").fill("Alfa");
  await expect(kandidat.getByRole("status")).toHaveText("Mencari…");
  await page.locator("#judul").fill("Alfabet");
  await expect(kandidat.getByRole("button", { name: /Hasil Baru/ })).toBeVisible();

  await expect.poll(() => lamaDijawab, { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(500);
  await expect(kandidat.getByRole("button", { name: /Hasil Lama/ })).toHaveCount(0);
  await expect(kandidat.getByRole("button", { name: /Hasil Baru/ })).toBeVisible();
});

test("offline atau login habis: tidak ada pesan galat, form tetap bisa diisi manual", async ({ page, context }) => {
  let permintaan = 0;
  let sesiHabis = false;
  await page.route("**/api/metadata/judul*", async (route) => {
    permintaan++;
    if (sesiHabis) return route.fulfill({ status: 401, json: { galat: "Belum login" } });
    await route.abort("internetdisconnected");
  });
  const kandidat = await keLayarTinjau(page);
  const status = kandidat.getByRole("status");

  // Offline: tidak ada permintaan sama sekali dan tidak ada pesan galat.
  await context.setOffline(true);
  await page.locator("#judul").fill("Bumi");
  await page.locator("#judul").press("Enter");
  await page.waitForTimeout(1500);
  expect(permintaan).toBe(0);
  await expect(status).not.toContainText(/gagal|tidak bisa dihubungi|Mencari/);
  await expect(kandidat.getByRole("alert")).toHaveCount(0);
  await context.setOffline(false);

  // Login habis (401): diam saja, tanpa pesan galat maupun "tidak ada yang cocok".
  sesiHabis = true;
  await page.locator("#judul").fill("Bumi Manusia");
  await expect.poll(() => permintaan).toBe(1);
  await page.waitForTimeout(500);
  await expect(status).not.toContainText(/gagal|tidak bisa dihubungi|Mencari|Tidak ada data yang cocok/);
  await expect(kandidat.getByRole("alert")).toHaveCount(0);

  await page.locator("#penerbit").fill("Penerbit Manual");
  await expect(page.locator("#penerbit")).toHaveValue("Penerbit Manual");
});
