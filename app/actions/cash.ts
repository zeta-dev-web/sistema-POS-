"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

export type CloseCashResult =
  | {
      ok: true;
      totals: { cash: number; transfer: number; total: number; count: number };
      closedAt: string;
    }
  | { ok: false; error: string };

/**
 * Cierra el turno abierto y congela los totales.
 * La apertura es automática con la primera venta; el cierre lo hace la persona
 * al terminar el día, que es el único momento en que sabe que ya no va a
 * entrar nadie más.
 */
export async function closeCashSession(): Promise<CloseCashResult> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return { ok: false, error: "No hay comercio configurado." };

  const session = await prisma.cashSession.findFirst({
    where: { tenantId: tenant.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });

  if (!session) return { ok: false, error: "No hay una caja abierta." };

  const grouped = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: { sessionId: session.id, status: "PAID" },
    _sum: { total: true },
    _count: { _all: true },
  });

  const cash = Number(grouped.find((row) => row.paymentMethod === "CASH")?._sum.total ?? 0);
  const transfer = Number(
    grouped.find((row) => row.paymentMethod === "TRANSFER")?._sum.total ?? 0,
  );
  const count = grouped.reduce((acc, row) => acc + row._count._all, 0);

  // Si no hubo ventas no hay nada que cerrar todavía: el turno se abrió recién.
  if (count === 0) return { ok: false, error: "La caja no tiene ventas todavía." };

  const closedAt = new Date();
  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.cashSession.update({
    where: { id: session.id },
    data: {
      status: "CLOSED",
      closedAt,
      closedBy: user?.id ?? null,
      totalCash: cash.toFixed(2),
      totalTransfer: transfer.toFixed(2),
      saleCount: count,
    },
  });

  revalidatePath("/reportes");
  revalidatePath("/");

  return {
    ok: true,
    closedAt: closedAt.toISOString(),
    totals: { cash, transfer, total: cash + transfer, count },
  };
}
