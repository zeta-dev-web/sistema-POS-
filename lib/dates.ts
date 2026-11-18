export const TZ = "America/Argentina/Buenos_Aires";

/** Fecha de hoy (o de `date`) como "YYYY-MM-DD" en hora argentina. */
export function todayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isValidISODate(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T12:00:00-03:00`).getTime());
}

/** Extremos del día en hora argentina (UTC-3 todo el año). */
export function dayBounds(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00-03:00`),
    lte: new Date(`${to}T23:59:59.999-03:00`),
  };
}

export function shiftISO(dateISO: string, days: number): string {
  const base = new Date(`${dateISO}T12:00:00-03:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return todayISO(base);
}

export function humanDate(value: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function humanTime(value: string | Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
