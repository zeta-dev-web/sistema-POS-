"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { createProduct, updateProduct } from "@/app/actions/stock";
import { Button, cx } from "@/components/pos/ui";

export type ProductFormValues = {
  id?: string;
  name: string;
  description: string | null;
  barcode: string | null;
  unit: "UNIT" | "KG";
  price: number;
  stock?: number;
  minStock: number;
};

const inputClass =
  "chunky w-full rounded-xl bg-white px-4 py-3 text-lg font-semibold tnum placeholder:font-normal placeholder:text-ink-2/50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black tracking-[0.18em] text-ink-2 uppercase">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs font-semibold text-ink-2">{hint}</span> : null}
    </label>
  );
}

export function ProductForm({ product }: { product?: ProductFormValues }) {
  const isEdit = Boolean(product?.id);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateProduct : createProduct,
    {},
  );
  const [unit, setUnit] = useState<"UNIT" | "KG">(product?.unit ?? "UNIT");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {product?.id ? <input type="hidden" name="id" value={product.id} /> : null}

      {state.error ? (
        <p role="alert" className="rounded-xl border-2 border-danger bg-danger/10 px-4 py-3 text-base font-bold text-danger">
          {state.error}
        </p>
      ) : null}

      <Field label="Nombre del producto">
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={product?.name ?? ""}
          placeholder="Ej. Yerba Mate Playadito 1 kg"
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label="Descripción (opcional)" hint="Marca, tamaño o cualquier detalle que ayude a reconocerlo.">
        <input
          name="description"
          maxLength={200}
          defaultValue={product?.description ?? ""}
          placeholder="Ej. Paquete de 1 kilo, tira de 4"
          className={inputClass}
        />
      </Field>

      <Field
        label="Código de barras (opcional)"
        hint="Podés escanearlo con la pistola o escribirlo. Después sirve para vender."
      >
        <input
          name="barcode"
          maxLength={64}
          defaultValue={product?.barcode ?? ""}
          placeholder="Ej. 7790895000101"
          className={`${inputClass} font-mono`}
          autoComplete="off"
        />
      </Field>

      <fieldset>
        <legend className="text-xs font-black tracking-[0.18em] text-ink-2 uppercase">
          ¿Cómo se vende?
        </legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {[
            { value: "UNIT" as const, icon: "🧴", title: "Por unidad", hint: "Paquetes, botellas, latas" },
            { value: "KG" as const, icon: "⚖️", title: "Por kilo", hint: "Fiambres, frutas, pan" },
          ].map((option) => {
            const selected = unit === option.value;
            return (
              <label
                key={option.value}
                className={cx(
                  "chunky flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition-colors",
                  selected ? "bg-ink text-paper" : "bg-white",
                )}
              >
                <input
                  type="radio"
                  name="unit"
                  value={option.value}
                  checked={selected}
                  onChange={() => setUnit(option.value)}
                  className="sr-only"
                />
                <span aria-hidden className="text-2xl">
                  {option.icon}
                </span>
                <span>
                  <span className="block text-base font-black">{option.title}</span>
                  <span className={cx("block text-xs font-semibold", selected ? "text-paper/70" : "text-ink-2")}>
                    {option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Precio de venta">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-black text-ink-2">
              $
            </span>
            <input
              name="price"
              required
              inputMode="decimal"
              defaultValue={product ? String(product.price) : ""}
              placeholder="0,00"
              className={`${inputClass} pl-9`}
            />
          </div>
        </Field>

        <Field label={isEdit ? "Stock actual" : "Cantidad inicial"}>
          <input
            name={isEdit ? "stockReadonly" : "stock"}
            inputMode="decimal"
            disabled={isEdit}
            defaultValue={product?.stock !== undefined ? String(product.stock) : ""}
            placeholder="0"
            className={cx(inputClass, isEdit && "opacity-60")}
          />
        </Field>

        <Field label="Stock mínimo" hint="Avisa cuando hay que reponer.">
          <input
            name="minStock"
            inputMode="decimal"
            defaultValue={product ? String(product.minStock) : "0"}
            placeholder="0"
            className={inputClass}
          />
        </Field>
      </div>

      {isEdit ? (
        <p className="rounded-xl bg-paper-2 px-4 py-3 text-sm font-semibold text-ink-2">
          El stock no se cambia desde acá: usá <span className="font-black text-ink">Ajustar stock</span> más abajo con AGREGAR, QUITAR o EDITAR.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" variant="ok" disabled={pending} className="h-20 flex-1 text-2xl">
          {pending ? "GUARDANDO…" : isEdit ? "GUARDAR CAMBIOS" : "GUARDAR PRODUCTO"}
        </Button>
        <Link
          href="/stock"
          className="btn btn-ghost h-20 flex-1 text-lg sm:flex-none sm:px-8"
        >
          CANCELAR
        </Link>
      </div>
    </form>
  );
}
