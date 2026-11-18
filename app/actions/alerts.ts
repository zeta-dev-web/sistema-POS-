"use server";

import { prisma } from "@/lib/prisma";
import type { LowStockItem } from "@/lib/types";

/**
 * Productos activos en el mínimo o por debajo. Se ordenan por cuánto falta:
 * primero los que están más lejos del mínimo.
 */
export async function getLowStockAlerts(): Promise<LowStockItem[]> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return [];

  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id, active: true },
    orderBy: { name: "asc" },
  });

  return products
    .filter((product) => Number(product.stock) <= Number(product.minStock))
    .map((product) => ({
      id: product.id,
      name: product.name,
      stock: Number(product.stock),
      minStock: Number(product.minStock),
      unit: product.unit === "KG" ? ("KG" as const) : ("UNIT" as const),
    }))
    .sort((a, b) => a.stock - a.minStock - (b.stock - b.minStock));
}
