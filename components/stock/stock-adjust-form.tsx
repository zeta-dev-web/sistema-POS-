"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { adjustStock } from "@/app/actions/stock";
import { Button, cx } from "@/components/pos/ui";
import { formatQuantity, parseAmount } from "@/lib/money";

const MODES = [
  { value: "ADD" as const, label: "AGREGAR" },
  { value: "REMOVE" as const, label: "QUITAR" },
  { value: "SET" as const, label: "EDITAR" },
];

export function StockAdjustForm({
  productId,
  currentStock,
  unit,
}: {
  productId: string;
  currentStock: number;
  unit: "UNIT" | "KG";
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(adjustStock, {});
  const [mode, setMode] = useState<"ADD" | "REMOVE" | "SET">("ADD");
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    if (state.ok) {
      setQuantity("");
      router.refresh();
    }
  }, [state, router]);

  const suffix = unit === "KG" ? "kg" : "u.";
  const parsed = parseAmount(quantity);
  const amount = parsed ?? 0;
  const next =
    mode === "ADD" ? currentStock + amount : mode === "REMOVE" ? currentStock - amount : amount;
  const invalid = parsed === null || amount <= 0 || next < 0;
  const canSave = !pending && !invalid;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="mode" value={mode} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-bold text-danger"
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          role="status"
          className="rounded-xl border-2 border-ok bg-ok/10 px-3 py-2 text-sm font-bold text-ok"
        >
          Stock actualizado.
        </p>
      ) : null}

      <div role="group" aria-label="Tipo de ajuste" className="grid grid-cols-3 gap-2">
        {MODES.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={selected}
              className={cx(
                "rounded-lg border-2 py-2.5 text-sm font-black tracking-wide transition-colors",
                selected
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/25 bg-white text-ink-2 hover:border-ink/60 hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <label className="block min-w-0 flex-1">
          <span className="text-xs font-black tracking-[0.18em] text-ink-2 uppercase">
            Cantidad ({suffix})
          </span>
          <input
            name="quantity"
            required
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0"
            className="chunky mt-1 h-12 w-full rounded-xl bg-white px-4 text-lg font-semibold tnum"
          />
        </label>

        <Button
          type="submit"
          variant="transfer"
          disabled={!canSave}
          className="h-12 px-5 text-sm"
        >
          {pending ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>

      <p className="text-sm font-semibold text-ink-2">
        Ahora hay{" "}
        <span className="tnum font-black text-ink">
          {formatQuantity(currentStock)} {suffix}
        </span>
        {parsed !== null && amount > 0 ? (
          next < 0 ? (
            <span className="font-black text-danger"> · No alcanza el stock.</span>
          ) : (
            <>
              {" "}
              → va a quedar{" "}
              <span className="tnum font-black text-ink">
                {formatQuantity(next)} {suffix}
              </span>
            </>
          )
        ) : null}
      </p>
    </form>
  );
}
