import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** Keluar dari akun; melempar bila server tidak terjangkau (offline), supaya pemanggil bisa menundanya. */
export async function keluarAkun() {
  const hasil = await authClient.signOut();
  if (hasil?.error) throw new Error(hasil.error.message ?? "Gagal keluar");
}
