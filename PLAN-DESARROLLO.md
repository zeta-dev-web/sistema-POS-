# Plan de Desarrollo — POS & Gestor de Almacén (ZetaDev)

> Documento de trabajo interno. Base: `presupuesto rodrigo.html` (30/10/2026).
> Stack: **Next.js (App Router) + TypeScript + Prisma + PostgreSQL**, monolito, un solo deploy.
> Foco: **Mercado Pago / aviso automático de acreditación** + **operación sin internet**.

> **Estado al 10/11/2026 — corte vertical implementado.**
> La transferencia con confirmación manual pasó a ser el **flujo principal**, no el plan B: el
> cliente es una persona mayor y no va a generar un QR por venta (además de la comisión de MP).
> Ya funciona: catálogo, carrito con pesables, efectivo con vuelto, transferencia con auditoría
> de quién confirmó y cuándo, ticket imprimible y cola offline con reintento idempotente.
> Detalle de uso y setup en `README.md`. Lo de abajo sigue vigente como plan de las fases que
> faltan (auth, QR + webhook, conciliación nocturna, PWA).

> **Estado al 11/11/2026 — stock y caja.**
> Se adelantó parte de las Fases 2 y 5: alta/edición de productos con precio, descripción, código
> de barras y stock mínimo; ajustes de stock (agregar, quitar, editar) e historial; apertura automática del turno
> con la primera venta; cierre manual desde `/reportes` con totales congelados; y reporte de ventas
> con filtros por fecha y medio de pago. La decisión de cierre manual está explicada en el README:
> el sistema no puede saber cuál es la última venta del día.
> Sigue pendiente de la Fase 5 solo la conciliación contra el extracto de MP (batch).

---

## 1. Veredicto rápido

| Pregunta | Respuesta |
|---|---|
| ¿Next.js sirve para esto? | Sí. El webhook es un Route Handler más. |
| ¿MP avisa cuando entra una transferencia? | **Depende del tipo de transferencia.** Ver §2. Hay una API que las ve, pero no en tiempo real. |
| ¿"QR Fijo" del presupuesto funciona? | Con **QR híbrido**, sí. Con transferencia a CVU, solo con confirmación manual. |
| ¿Hay que cambiar el stack? | No. |
| ¿Offline? | Sí, con PWA + IndexedDB. Suma ~5 días. Ver §7. |

---

## 2. El punto crítico: hay dos "transferencias" distintas

Esta es la confusión que hay que despejar con el cliente, porque define todo el proyecto.

### Transferencia tipo A — por QR de Mercado Pago

El cliente escanea el QR del almacén con la app de MP (o cualquier billetera, vía QR interoperable). **Ese pago se procesa como una `order` de Mercado Pago.**

- Hay webhook (`topic: orders`) → **aviso en segundos**. ✅
- Trae monto y `external_reference` → **se sabe exactamente qué venta es**. ✅

### Transferencia tipo B — bancaria al CVU/alias

El cliente abre *su* home banking y transfiere al CVU o alias del almacén.

- **No hay webhook.** No existe tópico de "transferencia entrante". ✅ (verificado en la referencia de la API: no hay endpoint de movimientos de cuenta)
- Pero **sí existe una API que las lista**: el *Reporte de Todas las Transacciones* (`/v1/account/settlement_report`). Es un extracto de cuenta en CSV que incluye "los ingresos de dinero" además de pagos, contracargos y devoluciones.

### Lo que investigué, en concreto

| Endpoint | Qué hace | Tiempo real |
|---|---|---|
| `POST /v1/account/settlement_report` | Genera un extracto para un rango de fechas. Devuelve `202 Accepted`; se genera **asíncronamente**. | ❌ |
| `GET /v1/account/settlement_report/list` | Lista los reportes generados (con `file_name`) | ❌ |
| `GET /v1/account/settlement_report/:file_name` | Descarga el CSV | ❌ |
| `POST /v1/account/settlement_report/config` | Configura columnas, prefijo, zona horaria, SFTP, y la frecuencia (**diaria / semanal / mensual**) | ❌ |
| `POST .../config/enable-automatic-generation` | Programa la generación automática | ❌ |
| webhook del reporte | **Avisa cuando el archivo está listo**, no cuando llega la plata. Firma BCrypt. | ❌ |

