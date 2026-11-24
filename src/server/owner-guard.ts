import type { Auth } from "./auth";

/** Sesi Pemilik dari header permintaan, atau null kalau belum login. */
export async function getOwnerSession(auth: Auth, headers: Headers) {
  return auth.api.getSession({ headers });
}
