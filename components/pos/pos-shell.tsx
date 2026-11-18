"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { registerSale } from "@/app/actions/sales";
import { AppHeader } from "@/components/app-header";
import { longDate, money, shortDate } from "@/lib/format";
import { formatQuantity, fromCents, lineTotalCents, toCents } from "@/lib/money";
import { enqueueSale } from "@/lib/outbox";
import { useSyncState } from "@/lib/sync";
import type { CartLine, PaymentMethod, ProductDTO, SalePayload, SaleResult, TenantDTO } from "@/lib/types";

import {
  CashSheet,
  MethodSheet,
  ReceiptSheet,
  TransferSheet,
  WeightDialog,
  type ReceiptData,
} from "./sheets";
import { Button, cx } from "./ui";

const CART_KEY = "pos.cart.v1";

type Stage = "cart" | "method" | "cash" | "transfer";

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Datos del turno que van en la barra superior.
 * En escritorio el espacio es justo: se muestran por tramos (conexión siempre,
 * "atiende" y fecha corta desde xl, fecha completa desde 2xl) para que la
 * barra no crezca en altura. En el menú mobile se ve todo completo.
 */
function ShiftInfo({
  cashierName,
  online,
  compact,
}: {
  cashierName: string;
  online: boolean;
  compact: boolean;
}) {
  return (
    <>
      {compact ? (
        <>
          <span className="hidden xl:inline 2xl:hidden">{shortDate()}</span>
          <span className="hidden 2xl:inline">{longDate()}</span>
          <span className="hidden xl:inline">·</span>
          <span className="hidden xl:inline">
            Atiende <span className="font-black text-ink">{cashierName}</span>
          </span>
        </>
      ) : (
        <>
          <span>{longDate()}</span>
          <span className="hidden sm:inline">·</span>
          <span>
            Atiende <span className="font-black text-ink">{cashierName}</span>
          </span>
        </>
      )}

      <span
        className={cx(
          "flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-xs font-black",
          online ? "bg-ok text-white" : "bg-cash text-white",
        )}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
        {online ? "CONECTADO" : "SIN INTERNET"}
      </span>
    </>
  );
}