**Conclusión:** la API existe y sirve, pero es **conciliación por lote, no notificación por evento**. La latencia real es de minutos a horas (o al día siguiente, si programás el reporte diario). Con eso no podés liberar mercadería en el mostrador.

Y hay un detalle que rompe cualquier ilusión de automatismo perfecto: **el CSV no trae ninguna referencia tuya**. Una transferencia al CVU no sabe de qué venta es. El cruce solo se puede hacer por **monto + ventana de tiempo**, y es ambiguo si hay dos ventas del mismo monto.

### La solución: dos capas, no una

```
CAPA 1 — Al instante (mostrador)
  QR híbrido → webhook → alerta sonora → venta cobrada
  (cubre "transferencia tipo A", que es el 90% de los casos)

CAPA 2 — Al día siguiente (auditoría)
  Transferencia al CVU → el cajero confirma a mano
  → cron nocturno baja el extracto → cruza por monto+hora
  → marca OK / diferencias / huérfanas para revisar
  (cubre "transferencia tipo B" sin depender de que el cajero acierte)
```

Esto es lo mejor de los dos mundos: **cero comisión** cuando el cliente transfiere al CVU, **aviso instantáneo** cuando paga por QR, y **control** en ambos casos. El cajero confirma rápido; el sistema audita después y avisa si algo no cierra.

### ¿Y una pestaña con la web de Mercado Pago al lado?

Evaluado y descartado como solución. Verificado: la CSP de `mercadopago.com.ar` tiene `frame-ancestors 'self'` + dominios propios, así que **no se puede embeber dentro del POS**. Sería una ventana suelta, fuera de la app.

Motivos para no proponerlo:

| Problema | Consecuencia |
|---|---|
| Sesión del comerciante abierta en la PC del mostrador | Cualquier empleado puede ver saldo, retirar o transferir. Riesgo real con personal rotativo. |
| Expiración de sesión + 2FA por SMS | Si expira, el cajero no lo nota. Peor que no tenerlo. |
| No vincula pago con venta | El cajero sigue teniendo que decidir a mano. |
| Sin alerta sonora integrada | Requiere mirar dos pantallas. |
| Cero registro en la base | Sin auditoría ni conciliación. |

**Alternativa superior y gratuita:** la app de Mercado Pago en un celular en el mostrador. Push real, biometría, sin exponer credenciales.

**Mejora que sí vamos a construir:** cuando el cajero elige "transferencia", el POS muestra un banner con **el monto exacto a esperar** y el botón de confirmación. Se compara contra una cifra, no contra una lista — reduce el error de confirmar una transferencia equivocada, que es el accidente caro de este modelo. ~1 día.

### Acción sobre el presupuesto

Reescribir el Módulo 2:

> **Módulo 2: Cobro y Alerta Mercado Pago**
> - **QR de cobro dinámico:** cada venta genera un QR con el monto exacto.
> - **Alerta en Pantalla:** cartel automático + aviso sonoro al acreditarse el pago por QR.
> - **Modo híbrido:** compatible con el QR fijo impreso de la caja.
> - **Transferencia manual:** botón de confirmación con registro del comprobante, para cobros por CVU/alias sin comisión.
> - **Conciliación automática:** cruce nocturno contra el extracto de Mercado Pago, con reporte de diferencias.

Así no prometés algo que MP no entrega, y sumás una funcionalidad que el cliente valora (control de caja) sin costo extra de comisión.

---

## 3. Flujo del QR dinámico (lo que sí es instantáneo)

```
Cajero arma la venta  →  POST /v1/orders (type: qr)
                              ↓ devuelve type_response.qr_data
         Pantalla "ESPERANDO PAGO" renderiza el QR
                              ↓ cliente escanea y paga
         MP → POST /api/webhooks/mp?tenant=xxx
                              ↓ validar, responder 200 en <22 s
         GET /v1/orders/{id}  ← fuente de verdad
                              ↓ external_reference = id de la venta
         UPDATE venta → PAID + alerta sonora
```

Datos duros de la documentación:

