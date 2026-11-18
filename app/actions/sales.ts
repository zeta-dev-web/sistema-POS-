"use server";

import { prisma } from "@/lib/prisma";
import { fromCents, lineTotalCents, sumCents, toCents } from "@/lib/money";
import type { SalePayload, SaleResult } from "@/lib/types";

const MAX_QUANTITY = 999;
const MAX_LINES = 60;

/** Tolerancia de reloj del navegador (una venta no puede ser "del futuro"). */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Más atrás que esto ya es una fecha absurda: se usa la hora del servidor. */
const MAX_BACKDATE_MS = 30 * 24 * 60 * 60 * 1000;

function bad(error: string, serverTotal?: number): SaleResult {
  return serverTotal === undefined ? { ok: false, error } : { ok: false, error, serverTotal };
}

/**
 * Hora real del cobro. La manda el navegador porque una venta puede cobrarse
 * sin internet y sincronizarse horas después: tiene que quedar en el día y la
 * hora en que se cobró, no en la que se pudo enviar.
 *
 * Si la fecha no se entiende, es futura o demasiado vieja (reloj mal puesto),
 * se usa la hora del servidor en vez de rechazar la venta.
 */
function resolvePaidAt(value: unknown, now: Date): Date {
  if (typeof value !== "string" || value.length === 0) return now;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;

  const diff = parsed.getTime() - now.getTime();
  if (diff > MAX_CLOCK_SKEW_MS || diff < -MAX_BACKDATE_MS) return now;
  return parsed;
}

/**
 * Registra una venta. El precio y el total SIEMPRE se recalculan acá:
 * el navegador puede estar desactualizado o haber sido manipulado.
 *
 * Es idempotente por `clientId`: si el POS reintenta después de un corte de
 * internet, no se duplica la venta ni se descuenta stock dos veces.
 *
 * La hora del cobro llega en `paidAt` y se guarda tal cual (con controles de
 * sentido), para que una venta cobrada sin internet quede en su día real.
 *
 * Si no hay un turno de caja abierto, lo abre esta misma venta.
 */
