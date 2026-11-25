import { expect, test, type Page } from "@playwright/test";
import { envE2E } from "./env";

const ISBN = "9786024246945";
const JUDUL = "Buku Uji Sesi";

/** Hasil Pencarian Metadata palsu: tidak ada jaringan keluar dari tes ini. */
const HASIL_METADATA = {
  ditemukan: true,
  draf: {
    isbn13: ISBN,
    judul: JUDUL,
    pengarang: ["Penulis Uji"],
    penerbit: "Penerbit Uji",
    kota: null,
    tahun: 2024,
    halaman: 200,
    bahasa: "id",
    sinopsis: null,
    sampul: null,
    subjek: [],
    kelasDdc: null,
    sumber: { judul: ["openlibrary"], pengarang: ["openlibrary"] },
  },
  sumber: [{ sumber: "openlibrary", status: "ok" }],
};

async function masuk(page: Page) {
  const { ownerEmail, ownerPassword } = envE2E();
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Kata sandi").fill(ownerPassword);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL("/");
}

test("login, Sesi Penerimaan: ketik ISBN, tinjau draf, konfirmasi Kategori, simpan, Eksemplar muncul di Koleksi", async ({ page }) => {
  let metadataDipanggil = 0;
  await page.route("**/api/metadata/isbn*", async (route) => {
    metadataDipanggil++;
    await route.fulfill({ json: HASIL_METADATA });
  });

  await masuk(page);

  // Mulai sesi dengan data sesi sekali isi.
  await page.goto("/tambah/sesi");
  await page.getByLabel("Tanggal masuk").fill("2026-11-20");
  await page.getByLabel("Asal").selectOption("beli");
  await page.getByRole("button", { name: "Mulai Sesi dan nyalakan kamera" }).click();

  const layar = page.getByTestId("layar-sesi");
  await expect(layar).toBeVisible();
  await expect(page.getByTestId("ringkasan-sesi")).toContainText("Beli");
  const urlSesi = page.url();

  // Kamera (palsu) menyala dan tetap menyala.
  await expect(layar.getByText("Arahkan barcode ISBN ke dalam kotak")).toBeVisible();
  await expect
    .poll(() => page.getByTestId("video-kamera").evaluate((v: HTMLVideoElement) => v.srcObject !== null && !v.paused))
    .toBe(true);

  // Barcode non-ISBN ditolak dengan pesan jelas.
  await layar.getByLabel("ISBN", { exact: true }).fill("8991234567890");
  await layar.getByLabel("ISBN", { exact: true }).press("Enter");
  await expect(layar.getByRole("alert").first()).toContainText("bukan ISBN");

  // Ketik ISBN: kartu Mencari… lalu Siap ditinjau.
  await layar.getByLabel("ISBN", { exact: true }).fill(ISBN);
  await layar.getByLabel("ISBN", { exact: true }).press("Enter");
  const kartu = layar.getByRole("list", { name: "Hasil scan" }).getByRole("listitem").first();
  await expect(kartu.getByTestId("status-kartu")).toHaveText("Siap ditinjau");
  await expect(kartu).toContainText(JUDUL);

  // Ketuk kartu: tinjau draf di lembar dalam halaman yang sama.
  await kartu.getByRole("button", { name: /Tinjau draf/ }).click();
  const lembar = page.getByRole("dialog", { name: "Tinjau draf Buku" });
  await expect(lembar.getByLabel("Judul")).toHaveValue(JUDUL);
  await expect(lembar.getByRole("button", { name: "Simpan" })).toBeDisabled();

  // Konfirmasi Kategori lalu simpan.
  await lembar.getByRole("radiogroup", { name: "Kategori" }).locator("label", { hasText: "FIK" }).click();
  await lembar.getByRole("button", { name: "Simpan" }).click();

  // Kartu menjadi Tersimpan; Nomor Induk dari server menggantikan "——" setelah Sinkronisasi.
  await expect(kartu.getByTestId("status-kartu")).toHaveText("Tersimpan");
  await expect(kartu.getByTestId("nomor-induk-kartu")).toHaveText(/^(——|FIK-001\/\d{4})$/);
  await expect(kartu.getByTestId("nomor-induk-kartu")).toHaveText(/^FIK-001\/\d{4}$/, { timeout: 30_000 });

  // ISBN yang sama (setelah jeda 1,5 detik) -> "Tambah eksemplar baru?".
  await page.waitForTimeout(1600);
  await layar.getByLabel("ISBN", { exact: true }).fill(ISBN);
  await layar.getByLabel("ISBN", { exact: true }).press("Enter");
  await expect(page.getByRole("alertdialog")).toContainText("Tambah eksemplar baru?");
  await page.getByRole("button", { name: "Batal" }).click();

  // Selama sesi berjalan tidak ada navigasi rute.
  expect(page.url()).toBe(urlSesi);
  expect(metadataDipanggil).toBe(1);

  // Selesai: kamera mati, lalu Koleksi memuat Eksemplarnya.
  await layar.getByRole("button", { name: "Selesai" }).click();
  await expect(page).toHaveURL(/\/koleksi$/);
  await expect(page.getByText(JUDUL).first()).toBeVisible();
});