- `POST https://api.mercadopago.com/v1/orders`
- Header **obligatorio**: `X-Idempotency-Key`
- `external_reference` obligatorio, máx. 64 caracteres → el ID de la venta
- La respuesta trae `type_response.qr_data` (el string que se convierte en imagen)
- `expiration_time` (ej. `"PT16M"`) → **el QR vence**, la pantalla tiene que manejarlo
- El tópico es **`orders`**, no `payment`

### Dos limitaciones asumidas

1. **Las notificaciones de QR no se validan con firma HMAC.** Lo dice la doc de MP textualmente. No es un problema: igual vas a re-consultar la order con tu access token. El webhook es la campanita; la verdad la trae la API.
2. **En QR, la config de notificaciones es por orden** (`notification_url` en el body). El panel de Tus Integraciones no aplica.

---

## 4. ¿Funciona bien con Next.js?

Sí. Condiciones concretas:

| # | Regla | Por qué |
|---|---|---|
| 1 | `app/api/webhooks/mp/route.ts` | Único lugar con body crudo y headers. |
| 2 | `export const runtime = "nodejs"` | Necesitás `crypto` y el driver de Postgres. |
| 3 | **Excluir la ruta del middleware de auth** | Si redirige a `/login`, MP recibe 307 y reintenta para siempre. El error clásico. |
| 4 | Responder `200` **siempre** | MP espera 22 s y reintenta cada 15 min. Un 500 tuyo = reintentos infinitos. |
| 5 | Procesar después de responder | `after()` de `next/server`. |
| 6 | Idempotencia en DB | MP manda el mismo evento varias veces. |
| 7 | Nunca confiar en el body | Solo trae `data.id`. Monto y estado vienen de la API. |
| 8 | HTTPS público | En dev: `cloudflared tunnel --url http://localhost:3000`. |
| 9 | Sin caché | `export const dynamic = "force-dynamic"`. |

**VPS vs Vercel:** el presupuesto ya incluye VPS y conviene. `next start` detrás de Caddy da proceso persistente (útil para SSE y para el cron de conciliación), logs completos y costo fijo.

---

## 5. Arquitectura

```
┌──────────────────────────────────────────────────┐
│  Caddy (SSL automático)                          │
└───────────────────┬──────────────────────────────┘
                    │
        ┌───────────▼────────────┐
        │  Next.js (Node)        │  ← monolito, 1 proceso
        │  ├─ App Router (UI)    │
        │  ├─ Server Actions     │
        │  ├─ /api/webhooks/mp   │
        │  └─ cron (node-cron)   │  ← conciliación nocturna
        └───────┬────────┬───────┘
                │        │
     ┌──────────▼──┐  ┌──▼──────────────────┐
     │ Postgres    │  │ Mercado Pago API    │
     │ (managed)   │  │ (+ reportes CSV)    │
     └─────────────┘  └─────────────────────┘
```

**DB:** Postgres administrado (Neon / Supabase), no en el mismo VPS. El presupuesto promete backups; si la DB vive en el mismo disco, un VPS muerto se lleva app y backups juntos.

**Multi-tenant:** `tenantId` en todas las tablas desde el día 1. No schema-per-tenant.

**Credenciales MP:** una cuenta por tenant. Aunque arranques con una sola, dejá `mpAccessToken` / `mpUserId` / `mpMode` en `Tenant` desde el principio.

---

## 6. Modelo de datos (Prisma, borrador)

