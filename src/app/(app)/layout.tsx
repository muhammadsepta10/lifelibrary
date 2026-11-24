import { AppShell } from "@/components/app/app-shell";
import { LibraryProvider } from "@/components/app/library-provider";

// Cangkang statis: tidak ada data/sesi server di layout supaya HTML bisa
// di-cache Service Worker dan dibuka offline (ADR 0004).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LibraryProvider>
      <AppShell>{children}</AppShell>
    </LibraryProvider>
  );
}
