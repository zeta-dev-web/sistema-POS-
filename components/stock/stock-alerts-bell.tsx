"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getLowStockAlerts } from "@/app/actions/alerts";
import { formatQuantity } from "@/lib/money";
import type { LowStockItem } from "@/lib/types";

const REFRESH_MS = 60_000;

export function StockAlertsBell() {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = items.length;

  const refresh = useCallback(async () => {
    try {
      setItems(await getLowStockAlerts());
    } catch {
      // Sin conexión: se mantiene lo último que se sabía.
    }
  }, []);

  // Se actualiza al entrar, cada minuto y al volver a la pestaña.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function toggle() {
    // Al abrir se vuelve a consultar, así el detalle es el stock de ahora.
    if (!open) void refresh();
    setOpen((value) => !value);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="stock-alerts"
        aria-label={
          count > 0
            ? `Alertas de stock: ${count} ${count === 1 ? "producto para reponer" : "productos para reponer"}`
            : "Alertas de stock"
        }
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-white text-lg md:h-9 md:w-9"
      >
        <span aria-hidden>🔔</span>
        {count > 0 ? (
          <span className="tnum absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-paper bg-danger px-1 text-[10px] leading-none font-black text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="stock-alerts"
          role="dialog"
          aria-label="Productos para reponer"
          className="fixed top-16 right-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-[5px_5px_0_var(--color-ink)] sm:right-6"
        >
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink/15 px-3 py-2">
            <p className="text-xs font-black tracking-[0.18em] uppercase">
              Para reponer
              {count > 0 ? <span className="ml-1.5 text-ink-2">({count})</span> : null}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar alertas"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-ink/20 text-sm font-black text-ink-2 hover:border-ink"
            >
              ✕
            </button>
          </div>

          {count === 0 ? (
            <p className="px-3 py-4 text-sm font-semibold text-ink-2">
              Todo el stock está por encima del mínimo.
            </p>
          ) : (
            <ul className="max-h-80 divide-y-2 divide-ink/10 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/stock/${item.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-paper-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-black">{item.name}</span>
                    <span className="shrink-0 text-right text-[10px] font-bold text-ink-2">
                      <span className="tnum block text-sm font-black text-danger">
                        {formatQuantity(item.stock)} {item.unit === "KG" ? "kg" : "u."}
                      </span>
                      mínimo {formatQuantity(item.minStock)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