export async function registerSale(payload: SalePayload): Promise<SaleResult> {
  if (!payload || typeof payload !== "object") return bad("Datos inválidos.");

  const clientId = typeof payload.clientId === "string" ? payload.clientId : "";
  if (clientId.length < 8 || clientId.length > 64) return bad("Identificador de venta inválido.");

  if (payload.paymentMethod !== "CASH" && payload.paymentMethod !== "TRANSFER") {
    return bad("Forma de pago inválida.");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return bad("La venta está vacía.");
  }
  if (payload.items.length > MAX_LINES) return bad("Demasiados ítems en una sola venta.");

  // --- Idempotencia: ¿ya se registró esta venta? -------------------------
  const previous = await prisma.sale.findUnique({ where: { clientId } });
  if (previous) {
    return {
      ok: true,
      alreadyExisted: true,
      sessionOpened: false,
      saleId: previous.id,
      number: previous.number ?? 0,
      total: Number(previous.total),
      paidAt: (previous.paidAt ?? previous.createdAt).toISOString(),
    };
  }

  // --- Comercio y usuarios ----------------------------------------------
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return bad("No hay comercio configurado. Corré el seed.");

  const [cashier, owner] = await Promise.all([
    prisma.user.findFirst({ where: { tenantId: tenant.id, role: "CASHIER", active: true } }),
    prisma.user.findFirst({ where: { tenantId: tenant.id, role: "OWNER", active: true } }),
  ]);

  const seller = cashier ?? owner;
  if (!seller) return bad("No hay usuarios configurados. Corré el seed.");

  // Sin login todavía: quien confirma la transferencia queda registrado como
  // el dueño. Cuando entre la autenticación (Fase 1) se usa la sesión real.
  const confirmer = owner ?? seller;

  // --- Productos y cantidades -------------------------------------------
  const requested = new Map<string, number>();
  for (const item of payload.items) {
    const productId = typeof item?.productId === "string" ? item.productId : "";
    const quantity = Number(item?.quantity);
    if (!productId) return bad("Hay un ítem sin producto.");
    if (!Number.isFinite(quantity) || quantity <= 0) return bad("Hay una cantidad inválida.");
    if (quantity > MAX_QUANTITY) return bad("Hay una cantidad demasiado grande.");
    requested.set(productId, (requested.get(productId) ?? 0) + quantity);
  }

  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id, id: { in: [...requested.keys()] } },
  });

  if (products.length !== requested.size) return bad("Un producto ya no existe. Volvé a cargarlo.");

  const lines = products.map((product) => {
    const quantity = requested.get(product.id) ?? 0;
    const unitPriceCents = toCents(Number(product.price));
    return {
      product,
      quantity,
      unitPriceCents,
      totalCents: lineTotalCents(unitPriceCents, quantity),
    };
  });

  // --- Stock (solo unidades; los pesables se venden aunque falte stock) ---
  for (const line of lines) {
    if (line.product.unit !== "UNIT") continue;
    const available = Number(line.product.stock);
    if (line.quantity > available) {
      return bad(`Sin stock de ${line.product.name}. Quedan ${available}.`);
    }
  }

  // --- Totales -----------------------------------------------------------
  const subtotalCents = sumCents(lines.map((line) => line.totalCents));
  const totalCents = subtotalCents;

  if (Math.abs(fromCents(totalCents) - Number(payload.expectedTotal ?? 0)) > 0.009) {
    return bad("Los precios cambiaron. Revisá el total antes de cobrar.", fromCents(totalCents));
  }

  // --- Efectivo ----------------------------------------------------------
  let cashReceivedCents: number | null = null;
  let changeCents: number | null = null;

  if (payload.paymentMethod === "CASH") {
    const received = Number(payload.cashReceived);
    if (!Number.isFinite(received)) return bad("Falta el monto con el que paga el cliente.");
    cashReceivedCents = toCents(received);
    if (cashReceivedCents < totalCents) return bad("El efectivo recibido no alcanza para cubrir el total.");
    changeCents = cashReceivedCents - totalCents;
  }

  // --- Transferencia -----------------------------------------------------
  const transferRef =
    payload.paymentMethod === "TRANSFER" && typeof payload.transferRef === "string"
      ? payload.transferRef.trim().slice(0, 80) || null
      : null;

  const now = new Date();
  const paidAt = resolvePaidAt(payload.paidAt, now);
  let sessionOpened = false;

  // --- Persistencia ------------------------------------------------------
  try {
    const sale = await prisma.$transaction(async (tx) => {
      // Turno abierto: si no hay, esta venta abre la caja.
      const openSession = await tx.cashSession.findFirst({
        where: { tenantId: tenant.id, status: "OPEN" },
        orderBy: { openedAt: "desc" },
        select: { id: true },
      });

      let sessionId = openSession?.id;
      if (!sessionId) {
        // Si la venta se cobró sin internet y llega más tarde, el turno arranca
        // con la hora del cobro (no con la hora de la sincronización).
        const createdSession = await tx.cashSession.create({
          data: { tenantId: tenant.id, openedBy: seller.id, openedAt: paidAt },
          select: { id: true },
        });
        sessionId = createdSession.id;
        sessionOpened = true;
      }

      const counter = await tx.tenant.update({
        where: { id: tenant.id },
        data: { saleCounter: { increment: 1 } },
        select: { saleCounter: true },
      });

      const created = await tx.sale.create({
        data: {
          clientId,
          tenantId: tenant.id,
          userId: seller.id,
          sessionId,
          number: counter.saleCounter,
          status: "PAID",
          paymentMethod: payload.paymentMethod,
          subtotal: fromCents(subtotalCents).toFixed(2),
          discount: "0.00",
          total: fromCents(totalCents).toFixed(2),
          cashReceived: cashReceivedCents === null ? null : fromCents(cashReceivedCents).toFixed(2),
          changeGiven: changeCents === null ? null : fromCents(changeCents).toFixed(2),
          transferRef,
          transferConfirmedBy: payload.paymentMethod === "TRANSFER" ? confirmer.id : null,
          transferConfirmedAt: payload.paymentMethod === "TRANSFER" ? paidAt : null,
          reconciliation: payload.paymentMethod === "CASH" ? "MATCHED" : "PENDING",
          paidAt,
          syncedAt: now,
          items: {
            create: lines.map((line) => ({
              productId: line.product.id,
              description: line.product.name,
              quantity: line.quantity.toFixed(3),
              unitPrice: fromCents(line.unitPriceCents).toFixed(2),
              total: fromCents(line.totalCents).toFixed(2),
            })),
          },
        },
      });

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.product.id },
          data: { stock: { decrement: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: line.product.id,
            delta: (-line.quantity).toFixed(3),
            reason: "SALE",
            saleId: created.id,
            userId: seller.id,
          },
        });
      }

      return created;
    });

    return {
      ok: true,
      alreadyExisted: false,
      sessionOpened,
      saleId: sale.id,
      number: sale.number ?? 0,
      total: Number(sale.total),
      paidAt: paidAt.toISOString(),
    };
  } catch (error) {
    // Otra pestaña/caja ganó la carrera con el mismo clientId.
    if ((error as { code?: string }).code === "P2002") {
      const existing = await prisma.sale.findUnique({ where: { clientId } });
      if (existing) {
        return {
          ok: true,
          alreadyExisted: true,
          sessionOpened: false,
          saleId: existing.id,
          number: existing.number ?? 0,
          total: Number(existing.total),
          paidAt: (existing.paidAt ?? existing.createdAt).toISOString(),
        };
      }
    }
    console.error("[registerSale]", error);
    return bad("No se pudo guardar la venta. Probá de nuevo.");
  }
}
