"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { parseAmount } from "@/lib/money";
import type { FormState } from "@/lib/types";

function text(formData: FormData, key: string, maxLength: number): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeBarcode(raw: string): string | null {
  const value = raw.replace(/\s+/g, "");
  return value.length > 0 ? value : null;
}

type ProductInput = {
  name: string;
  description: string | null;
  barcode: string | null;
  unit: "UNIT" | "KG";
  price: string;
  minStock: string;
};

function parseProduct(formData: FormData): { input: ProductInput } | { error: string } {
  const name = text(formData, "name", 80);
  if (name.length < 2) return { error: "Poné un nombre de al menos 2 letras." };

  const barcode = normalizeBarcode(text(formData, "barcode", 64));
  if (barcode && !/^[A-Za-z0-9\-_.]{4,64}$/.test(barcode)) {
    return { error: "El código de barras solo puede tener letras, números, guiones o puntos." };
  }

  const unit = formData.get("unit") === "KG" ? "KG" : "UNIT";

  const price = parseAmount(text(formData, "price", 20));
  if (price === null || price <= 0) return { error: "El precio de venta tiene que ser mayor a cero." };
  if (price > 9_999_999) return { error: "Ese precio es demasiado alto." };

  const rawMin = text(formData, "minStock", 20);
  const minStock = rawMin ? parseAmount(rawMin) : 0;
  if (minStock === null || minStock < 0) return { error: "El stock mínimo no puede ser negativo." };

  return {
    input: {
      name,
      description: text(formData, "description", 200) || null,
      barcode,
      unit,
      price: price.toFixed(2),
      minStock: minStock.toFixed(3),
    },
  };
}

async function currentUserForTenant(tenantId: string) {
  return prisma.user.findFirst({
    where: { tenantId, active: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

/** Alta de producto con stock inicial. */
export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return { error: "No hay comercio configurado." };

  const parsed = parseProduct(formData);
  if ("error" in parsed) return parsed;

  const rawStock = text(formData, "stock", 20);
  const stock = rawStock ? parseAmount(rawStock) : 0;
  if (stock === null || stock < 0) return { error: "La cantidad inicial no puede ser negativa." };

  const user = await currentUserForTenant(tenant.id);

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId: tenant.id,
          name: parsed.input.name,
          description: parsed.input.description,
          barcode: parsed.input.barcode,
          unit: parsed.input.unit,
          price: parsed.input.price,
          stock: stock.toFixed(3),
          minStock: parsed.input.minStock,
        },
      });

      if (stock > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: product.id,
            delta: stock.toFixed(3),
            reason: "ALTA",
            note: "Stock inicial",
            userId: user?.id ?? "system",
          },
        });
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { error: "Ya hay un producto con ese código de barras." };
    }
    console.error("[createProduct]", error);
    return { error: "No se pudo guardar el producto." };
  }

  revalidatePath("/stock");
  redirect("/stock?ok=alta");
}

/** Edición de datos del producto. El stock se mueve aparte, con adjustStock. */
export async function updateProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return { error: "No hay comercio configurado." };

  const id = text(formData, "id", 40);
  if (!id) return { error: "Falta el producto." };

  const parsed = parseProduct(formData);
  if ("error" in parsed) return parsed;

  const existing = await prisma.product.findFirst({ where: { id, tenantId: tenant.id } });
  if (!existing) return { error: "Ese producto no existe." };

  try {
    await prisma.product.update({
      where: { id },
      data: {
        name: parsed.input.name,
        description: parsed.input.description,
        barcode: parsed.input.barcode,
        unit: parsed.input.unit,
        price: parsed.input.price,
        minStock: parsed.input.minStock,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return { error: "Ya hay otro producto con ese código de barras." };
    }
    console.error("[updateProduct]", error);
    return { error: "No se pudo guardar el producto." };
  }

  revalidatePath("/stock");
  revalidatePath(`/stock/${id}`);
  redirect("/stock?ok=editado");
}

/** Ajuste manual de stock: agrega, quita o fija la cantidad. */
export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return { error: "No hay comercio configurado." };

  const id = text(formData, "productId", 40);
  const mode = text(formData, "mode", 10);
  const quantity = parseAmount(text(formData, "quantity", 20));
  const note = text(formData, "note", 120) || null;

  if (!id) return { error: "Falta el producto." };
  if (!["ADD", "REMOVE", "SET"].includes(mode)) return { error: "Operación inválida." };
  if (quantity === null || quantity <= 0) return { error: "Poné una cantidad mayor a cero." };
  if (quantity > 999_999) return { error: "Esa cantidad es demasiado grande." };

  const product = await prisma.product.findFirst({ where: { id, tenantId: tenant.id } });
  if (!product) return { error: "Ese producto no existe." };

  const current = Number(product.stock);
  const next =
    mode === "ADD" ? current + quantity : mode === "REMOVE" ? current - quantity : quantity;

  if (next < 0) {
    return { error: `No podés quitar ${quantity}. Hay ${current} en stock.` };
  }

  const delta = next - current;
  if (Math.abs(delta) < 0.0005) return { ok: true };

  const user = await currentUserForTenant(tenant.id);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { stock: next.toFixed(3) },
    });
    await tx.stockMovement.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        delta: delta.toFixed(3),
        reason: mode === "SET" ? "ADJUSTMENT" : "MANUAL",
        note,
        userId: user?.id ?? "system",
      },
    });
  });

  revalidatePath("/stock");
  revalidatePath(`/stock/${id}`);
  return { ok: true };
}

/** Baja lógica: deja de aparecer en el POS sin borrar el historial. */
export async function toggleProductActive(formData: FormData): Promise<void> {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return;

  const id = text(formData, "productId", 40);
  const active = text(formData, "active", 5) === "true";

  const product = await prisma.product.findFirst({ where: { id, tenantId: tenant.id } });
  if (!product) return;

  await prisma.product.update({ where: { id }, data: { active } });

  revalidatePath("/stock");
  revalidatePath(`/stock/${id}`);
  redirect("/stock?ok=estado");
}