```prisma
model Tenant {
  id            String   @id @default(cuid())
  name          String
  cuit          String?
  mpUserId      String?
  mpAccessToken String?          // cifrado en reposo (AES-GCM)
  mpMode        String   @default("sandbox")
  createdAt     DateTime @default(now())

  users    User[]
  products Product[]
  sales    Sale[]
}

model User {
  id           String  @id @default(cuid())
  tenantId     String
  tenant       Tenant  @relation(fields: [tenantId], references: [id])
  email        String
  passwordHash String
  role         Role    @default(CASHIER)
  active       Boolean @default(true)

  @@unique([tenantId, email])
}

enum Role { OWNER CASHIER }

model Product {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  sku       String?
  barcode   String?
  name      String
  unit      Unit     @default(UNIT)   // UNIT | KG
  price     Decimal  @db.Decimal(12, 2)
  stock     Decimal  @db.Decimal(12, 3) @default(0)
  minStock  Decimal  @db.Decimal(12, 3) @default(0)
  active    Boolean  @default(true)
  updatedAt DateTime @updatedAt      // cursor para sync offline

  @@unique([tenantId, barcode])
  @@index([tenantId, name])
  @@index([tenantId, updatedAt])
}

enum Unit { UNIT KG }

model Sale {
  id            String        @id @default(cuid())
  clientId      String?       @unique  // UUID generado offline → idempotencia al sincronizar
  tenantId      String
  tenant        Tenant        @relation(fields: [tenantId], references: [id])
  userId        String
  number        Int?
  status        SaleStatus    @default(OPEN)
  paymentMethod PaymentMethod @default(CASH)
  subtotal      Decimal       @db.Decimal(12, 2)
  discount      Decimal       @db.Decimal(12, 2) @default(0)
  total         Decimal       @db.Decimal(12, 2)
  paidAt        DateTime?
  createdAt     DateTime      @default(now())
  syncedAt      DateTime?     // null = creada offline, pendiente

  items   SaleItem[]
  mpOrder MpOrder?

  @@unique([tenantId, number])
  @@index([tenantId, createdAt])
  @@index([tenantId, status, paymentMethod])
}

enum SaleStatus    { OPEN PAID CANCELLED }
enum PaymentMethod { CASH TRANSFER MP_QR CARD }

model SaleItem {
  id          String  @id @default(cuid())
  saleId      String
  sale        Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  productId   String?
  description String          // snapshot
  quantity    Decimal @db.Decimal(12, 3)
  unitPrice   Decimal @db.Decimal(12, 2)  // snapshot del precio
  total       Decimal @db.Decimal(12, 2)
}

model MpOrder {
  id                String   @id @default(cuid())
  saleId            String   @unique
  sale              Sale     @relation(fields: [saleId], references: [id])
  mpOrderId         String   @unique
  externalReference String
  amount            Decimal  @db.Decimal(12, 2)
  status            String
  qrData            String   @db.Text
  expiresAt         DateTime?
  createdAt         DateTime @default(now())
}

model MpEvent {
  id          String    @id @default(cuid())
  eventId     String    @unique
  topic       String
  action      String?
  resourceId  String
  payload     Json
  processedAt DateTime?
  error       String?
  receivedAt  DateTime  @default(now())
}

// Resultado del cruce nocturno contra el extracto de MP
model Conciliacion {
  id          String   @id @default(cuid())
  tenantId    String
  fecha       DateTime @db.Date
  archivo     String
  estado      String   // OK | DIFERENCIA | HUERFANA
  saleId      String?
  monto       Decimal  @db.Decimal(12, 2)
  detalle     String?
  createdAt   DateTime @default(now())

  @@index([tenantId, fecha])
}

model StockMovement {
  id        String   @id @default(cuid())
  tenantId  String
  productId String
  delta     Decimal  @db.Decimal(12, 3)
  reason    String   // SALE | MANUAL | ADJUSTMENT
  saleId    String?
  userId    String
  createdAt DateTime @default(now())

  @@index([tenantId, productId, createdAt])
}
```

**Plata:** `Decimal(12,2)` → `numeric` de Postgres. Nunca `Float`: en un POS los redondeos rompen el cierre de caja. Cantidades pesables: `Decimal(12,3)`.

**Diferencias con lo implementado:** al modelo real se le sumaron `Product.description`, `StockMovement.note` y el motivo `ALTA` del alta de producto, y existe `CashSession` (turno con `OPEN`/`CLOSED`, totales congelados al cerrar) con `Sale.sessionId`.

**Stock:** dentro de la misma transacción, con guarda optimista:

```ts
await prisma.$transaction(async (tx) => {
  const updated = await tx.product.updateMany({
    where: { id, stock: { gte: qty } },
    data: { stock: { decrement: qty } },
  });
  if (updated.count === 0) throw new Error("STOCK_INSUFICIENTE");
  // ...crear Sale + SaleItem
});
```

