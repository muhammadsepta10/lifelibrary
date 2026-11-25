"use client";

import type { KategoriRow } from "@/lib/local-library";
import { cn } from "@/lib/utils";

/** Pilihan Kategori sebagai chip radio; memilih berarti mengonfirmasi. */
export function PilihKategori({
  nama,
  kategori,
  nilai,
  onPilih,
  disarankan,
}: {
  nama: string;
  kategori: KategoriRow[] | undefined;
  nilai: string;
  onPilih: (id: string) => void;
  /** Id Kategori yang disarankan, diberi penanda. */
  disarankan?: string | null;
}) {
  return (
    <div role="radiogroup" aria-label="Kategori" className="flex flex-wrap gap-2">
      {kategori?.map((k) => (
        <label
          key={k.id}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-white px-3 py-2 text-[13px] font-medium has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-paper has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest-link",
          )}
        >
          <input
            type="radio"
            name={nama}
            value={k.id}
            checked={nilai === k.id}
            onChange={() => onPilih(k.id)}
            className="sr-only"
          />
          <span className="size-3 rounded-full" style={{ background: k.warna }} aria-hidden />
          <span className="font-mono text-xs">{k.kode}</span> {k.nama}
          {disarankan === k.id && <span className="text-[11px] opacity-70">(saran)</span>}
        </label>
      ))}
    </div>
  );
}
