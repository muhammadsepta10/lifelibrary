import type { Auth } from "./auth";

/** Membuat satu-satunya akun Pemilik. Menolak kalau sudah ada pengguna. */
export async function seedOwner(auth: Auth, input: { email: string; password: string }) {
  const ctx = await auth.$context;
  const ada = await ctx.internalAdapter.findUserByEmail(input.email);
  const sudahAdaPengguna = ada || (await ctx.internalAdapter.listUsers(1, 0)).length > 0;
  if (sudahAdaPengguna) throw new Error("Akun Pemilik sudah ada");

  const user = await ctx.internalAdapter.createUser(
    { email: input.email, name: "Pemilik", emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user;
}
