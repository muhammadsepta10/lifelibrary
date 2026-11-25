import type { eksemplar } from "@/server/db/schema";
import type { EksemplarDto } from "@/lib/sync-protocol";
import type { JenisPenyiangan } from "@/lib/penyiangan-protocol";

/** Baris Eksemplar -> bentuk yang dikirim ke perangkat (pull dan hasil Penyiangan). */
export function eksemplarDto(e: typeof eksemplar.$inferSelect): EksemplarDto {
  return {
    id: e.id,
    bukuId: e.bukuId,
    kategoriId: e.kategoriId,
    nomorInduk: e.nomorInduk,
    tahunPencatatan: e.tahunPencatatan,
    waktuDicatat: e.waktuDicatatPerangkat.toISOString(),
    status: e.status as EksemplarDto["status"],
    penyiangan:
      e.status === "keluar" && e.penyianganJenis && e.penyianganTanggal
        ? {
            jenis: e.penyianganJenis as JenisPenyiangan,
            tanggal: e.penyianganTanggal,
            alasan: e.penyianganAlasan,
          }
        : null,
    lokasiId: e.lokasiId,
    tanggalMasuk: e.tanggalMasuk,
    asal: e.asal as EksemplarDto["asal"],
    harga: e.harga,
    kondisi: e.kondisi as EksemplarDto["kondisi"],
    perluCetak: e.perluCetak,
  };
}
