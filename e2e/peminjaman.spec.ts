import { expect, test, type Page } from "@playwright/test";
import { envE2E } from "./env";

const JUDUL = "Buku Uji Peminjaman";

async function masuk(page: Page) {
  const { ownerEmail, ownerPassword } = envE2E();
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Kata sandi").fill(ownerPassword);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL("/");
}

test("Peminjaman: Nomor Induk dipindai (diketik), pinjamkan ke Peminjam baru, terlambat tampil di badge nav, pengingat WhatsApp, kembalikan", async ({ page }) => {
  await masuk(page);

  // Catat Buku manual lalu tunggu server memberi Nomor Induk.
  await page.goto("/tambah");
  await page.getByLabel("Judul").fill(JUDUL);
  await page.getByLabel("Pengarang").fill("Pengarang Peminjaman");
  await page.getByRole("group", { name: "Kategori" }).locator("label", { hasText: "FIK" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/koleksi$/);
  await page.getByText(JUDUL).first().click();
  const nomorInduk = page.getByTestId("nomor-induk").first();
  await expect(nomorInduk).toHaveText(/^[A-Z0-9]{2,5}-\d{3,}\/\d{4}$/, { timeout: 30_000 });
  const nomor = (await nomorInduk.textContent())!.trim();

  // Pindai Label Barcode: kamera (palsu) menyala, Nomor Induk diketik sebagai ganti barcode.
  await page.goto("/peminjaman");
  await page.getByRole("button", { name: "Pindai Label Barcode" }).click();
  const layar = page.getByTestId("layar-pindai-label");
  await expect(layar).toBeVisible();
  await expect
    .poll(() => page.getByTestId("video-kamera").evaluate((v: HTMLVideoElement) => v.srcObject !== null && !v.paused))
    .toBe(true);
  const urlPindai = page.url();

  // ISBN (bukan Label) ditolak dengan pesan jelas.
  await layar.getByLabel("Nomor Induk", { exact: true }).fill("9786024246945");
  await layar.getByLabel("Nomor Induk", { exact: true }).press("Enter");
  await expect(layar.getByRole("alert")).toContainText("bukan Label Barcode");

  await layar.getByLabel("Nomor Induk", { exact: true }).fill(nomor);
  await layar.getByLabel("Nomor Induk", { exact: true }).press("Enter");
  const hasil = layar.getByTestId("hasil-pindai");
  await expect(hasil.getByTestId("nomor-induk-hasil")).toHaveText(nomor);
  await expect(hasil).toContainText(JUDUL);
  await expect(hasil).toContainText("Tersedia");

  // Pinjamkan ke Peminjam baru dengan jatuh tempo yang sudah lewat, di lembar dalam halaman.
  await hasil.getByRole("button", { name: "Pinjamkan" }).click();
  const lembar = page.getByRole("dialog", { name: "Pinjamkan Eksemplar" });
  await lembar.getByLabel("Nama Peminjam").fill("Rina");
  await lembar.getByLabel("Kontak (nomor WhatsApp)").fill("0812-3456-7890");
  await lembar.getByLabel("Tanggal pinjam").fill("2020-01-01");
  await lembar.getByLabel("Jatuh tempo").fill("2020-01-15");
  await lembar.getByRole("button", { name: "Pinjamkan", exact: true }).click();
  await expect(lembar).toBeHidden();
  await expect(hasil).toContainText("Dipinjam Rina");
  await expect(hasil.getByTestId("chip-pinjam")).toContainText("Terlambat");

  // Dua kali meminjamkan tidak bisa: tombol Pinjamkan sudah diganti Kembalikan.
  await expect(hasil.getByRole("button", { name: "Pinjamkan", exact: true })).toHaveCount(0);

  // Pengingat WhatsApp membuka wa.me dengan nomor 628… dan pesan berisi judul serta jatuh tempo.
  const wa = hasil.getByRole("link", { name: /Kirim pengingat via WhatsApp/ });
  const href = (await wa.getAttribute("href"))!;
  expect(href.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
  const pesan = new URL(href).searchParams.get("text")!;
  expect(pesan).toContain(JUDUL);
  expect(pesan).toContain("15 Januari 2020");

  // Tidak ada navigasi rute selama kamera menyala.
  expect(page.url()).toBe(urlPindai);
  await layar.getByRole("button", { name: "Selesai" }).click();
  await expect(layar).toBeHidden();

  // Badge terlambat di nav dan daftar Terlambat.
  await expect(page.getByTestId("badge-terlambat").first()).toHaveText("1");
  await page.getByRole("tab", { name: /Terlambat/ }).click();
  const baris = page.getByTestId("baris-peminjaman");
  await expect(baris).toHaveCount(1);
  await expect(baris).toContainText("Terlambat");

  // Kembalikan: keluar dari Terlambat, badge hilang, masuk Riwayat.
  await baris.getByRole("button", { name: "Kembalikan" }).click();
  await expect(page.getByTestId("badge-terlambat")).toHaveCount(0);
  await expect(baris).toHaveCount(0);
  await page.getByRole("tab", { name: /Riwayat/ }).click();
  await expect(page.getByTestId("baris-peminjaman")).toContainText(JUDUL);
});
