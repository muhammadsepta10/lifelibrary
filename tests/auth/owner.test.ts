import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth";
import { seedOwner } from "@/server/auth-seed";
import { getOwnerSession } from "@/server/owner-guard";
import { createTestDb } from "../support/test-db";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  ctx = await createTestDb();
  auth = createAuth(ctx.db, { secret: "rahasia-uji-yang-cukup-panjang-1234567890", baseURL: "http://localhost:3000" });
  await seedOwner(auth, { email: "pemilik@example.com", password: "kata-sandi-uji-123" });
});
afterEach(async () => {
  await ctx.close();
});

function cookieDari(res: Response) {
  return (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("Login Pemilik", () => {
  it("Pemilik bisa login dengan email dan kata sandi, lalu dikenali oleh server", async () => {
    const res = await auth.api.signInEmail({
      body: { email: "pemilik@example.com", password: "kata-sandi-uji-123" },
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const sesi = await getOwnerSession(auth, new Headers({ cookie: cookieDari(res) }));
    expect(sesi?.user.email).toBe("pemilik@example.com");
  });

  it("kata sandi salah ditolak", async () => {
    const res = await auth.api.signInEmail({
      body: { email: "pemilik@example.com", password: "salah-salah-salah" },
      asResponse: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("Pengunjung tanpa login tidak dikenali (API menjawab 401)", async () => {
    expect(await getOwnerSession(auth, new Headers())).toBeNull();
    expect(await getOwnerSession(auth, new Headers({ cookie: "better-auth.session_token=palsu" }))).toBeNull();
  });

  it("pendaftaran akun baru dimatikan: hanya satu akun Pemilik", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "lain@example.com", password: "kata-sandi-lain-123", name: "Lain" } }),
    ).rejects.toThrow();
  });

  it("seed Pemilik menolak kalau sudah ada akun", async () => {
    await expect(seedOwner(auth, { email: "lain@example.com", password: "kata-sandi-lain-123" })).rejects.toThrow(
      /sudah ada/i,
    );
  });
});
