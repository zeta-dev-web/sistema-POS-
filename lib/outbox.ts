import type { SalePayload } from "./types";

const KEY = "pos.outbox.v1";

/** Aviso interno para que la barra superior se entere de cada cambio. */
const EVENT = "pos:outbox-changed";

/**
 * Cola de ventas que no pudieron enviarse (sin internet o servidor caído).
 * Se reintentan solas; el `clientId` hace que el servidor no las duplique.
 */
export function readOutbox(): SalePayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SalePayload[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: SalePayload[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Sin espacio o modo privado: la venta ya se mostró como guardada.
  }
  emitChange();
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

/** Escucha cambios de la cola (agregar, quitar o sincronizar). */
export function onOutboxChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function enqueueSale(payload: SalePayload) {
  const items = readOutbox().filter((item) => item.clientId !== payload.clientId);
  items.push(payload);
  writeOutbox(items);
}

export function removeFromOutbox(clientId: string) {
  writeOutbox(readOutbox().filter((item) => item.clientId !== clientId));
}