Para **pesables** conviene permitir vender sin stock suficiente (el almacén no siempre pesa antes de cargar). A validar con el cliente.

---

## 7. Modo offline (PWA)

El almacén necesita vender aunque se caiga internet. Esto cambia el diseño del POS, así que va desde el principio y no como parche.

### Estrategia

**PWA con mirror local del catálogo + outbox de ventas.**

```
navegador                          servidor
┌──────────────────────┐          ┌──────────────┐
│ IndexedDB (Dexie)    │          │  Postgres    │
│  ├─ products (espejo)│◄─────────│              │
│  └─ outbox (ventas)  │─────────►│  idempotente │
└──────────────────────┘          └──────────────┘
        │
   el POS lee SIEMPRE de acá
```

- El POS **lee del IndexedDB, no del server**. Con o sin internet, la pantalla responde igual.
- Cada venta offline recibe un **UUID en el cliente** (`clientId`). Ese UUID es la clave de idempotencia al sincronizar: si el POST se reintenta, el server no duplica.
- Cola de salida (`outbox`) con reintentos y backoff.
- Sync de catálogo por **delta**: `GET /api/catalog/sync?since=<updatedAt>` — no bajar todo cada vez.
- Las ventas offline salen con `syncedAt: null` y un badge visible en el listado ("pendiente de sincronizar").
- **MP QR requiere internet**: si no hay conexión, el botón se deshabilita con un mensaje claro. Efectivo y transferencia manual siguen funcionando.

### Decisiones de conflicto (importantes)

- **Precio:** si el precio cambió mientras el POS estaba offline, se respeta **el precio del momento de la venta** (snapshot). El server lo registra tal cual. Es lo correcto: el cliente ya se fue con ese precio.
- **Stock:** puede quedar negativo al sincronizar. No se bloquea — se registra y se muestra en un reporte de "ventas offline con descuento pendiente". Bloquear una venta ya cobrada sería peor.
- **Numeración de ventas:** el número definitivo se asigna en el server al sincronizar. Offline se muestra un número provisorio.

### Servicio worker

Serwist (el sucesor de next-pwa para App Router). Precarga el shell del POS y la pantalla de cobro. El catálogo no va por service worker: va por IndexedDB, para poder consultarlo y filtrarlo.

### Detección de conexión

No confiar solo en `navigator.onLine` (miente). Usar `navigator.onLine` **+** un ping real cada 20 s al server, y **+** el resultado de los POST fallidos. Los tres desacuerdan seguido.

**Estimación: 5 días** (2 PWA/shell, 2 offline/outbox/sync, 1 conflictos y UX de estados).

---

## 8. Webhook + conciliación (código de referencia)

### Webhook

```ts
// app/api/webhooks/mp/route.ts
import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/db";
import { fetchMpOrder } from "@/lib/mercadopago";
import { notifyPos } from "@/lib/pos-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();
    const tenant = req.nextUrl.searchParams.get("tenant");
    const resourceId = String(event?.data?.id ?? "");
    if (!event?.type || !resourceId) return ok();

    // 1. Dedupe
    const seen = await prisma.mpEvent.findUnique({ where: { eventId: String(event.id) } });
    if (seen?.processedAt) return ok();

    await prisma.mpEvent.upsert({
      where: { eventId: String(event.id) },
      create: {
        eventId: String(event.id),
        topic: event.type,
        action: event.action ?? null,
        resourceId,
        payload: event,
      },
      update: {},
    });

    // 2. Procesar fuera del ciclo de respuesta
    after(async () => {
      try {
        if (event.type !== "orders") return;
        const order = await fetchMpOrder(resourceId);
        if (order.status !== "processed") return;

        const sale = await prisma.sale.findFirst({
          where: { tenantId: tenant!, status: "OPEN", mpOrder: { mpOrderId: order.id } },
        });
        if (!sale) return;   // webhook huérfano o trucho

        await prisma.$transaction([
          prisma.sale.update({
            where: { id: sale.id },
            data: { status: "PAID", paidAt: new Date(), paymentMethod: "MP_QR" },
          }),
          prisma.mpOrder.update({
            where: { saleId: sale.id },
            data: { status: order.status },
          }),
          prisma.mpEvent.update({
            where: { eventId: String(event.id) },
            data: { processedAt: new Date() },
          }),
        ]);

        notifyPos(tenant!, { type: "PAYMENT_OK", saleId: sale.id, amount: order.total_amount });
      } catch (e) {
        await prisma.mpEvent.update({
          where: { eventId: String(event.id) },
          data: { error: String(e) },
        });
      }
    });

    return ok();
  } catch {
    return ok();   // SIEMPRE 200. Un 500 acá = reintentos infinitos.
  }
}

const ok = () => Response.json({ received: true }, { status: 200 });
```

