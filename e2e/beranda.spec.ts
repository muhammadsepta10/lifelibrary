import { expect, test, type Page } from "@playwright/test";
import { envE2E } from "./env";

const JUDUL = "Buku Uji Beranda";

async function masuk(page: Page) {
  const { ownerEmail, ownerPassword } = envE2E();
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Kata sandi").fill(ownerPassword);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL("/");
}

test("Beranda: Rak masih kosong, lalu menampilkan angka, rak dan chip setelah Buku ditambah", async ({ page }) => {
  // Server tidak menerima apa pun: perubahan tetap Menunggu Sinkron, jadi chip-nya stabil.
  await page.route("**/api/sync/push", (route) => route.abort());
  await masuk(page);

  // Koleksi kosong: empty state, tanpa chip, tombol menuju Sesi Penerimaan.
  await expect(page.getByRole("heading", { name: "Rak kamu" })).toBeVisible();
  await expect(page.getByText("0 buku · 0 eksemplar · 0 dipinjam")).toBeVisible();
  await expect(page.getByTestId("beranda-kosong")).toContainText("Rak masih kosong…");
  await expect(page.getByRole("link", { name: "Scan buku pertama" })).toHaveAttribute("href", "/tambah/sesi");
  await expect(page.getByLabel("Perlu perhatian")).toHaveCount(0);

  // Tambah satu Buku (manual).
  await page.goto("/tambah");
  await page.getByLabel("Judul").fill(JUDUL);
  await page.getByLabel("Pengarang").fill("Pengarang Beranda");
  await page.getByRole("group", { name: "Kategori" }).locator("label", { hasText: "FIK" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/koleksi$/);

  // Beranda: angka sesuai data, punggung dan sampul bertanda Menunggu Sinkron, chip menaut ke /sinkron.
  await page.goto("/");
  await expect(page.getByText("1 buku · 1 eksemplar · 0 dipinjam")).toBeVisible();
  await expect(page.getByTestId("beranda-kosong")).toHaveCount(0);
  await expect(page.getByTestId("rak-punggung").getByTestId("penanda-menunggu")).toHaveCount(1);
  await expect(page.getByRole("link", { name: new RegExp(JUDUL) }).getByTestId("penanda-menunggu")).toBeVisible();
  await expect(page.getByTestId("chip-menunggu")).toHaveText(/\d+ perubahan menunggu sinkron/);
  await expect(page.getByTestId("chip-menunggu")).toHaveAttribute("href", "/sinkron");
  // Chip lain tidak relevan, jadi tidak tampil.
  await expect(page.getByTestId("chip-terlambat")).toHaveCount(0);
  await expect(page.getByTestId("chip-gagal")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Mulai Sesi Penerimaan" })).toHaveAttribute("href", "/tambah/sesi");
});
