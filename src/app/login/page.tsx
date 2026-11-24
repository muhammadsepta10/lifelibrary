"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const inputCls =
  "h-12 w-full rounded-2xl border border-white/20 bg-white/10 px-4 text-base text-paper outline-none placeholder:text-paper/50 focus-visible:ring-2 focus-visible:ring-brand";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [kataSandi, setKataSandi] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [bekerja, setBekerja] = useState(false);

  async function masuk(e: React.FormEvent) {
    e.preventDefault();
    setGalat(null);
    setBekerja(true);
    const { error } = await authClient.signIn.email({ email, password: kataSandi });
    setBekerja(false);
    if (error) {
      setGalat("Email atau kata sandi salah");
      return;
    }
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col justify-center bg-forest px-6 text-paper">
      <div className="mx-auto w-full max-w-sm">
        <p className="text-[13px] opacity-85">lifelibrary</p>
        <h1 className="mb-8 mt-3 text-[34px] font-bold leading-[1.1]">Masuk ke rak kamu</h1>
        <form onSubmit={masuk} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="kata-sandi" className="mb-1.5 block text-sm font-medium">
              Kata sandi
            </label>
            <input
              id="kata-sandi"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
              value={kataSandi}
              onChange={(e) => setKataSandi(e.target.value)}
            />
          </div>
          {galat && (
            <p role="alert" className="text-sm text-[#F7C6BC]">
              {galat}
            </p>
          )}
          <button
            type="submit"
            disabled={bekerja}
            className="mt-2 h-[52px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-60"
          >
            {bekerja ? "Masuk…" : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}