### Cliente MP (sin SDK: es más simple que pelearse con el paquete oficial)

```ts
// lib/mercadopago.ts
const BASE = "https://api.mercadopago.com";

export async function createQrOrder(input: {
  token: string;
  totalAmount: string;          // "1500.00"
  externalReference: string;
  posId: string;
  notificationUrl: string;
  mode?: "static" | "dynamic" | "hybrid";
}) {
  const res = await fetch(`${BASE}/v1/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),   // obligatorio
    },
    body: JSON.stringify({
      type: "qr",
      total_amount: input.totalAmount,
      description: `Venta ${input.externalReference}`,
      external_reference: input.externalReference,
      expiration_time: "PT16M",
      config: { qr: { external_pos_id: input.posId, mode: input.mode ?? "hybrid" } },
      transactions: { payments: [{ amount: input.totalAmount }] },
      notification_url: input.notificationUrl,
    }),
  });
  if (!res.ok) throw new Error(`MP ${res.status}: ${await res.text()}`);
  return res.json();   // → type_response.qr_data
}

export async function fetchMpOrder(id: string, token: string) {
  const res = await fetch(`${BASE}/v1/orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MP ${res.status}`);
  return res.json();
}
```

### Conciliación nocturna (la parte nueva)

```ts
// jobs/conciliacion.ts — cron diario 06:00 America/Argentina/Buenos_Aires
const BASE = "https://api.mercadopago.com";

