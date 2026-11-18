"use client";

import { useEffect, useRef, useState } from "react";

import { TZ } from "@/lib/dates";
import { money } from "@/lib/format";
import { flushOutbox, useSyncState, type SyncState } from "@/lib/sync";

function saleTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "hora desconocida";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function methodLabel(method: string): string {
  return method === "CASH" ? "Efectivo" : "Transferencia";
}

function PendingList({ state }: { state: SyncState }) {
  const { pending, errors } = state;

  if (pending.length === 0) {
    return (
      <p className="px-3 py-4 text-sm font-semibold text-ink-2">
        No hay ventas esperando. Todo lo cobrado ya está asentado.
      </p>
    );
  }

  return (
    <ul className="max-h-64 divide-y-2 divide-ink/10 overflow-y-auto">
      {pending.map((sale) => (
        <li key={sale.clientId} className="px-3 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="tnum text-base font-black">{money(sale.expectedTotal)}</span>
            <span className="tnum shrink-0 text-[11px] font-bold text-ink-2">
              {saleTime(sale.paidAt)}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-ink-2">
            {methodLabel(sale.paymentMethod)} · {sale.items.length}{" "}
            {sale.items.length === 1 ? "producto" : "productos"}
          </p>
          {errors[sale.clientId] ? (
            <p className="mt-1 rounded bg-danger/10 px-2 py-1 text-[11px] font-bold text-danger">
              {errors[sale.clientId]}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SyncBody({ onClose }: { onClose?: () => void }) {
  const state = useSyncState();
  const { pending, online, syncing } = state;
  const count = pending.length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink/15 px-3 py-2">
        <p className="text-xs font-black tracking-[0.18em] uppercase">
          Ventas sin enviar
          {count > 0 ? <span className="ml-1.5 text-ink-2">({count})</span> : null}
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventas sin enviar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-ink/20 text-sm font-black text-ink-2 hover:border-ink"
          >
            ✕
          </button>
        ) : null}
      </div>

      <PendingList state={state} />

      <div className="border-t-2 border-ink/15 px-3 py-2">
        <p className="mb-2 text-[11px] font-semibold text-ink-2">
          {!online
            ? "Sin internet. Se envían solas en cuanto vuelva la conexión."
            : syncing
              ? "Enviando…"
              : "Se reintenta solo cada 15 segundos."}
        </p>
        <button
          type="button"
          onClick={() => void flushOutbox()}
          disabled={!online || syncing || count === 0}
          className="btn btn-dark h-12 w-full text-sm tracking-wide"
        >
          {syncing ? "SINCRONIZANDO…" : "SINCRONIZAR AHORA"}
        </button>
      </div>
    </div>
  );
}

/**
 * Estado de las ventas cobradas sin internet.
 *
 * - En la barra superior (escritorio): botón ↻ con la cantidad y un panel con
 *   las ventas pendientes, su hora y el motivo si el servidor las rechazó.
 * - En el menú mobile: el mismo detalle en línea, con el botón para enviar.
 *
 * Se sincroniza sola al detectar la reconexión, cada 15 segundos, al volver a
 * la pestaña y al abrir cualquiera de las pantallas.
 */
export function SyncCenter({ variant = "icon" }: { variant?: "icon" | "inline" }) {
  const { pending, online, syncing } = useSyncState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = pending.length;

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

  if (variant === "inline") {
    return (
      <div className="rounded-xl border-2 border-ink/20 bg-white">
        <SyncBody />
      </div>
    );
  }

  // Sin ventas pendientes y con internet no hay nada que avisar: no se ocupa lugar.
  if (count === 0 && online) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="sync-pending"
        aria-label={
          count > 0
            ? `Sincronizar ventas: ${count} ${count === 1 ? "pendiente" : "pendientes"}`
            : "Sincronizar ventas"
        }
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-white text-lg md:h-9 md:w-9"
      >
        <span aria-hidden>↻</span>
        {count > 0 ? (
          <span className="tnum absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-paper bg-cash px-1 text-[10px] leading-none font-black text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-paper bg-cash"
          />
        )}
      </button>

      {open ? (
        <div
          id="sync-pending"
          role="dialog"
          aria-label="Ventas sin enviar"
          className="fixed top-16 right-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-2 border-ink bg-paper shadow-[5px_5px_0_var(--color-ink)] sm:right-6"
        >
          <SyncBody onClose={() => setOpen(false)} />
        </div>
      ) : null}

      {syncing ? (
        <span role="status" className="sr-only">
          Sincronizando ventas
        </span>
      ) : null}
    </div>
  );
}
