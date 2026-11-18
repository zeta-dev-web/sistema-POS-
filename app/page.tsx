import { PosShell } from "@/components/pos/pos-shell";
import { SetupNotice } from "@/components/pos/setup-notice";
import { prisma } from "@/lib/prisma";
import type { ProductDTO, TenantDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  try {
    const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });

    if (!tenant) {
      return (
        <SetupNotice
          title="La base está vacía"
          detail="Todavía no hay un comercio cargado."
        />
      );
    }

    const [cashier, owner, products] = await Promise.all([
      prisma.user.findFirst({
        where: { tenantId: tenant.id, role: "CASHIER", active: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.findFirst({
        where: { tenantId: tenant.id, role: "OWNER", active: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.product.findMany({
        where: { tenantId: tenant.id, active: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const tenantDTO: TenantDTO = {
      name: tenant.name,
      cvu: tenant.cvu,
      alias: tenant.alias,
      holderName: tenant.holderName,
    };

    const productDTOs: ProductDTO[] = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      barcode: product.barcode,
      unit: product.unit === "KG" ? "KG" : "UNIT",
      price: Number(product.price),
      stock: Number(product.stock),
    }));

    return (
      <PosShell
        tenant={tenantDTO}
        cashierName={owner?.name ?? cashier?.name ?? "Caja"}
        products={productDTOs}
      />
    );
  } catch (error) {
    return (
      <SetupNotice
        title="No se pudo conectar a la base"
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }
}
