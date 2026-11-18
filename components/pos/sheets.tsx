"use client";

import { useEffect, useMemo, useState } from "react";

import { money } from "@/lib/format";
import { fromCents, parseAmount, toCents } from "@/lib/money";
import type { PaymentMethod, ProductDTO, TenantDTO } from "@/lib/types";

import { applyKey, Button, cx, Keypad, Overlay, OverlayHeader } from "./ui";

/* ------------------------------------------------------------------ */
/* 1. Elegir forma de pago                                             */
/* ------------------------------------------------------------------ */

export function MethodSheet({
  total,
  onCash,
  onTransfer,
  onCancel,
}: {
  total: number;
  onCash: () => void;
  onTransfer: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay label="Elegir forma de pago">
      <OverlayHeader title="¿Cómo paga?" subtitle="Paso 1 de 2" onClose={onCancel} />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-5 py-6">
        <div className="text-center">
          <p className="text-sm font-black tracking-[0.22em] text-ink-2 uppercase">Total a cobrar</p>
          <p className="tnum text-6xl font-black tracking-tight sm:text-7xl">{money(total)}</p>
        </div>

        <div className="grid w-full max-w-2xl gap-5">
          <Button variant="cash" onClick={onCash} className="h-24 text-3xl sm:h-28 sm:text-4xl">
            <span aria-hidden className="text-4xl">💵</span>
            EFECTIVO
          </Button>
          <Button variant="transfer" onClick={onTransfer} className="h-24 text-3xl sm:h-28 sm:text-4xl">
            <span aria-hidden className="text-4xl">🏦</span>
            TRANSFERENCIA
          </Button>
        </div>

        <p className="max-w-md text-center text-sm font-semibold text-ink-2">
          Si el cliente transfiere, pedile el comprobante antes de confirmar.
        </p>
      </div>
    </Overlay>
  );
}

/* ------------------------------------------------------------------ */
/* 2a. Efectivo: paga con / vuelto                                     */
/* ------------------------------------------------------------------ */

const BILL_STEPS = [5000, 10000, 20000, 50000].map((pesos) => pesos * 100);

export function CashSheet({
  total,
  onConfirm,
  onCancel,
}: {
  total: number;
  onConfirm: (received: number, change: number) => void;
  onCancel: () => void;
}) {
  const [received, setReceived] = useState("");
  const totalCents = toCents(total);
  const parsed = parseAmount(received);
  const receivedCents = parsed === null ? 0 : toCents(parsed);
  const changeCents = receivedCents - totalCents;
  const canConfirm = receivedCents >= totalCents && totalCents > 0;

  const suggestions = useMemo(() => {
    const values = new Set<number>([totalCents]);
    for (const step of BILL_STEPS) {
      const rounded = Math.ceil(totalCents / step) * step;
      if (rounded > totalCents) values.add(rounded);
    }
    return [...values].sort((a, b) => a - b).slice(0, 5);
  }, [totalCents]);

  // Teclado físico: números, coma (o punto), borrar, Enter y Escape.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        setReceived((current) => applyKey(current, event.key, 2, ","));
        return;
      }
      if (event.key === "." || event.key === ",") {
        event.preventDefault();
        setReceived((current) => applyKey(current, ".", 2, ","));
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        setReceived((current) => applyKey(current, "back", 2, ","));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (canConfirm) onConfirm(fromCents(receivedCents), fromCents(changeCents));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canConfirm, changeCents, onCancel, onConfirm, receivedCents]);

  return (
    <Overlay label="Cobro en efectivo">
      <OverlayHeader title="Cobro en efectivo" subtitle="Paso 2 de 2" onClose={onCancel} />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 lg:grid lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:px-8">
        <section className="flex flex-col gap-4">
          <div className="chunky rounded-2xl bg-white p-4">
            <p className="text-xs font-black tracking-[0.2em] text-ink-2 uppercase">Paga con</p>
            <p className={cx("tnum text-5xl font-black sm:text-6xl", received ? "" : "text-ink-2/40")}>
              {received ? money(fromCents(receivedCents)) : "$ —"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggestions.map((cents) => (
              <button
                key={cents}
                type="button"
                onClick={() => setReceived(String(fromCents(cents)).replace(".", ","))}
                className="chunky rounded-xl bg-paper-2 px-4 py-2 text-lg font-extrabold tnum active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {money(fromCents(cents))}
              </button>
            ))}
          </div>

          <Keypad value={received} onChange={setReceived} decimals={2} />
          <p className="text-center text-xs font-semibold text-ink-2">
            Podés usar el teclado: números, coma y Enter.
          </p>
        </section>

        <section className="flex flex-col justify-between gap-5">
          <div
            className={cx(
              "chunky flex flex-col items-center justify-center rounded-2xl p-5 text-center",
              changeCents >= 0 ? "bg-ok text-white" : "bg-white",
            )}
          >
            <p className="text-xs font-black tracking-[0.22em] uppercase opacity-80">
              {changeCents >= 0 ? "Vuelto" : "Falta"}
            </p>
            <p className="tnum text-6xl font-black sm:text-7xl">
              {money(Math.abs(fromCents(changeCents)))}
            </p>
            <p className="mt-1 text-sm font-semibold opacity-80">
              Total {money(total)}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="ok"
              disabled={!canConfirm}
              onClick={() => onConfirm(fromCents(receivedCents), fromCents(changeCents))}
              className="h-20 text-2xl sm:text-3xl"
            >
              COBRAR {money(total)}
            </Button>
            <Button variant="ghost" onClick={onCancel} className="h-14 text-lg">
              CANCELAR
            </Button>
          </div>
        </section>
      </div>
    </Overlay>
  );
}

