import { getOwnerSession } from "./owner-guard";
import { runtime } from "./runtime";

/** Dipakai route handler: mengembalikan Response 401 untuk Pengunjung, atau null bila Pemilik. */
export async function tolakJikaBukanPemilik(request: Request): Promise<Response | null> {
  const sesi = await getOwnerSession(runtime().auth, request.headers);
  if (sesi) return null;
  return Response.json({ galat: "Belum login" }, { status: 401 });
}
