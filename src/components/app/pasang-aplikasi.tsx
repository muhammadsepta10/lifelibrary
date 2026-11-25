"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { caraPasang, type CaraPasang } from "@/lib/status-aplikasi";
import { kartuCls } from "./kelola";

type PromptPasang = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Lingkungan = { userAgent: string; standalone: boolean; maxTouchPoints: number };
const noopSubscribe = () => () => {};
function bacaLingkungan(): string {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const l: Lingkungan = { userAgent: navigator.userAgent, standalone, maxTouchPoints: navigator.maxTouchPoints };
  return JSON.stringify(l);
}

/**
 * Pasang ke layar utama: tombol Pasang bila browser menawarkannya (Chromium),
 * langkah "Add to Home Screen" untuk iOS (tanpa prompt), atau petunjuk umum.
 * Setelah terpasang, bagian ini tidak tampil.
 */
export function PasangAplikasi() {
  const [prompt, setPrompt] = useState<PromptPasang | null>(null);
  const [terpasang, setTerpasang] = useState(false);
  // String supaya snapshot stabil; kosong di server (tidak ada navigator).
  const kunciLingkungan = useSyncExternalStore(noopSubscribe, bacaLingkungan, () => "");
  const lingkungan = useMemo(
    () => (kunciLingkungan ? (JSON.parse(kunciLingkungan) as Lingkungan) : null),
    [kunciLingkungan],
  );

  useEffect(() => {
    const sebelum = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptPasang);
    };
    const sesudah = () => setTerpasang(true);
    window.addEventListener("beforeinstallprompt", sebelum);
    window.addEventListener("appinstalled", sesudah);
    return () => {
      window.removeEventListener("beforeinstallprompt", sebelum);
      window.removeEventListener("appinstalled", sesudah);
    };
  }, []);

  if (!lingkungan || terpasang) return null;
  const cara: CaraPasang = caraPasang({ ...lingkungan, bisaDipasangLangsung: prompt !== null });
  if (cara.jenis === "terpasang") return null;

  return (
    <section className="flex flex-col gap-3 p-5 pb-0" aria-labelledby="judul-pasang">
      <h2 id="judul-pasang" className="font-heading text-xl font-semibold">
        Pasang di layar utama
      </h2>
      <div className={`${kartuCls} flex flex-col gap-3 p-4 text-sm`} data-testid="pasang-aplikasi">
        <p className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-forest-link" aria-hidden />
          <span>Terbuka seperti aplikasi, dan tetap bisa dipakai tanpa koneksi.</span>
        </p>
        {cara.jenis === "langsung" && (
          <button
            type="button"
            className="h-12 rounded-2xl bg-forest text-sm font-semibold text-paper"
            onClick={async () => {
              if (!prompt) return;
              await prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
          >
            Pasang aplikasi
          </button>
        )}
        {cara.jenis === "ios" && (
          <ol className="list-decimal space-y-1.5 pl-5" aria-label="Cara menambah ke layar utama di iPhone atau iPad">
            {cara.langkah.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        )}
        {cara.jenis === "lainnya" && <p className="text-ink-muted">{cara.petunjuk}</p>}
      </div>
    </section>
  );
}
