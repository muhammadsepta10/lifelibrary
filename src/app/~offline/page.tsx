import Link from "next/link";
import { CloudOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-forest px-8 text-center text-paper">
      <CloudOff className="size-10 opacity-80" aria-hidden />
      <h1 className="text-2xl font-bold">Kamu sedang offline</h1>
      <p className="max-w-xs text-sm opacity-80">
        Halaman ini belum tersimpan di perangkat. Buka halaman yang pernah kamu kunjungi, atau
        sambungkan internet dulu.
      </p>
      <Link href="/" className="rounded-2xl bg-paper px-5 py-3 text-sm font-semibold text-forest">
        Kembali ke Beranda
      </Link>
    </main>
  );
}
