"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useSyncState } from "@/lib/sync";

import { StockAlertsBell } from "./stock/stock-alerts-bell";
import { SyncCenter } from "./sync/sync-center";
import { cx } from "./pos/ui";

const LINKS = [
  { href: "/", label: "Cobrar" },
  { href: "/stock", label: "Stock" },
  { href: "/reportes", label: "Reportes" },
];

export function AppHeader({
  tenantName,
  children,
  menuChildren,
}: {
  tenantName: string;
  children?: ReactNode;
  /** Contenido extra del menú mobile; por defecto usa `children`. */
  menuChildren?: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { online } = useSyncState();

  useEffect(() => {
    if (!menuOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <header className="border-b-4 border-ink bg-paper px-3 py-1.5 sm:px-6 sm:py-2.5">
      {/*
        En escritorio, tres columnas con el mismo ancho a los costados: la
        navegación queda siempre centrada. En mobile se reemplaza por el
        nombre y un botón de menú, para ganar altura.
      */}
      <div className="flex items-center justify-between gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="truncate text-lg leading-none font-black tracking-tight sm:text-xl md:text-2xl">
            {tenantName}
          </span>
          <span className="shrink-0 rounded-md bg-ink px-1.5 py-0.5 text-[9px] font-black tracking-widest text-paper uppercase sm:px-2 sm:py-1 sm:text-[10px]">
            Caja 1
          </span>
        </div>

        <nav
          aria-label="Secciones"
          className="hidden items-center gap-1 md:flex md:justify-self-center"
        >
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "rounded-lg border-2 px-3 py-1.5 text-sm font-black whitespace-nowrap transition-colors",
                  active
                    ? "border-ink bg-ink text-paper"
                    : "border-transparent text-ink-2 hover:border-ink/30 hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center gap-2 md:justify-self-end">
          <div className="hidden min-w-0 flex-wrap items-center gap-3 text-xs font-semibold text-ink-2 md:flex">
            {children}
          </div>

          <div className="hidden md:block">
            <SyncCenter />
          </div>

          <StockAlertsBell />

          <span
            role="status"
            aria-label={`Estado de conexión: ${online ? "conectado" : "sin conexión"}`}
            title={online ? "Conectado" : "Sin conexión"}
            className="flex h-10 w-3 shrink-0 items-center justify-center md:hidden"
          >
            <span
              aria-hidden
              className={cx("h-2.5 w-2.5 rounded-full", online ? "bg-ok" : "bg-danger")}
            />
          </span>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-white text-lg font-black md:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink/45"
          />

          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className="absolute inset-y-0 right-0 flex w-[min(19rem,85vw)] flex-col overflow-y-auto border-l-4 border-ink bg-paper p-5 shadow-[-8px_0_0_rgba(23,19,13,0.15)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black tracking-[0.22em] text-ink-2 uppercase">
                Menú
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-ink bg-white text-lg font-black"
              >
                ✕
              </button>
            </div>

            <nav aria-label="Secciones" className="mt-5 flex flex-col gap-2">
              {LINKS.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "rounded-xl border-2 px-4 py-3 text-lg font-black transition-colors",
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-ink/25 bg-white text-ink hover:border-ink",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-5">
              <SyncCenter variant="inline" />
            </div>

            {(menuChildren ?? children) ? (
              <div className="mt-5 flex flex-col gap-2 border-t-2 border-ink/15 pt-4 text-sm font-semibold text-ink-2">
                {menuChildren ?? children}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
