"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (`public/sw.js`), que es lo que permite abrir la
 * caja sin internet y guardar las pantallas ya visitadas.
 *
 * En desarrollo no se registra: cachearía HTML viejo y pelearía con el recargado
 * automático de Next.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((item) => item.unregister())))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin service worker la app sigue funcionando, solo que no abre offline.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
