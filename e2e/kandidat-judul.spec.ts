import { expect, test, type Page } from "@playwright/test";
import { masuk } from "./bantu";

const ISBN_TAK_ADA = "9786026486066";
/** ISBN lain untuk tes yang tidak menyimpan Buku, supaya tidak bentrok dengan Buku dari tes pertama. */
const ISBN_GAGAL_SAMPUL = "9780735211292";
const ISBN_ADA = "9786024246945";

const SUMBER_KOSONG = [
  { sumber: "openlibrary", status: "kosong" },
  { sumber: "google", status: "dilewati", pesan: "Kunci API belum diatur" },
  { sumber: "loc", status: "kosong" },
];

/** Kandidat palsu: tidak ada jaringan keluar dari tes ini. */
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
  sampulUrl: "https://covers.openlibrary.org/b/id/12810708-L.jpg",
};
const KANDIDAT_LAIN = {
  id: "google:sintetis-bumi-manusia",
  sumber: "google",
  judul: "Bumi Manusia",
  pengarang: ["Pramoedya Ananta Toer"],
  penerbit: "Hasta Mitra",
  tahun: 1980,
};

/** PNG 1x1 untuk pratinjau sampul Kandidat dan sampul yang disajikan aplikasi; tanpa jaringan. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const KUNCI_SAMPUL = `${ISBN_TAK_ADA}.jpg`;

async function cegatSampul(page: Page, balasan: { kunci: string | null }) {
  const permintaan: { isbn13: string; url: string }[] = [];
  await page.route("https://covers.openlibrary.org/**", (route) => route.fulfill({ body: PNG, contentType: "image/png" }));
  await page.route("**/api/covers/**", (route) => route.fulfill({ body: PNG, contentType: "image/png" }));
  await page.route("**/api/metadata/sampul", async (route) => {
    permintaan.push(route.request().postDataJSON());
    await route.fulfill({ json: balasan });
  });
  return permintaan;
}

