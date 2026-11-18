import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { SetupNotice } from "@/components/pos/setup-notice";
import { ProductForm } from "@/components/stock/product-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NuevoProductoPage() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });

  if (!tenant) {
    return <SetupNotice title="Falta configurar el comercio" detail="Corré el seed para crear el almacén." />;
  }

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppHeader tenantName={tenant.name} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <Link href="/stock" className="text-sm font-black text-ink-2 underline underline-offset-4">
          ← Volver a stock
        </Link>

        <h2 className="mt-2 text-3xl font-black tracking-tight">Nuevo producto</h2>
        <p className="mt-1 text-sm font-semibold text-ink-2">
          Cargá el precio de venta y la cantidad que hay hoy. Después lo encontrás en el mostrador.
        </p>

        <div className="chunky mt-5 rounded-2xl bg-paper p-5 sm:p-6">
          <ProductForm />
        </div>
      </main>
    </div>
  );
}
