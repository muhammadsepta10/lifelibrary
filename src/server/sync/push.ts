import { eq } from "drizzle-orm";
import { syncMutasi } from "@/server/db/schema";
import type { Db } from "@/server/db/types";
import {
  pushRequestSchema,
  type HasilMutasi,
  type Mutasi,
  type PushResponse,
} from "@/lib/sync-protocol";
import type { HasilTanpaId } from "./hasil";
import { tambahBuku, ubahBuku } from "./mutasi-buku";
import { catatEksemplar, koreksiKategori, ubahEksemplar } from "./mutasi-eksemplar";
import type { Tx } from "./tx";

export async function push(db: Db, input: unknown): Promise<PushResponse> {
  const { mutasi } = pushRequestSchema.parse(input);
  const hasil: HasilMutasi[] = [];
  // Berurutan: Eksemplar dan perubahan bergantung pada mutasi sebelumnya.
  for (const m of mutasi) {
    hasil.push(await db.transaction((tx) => prosesMutasi(tx, m)));
  }
  return { hasil };
}

function terapkan(tx: Tx, m: Mutasi): Promise<HasilTanpaId> {
  switch (m.jenis) {
    case "buku.tambah":
      return tambahBuku(tx, m);
    case "buku.ubah":
      return ubahBuku(tx, m);
    case "eksemplar.catat":
      return catatEksemplar(tx, m);
    case "eksemplar.ubah":
      return ubahEksemplar(tx, m);
    case "eksemplar.koreksiKategori":
      return koreksiKategori(tx, m);
  }
}

async function prosesMutasi(tx: Tx, m: Mutasi): Promise<HasilMutasi> {
  // Idempotensi: id mutasi yang sama tidak diproses dua kali. Penulis
  // bersamaan dengan id sama menunggu di indeks unik sampai yang pertama commit.
  const baru = await tx
    .insert(syncMutasi)
    .values({ id: m.id, hasil: {} })
    .onConflictDoNothing()
    .returning({ id: syncMutasi.id });

  if (baru.length === 0) {
    const [ada] = await tx.select().from(syncMutasi).where(eq(syncMutasi.id, m.id));
    return { id: m.id, ...(ada.hasil as HasilTanpaId) };
  }

  const hasil = await terapkan(tx, m);
  await tx.update(syncMutasi).set({ hasil }).where(eq(syncMutasi.id, m.id));
  return { id: m.id, ...hasil } as HasilMutasi;
}
