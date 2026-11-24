import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Pemeriksaan optimistis: hanya mengecek keberadaan cookie sesi, bukan
 * keabsahannya. Halaman adalah cangkang klien yang membaca Dexie; sesi yang
 * kedaluwarsa tidak boleh mengunci data lokal (ADR 0004). Pemeriksaan
 * sebenarnya ada di setiap route API (`tolakJikaBukanPemilik`).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ galat: "Belum login" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Biarkan lewat: halaman login, API auth, aset SW/manifest/ikon, dan berkas statis.
  matcher: [
    "/((?!login|api/auth|serwist|sw\\.js|manifest\\.webmanifest|~offline|icons|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
