import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DATABASE_URL para el seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    enableChannelBinding: true,
  }),
});

const TENANT_ID = "tenant_almacen";

const users = [
  {
    email: "administrador@almacen.local",
    name: "Administrador",
    role: "OWNER" as const,
  },
  {
    email: "vendedor@almacen.local",
    name: "Vendedor",
    role: "CASHIER" as const,
  },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { name: "ALMACEN" },
    create: {
      id: TENANT_ID,
      name: "ALMACEN",
    },
  });

  for (const user of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: user.email } },
      update: {
        name: user.name,
        role: user.role,
        active: true,
      },
      create: {
        tenantId: tenant.id,
        ...user,
      },
    });
  }

  console.log(`Seed listo: ${tenant.name}, 1 administrador, 1 vendedor y sin productos.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
