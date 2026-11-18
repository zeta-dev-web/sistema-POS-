import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleProductActive } from "@/app/actions/stock";
import { AppHeader } from "@/components/app-header";
import { SetupNotice } from "@/components/pos/setup-notice";
import { ProductForm } from "@/components/stock/product-form";
import { StockAdjustForm } from "@/components/stock/stock-adjust-form";
import { humanDate, humanTime } from "@/lib/dates";
import { money } from "@/lib/format";
import { formatQuantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MOVEMENTS_PER_PAGE = 5;

const REASON_LABELS: Record<string, string> = {
  SALE: "Venta",
  ALTA: "Alta",
};

function movementLabel(reason: string, delta: number): string {
  if (reason === "MANUAL") return delta > 0 ? "Agregar" : "Quitar";
  if (reason === "ADJUSTMENT") return "Editar";
  return REASON_LABELS[reason] ?? reason;
}

export default async function EditarProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) {
    return <SetupNotice title="Falta configurar el comercio" detail="Corré el seed para crear el almacén." />;
  }

  const product = await prisma.product.findFirst({ where: { id, tenantId: tenant.id } });
  if (!product) notFound();

  const totalMovements = await prisma.stockMovement.count({
    where: { productId: product.id },
  });
  const totalPages = Math.max(1, Math.ceil(totalMovements / MOVEMENTS_PER_PAGE));
  const requested = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), totalPages) : 1;

  const movements = await prisma.stockMovement.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * MOVEMENTS_PER_PAGE,
    take: MOVEMENTS_PER_PAGE,
  });

  const unitLabel = product.unit === "KG" ? "kg" : "u.";
  const stock = Number(product.stock);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppHeader tenantName={tenant.name} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <Link href="/stock" className="text-sm font-black text-ink-2 underline underline-offset-4">
          ← Volver a stock
        </Link>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-black tracking-tight">{product.name}</h2>
            <p className="mt-1 text-sm font-semibold text-ink-2">
              {product.barcode ? <span className="font-mono">{product.barcode}</span> : "Sin código de barras"}
              {product.description ? ` · ${product.description}` : ""}
            </p>
          </div>

          <div className="chunky rounded-xl bg-white px-4 py-2 text-right">
            <p className="text-[10px] font-black tracking-wide text-ink-2 uppercase">Stock actual</p>
            <p className="tnum text-2xl font-black">
              {formatQuantity(stock)} {unitLabel}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="chunky rounded-2xl bg-paper p-5">
            <h3 className="mb-4 text-sm font-black tracking-[0.18em] text-ink-2 uppercase">
              Datos del producto
            </h3>
            <ProductForm
              product={{
                id: product.id,
                name: product.name,
                description: product.description,
                barcode: product.barcode,
                unit: product.unit === "KG" ? "KG" : "UNIT",
                price: Number(product.price),
                stock,
                minStock: Number(product.minStock),
              }}
            />
          </section>

          <div className="flex flex-col gap-6">
            <section className="chunky rounded-2xl bg-white p-5">
              <h3 className="mb-1 text-sm font-black tracking-[0.18em] text-ink-2 uppercase">
                Ajustar stock
              </h3>
              <p className="mb-4 text-xs font-semibold text-ink-2">
                Sumá, restá o poné la cantidad exacta. Queda registrado con la fecha.
              </p>
              <StockAdjustForm
                productId={product.id}
                currentStock={stock}
                unit={product.unit === "KG" ? "KG" : "UNIT"}
              />
            </section>

            <section className="chunky rounded-2xl bg-white p-5">
              <h3 className="mb-3 text-sm font-black tracking-[0.18em] text-ink-2 uppercase">
                Últimos movimientos
              </h3>
              {movements.length === 0 ? (
                <p className="text-sm font-semibold text-ink-2">Sin movimientos todavía.</p>
              ) : (
                <ul className="divide-y divide-ink/10">
                  {movements.map((movement) => {
                    const delta = Number(movement.delta);
                    return (
                      <li key={movement.id} className="flex items-baseline justify-between gap-3 py-2">
                        <div>
                          <p className="text-sm font-bold">
                            {movementLabel(movement.reason, delta)}
                            {movement.note ? ` · ${movement.note}` : ""}
                          </p>
                          <p className="text-[11px] font-semibold text-ink-2">
                            {humanDate(movement.createdAt)} {humanTime(movement.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`tnum text-base font-black ${delta < 0 ? "text-danger" : "text-ok"}`}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatQuantity(delta)} {unitLabel}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {totalPages > 1 ? (
                <div className="mt-3 flex items-center justify-between gap-2 border-t-2 border-ink/10 pt-3">
                  {page > 1 ? (
                    <Link
                      href={`/stock/${product.id}?page=${page - 1}`}
                      className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-black active:translate-y-0.5"
                    >
                      ← ANTERIORES
                    </Link>
                  ) : (
                    <span className="rounded-lg border-2 border-ink/15 px-3 py-1.5 text-xs font-black text-ink-2/40">
                      ← ANTERIORES
                    </span>
                  )}

                  <p className="tnum text-xs font-black text-ink-2">
                    Página {page} de {totalPages}
                  </p>

                  {page < totalPages ? (
                    <Link
                      href={`/stock/${product.id}?page=${page + 1}`}
                      className="rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-xs font-black active:translate-y-0.5"
                    >
                      SIGUIENTES →
                    </Link>
                  ) : (
                    <span className="rounded-lg border-2 border-ink/15 px-3 py-1.5 text-xs font-black text-ink-2/40">
                      SIGUIENTES →
                    </span>
                  )}
                </div>
              ) : null}
            </section>

            <section className="chunky rounded-2xl bg-white p-5">
              <h3 className="mb-2 text-sm font-black tracking-[0.18em] text-ink-2 uppercase">
                {product.active ? "Dar de baja" : "Reactivar"}
              </h3>
              <p className="mb-3 text-xs font-semibold text-ink-2">
                {product.active
                  ? "Dejar de ofrecer el producto. El historial de ventas se conserva."
                  : "Vuelve a aparecer en el mostrador con el stock que tenga."}
              </p>
              <form action={toggleProductActive}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="active" value={String(!product.active)} />
                <button
                  type="submit"
                  className={`btn h-12 px-5 text-sm ${product.active ? "btn-danger" : "btn-ok"}`}
                >
                  {product.active ? "DAR DE BAJA" : "REACTIVAR PRODUCTO"}
                </button>
              </form>
            </section>
          </div>
        </div>

        <p className="mt-6 text-center text-xs font-semibold text-ink-2">
          Valor de este stock: {money(stock * Number(product.price))}
        </p>
      </main>
    </div>
  );
}
