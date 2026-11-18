"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { money } from "@/lib/format";
import { formatQuantity } from "@/lib/money";

const PAGE_SIZE = 10;

export type StockListItem = {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  unit: "UNIT" | "KG";
  price: number;
  stock: number;
  minStock: number;
  active: boolean;
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function StockList({
  products,
  initialQuery,
  initialPage = 1,
}: {
  products: StockListItem[];
  initialQuery: string;
  initialPage?: number;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const raw = query.trim();
    const term = normalize(raw);
    if (!term) return products;

    return products.filter(
      (product) =>
        Boolean(product.barcode && product.barcode.includes(raw)) ||
        normalize(product.name).includes(term) ||
        normalize(product.description ?? "").includes(term),
    );
  }, [products, query]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // El filtro es instantáneo en el navegador; la URL se actualiza sin volver
  // a pedir la página, así al refrescar se mantienen la búsqueda y la página.
  function syncUrl(nextQuery: string, nextPage: number) {
    const url = new URL(window.location.href);
    if (nextQuery.trim()) url.searchParams.set("q", nextQuery);
    else url.searchParams.delete("q");
    if (nextPage > 1) url.searchParams.set("page", String(nextPage));
    else url.searchParams.delete("page");
    window.history.replaceState(null, "", url);
  }

  function changeQuery(value: string) {
    setQuery(value);
    setPage(1);
    syncUrl(value, 1);
  }

  function changePage(next: number) {
    const target = Math.min(Math.max(next, 1), totalPages);
    setPage(target);
    syncUrl(query, target);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div className="mt-5">
        <label
          htmlFor="stock-search"
          className="block text-xs font-black tracking-[0.22em] text-ink-2 uppercase"
        >
          Buscar producto
        </label>
        <div className="relative mt-1.5">
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xl"
          >
            🔍
          </span>
          <input
            id="stock-search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Nombre, código de barras o descripción"
            className="chunky h-14 w-full rounded-xl bg-white pr-24 pl-12 text-lg font-semibold placeholder:text-base placeholder:text-ink-2/45"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => changeQuery("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg border-2 border-ink/25 bg-paper px-3 py-1.5 text-xs font-black tracking-wide text-ink-2 active:translate-y-[calc(-50%+2px)]"
            >
              LIMPIAR
            </button>
          ) : null}
        </div>
        {query.trim() ? (
          <p className="mt-2 text-sm font-semibold text-ink-2">
            <span className="font-black text-ink">
              {results.length} {results.length === 1 ? "coincidencia" : "coincidencias"}
            </span>
          </p>
        ) : null}
      </div>

      {results.length === 0 ? (
        <div className="chunky mt-6 rounded-2xl bg-white p-8 text-center">
          <p className="text-xl font-black">
            {query.trim() ? `No hay productos con “${query.trim()}”.` : "Todavía no hay productos."}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-2">
            {query.trim()
              ? "Probá con otro nombre, descripción o código."
              : "Cargá el primero con el botón de arriba."}
          </p>
        </div>
      ) : (
        <ul ref={listRef} className="chunky mt-6 scroll-mt-4 divide-y-2 divide-ink/10 overflow-hidden rounded-2xl bg-white">
          {pageItems.map((product) => {
            const low = product.active && product.stock <= product.minStock;
            return (
              <li key={product.id}>
                <Link
                  href={`/stock/${product.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-paper-2/70"
                >
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black">{product.name}</span>
                      {!product.active ? (
                        <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-black tracking-wide uppercase">
                          Inactivo
                        </span>
                      ) : null}
                      {low ? (
                        <span className="rounded bg-danger px-1.5 py-0.5 text-[10px] font-black tracking-wide text-white uppercase">
                          Reponer
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-ink-2">
                      {product.barcode ? (
                        <span className="font-mono">{product.barcode}</span>
                      ) : (
                        "sin código"
                      )}
                      {product.description ? ` · ${product.description}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[10px] font-black tracking-wide text-ink-2 uppercase">
                        Precio
                      </p>
                      <p className="tnum text-base font-black">{money(product.price)}</p>
                    </div>
                    <div className="min-w-20 text-right">
                      <p className="text-[10px] font-black tracking-wide text-ink-2 uppercase">
                        Stock
                      </p>
                      <p className={`tnum text-base font-black ${low ? "text-danger" : ""}`}>
                        {formatQuantity(product.stock)} {product.unit === "KG" ? "kg" : "u."}
                      </p>
                    </div>
                    <span aria-hidden className="text-xl font-black text-ink-2">
                      ›
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {results.length > 0 && totalPages > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink-2">
            Mostrando{" "}
            <span className="tnum font-black text-ink">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, results.length)}
            </span>{" "}
            de {results.length} · página {currentPage} de {totalPages}
          </p>

          <nav aria-label="Páginas de stock" className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="btn btn-ghost h-12 flex-1 px-4 text-sm sm:flex-none"
            >
              ← ANTERIOR
            </button>
            <button
              type="button"
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="btn btn-ghost h-12 flex-1 px-4 text-sm sm:flex-none"
            >
              SIGUIENTE →
            </button>
          </nav>
        </div>
      ) : null}
    </>
  );
}
