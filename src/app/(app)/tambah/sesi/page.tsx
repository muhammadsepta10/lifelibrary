"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormSesi, hariIni } from "@/components/app/form-sesi";
import { LayarSesi } from "@/components/app/layar-sesi";
import { useLibrary } from "@/components/app/library-provider";
import { PageHeader } from "@/components/app/page-header";
import type { DataSesi, SesiPenerimaan } from "@/lib/local-library";
import { cariMetadataIsbn } from "@/lib/sync/fetch-metadata";
import { siapkanBunyi } from "@/lib/umpan-balik-scan";

/**
 * Sesi Penerimaan: isi tanggal masuk, asal, dan Lokasi sekali, lalu pindai
 * ISBN beruntun dengan kamera. Setelah sesi dimulai semuanya terjadi di
 * halaman ini (tanpa berpindah rute) sampai Pemilik menekan Selesai.
 */
export default function SesiPenerimaanPage() {
  const { library, daftar } = useLibrary();
  const router = useRouter();
  const [sesi, setSesi] = useState<SesiPenerimaan | null>(null);

  if (sesi) {
    return <LayarSesi sesi={sesi} lokasi={daftar?.lokasi} onSelesai={() => router.push("/koleksi")} />;
  }

  const awal: DataSesi = { tanggalMasuk: hariIni(), asal: null, lokasiId: null };

  return (
    <>
      <PageHeader judul="Sesi Penerimaan" keterangan="Satu data untuk semua buku yang dicatat berurutan" />
      <div className="flex flex-col gap-5 p-5">
        <p className="text-sm text-ink-muted">
          Isi sekali, lalu pindai ISBN buku satu per satu. Tanggal masuk, asal, dan Lokasi ini dipakai untuk setiap Eksemplar di sesi ini.
        </p>
        {!library ? (
          <p className="text-sm text-ink-muted">Menyiapkan data di perangkat…</p>
        ) : (
          <FormSesi
            awal={awal}
            lokasi={daftar?.lokasi}
            labelTombol="Mulai Sesi dan nyalakan kamera"
            onSimpan={async (d) => {
              siapkanBunyi(); // dari sentuhan Pemilik, supaya bunyi diizinkan browser
              setSesi(await library.mulaiSesiPenerimaan({ cariMetadata: cariMetadataIsbn, ...d }));
            }}
          />
        )}
        <Link href="/tambah/isbn" className="text-center text-sm font-medium text-forest-link underline">
          Satu buku saja? Tambah lewat ISBN
        </Link>
      </div>
    </>
  );
}