test("ISBN tidak ditemukan: ketik judul, pilih Kandidat, field terisi dengan lencana, judul dan ISBN scan tetap, Buku tersimpan", async ({ page }) => {
  await page.route("**/api/metadata/isbn*", (route) =>
    route.fulfill({ json: { ditemukan: false, isbn13: ISBN_TAK_ADA, sumber: SUMBER_KOSONG, semuaGalat: false } }),
  );
  const permintaanJudul: URL[] = [];
  await page.route("**/api/metadata/judul*", async (route) => {
    const url = new URL(route.request().url());
    permintaanJudul.push(url);
    // Judul umum menghasilkan banyak hasil; dengan pengarang menyempit.
    const kandidat = url.searchParams.has("pengarang") ? [KANDIDAT_BUMI] : [KANDIDAT_BUMI, KANDIDAT_LAIN];
    await route.fulfill({
      json: {
        kandidat,
        sumber: [
          { sumber: "openlibrary", status: "ok" },
          { sumber: "google", status: "ok" },
        ],
      },
    });
  });
  const permintaanSampul = await cegatSampul(page, { kunci: KUNCI_SAMPUL });

  await masuk(page);
  await page.goto("/tambah/isbn");
  await page.getByLabel("ISBN", { exact: true }).fill(ISBN_TAK_ADA);
  await page.getByRole("button", { name: "Cari" }).click();

  // Layar tinjau kosong dengan ISBN scan; belum ada permintaan judul.
  await expect(page.getByText(`ISBN ${ISBN_TAK_ADA}`, { exact: true })).toBeVisible();
  const kandidat = page.getByTestId("kandidat-judul");
  await expect(kandidat).toBeVisible();
  expect(permintaanJudul).toHaveLength(0);

  // Judul pendek tidak mencari.
  await page.locator("#judul").fill("Bu");
  await page.waitForTimeout(1200);
  expect(permintaanJudul).toHaveLength(0);

  // Judul >= 3 karakter: mencari otomatis setelah jeda, Kandidat muncul.
  await page.locator("#judul").fill("Bumi");
  const daftar = kandidat.getByRole("list");
  await expect(daftar.getByRole("listitem")).toHaveCount(2);
  expect(permintaanJudul).toHaveLength(1);
  expect(permintaanJudul[0].searchParams.get("judul")).toBe("Bumi");
  expect(permintaanJudul[0].searchParams.has("pengarang")).toBe(false);

  // Tiap Kandidat menyebut sumbernya; yang punya sampul menampilkan pratinjau kecil dari alamat luar.
  const barisBumi = daftar.getByRole("listitem").filter({ hasText: "Bumi (edisi lain)" });
  await expect(barisBumi.getByText("Open Library", { exact: true })).toBeVisible();
  await expect(daftar.getByRole("listitem").filter({ hasText: "Bumi Manusia" }).getByText("Google Books", { exact: true })).toBeVisible();
  await expect(barisBumi.getByTestId("sampul-kandidat")).toHaveAttribute("src", KANDIDAT_BUMI.sampulUrl);
  await expect(daftar.getByTestId("sampul-kandidat")).toHaveCount(1);
  expect(permintaanSampul).toHaveLength(0);

  // Pengarang pertama memicu pencarian ulang dengan judul + pengarang; daftar menyempit.
  await page.getByLabel("Pengarang Utama").fill("Tere Liye");
  await expect(daftar.getByRole("listitem")).toHaveCount(1);
  expect(permintaanJudul).toHaveLength(2);
  expect(permintaanJudul[1].searchParams.get("judul")).toBe("Bumi");
  expect(permintaanJudul[1].searchParams.get("pengarang")).toBe("Tere Liye");

  // Pilih Kandidat: field kosong terisi dengan lencana, daftar hilang.
  await daftar.getByRole("button", { name: /Bumi \(edisi lain\)/ }).click();
  await expect(kandidat.getByRole("list")).toHaveCount(0);
  await expect(page.locator("#penerbit")).toHaveValue("PT Gramedia Pustaka Utama");
  await expect(page.locator("#tahun")).toHaveValue("2014");
  await expect(page.locator("#halaman")).toHaveValue("438");
  await expect(page.locator("#bahasa")).toHaveValue("Indonesia");
  await expect(page.locator("label[for=penerbit]").getByText("dari edisi lain, cek")).toBeVisible();
  await expect(page.locator("label[for=halaman]").getByText("dari edisi lain, cek")).toBeVisible();

  // Sampul Kandidat diunduh server dengan kunci ISBN hasil scan, tampil di draf dengan lencana.
  expect(permintaanSampul).toEqual([{ isbn13: ISBN_TAK_ADA, url: KANDIDAT_BUMI.sampulUrl }]);
  const sampulDraf = page.getByRole("img", { name: "Sampul Bumi" });
  await expect(sampulDraf).toHaveAttribute("src", `/api/covers/${KUNCI_SAMPUL}`);
  await expect(page.getByText("dari edisi lain, cek").last()).toBeVisible();

  // Isian Pemilik dan ISBN scan tidak berubah.
  await expect(page.locator("#judul")).toHaveValue("Bumi");
  await expect(page.getByLabel("Pengarang Utama")).toHaveValue("Tere Liye");
  await expect(page.getByText(`ISBN ${ISBN_TAK_ADA}`, { exact: true })).toBeVisible();

  // Daftar tidak muncul lagi sendiri setelah pilihan (tidak ada permintaan baru).
  await page.waitForTimeout(1200);
  expect(permintaanJudul).toHaveLength(2);
  await expect(kandidat.getByRole("list")).toHaveCount(0);

  // Mengubah field dari Kandidat: lencana menjadi "diedit".
  await page.locator("#halaman").fill("440");
  await expect(page.locator("label[for=halaman]").getByText("diedit")).toBeVisible();
  await page.locator("#halaman").fill("438");

  // Pilih Kategori, simpan: Buku tersimpan dengan ISBN hasil scan.
  await page.getByRole("radiogroup", { name: "Kategori" }).locator("label", { hasText: "FIK" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/buku\?id=/);
  await expect(page.getByRole("heading", { name: "Bumi", exact: true })).toBeVisible();
  await expect(page.getByText(`ISBN ${ISBN_TAK_ADA}`)).toBeVisible();
  await expect(page.getByText("PT Gramedia Pustaka Utama").first()).toBeVisible();
  // Sampul Kandidat ikut tersimpan di Buku.
  await expect(page.getByRole("img", { name: "Sampul Bumi" })).toHaveAttribute("src", new RegExp(`${KUNCI_SAMPUL}$`));
});

test("ISBN tidak ditemukan: unduhan sampul Kandidat gagal, field teks tetap terisi tanpa pesan galat", async ({ page }) => {
  await page.route("**/api/metadata/isbn*", (route) =>
    route.fulfill({ json: { ditemukan: false, isbn13: ISBN_GAGAL_SAMPUL, sumber: SUMBER_KOSONG, semuaGalat: false } }),
  );
  await page.route("**/api/metadata/judul*", (route) =>
    route.fulfill({ json: { kandidat: [KANDIDAT_BUMI], sumber: [{ sumber: "openlibrary", status: "ok" }] } }),
  );
  const permintaanSampul = await cegatSampul(page, { kunci: null });

  await masuk(page);
  await page.goto("/tambah/isbn");
  await page.getByLabel("ISBN", { exact: true }).fill(ISBN_GAGAL_SAMPUL);
  await page.getByRole("button", { name: "Cari" }).click();
  await page.locator("#judul").fill("Bumi");
  await page.getByTestId("kandidat-judul").getByRole("button", { name: /Bumi \(edisi lain\)/ }).click();

  await expect(page.locator("#penerbit")).toHaveValue("PT Gramedia Pustaka Utama");
  await expect.poll(() => permintaanSampul.length).toBe(1);
  await expect(page.getByRole("img", { name: /Sampul/ })).toHaveCount(0);
  // Tidak ada pesan galat (pengumum rute Next.js juga ber-role alert, tetapi kosong).
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(0);
});

test("ISBN ditemukan: tidak ada pencarian judul sama sekali", async ({ page }) => {
  await page.route("**/api/metadata/isbn*", (route) =>
    route.fulfill({
      json: {
        ditemukan: true,
        draf: {
          isbn13: ISBN_ADA,
          judul: "Buku Ada",
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
        sumber: [{ sumber: "openlibrary", status: "ok" }],
      },
    }),
  );
  let permintaanJudul = 0;
  await page.route("**/api/metadata/judul*", async (route) => {
    permintaanJudul++;
    await route.fulfill({ json: { kandidat: [], sumber: [] } });
  });

  await masuk(page);
  await page.goto("/tambah/isbn");
  await page.getByLabel("ISBN", { exact: true }).fill(ISBN_ADA);
  await page.getByRole("button", { name: "Cari" }).click();
  await expect(page.locator("#judul")).toHaveValue("Buku Ada");

  // Mengubah judul di sini tidak memicu pencarian cadangan.
  await page.locator("#judul").fill("Judul yang diubah Pemilik");
  await page.locator("#judul").press("Enter");
  await page.waitForTimeout(1500);
  expect(permintaanJudul).toBe(0);
  await expect(page.getByTestId("kandidat-judul")).toHaveCount(0);
});
