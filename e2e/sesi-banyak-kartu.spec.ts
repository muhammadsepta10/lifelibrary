import { expect, test, type Locator, type Page } from "@playwright/test";
import { masuk } from "./bantu";

/** ISBN-13 valid berurutan (awalan 978602, digit cek dihitung). */
function isbn13(n: number) {
  const dua12 = `978602${String(n).padStart(6, "0")}`;
  const jumlah = [...dua12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return dua12 + ((10 - (jumlah % 10)) % 10);
}

async function dalamLayar(page: Page, el: Locator) {
  const kotak = await el.boundingBox();
  const tinggi = page.viewportSize()!.height;
  expect(kotak, "elemen harus dirender").not.toBeNull();
  expect(kotak!.y, "atas elemen di dalam layar").toBeGreaterThanOrEqual(0);
  expect(kotak!.y + kotak!.height, "bawah elemen tidak terdorong keluar layar").toBeLessThanOrEqual(tinggi);
}

test("Sesi Penerimaan: banyak kartu tidak mendorong isian ISBN dan tombol bawah keluar layar", async ({ page }) => {
  await page.route("**/api/metadata/isbn*", async (route) => {
    const isbn = new URL(route.request().url()).searchParams.get("isbn") ?? "";
    await route.fulfill({
      json: {
        ditemukan: true,
        draf: {
          isbn13: isbn,
          judul: `Buku Uji Banyak ${isbn}`,
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
          sumber: { judul: ["openlibrary"] },
        },
        sumber: [{ sumber: "openlibrary", status: "ok" }],
      },
    });
  });

  await masuk(page);
  await page.goto("/tambah/sesi");
  await page.getByLabel("Asal").selectOption("beli");
  await page.getByRole("button", { name: "Mulai Sesi dan nyalakan kamera" }).click();

  const layar = page.getByTestId("layar-sesi");
  const isian = layar.getByLabel("ISBN", { exact: true });
  for (let i = 1; i <= 8; i++) {
    await isian.fill(isbn13(i));
    await isian.press("Enter");
    await expect(layar.getByRole("list", { name: "Hasil scan" }).getByRole("listitem")).toHaveCount(i);
  }

  // Kamera palsu tidak pernah membaca barcode: saran panjang "belum terbaca" ikut tampil.
  await expect(layar.getByText("Barcode belum terbaca", { exact: false })).toBeVisible({ timeout: 15_000 });

  await dalamLayar(page, isian);
  await dalamLayar(page, layar.getByRole("button", { name: "Cari ISBN" }));
  await dalamLayar(page, layar.getByRole("button", { name: "Tanpa ISBN? Isi manual" }));
});
