"use client";

import { useSyncExternalStore } from "react";

import { registerSale } from "@/app/actions/sales";

import { onOutboxChange, readOutbox, removeFromOutbox } from "./outbox";
import type { SalePayload } from "./types";

/** Cada cuánto se reintenta mientras haya ventas sin enviar. */
const RETRY_MS = 15_000;

export type SyncState = {
  pending: SalePayload[];
  online: boolean;
  syncing: boolean;
  /** Último intento de sincronización (ms) o null si todavía no hubo. */
  lastAttemptAt: number | null;
  /** Motivo del último rechazo, por venta (`clientId` → texto). */
  errors: Record<string, string>;
};

export type SyncOutcome = { sent: number; failed: number; offline: boolean };

const INITIAL: SyncState = {
  pending: [],
  online: true,
  syncing: false,
  lastAttemptAt: null,
  errors: {},
};

let state: SyncState = INITIAL;
const listeners = new Set<() => void>();
let started = false;
let inFlight: Promise<SyncOutcome> | null = null;

function update(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function getState(): SyncState {
  return state;
}

/**
 * Enciende una sola vez los avisos de conexión y el reintento automático.
 * Es global: funciona igual desde Cobrar, Stock o Reportes.
 */
function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;

  update({ online: navigator.onLine, pending: readOutbox() });

  // Al abrir cualquier pantalla con ventas pendientes, se intenta enseguida.
  void flushOutbox();

  window.addEventListener("online", () => {
    update({ online: true });
    void flushOutbox();
  });
  window.addEventListener("offline", () => update({ online: false }));

  // Al volver a la pestaña o al enfocar la ventana se intenta de nuevo.
  const retryIfVisible = () => {
    if (document.visibilityState === "visible") void flushOutbox();
  };
  window.addEventListener("focus", retryIfVisible);
  document.addEventListener("visibilitychange", retryIfVisible);

  window.setInterval(() => {
    if (state.pending.length > 0) void flushOutbox();
  }, RETRY_MS);

  onOutboxChange(() => update({ pending: readOutbox() }));
}

export function subscribeSync(listener: () => void): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hook para leer el estado de sincronización desde cualquier pantalla. */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getState, getState);
}

/**
 * Envía todas las ventas guardadas. Devuelve cuántas salieron y cuántas
 * quedaron rechazadas. Nunca corre dos veces a la vez.
 */
export function flushOutbox(): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = runFlush().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFlush(): Promise<SyncOutcome> {
  const queue = readOutbox();
  const outcome: SyncOutcome = { sent: 0, failed: 0, offline: false };

  update({ pending: queue });

  if (queue.length === 0) {
    update({ syncing: false });
    return outcome;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    update({ online: false, syncing: false, lastAttemptAt: Date.now() });
    outcome.offline = true;
    return outcome;
  }

  update({ syncing: true, errors: {} });

  const errors: Record<string, string> = {};

  for (const sale of queue) {
    try {
      const result = await registerSale(sale);
      if (result.ok) {
        removeFromOutbox(sale.clientId);
        outcome.sent += 1;
      } else {
        // El servidor la rechazó (precio, stock): queda listada con el motivo.
        errors[sale.clientId] = result.error;
        outcome.failed += 1;
      }
    } catch {
      // Se cortó la conexión a mitad de camino: el resto se reintenta después.
      outcome.offline = true;
      break;
    }
  }

  update({
    pending: readOutbox(),
    syncing: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    lastAttemptAt: Date.now(),
    errors,
  });

  return outcome;
}
