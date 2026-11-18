/**
 * Todo el dinero se calcula en centavos enteros.
 * Nunca sumar floats: en un POS los redondeos rompen el cierre de caja.
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Importe de una línea, redondeado a centavos (sirve para pesables). */
export function lineTotalCents(unitPriceCents: number, quantity: number): number {
  return Math.round(unitPriceCents * quantity);
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

/** "12345.6" | "12345,6" -> número. Devuelve null si no es válido. */
export function parseAmount(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(\.\d{0,3})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Cantidades (kilos) con punto decimal: "1.5", "0.56". */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
    .format(value)
    .replace(",", ".");
}
