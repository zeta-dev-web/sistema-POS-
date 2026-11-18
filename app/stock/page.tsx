import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { SetupNotice } from "@/components/pos/setup-notice";
import { StockList } from "@/components/stock/stock-list";
import { money } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const OK_MESSAGES: Record<string, string> = {
  alta: "Producto creado.",
  editado: "Cambios guardados.",
  estado: "Estado del producto actualizado.",
};

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const ok = typeof params.ok === "string" ? params.ok : "";
  const requestedPage = Number(params.page);
  const initialPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });

  if (!tenant) {
    return <SetupNotice title="Falta configurar el comercio" detail="Corré el seed para crear el almacén." />;
  }

  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const lowStock = products.filter(
    (product) => product.active && Number(product.stock) <= Number(product.minStock),
  );
  const stockValue = products.reduce(
    (acc, product) => acc + Number(product.price) * Number(product.stock),
    0,
  );

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppHeader tenantName={tenant.name} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.22em] text-ink-2 uppercase">Mercadería</p>
            <h2 className="text-3xl font-black tracking-tight">Stock</h2>
            <p className="mt-1 text-sm font-semibold text-ink-2">
              {products.length} {products.length === 1 ? "producto" : "productos"} ·{" "}
              {lowStock.length} para reponer · valor {money(stockValue)}
            </p>
          </div>

          <Link href="/stock/nuevo" className="btn btn-ok h-14 px-6 text-base">
            + NUEVO PRODUCTO
          </Link>
        </div>

        {OK_MESSAGES[ok] ? (
          <p
            role="status"
            className="mt-4 rounded-xl border-2 border-ok bg-ok/10 px-4 py-3 text-base font-bold text-ok"
          >
            {OK_MESSAGES[ok]}
          </p>
        ) : null}

        <StockList
          initialQuery={q}
          initialPage={initialPage}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            barcode: product.barcode,
            unit: product.unit === "KG" ? "KG" : "UNIT",
            price: Number(product.price),
            stock: Number(product.stock),
            minStock: Number(product.minStock),
            active: product.active,
          }))}
        />
      </main>
    </div>
  );
}