export function PosShell({
  tenant,
  cashierName,
  products,
}: {
  tenant: TenantDTO;
  cashierName: string;
  products: ProductDTO[];
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>("cart");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLUListElement>(null);
  const [weightFor, setWeightFor] = useState<ProductDTO | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Estado compartido: la reconexión y el reintento de ventas viven en lib/sync.
  const { online } = useSyncState();

  const totalCents = useMemo(
    () => lines.reduce((acc, line) => acc + lineTotalCents(toCents(line.price), line.quantity), 0),
    [lines],
  );
  const total = fromCents(totalCents);

  /* --------------------------- carrito persistente --------------------------- */

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setLines(parsed as CartLine[]);
      }
    } catch {
      // Carrito corrupto: se arranca vacío.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      // Sin persistencia, pero la venta sigue funcionando.
    }
  }, [lines, hydrated]);

  /* ------------------------------- conexión -------------------------------- */

  // El encendido/apagado de la conexión y el reintento de la cola los maneja
  // `lib/sync` una sola vez para toda la app (también fuera de Cobrar).

  /* -------------------------------- carrito -------------------------------- */

  function addProduct(product: ProductDTO) {
    if (product.unit === "KG") {
      setWeightFor(product);
      return;
    }
    addQuantity(product, 1);
  }

  function addQuantity(product: ProductDTO, quantity: number) {
    setLines((current) => {
      const index = current.findIndex((line) => line.productId === product.id);
      if (index === -1) {
        return [
          ...current,
          {
            productId: product.id,
            name: product.name,
            unit: product.unit,
            price: product.price,
            quantity: round3(quantity),
          },
        ];
      }
      const next = [...current];
      next[index] = { ...next[index], quantity: round3(next[index].quantity + quantity) };
      return next;
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setLines((current) =>
      current
        .map((line) =>
          line.productId === productId
            ? { ...line, quantity: round3(line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0.0001),
    );
  }

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  function clearCart() {
    setLines([]);
  }

  /* ------------------------------- búsqueda -------------------------------- */

  const results = useMemo(() => {
    const term = normalize(query);
    if (!term) return [];
    const raw = query.trim();

    return products
      .filter((product) => {
        const byBarcode = Boolean(product.barcode && product.barcode.includes(raw));
        return (
          byBarcode ||
          normalize(product.name).includes(term) ||
          normalize(product.description ?? "").includes(term)
        );
      })
      .slice(0, 6);
  }, [products, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Si la opción elegida con el teclado queda fuera de la vista, se acomoda
  // el scroll de la lista (sin mover la página).
  useEffect(() => {
    const list = resultsRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !item) return;
    const itemBox = item.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    if (itemBox.top < listBox.top) list.scrollTop -= listBox.top - itemBox.top;
    else if (itemBox.bottom > listBox.bottom) list.scrollTop += itemBox.bottom - listBox.bottom;
  }, [activeIndex, results]);

  // En pantalla grande el foco arranca en el buscador; en el celular no, para
  // no abrir el teclado apenas entra.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) searchRef.current?.focus();
  }, []);

  function focusSearch() {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function soldOut(product: ProductDTO): boolean {
    return product.unit === "UNIT" && product.stock <= 0;
  }

  function chooseProduct(product: ProductDTO) {
    if (soldOut(product)) return;
    addProduct(product);
    setQuery("");
    focusSearch();
  }

  function submitSearch() {
    const raw = query.trim();
    if (!raw) return;
    const byBarcode = products.find((product) => product.barcode === raw);
    const match = byBarcode ?? results[activeIndex] ?? results[0];
    if (match) chooseProduct(match);
  }

  /* -------------------------------- cobro ---------------------------------- */

  async function sendSale(payload: SalePayload): Promise<SaleResult> {
    if (!navigator.onLine) {
      enqueueSale(payload);
      return { ok: false, queued: true, error: "Sin conexión" };
    }
    try {
      return await registerSale(payload);
    } catch (cause) {
      console.error(cause);
      enqueueSale(payload);
      return { ok: false, queued: true, error: "Sin conexión" };
    }
  }

  async function finishSale(input: {
    method: PaymentMethod;
    cashReceived: number | null;
    changeGiven: number | null;
    transferRef: string | null;
  }) {
    if (submitting || lines.length === 0) return;
    setSubmitting(true);
    setError(null);

    // Hora real del cobro: viaja con la venta aunque se sincronice más tarde.
    const paidAt = new Date().toISOString();

    const payload: SalePayload = {
      clientId: newClientId(),
      paidAt,
      paymentMethod: input.method,
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      expectedTotal: total,
      cashReceived: input.cashReceived,
      changeGiven: input.changeGiven,
      transferRef: input.transferRef,
    };

    let result: SaleResult;
    try {
      result = await sendSale(payload);
    } finally {
      setSubmitting(false);
    }

    if (!result.ok) {
      if (!result.queued) {
        setError(result.error);
        return;
      }
      setReceipt({
        number: null,
        total,
        method: input.method,
        cashReceived: input.cashReceived,
        changeGiven: input.changeGiven,
        paidAt,
        transferRef: input.transferRef,
        queued: true,
        sessionOpened: false,
      });
      setLines([]);
      setStage("cart");
      return;
    }

    setReceipt({
      number: result.number,
      total: result.total,
      method: input.method,
      cashReceived: input.cashReceived,
      changeGiven: input.changeGiven,
      paidAt: result.paidAt,
      transferRef: input.transferRef,
      queued: false,
      sessionOpened: result.sessionOpened,
    });
    setLines([]);
    setStage("cart");
  }

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="relative z-10 flex h-dvh flex-col">
      <AppHeader
        tenantName={tenant.name}
        menuChildren={
          <ShiftInfo cashierName={cashierName} online={online} compact={false} />
        }
      >
        <ShiftInfo cashierName={cashierName} online={online} compact />
      </AppHeader>

      <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {/* Buscador */}
        <section
          aria-labelledby="buscar-titulo"
          className="flex shrink-0 flex-col lg:min-h-0 lg:flex-1 lg:border-r-4 lg:border-ink"
        >
          <div className="border-b-2 border-ink/20 px-2.5 py-2 sm:px-6 sm:py-4">
            <label
              htmlFor="pos-search"
              id="buscar-titulo"
              className="sr-only text-xs font-black tracking-[0.22em] text-ink-2 uppercase sm:not-sr-only sm:block"
            >
              Buscar producto
            </label>
            <div className="relative sm:mt-1.5">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base sm:left-4 sm:text-2xl"
              >
                🔍
              </span>
              <input
                ref={searchRef}
                id="pos-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearch();
                    return;
                  }
                  if (event.key === "ArrowDown" && results.length > 0) {
                    event.preventDefault();
                    setActiveIndex((index) => (index + 1) % results.length);
                    return;
                  }
                  if (event.key === "ArrowUp" && results.length > 0) {
                    event.preventDefault();
                    setActiveIndex((index) => (index - 1 + results.length) % results.length);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder="Nombre, descripción o código de barras"
                className="chunky h-12 w-full rounded-xl bg-white pr-16 pl-10 text-lg font-bold placeholder:text-sm placeholder:font-semibold placeholder:text-ink-2/45 sm:h-16 sm:rounded-2xl sm:pr-24 sm:pl-14 sm:text-2xl sm:placeholder:text-base"
                autoComplete="off"
                enterKeyHint="search"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    focusSearch();
                  }}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg border-2 border-ink/25 bg-paper px-2 py-1 text-[10px] font-black tracking-wide text-ink-2 active:translate-y-[calc(-50%+2px)] sm:right-3 sm:px-3 sm:py-2 sm:text-xs"
                >
                  LIMPIAR
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-[32dvh] min-h-0 overflow-y-auto px-2.5 py-1.5 sm:px-6 sm:py-3 lg:max-h-none lg:flex-1">
            {query ? (
              results.length === 0 ? (
                <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 py-6 text-center">
                  <p className="text-lg font-black">No hay productos con “{query.trim()}”.</p>
                  <p className="text-sm font-semibold text-ink-2">
                    Probá con otra palabra o revisá el código.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3 sm:mb-2">
                    <p className="text-xs font-black tracking-[0.18em] text-ink-2 uppercase">
                      {results.length} {results.length === 1 ? "coincidencia" : "coincidencias"}
                    </p>
                    <p className="hidden text-xs font-semibold text-ink-2 sm:block">
                      ↑ ↓ para elegir · Enter para agregar
                    </p>
                  </div>

                  <ul ref={resultsRef} className="flex flex-col gap-2">
                    {results.map((product, index) => {
                      const disabled = soldOut(product);
                      return (
                        <li key={product.id}>
                          <button
                            type="button"
                            data-index={index}
                            onClick={() => chooseProduct(product)}
                            onMouseEnter={() => setActiveIndex(index)}
                            disabled={disabled}
                            className={cx(
                              "flex w-full items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow] duration-100 sm:gap-3 sm:px-4 sm:py-3",
                              disabled
                                ? "cursor-not-allowed border-ink/15 bg-paper-2/70 opacity-70"
                                : index === activeIndex
                                  ? "border-ink bg-paper-2 shadow-[inset_7px_0_0_var(--color-ink),5px_5px_0_var(--color-ink)]"
                                  : "border-ink/25 bg-white/80 hover:border-ink/60",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-lg leading-tight font-black sm:text-xl">
                                  {product.name}
                                </span>
                                {product.unit === "KG" ? (
                                  <span className="rounded bg-transfer px-1.5 py-0.5 text-[10px] font-black text-white uppercase">
                                    kg
                                  </span>
                                ) : null}
                                {disabled ? (
                                  <span className="rounded bg-danger px-1.5 py-0.5 text-[10px] font-black text-white uppercase">
                                    sin stock
                                  </span>
                                ) : null}
                              </div>
                              {product.description ? (
                                <p className="truncate text-sm font-semibold text-ink-2">
                                  {product.description}
                                </p>
                              ) : null}
                              {product.barcode ? (
                                <p className="tnum text-xs font-bold text-ink-2/80">
                                  Código {product.barcode}
                                </p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="tnum text-lg font-black sm:text-xl">{money(product.price)}</p>
                              <p
                                className={cx(
                                  "tnum text-xs font-bold",
                                  product.stock <= 0 ? "text-danger" : "text-ink-2",
                                )}
                              >
                                {product.unit === "KG"
                                  ? `${formatQuantity(product.stock)} kg`
                                  : `${formatQuantity(product.stock)} u.`}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            ) : (
              <div className="hidden h-full flex-col items-center justify-center gap-5 py-10 text-center lg:flex">
                <div className="chunky rounded-2xl bg-white px-6 py-5 text-left">
                  <p className="text-xs font-black tracking-[0.22em] text-ink-2 uppercase">
                    Cómo cobrar
                  </p>
                  <ol className="mt-3 flex flex-col gap-3 text-base font-semibold">
                    <li className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-paper">
                        1
                      </span>
                      Buscá el producto o escaneá el código de barras.
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-paper">
                        2
                      </span>
                      Revisá la venta de la derecha: producto, precio y cantidad.
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-black text-paper">
                        3
                      </span>
                      Tocá COBRAR y elegí efectivo o transferencia.
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Venta */}
        <aside className="flex min-h-0 flex-1 flex-col bg-paper-2/70 lg:max-h-none">
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink/20 px-2.5 py-1.5 sm:px-4 sm:py-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-sm font-black tracking-[0.2em] uppercase">Venta</h2>
              {lines.length > 0 ? (
                <span className="text-xs font-bold text-ink-2 sm:text-sm">
                  {lines.length} {lines.length === 1 ? "producto" : "productos"}
                </span>
              ) : null}
            </div>
            {lines.length > 0 ? (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-black text-danger underline underline-offset-4"
              >
                VACIAR
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5 sm:px-4 sm:py-3">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-2 py-8 text-center">
                <span aria-hidden className="text-4xl">
                  🧺
                </span>
                <p className="text-lg font-black">Todavía no cargaste nada</p>
                <p className="max-w-[28ch] text-sm font-semibold text-ink-2">
                  Buscá un producto arriba, elegilo y aparece acá con su precio y cantidad.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5 sm:gap-2">
                {lines.map((line) => {
                  const step = line.unit === "KG" ? 0.1 : 1;
                  return (
                    <li
                      key={line.productId}
                      className="rounded-xl border-2 border-ink/20 bg-white p-2 sm:p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base leading-tight font-black sm:text-xl">{line.name}</p>
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          className="-mt-1.5 -mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-black text-ink-2 hover:bg-ink/10"
                          aria-label={`Quitar ${line.name}`}
                        >
                          ✕
                        </button>
                      </div>

                      <p className="tnum mt-0.5 text-xs font-bold text-ink-2 sm:mt-1 sm:text-sm">
                        {money(line.price)} {line.unit === "KG" ? "por kg" : "c/u"} ×{" "}
                        {formatQuantity(line.quantity)}
                        {line.unit === "KG" ? " kg" : ""}
                      </p>

                      <div className="mt-1.5 flex items-center justify-between gap-2 sm:mt-2">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => changeQuantity(line.productId, -step)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-paper text-lg font-black active:translate-y-0.5 sm:h-11 sm:w-11 sm:text-2xl"
                            aria-label={`Quitar ${line.unit === "KG" ? "100 g" : "una unidad"} de ${line.name}`}
                          >
                            −
                          </button>
                          <span className="tnum min-w-14 text-center text-base font-black sm:min-w-18 sm:text-xl">
                            {formatQuantity(line.quantity)}
                            {line.unit === "KG" ? " kg" : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(line.productId, step)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-ink bg-paper text-lg font-black active:translate-y-0.5 sm:h-11 sm:w-11 sm:text-2xl"
                            aria-label={`Agregar ${line.unit === "KG" ? "100 g" : "una unidad"} de ${line.name}`}
                          >
                            +
                          </button>
                        </div>
                        <span className="tnum text-lg font-black sm:text-2xl">
                          {money(fromCents(lineTotalCents(toCents(line.price), line.quantity)))}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t-4 border-ink bg-paper px-2.5 py-2 sm:px-4 sm:py-3">
            {error ? (
              <div
                role="alert"
                className="mb-3 flex items-start justify-between gap-3 rounded-xl border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-bold text-danger"
              >
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso">
                  ✕
                </button>
              </div>
            ) : null}

            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.22em] text-ink-2 uppercase sm:text-[11px]">
                  Total
                </p>
                <p className="tnum text-2xl leading-none font-black sm:text-5xl">{money(total)}</p>
              </div>
              <p className="hidden pb-1 text-sm font-bold text-ink-2 sm:block">
                {lines.length} {lines.length === 1 ? "producto" : "productos"}
              </p>
            </div>

            <Button
              variant="dark"
              onClick={() => setStage("method")}
              disabled={lines.length === 0 || submitting}
              className="mt-1.5 h-12 w-full text-lg tracking-wide sm:mt-3 sm:h-20 sm:text-3xl"
            >
              COBRAR
            </Button>
          </div>
        </aside>
      </main>

      {stage === "method" ? (
        <MethodSheet
          total={total}
          onCash={() => setStage("cash")}
          onTransfer={() => setStage("transfer")}
          onCancel={() => setStage("cart")}
        />
      ) : null}

      {stage === "cash" ? (
        <CashSheet
          total={total}
          onCancel={() => setStage("method")}
          onConfirm={(received, change) =>
            void finishSale({
              method: "CASH",
              cashReceived: received,
              changeGiven: change,
              transferRef: null,
            })
          }
        />
      ) : null}

      {stage === "transfer" ? (
        <TransferSheet
          tenant={tenant}
          total={total}
          onCancel={() => setStage("method")}
          onConfirm={(transferRef) =>
            void finishSale({
              method: "TRANSFER",
              cashReceived: null,
              changeGiven: null,
              transferRef,
            })
          }
        />
      ) : null}

      {weightFor ? (
        <WeightDialog
          product={weightFor}
          onCancel={() => {
            setWeightFor(null);
            focusSearch();
          }}
          onConfirm={(quantity) => {
            addQuantity(weightFor, quantity);
            setWeightFor(null);
            focusSearch();
          }}
        />
      ) : null}

      {receipt ? (
        <ReceiptSheet receipt={receipt} tenantName={tenant.name} onClose={() => setReceipt(null)} />
      ) : null}

      {submitting ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-paper/85">
          <p className="chunky rounded-2xl bg-white px-8 py-5 text-2xl font-black">GUARDANDO VENTA…</p>
        </div>
      ) : null}
    </div>
  );
}
