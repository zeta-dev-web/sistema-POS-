"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "dark" | "cash" | "transfer" | "ok" | "ghost" | "danger";
};

export function Button({ variant = "dark", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx("btn", `btn-${variant}`, className)} {...props} />;
}

export function Overlay({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex flex-col bg-paper"
    >
      <div className="sheet-in relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function OverlayHeader({
  title,
  subtitle,
  onClose,
  closeLabel = "Volver",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b-4 border-ink px-5 py-4 sm:px-8">
      <div>
        <p className="text-xs font-black tracking-[0.22em] text-ink-2 uppercase">{subtitle}</p>
        <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
      </div>
      <Button variant="ghost" onClick={onClose} className="px-4 py-2 text-sm">
        {closeLabel}
      </Button>
    </header>
  );
}

/**
 * Aplica una tecla al valor actual. `decimals` controla cuántos decimales se
 * permiten (2 para pesos, 3 para kilos). El separador es siempre punto.
 */
export function applyKey(
  value: string,
  key: string,
  decimals: number,
  separator = ".",
): string {
  if (key === "C") return "";
  if (key === "back") return value.slice(0, -1);
  if (key === "." || key === separator) {
    if (decimals === 0 || value.includes(separator)) return value;
    return `${value || "0"}${separator}`;
  }

  const [whole = "", fraction] = value.split(separator);
  if (fraction !== undefined && fraction.length >= decimals) return value;
  if (whole.length >= 9) return value;
  if (value === "0") return key;
  return value + key;
}

/**
 * Teclado numérico grande. `decimals` controla cuántos decimales se permiten
 * (2 para pesos, 3 para kilos).
 */
export function Keypad({
  value,
  onChange,
  decimals = 2,
  separator = ",",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  decimals?: number;
  separator?: string;
  className?: string;
}) {
  function press(key: string) {
    onChange(applyKey(value, key, decimals, separator));
  }

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];

  return (
    <div className={cx("grid grid-cols-3 gap-3", className)}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          className="chunky flex h-16 items-center justify-center rounded-2xl bg-white text-3xl font-black transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none sm:h-[4.5rem]"
          aria-label={`Número ${key}`}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        onClick={() => press(".")}
        disabled={decimals === 0}
        className="chunky flex h-16 items-center justify-center rounded-2xl bg-white text-3xl font-black transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-40 sm:h-[4.5rem]"
        aria-label="Separador decimal"
      >
        {separator}
      </button>
      <button
        type="button"
        onClick={() => press("0")}
        className="chunky flex h-16 items-center justify-center rounded-2xl bg-white text-3xl font-black transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none sm:h-[4.5rem]"
      >
        0
      </button>
      <button
        type="button"
        onClick={() => press("back")}
        className="chunky flex h-16 items-center justify-center rounded-2xl bg-paper-2 text-2xl font-black transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none sm:h-[4.5rem]"
        aria-label="Borrar último dígito"
      >
        ←
      </button>
    </div>
  );
}
