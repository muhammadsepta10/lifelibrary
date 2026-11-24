import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "lifelibrary",
    short_name: "lifelibrary",
    description: "Perpustakaan pribadi di rumah",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F3EEE4",
    theme_color: "#1F3A33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
