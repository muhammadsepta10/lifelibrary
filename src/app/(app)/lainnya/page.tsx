"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { useLibrary } from "@/components/app/library-provider";
import { authClient } from "@/lib/auth-client";

export default function LainnyaPage() {
  const router = useRouter();
  const { library } = useLibrary();
  const { data: sesi } = authClient.useSession();
  const [bekerja, setBekerja] = useState(false);

  async function keluar(hapusData: boolean) {
    setBekerja(true);
    try {
      if (hapusData) await library?.hapusDataPerangkat();
      await authClient.signOut();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <>
      <PageHeader judul="Lainnya" keterangan={sesi?.user.email} />
      <section className="flex flex-col gap-3 p-5">
        <button
          type="button"
          disabled={bekerja}
          onClick={() => keluar(false)}
          className="h-12 rounded-2xl bg-white text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,.08)] disabled:opacity-60"
        >
          Keluar
        </button>
        <button
          type="button"
          disabled={bekerja}
          onClick={() => {
            if (
              confirm(
                "Hapus semua data di perangkat ini? Perubahan yang belum tersinkron akan hilang.",
              )
            ) {
              void keluar(true);
            }
          }}
          className="h-12 rounded-2xl bg-white text-sm font-semibold text-bahaya shadow-[0_2px_8px_rgba(0,0,0,.08)] disabled:opacity-60"
        >
          Keluar & hapus data di perangkat ini
        </button>
      </section>
    </>
  );
}
