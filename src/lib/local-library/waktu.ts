/**
 * Waktu perangkat sebagai ISO 8601 dengan offset zona lokal,
 * mis. `2026-12-31T23:30:00+07:00`. Tahun pada awalan teks adalah tahun
 * pencatatan Nomor Induk (ADR 0001).
 */
export function isoLokal(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const off = -d.getTimezoneOffset();
  const tanda = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${tanda}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}
