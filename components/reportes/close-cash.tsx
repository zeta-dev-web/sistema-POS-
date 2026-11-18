"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { closeCashSession, type CloseCashResult } from "@/app/actions/cash";
import { Button } from "@/components/pos/ui";
import { money } from "@/lib/format";

export function CloseCash({
  cash,
  transfer,
  count,
}: {
  cash: number;
  transfer: number;
  count: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CloseCashResult | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    startTransition(async () => {
      const res = await closeCashSession();
      setResult(res);
      setConfirming(false);
      if (res.ok) router.refresh();
    });
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="danger" onClick={() => setConfirming(true)} className="h-14 w-full text-base">
          CERRAR CAJA
        </Button>
        {result && !result.ok ? (
          <p role="alert" className="text-xs font-bold text-danger">
            {result.error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-ink bg-paper p-3">
      <p className="text-xs font-black tracking-wide text-ink-2 uppercase">Confirmá el cierre</p>
      <ul className="mt-2 grid gap-1 text-sm font-semibold">
        <li className="flex justify-between gap-3">
          <span>Efectivo</span>
          <span className="tnum font-black">{money(cash)}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span>Transferencia</span>
          <span className="tnum font-black">{money(transfer)}</span>
        </li>
        <li className="flex justify-between gap-3 border-t border-ink/20 pt-1">
          <span>Total · {count} ventas</span>
          <span className="tnum font-black">{money(cash + transfer)}</span>
        </li>
      </ul>
      <div className="mt-3 flex flex-col gap-2">
        <Button variant="danger" disabled={pending} onClick={close} className="h-12 text-sm">
          {pending ? "CERRANDO…" : "CONFIRMAR CIERRE"}
        </Button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs font-black text-ink-2 underline underline-offset-4"
        >
          VOLVER
        </button>
      </div>
    </div>
  );
}
