import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";

export type AuthOptions = { secret: string; baseURL?: string };

/**
 * Satu akun Pemilik: email + kata sandi, pendaftaran dimatikan (ADR 0002).
 * Sesi panjang (30 hari) supaya perangkat tetap nyaman dipakai offline;
 * sesi kedaluwarsa tidak mengunci data lokal (ADR 0004).
 */
export function createAuth(db: Db, opts: AuthOptions) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [nextCookies()], // harus plugin terakhir
  });
}

export type Auth = ReturnType<typeof createAuth>;
