import type { PemberitahuanDitimpa } from "@/lib/local-library";

/** "Penerbit di *Laut Bercerita* diperbarui dari perangkat lain" (judul dimiringkan). */
export function PesanDitimpa({ item }: { item: Pick<PemberitahuanDitimpa, "pesan" | "judul"> }) {
  const i = item.judul ? item.pesan.indexOf(item.judul) : -1;
  if (i < 0) return <>{item.pesan}</>;
  return (
    <>
      {item.pesan.slice(0, i)}
      <em className="font-semibold">{item.judul}</em>
      {item.pesan.slice(i + item.judul.length)}
    </>
  );
}