/* ------------------------------------------------------------------ */
/* 2b. Transferencia: confirmación manual contra el comprobante        */
/* ------------------------------------------------------------------ */

export function TransferSheet({
  tenant,
  total,
  onConfirm,
  onCancel,
}: {
  tenant: TenantDTO;
  total: number;
  onConfirm: (transferRef: string | null) => void;
  onCancel: () => void;
}) {
  const [ref, setRef] = useState("");

  return (
    <Overlay label="Cobro por transferencia">
      <OverlayHeader title="Cobro por transferencia" subtitle="Paso 2 de 2" onClose={onCancel} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 lg:px-8">
        <div className="chunky rounded-2xl bg-transfer p-5 text-center text-white">
          <p className="text-xs font-black tracking-[0.24em] uppercase opacity-90">
            Monto exacto a esperar
          </p>
          <p className="tnum text-6xl font-black leading-none sm:text-7xl">{money(total)}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="chunky rounded-2xl bg-white p-4">
            <p className="text-xs font-black tracking-[0.2em] text-ink-2 uppercase">Alias</p>
            <p className="truncate text-2xl font-black">{tenant.alias ?? "—"}</p>
          </div>

          <div className="chunky rounded-2xl bg-white p-4">
            <p className="text-xs font-black tracking-[0.2em] text-ink-2 uppercase">CVU</p>
            <p className="tnum text-lg font-black break-all sm:text-xl">{tenant.cvu ?? "—"}</p>
          </div>
        </div>

        {tenant.holderName ? (
          <p className="text-sm font-semibold text-ink-2">
            Titular: <span className="font-black text-ink">{tenant.holderName}</span>
          </p>
        ) : null}

        <label className="block">
          <span className="text-xs font-black tracking-[0.2em] text-ink-2 uppercase">
            N° de operación del comprobante (opcional)
          </span>
          <input
            value={ref}
            onChange={(event) => setRef(event.target.value.slice(0, 40))}
            inputMode="numeric"
            placeholder="Ej. 00451238"
            className="chunky mt-1 w-full rounded-xl bg-white px-4 py-3 text-xl font-bold tnum placeholder:font-normal placeholder:text-ink-2/50"
          />
        </label>

        <div className="mt-auto grid gap-3 pt-2 sm:grid-cols-2">
          <Button variant="ghost" onClick={onCancel} className="h-16 text-lg sm:order-1">
            CANCELAR
          </Button>
          <Button
            variant="ok"
            onClick={() => onConfirm(ref.trim() ? ref.trim() : null)}
            className="h-auto min-h-20 py-4 text-xl leading-tight sm:order-2 sm:text-2xl"
          >
            CONFIRMAR TRANSFERENCIA RECIBIDA
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Comprobante                                                      */
/* ------------------------------------------------------------------ */

export type ReceiptData = {
  number: number | null;
  total: number;
  method: PaymentMethod;
  cashReceived: number | null;
  changeGiven: number | null;
  paidAt: string;
  transferRef: string | null;
  queued: boolean;
  sessionOpened: boolean;
};

export function ReceiptSheet({
  receipt,
  tenantName,
  onClose,
}: {
  receipt: ReceiptData;
  tenantName: string;
  onClose: () => void;
}) {
  const methodLabel = receipt.method === "CASH" ? "EFECTIVO" : "TRANSFERENCIA";
  const time = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(receipt.paidAt));

  return (
    <Overlay label="Comprobante de venta">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-6">
        <div
          className={cx(
            "pop-in chunky print-area w-full max-w-lg rounded-2xl bg-white p-6",
          )}
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className={cx(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-black text-white",
                receipt.queued ? "bg-cash" : "bg-ok",
              )}
            >
              {receipt.queued ? "↻" : "✓"}
            </span>
            <div>
              <p className="text-xl font-black leading-tight">
                {receipt.queued ? "VENTA GUARDADA" : "VENTA COBRADA"}
              </p>
              <p className="text-sm font-semibold text-ink-2">
                {receipt.queued
                  ? "Sin internet: se envía sola cuando vuelva la conexión."
                  : receipt.sessionOpened
                    ? "Se abrió la caja con esta venta."
                    : "Pago registrado"}
              </p>
            </div>
          </div>

          <hr className="my-4 border-t-2 border-dashed border-ink/30" />

          <div className="flex items-baseline justify-between gap-3 text-sm font-bold text-ink-2">
            <span>{tenantName}</span>
            <span className="tnum">
              {receipt.number === null ? "TICKET PENDIENTE" : `Ticket #${String(receipt.number).padStart(4, "0")}`}
            </span>
          </div>

          <p className="mt-3 text-xs font-black tracking-[0.2em] text-ink-2 uppercase">Total</p>
          <p className="tnum text-5xl font-black leading-none sm:text-6xl">{money(receipt.total)}</p>

          <dl className="mt-4 grid gap-2 text-base">
            <div className="flex justify-between gap-4 border-t border-ink/15 pt-2">
              <dt className="font-semibold text-ink-2">Forma de pago</dt>
              <dd className="font-black">{methodLabel}</dd>
            </div>
            {receipt.method === "CASH" && receipt.cashReceived !== null ? (
              <>
                <div className="flex justify-between gap-4 border-t border-ink/15 pt-2">
                  <dt className="font-semibold text-ink-2">Paga con</dt>
                  <dd className="tnum font-black">{money(receipt.cashReceived)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-ink/15 pt-2">
                  <dt className="font-semibold text-ink-2">Vuelto</dt>
                  <dd className="tnum font-black">{money(receipt.changeGiven ?? 0)}</dd>
                </div>
              </>
            ) : null}
            {receipt.method === "TRANSFER" ? (
              <div className="flex justify-between gap-4 border-t border-ink/15 pt-2">
                <dt className="font-semibold text-ink-2">Comprobante</dt>
                <dd className="font-black">{receipt.transferRef ?? "Confirmado a mano"}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-ink/15 pt-2">
              <dt className="font-semibold text-ink-2">Fecha</dt>
              <dd className="font-black">{time}</dd>
            </div>
          </dl>

          {receipt.method === "TRANSFER" && !receipt.queued ? (
            <p className="mt-4 rounded-lg bg-paper-2 p-2 text-xs font-semibold text-ink-2">
              Queda en revisión para el cruce nocturno con el extracto de Mercado Pago.
            </p>
          ) : null}
        </div>

        <div className="no-print flex w-full max-w-lg flex-col gap-3 sm:flex-row-reverse">
          <Button variant="ok" onClick={onClose} className="h-20 flex-1 text-2xl">
            NUEVA VENTA
          </Button>
          <Button variant="ghost" onClick={() => window.print()} className="h-16 px-6 text-base sm:h-20">
            IMPRIMIR
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Peso para productos por kilo                                     */
/* ------------------------------------------------------------------ */

export function WeightDialog({
  product,
  onConfirm,
  onCancel,
}: {
  product: ProductDTO;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const parsed = parseAmount(value);
  const quantity = parsed ?? 0;
  const subtotal = Math.round(toCents(product.price) * quantity) / 100;
  const canConfirm = quantity > 0 && quantity <= 100;

  // Teclado físico: números, punto (o coma), borrar, Enter y Escape.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        setValue((current) => applyKey(current, event.key, 3));
        return;
      }
      if (event.key === "." || event.key === ",") {
        event.preventDefault();
        setValue((current) => applyKey(current, ".", 3));
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        setValue((current) => applyKey(current, "back", 3));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (canConfirm) onConfirm(quantity);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canConfirm, onCancel, onConfirm, quantity]);

  return (
    <Overlay label={`Pesar ${product.name}`}>
      <OverlayHeader title={product.name} subtitle="Producto por kilo" onClose={onCancel} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 lg:grid lg:grid-cols-2 lg:gap-8 lg:px-8">
        <section className="flex flex-col gap-4">
          <div className="chunky rounded-2xl bg-white p-4 text-center">
            <p className="text-xs font-black tracking-[0.2em] text-ink-2 uppercase">Peso en kilos</p>
            <p className={cx("tnum text-6xl font-black", value ? "" : "text-ink-2/40")}>
              {value ? `${value} kg` : "0 kg"}
            </p>
          </div>
          <Keypad value={value} onChange={setValue} decimals={3} separator="." />
          <p className="text-center text-xs font-semibold text-ink-2">
            Podés usar el teclado: números, punto y Enter.
          </p>
        </section>

        <section className="flex flex-col justify-between gap-4">
          <div className="chunky grid gap-2 rounded-2xl bg-paper-2 p-4">
            <div className="flex justify-between gap-4">
              <span className="font-semibold text-ink-2">Precio por kg</span>
              <span className="tnum font-black">{money(product.price)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink/15 pt-3">
              <span className="text-lg font-black">Subtotal</span>
              <span className="tnum text-4xl font-black">{money(subtotal)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              variant="ok"
              disabled={!canConfirm}
              onClick={() => onConfirm(quantity)}
              className="h-20 text-2xl"
            >
              AGREGAR {value ? `${value} kg` : ""}
            </Button>
            <Button variant="ghost" onClick={onCancel} className="h-14 text-lg">
              CANCELAR
            </Button>
          </div>
        </section>
      </div>
    </Overlay>
  );
}
