import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Literata } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "lifelibrary",
  description: "Perpustakaan pribadi di rumah: catat koleksi, beri Nomor Induk, pinjamkan.",
  appleWebApp: { capable: true, title: "lifelibrary", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1F3A33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="id"
      className={`${literata.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          reloadOnOnline mati: bawaannya memuat ulang halaman saat koneksi pulih, yang membuang isian
          form dan kartu Sesi Penerimaan yang sedang dikerjakan. Sinkronisasi sudah dipicu event
          `online` oleh Penjadwal. cacheOnNavigation mati: cangkang disimpan lewat pesan
          sendiri (lib/sw/simpan-cangkang) ke cache yang benar.
        */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
          reloadOnOnline={false}
          cacheOnNavigation={false}
        >
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