export async function conciliar(tenantId: string, fecha: Date) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const begin = startOfDayAR(fecha);
  const end   = endOfDayAR(fecha);

  // 1. Pedir el extracto (asíncrono → 202)
  await fetch(`${BASE}/v1/account/settlement_report`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t.mpAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      begin_date: begin.toISOString(),
      end_date: end.toISOString(),
    }),
  });

  // 2. Polling al list hasta que aparezca el archivo (minutos)
  const file = await esperarReporte(t.mpAccessToken, begin, end);

  // 3. Descargar CSV
  const csv = await (await fetch(
    `${BASE}/v1/account/settlement_report/${file}`,
    { headers: { Authorization: `Bearer ${t.mpAccessToken}` } },
  )).text();

  // 4. Cruzar: transferencias entrantes vs. ventas TRANSFER confirmadas a mano
  const movimientos = parseCsv(csv).filter(esTransferenciaEntrante);
  const ventas = await prisma.sale.findMany({
    where: {
      tenantId,
      paymentMethod: "TRANSFER",
      paidAt: { gte: begin, lte: end },
    },
  });

  for (const mov of movimientos) {
    const candidatas = ventas.filter(
      (v) => v.total.equals(mov.monto) && Math.abs(+v.paidAt! - +mov.fecha) < 30 * 60_000,
    );
    // 0 candidatas → HUERFANA (entró plata sin venta: revisar)
    // 1 candidata  → OK
    // 2+           → DIFERENCIA (ambiguo, revisar a mano)
  }
}
```

> **Ojo con los enums exactos.** El valor concreto de `TRANSACTION_TYPE` / `PAYMENT_METHOD_TYPE` para transferencias entrantes hay que confirmarlo contra el [glosario del reporte](https://www.mercadopago.com.ar/developers/es/docs/additional-content/reports/account-money/glossary) con el CSV real en la Fase 0. No lo doy por cerrado sin ver un archivo de verdad.

**Estimación de la conciliación: 3 días.**

---

## 9. Tiempo real en el POS

**Polling (v1).** `GET /api/sales/:id/status` cada 3 s con SWR. Pocas líneas, cero infraestructura, sobrevive a webhooks tardíos. Para un almacén es imperceptible.

**SSE (si lo piden).** `EventSource` a `/api/sales/stream`. Instantáneo, pero requiere proceso persistente y manejo de reconexión. Con una sola instancia, un `EventEmitter` en memoria alcanza.

**Plan:** polling + chequeo de respaldo cada 15 s contra la API de MP. Si quieren "instantáneo de verdad", se pasa a SSE en una tarde.

El **aviso sonoro** no depende del transporte: overlay full-screen + `<audio>`. Ojo con el autoplay del navegador: el audio tiene que inicializarse con un gesto previo (el click de "cobrar" sirve).

---

## 10. Plan por fases

Días de desarrollo, un dev full-time.

### Fase 0 — Definiciones y spike · 3 días
- **Bloqueante:** definir qué es "transferencia" para el cliente (§2).
- App en *Tus Integraciones*, cuenta de prueba, caja (`external_pos_id`).
- Vía MCP: `create_application` (`product: qr_code`, `payment_solution: in_person_payments`) + `get_credentials` + `create_test_user` (MLA, seller).
- **Spike de punta a punta:** crear order en sandbox → `cloudflared` → recibir el webhook real → ver el JSON.
- **Spike del reporte:** generar un extracto, descargarlo, confirmar los enums de transferencia entrante.
- **Resolver la duda de `save_webhook`:** la doc dice que QR no se configura desde el panel (§3). Verificar si la tool aplica o si hay que ir por `notification_url`.
- Verificar que el cliente tenga cuenta MP de vendedor habilitada para cobrar con QR.

**Entregable:** QR funcionando + webhook imprimiendo JSON + CSV del extracto parseado.

### Fase 1 — Andamiaje · 3 días
- Next + TS + Tailwind + Prisma + Postgres.
- Migraciones, seed de tenant + usuario.
- Auth con roles.
- Deploy a VPS + Caddy + SSL (**ahora, no después**: el webhook necesita HTTPS público).

### Fase 2 — Catálogo y stock · 5 días
- CRUD de productos, búsqueda, código de barras, UNIT/KG. ✅
- Edición rápida de precios. ✅
- Movimientos de stock. ✅
- Endpoint de sync por delta (`?since=`), que es la base del offline. ⛔

### Fase 3 — POS + offline · 15 días
- Buscador mixto (escanea código o tipea nombre).
- Carrito, cantidades decimales, totales.
- Efectivo con calculadora de vuelto.
- Venta + stock en transacción atómica.
- Botones gigantes, alto contraste, tipografía grande.
- **PWA + IndexedDB:** espejo de catálogo, POS leyendo local.
- **Outbox + sync** con UUID de cliente e idempotencia.
- **Estados de conexión** visibles y badge de ventas pendientes.
- Anulación con reingreso de stock.

### Fase 4 — Mercado Pago · 8 días
- Cliente API + creación de order QR (híbrido).
- Pantalla "esperando pago" con QR + countdown de expiración.
- Webhook + idempotencia + reconciliación.
- Alerta visual y sonora.
- Botón de transferencia manual con comprobante.
- Testing con el panel de notificaciones de MP (permite reenviar y simular eventos).

### Fase 5 — Conciliación y cierre de caja · 6 días
- Cron nocturno + descarga y parseo del extracto. ⛔
- Cruce por monto + ventana horaria, con estados OK / DIFERENCIA / HUERFANA. ⛔
- Pantalla de revisión de diferencias. ⛔
- Cierre por turno/día: totales por medio de pago. ✅ (cierre manual, totales congelados)
- Listado de ventas con filtros y export CSV. ✅ filtros; ⛔ export CSV

### Fase 6 — QA, capacitación, producción · 5 días
- Credenciales productivas, prueba con monto real chico.
- **Prueba de corte de internet** en el local, con el cliente operando.
- Un día completo de operación acompañada.
- Backup automático **verificado** (restaurar en un entorno de prueba, no solo "está configurado").
- Manual de una página + capacitación.

**Total: ~45 días → 8 a 10 semanas.** Offline (+5) y conciliación (+3) son los dos agregados que no estaban en el presupuesto original.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cliente espera aviso instantáneo de transferencias al CVU | **Alto** | Resolver en Fase 0. El extracto existe pero es batch. Ofrecer el esquema de dos capas. |
| Conciliación ambigua (dos ventas del mismo monto) | Medio | Marcar como DIFERENCIA para revisión manual. Nunca adivinar. |
| Webhook sin firma HMAC en QR | Bajo | Re-consultar la API + matchear `external_reference`. Ya está en el diseño. |
| Webhook perdido o tardío | Medio | Polling de respaldo + panel de reintentos de MP + botón manual. |
| **Corte de internet en el local** | **Alto** | PWA + outbox (Fase 3). Es requisito confirmado. |
| Stock negativo por sync offline | Medio | Permitir, registrar, reportar. No bloquear ventas ya cobradas. |
| Precio desactualizado offline | Bajo | Snapshot del precio al momento de la venta. Es lo correcto. |
| Comisión MP no prevista en el margen | Medio | Explicitarla en la propuesta. |
| Credenciales MP en la DB | Alto | Cifrado AES-GCM con clave en env. Nunca en logs. |
| Zona horaria en fechas y cortes | Medio | `America/Argentina/Buenos_Aires` en Postgres y en los cortes de caja. El reporte de MP usa `GMT-04` por defecto: configurarlo explícito. |

---

## 12. Decisiones abiertas

1. **¿Qué significa "transferencia" para el cliente?** ¿Escanea un QR (tipo A) o transfiere al CVU desde el home banking (tipo B)? Probablemente las dos. El diseño de dos capas cubre ambas, pero hay que confirmarlo.
2. **¿Acepta la comisión de MP cuando paga por QR?** Si dice que no a todo, queda solo la capa 2.
3. **¿Una cuenta MP o una por cliente?** Si es SaaS a futuro, diseñar OAuth desde el modelo (ya previsto) aunque la v1 use una sola cuenta.
4. **¿Venta sin stock permitido?** Especialmente pesables.
5. **¿Se imprimen tickets?** El presupuesto dice "sin impresión obligatoria", pero si después lo piden, cambia el hardware.

---

## 13. Nota sobre el presupuesto

- **El alcance creció.** Offline (+5 días) y conciliación automática (+3) no estaban. O se suman al precio, o se sacan del alcance explícitamente.
- **$110.000/mes sin inversión inicial** para un POS con integración de pagos, hosting, backups, soporte y ahora offline es un abono bajo para 8–10 semanas de trabajo. Vale definir si es "primer cliente / caso de referencia" (y entonces está bien) o si se va a replicar como SaaS (y entonces el precio debería subir o pasar a alta inicial + abono).
- **La línea de "QR Fijo" del Módulo 2** sigue siendo la única que no se puede cumplir tal cual. Con el texto propuesto en §2 queda correcta.

---

## Anexo — Tooling: Mercado Pago MCP Server

Configurado global en `~/.config/opencode/opencode.jsonc`:

```jsonc
"mercadopago": {
  "type": "remote",
  "url": "https://mcp.mercadopago.com/mcp",
  "enabled": true
}
```

Endpoint oficial, autenticación OAuth (elegir país: Argentina). Se activa con `/mcps`.

| Tool | Dónde se usa |
|---|---|
| `create_application` | Fase 0 — app con `product: qr_code` |
| `get_credentials` | Fase 0 — Access Token / Public Key |
| `create_test_user` | Fase 0 — vendedor MLA con saldo |
| `add_money_test_user` | Fase 4 — recargar saldo de prueba |
| `search-documentation` | Fase 0/4 — doc con grounding |
| `quality_checklist` | Fase 1 — checklist previo a codear |
| `notifications_history_diagnostics` | Fase 4/6 — diagnosticar entregas de webhook |
| `quality_evaluation` | Fase 6 — score con `order_id` productivo |
| `save_webhook` | ⚠️ probablemente no aplica a QR (§3) |

**Limitación:** ninguna tool consulta transferencias entrantes al CVU. Confirma que para "transferencia tipo B" la única vía sigue siendo el reporte batch (§2).
