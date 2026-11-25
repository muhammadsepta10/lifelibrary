"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudOff, ClockArrowUp, House, Library, Menu, Plus, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLibrary } from "./library-provider";

const NAV = [
  { href: "/", label: "Beranda", Icon: House },
  { href: "/koleksi", label: "Koleksi", Icon: Library },
  { href: "/tambah", label: "Tambah", Icon: Plus, fab: true },
  { href: "/sinkron", label: "Sinkron", Icon: ClockArrowUp, badge: true },
  { href: "/lainnya", label: "Lainnya", Icon: Menu },
] as const;

function aktif(pathname: string, href: string) {
  if (href === "/koleksi") {
    return pathname.startsWith("/koleksi") || pathname === "/buku" || pathname.startsWith("/buku/");
  }
  if (href === "/lainnya") {
    return pathname.startsWith("/lainnya") || pathname.startsWith("/buku-induk") || pathname.startsWith("/statistik");
  }
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, online, jumlahCetak } = useLibrary();
  const menunggu = status?.menunggu ?? 0;
  const gagal = status?.ditolak ?? 0;
  // Badge Sinkron: jumlah Menunggu Sinkron; "!" merah bila hanya ada yang Gagal terkirim.
  const badge = menunggu > 0 ? String(menunggu) : gagal > 0 ? "!" : null;
  const warnaBadge = gagal > 0 ? "bg-bahaya text-white" : "bg-menunggu text-menunggu-fg";

  return (
    <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-1 bg-sidebar p-5 text-sidebar-foreground lg:flex">
        <p className="mb-6 font-heading text-xl font-bold">lifelibrary</p>
        <p className="mb-1 text-xs uppercase tracking-wide opacity-60">Koleksi</p>
        {NAV.map(({ href, label, Icon, ...rest }) => (
          <Link
            key={href}
            href={href}
            aria-current={aktif(pathname, href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-sidebar-accent",
              aktif(pathname, href) && "bg-sidebar-accent",
            )}
          >
            <Icon className="size-5" strokeWidth={1.9} aria-hidden />
            {label}
            {"badge" in rest && badge && (
              <span
                data-testid="badge-sinkron"
                className={cn("ml-auto rounded-full px-2 text-xs font-semibold", warnaBadge)}
              >
                {badge}
              </span>
            )}
          </Link>
        ))}
        <p className="mb-1 mt-4 text-xs uppercase tracking-wide opacity-60">Pengelolaan</p>
        <Link
          href="/cetak"
          aria-current={pathname.startsWith("/cetak") ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-sidebar-accent",
            pathname.startsWith("/cetak") && "bg-sidebar-accent",
          )}
        >
          <Tag className="size-5" strokeWidth={1.9} aria-hidden />
          Cetak Label
          {!!jumlahCetak?.siapDicetak && (
            <span className="ml-auto rounded-full bg-menunggu px-2 text-xs font-semibold text-menunggu-fg">
              {jumlahCetak.siapDicetak}
            </span>
          )}
        </Link>
      </aside>

      {!online && (
        <div role="status" className="bg-offline px-5 py-1.5 text-xs font-semibold text-offline-fg">
          <CloudOff className="mr-1.5 inline size-3.5" aria-hidden />
          {menunggu > 0
            ? `Offline — ${menunggu} perubahan menunggu dikirim`
            : "Offline — perubahan disimpan di perangkat"}
        </div>
      )}

      <main className="flex flex-1 flex-col pb-28 lg:pb-10">{children}</main>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-5 bottom-5 z-20 mx-auto flex h-16 max-w-md items-center justify-around rounded-[22px] bg-ink shadow-[0_10px_30px_rgba(0,0,0,.3)] lg:hidden"
      >
        {NAV.map(({ href, label, Icon, ...rest }) =>
          "fab" in rest ? (
            <Link
              key={href}
              href={href}
              aria-label="Tambah Buku"
              className="-mt-[30px] flex size-16 items-center justify-center rounded-full border-4 border-paper bg-brand text-white shadow-[0_8px_20px_rgba(231,111,81,.5)]"
            >
              <Icon className="size-[26px]" strokeWidth={1.9} aria-hidden />
            </Link>
          ) : (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={aktif(pathname, href) ? "page" : undefined}
              className={cn(
                "relative flex size-11 items-center justify-center",
                aktif(pathname, href) ? "text-paper" : "text-nav-icon",
              )}
            >
              <Icon className="size-5" strokeWidth={1.9} aria-hidden />
              {"badge" in rest && badge && (
                <span
                  data-testid="badge-sinkron"
                  className={cn(
                    "absolute right-0 top-0.5 min-w-4 rounded-full px-1 text-center text-[10px] font-bold",
                    warnaBadge,
                  )}
                >
                  {badge}
                </span>
              )}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
