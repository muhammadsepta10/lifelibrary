import { expect, type BrowserContext, type Page } from "@playwright/test";
import { BASE_URL, envE2E } from "./env";

/**
 * Login lewat layar Masuk. Better Auth membatasi login 3 kali per 10 detik; bila ditolak
 * (pesan galat tampil), tunggu lalu coba lagi supaya urutan spec tidak membuat tes goyah.
 */
export async function masuk(page: Page) {
  const { ownerEmail, ownerPassword } = envE2E();
  for (let percobaan = 0; percobaan < 4; percobaan++) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Kata sandi").fill(ownerPassword);
    await page.getByRole("button", { name: "Masuk" }).click();
    const berhasil = await page
      .waitForURL(BASE_URL + "/", { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (berhasil) return;
    await page.waitForTimeout(4000);
  }
  await expect(page).toHaveURL("/");
}

/** Tambah Buku manual lewat /tambah dan tunggu sampai Koleksi tampil. */
export async function tambahBukuManual(page: Page, judul: string, pengarang: string, kodeKategori = "FIK") {
  await page.goto("/tambah");
  await page.getByLabel("Judul").fill(judul);
  await page.getByLabel("Pengarang").fill(pengarang);
  await page.locator("label", { hasText: kodeKategori }).first().click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/koleksi$/);
}

/**
 * Login lewat API (cookie masuk ke konteks). Better Auth membatasi login 3 kali per 10 detik,
 * jadi tes yang masuk berulang menunggu dan mencoba lagi saat dijawab 429.
 */
export async function masukLewatApi(context: BrowserContext) {
  const { ownerEmail, ownerPassword } = envE2E();
  for (let percobaan = 0; percobaan < 6; percobaan++) {
    const res = await context.request.post("/api/auth/sign-in/email", {
      data: { email: ownerEmail, password: ownerPassword },
      headers: { origin: BASE_URL },
    });
    if (res.ok()) return;
    if (res.status() !== 429) throw new Error(`Login E2E gagal (${res.status()})`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Login E2E terus dibatasi (429)");
}
