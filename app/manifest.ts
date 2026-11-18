import type { MetadataRoute } from "next";

/**
 * Manifest de la PWA: permite instalar el POS como aplicación y abrirlo sin
 * internet (el service worker de `public/sw.js` cachea la pantalla de cobro).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ALMACEN",
    short_name: "ALMACEN",
    description:
      "Punto de venta y control de stock. Cobro en efectivo o transferencia con confirmación manual.",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f2e7",
    theme_color: "#f7f2e7",
    categories: ["business", "productivity", "shopping"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
