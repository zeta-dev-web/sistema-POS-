# Almacén · Caja

POS y control de stock para un almacén de barrio. Next.js (App Router) + Prisma + PostgreSQL, monolito.

La decisión central de este corte: **el cobro por transferencia se confirma a mano cuando el cajero ve el comprobante**. No hay QR por venta ni webhook de acreditación; el cliente es una persona mayor y no va a generar un QR en cada cobro. La transferencia al CVU/alias no tiene comisión y encaja con cómo trabaja hoy.

## Estado

| Pieza | Estado |
|---|---|
| Catálogo con búsqueda y código de barras | ✅ |
| Alta y edición de productos (precio, descripción, código, stock mínimo) | ✅ |
| Ajustes de stock (agregar / quitar / editar) e historial | ✅ |
| Carrito con productos por unidad y por kilo | ✅ |
| Cobro en efectivo con cálculo de vuelto | ✅ |
| Cobro por transferencia con confirmación manual y auditoría | ✅ |
| Comprobante en pantalla + impresión | ✅ |
| Cola offline (localStorage) con reintento automático | ✅ |
| PWA instalable + pantalla de cobro guardada para abrir sin internet | ✅ |
| Hora real del cobro guardada (se asienta bien al reconectar) | ✅ |
| Botón de sincronización con detalle de ventas pendientes | ✅ |
| Caja: apertura automática con la primera venta, cierre manual | ✅ |
| Reporte de ventas con filtros por fecha y medio de pago | ✅ |
| Login / roles / permisos | ⛔ pendiente |
| QR dinámico de Mercado Pago + webhook | ⛔ pendiente (Fase 4) |
| Conciliación nocturna contra el extracto de MP | ⛔ pendiente (Fase 5) |

## Cómo levantarlo

Requiere Node 22+ y una base PostgreSQL accesible, por ejemplo Neon.

```bash
# 1. Dependencias y variables de entorno
pnpm install
Copy-Item .env.example .env # en PowerShell
# Editá .env con la URL de conexión de Neon; no la subas al repositorio.

# 2. Tablas y datos de ejemplo
pnpm db:push
pnpm db:seed

# 3. A correr
pnpm dev
```

Si el puerto 3000 está ocupado, Next elige otro y lo imprime en consola.

## El flujo de transferencia

```
Productos → COBRAR → TRANSFERENCIA
                            ↓
        Pantalla con el MONTO EXACTO a esperar
        + alias, CVU y titular para dictarle al cliente
                            ↓
        El cajero pide el comprobante y toca:
        CONFIRMAR TRANSFERENCIA RECIBIDA
                            ↓
        Venta PAID
                            ↓
        Ticket: quién confirmó, cuándo, N° de operación
        reconciliation = PENDING (para el cruce nocturno)
```

La pantalla muestra el monto exacto, el alias y el CVU, sin botones de copiar: son datos para leerle al cliente o mostrarle, no para pegar en otro lado.

La venta guarda `transferConfirmedBy` y `transferConfirmedAt`. Hoy el confirmador es el usuario `OWNER` porque todavía no hay login; cuando entre la autenticación se usa la sesión real sin tocar el modelo.

## Mostrador (pantalla de cobro)

La home no muestra la grilla de productos: el mostrador es un buscador grande y la venta al costado, para que se lea bien lo que se escribe y lo que se cobra.

- **Buscador**: en escritorio, campo de 72 px de alto y letra de 27 px, con etiqueta visible. Busca por nombre, descripción o código de barras (sin distinguir mayúsculas ni acentos).
- **Resultados**: aparecen mientras escribís (sin apretar Buscar), hasta 6 opciones, cada una con nombre, descripción, código, precio y stock. Se eligen con el mouse, con `↑` / `↓` y `Enter`, o escaneando el código y presionando `Enter`. Al agregar, el campo se limpia y vuelve el foco para cargar el siguiente producto.
- **Sin stock**: las unidades sin stock aparecen deshabilitadas con el cartel `SIN STOCK`.
- **Efectivo**: se escribe lo que paga el cliente con el teclado numérico en pantalla o con el teclado de la computadora (números, coma, borrar, `Enter` para cobrar y `Esc` para volver). Arriba muestra el vuelto o cuánto falta.
- **Venta**: cada línea muestra el nombre grande, el detalle (`$ 1.950,00 c/u × 2` o `$ 3.200,00 por kg × 0.56 kg`), los botones de cantidad y el total de la línea. El total de la venta queda siempre visible arriba del botón `COBRAR`.
- **En el celular**: la navegación se guarda en un botón `☰` que abre un panel (se cierra con la ✕, tocando afuera o con `Esc`), la tipografía base baja de 18 a 16 px y el buscador y los botones se achican. Así la pantalla se usa casi entera para ver los productos que se van cargando al carrito.

## Stock

`/stock` lista todo con buscador (nombre, descripción o código de barras). Los resultados se filtran mientras escribís, sin botón de Buscar, y la búsqueda queda en la URL. Arriba resume cuántos productos hay, cuántos están para reponer y cuánto vale el stock a precio de venta.

- **Paginado de a 10**: el listado muestra 10 productos por página con el resumen "Mostrando 1–10 de N" y los botones `← ANTERIOR` / `SIGUIENTE →`. El filtro es instantáneo en el navegador (no vuelve a pedir la página), y la página queda en la URL (`/stock?page=2`); al escribir una búsqueda nueva se vuelve a la página 1.

- **Alta** (`/stock/nuevo`): nombre, descripción, código de barras, unidad (unidad o kilo), precio de venta, cantidad inicial y stock mínimo. La cantidad inicial no se escribe directo en el producto: genera un movimiento `ALTA` en `StockMovement`, así el historial arranca con el motivo.
- **Edición** (`/stock/[id]`): se cambian precio, descripción, código, unidad y stock mínimo. El stock **no** se edita acá a propósito: se mueve con "Ajustar stock" para que quede el movimiento registrado.
- **Ajuste**: `AGREGAR` (suma), `QUITAR` (resta) o `EDITAR` (deja la cantidad exacta que escribís). No pide motivo: el movimiento guarda la cantidad, el usuario y la fecha. Antes de guardar muestra cómo va a quedar el stock.
- **Baja lógica**: se deja de ofrecer el producto sin perder el historial de ventas ni los movimientos. Se puede reactivar.
- **Código de barras**: se guarda tal cual se escanea o se escribe (letras, números, guiones y puntos). En el POS, escribir o escanear el código y presionar Enter agrega el producto directo al carrito. Es el mismo camino que va a usar la pistola, sin cambios.
- **Campanita de alertas** (siempre en la barra superior, en todas las vistas): muestra cuántos productos activos están en el mínimo o por debajo. Se actualiza al entrar, cada minuto y al volver a la pestaña. Al tocarla se abre la lista con el stock actual y el mínimo de cada uno, ordenada por cuánto falta; cada producto lleva a su ficha para ajustar. Si no hay ninguno, avisa que todo está por encima del mínimo.
- **Barra superior del POS**: en pantallas chicas muestra lo esencial (conexión y campanita) y va sumando el botón de sincronizar (desde 768 px), "Atiende" (desde 1440 px), una fecha corta y la fecha completa a medida que hay lugar, para que la barra no cambie de alto. El menú mobile (☰) muestra siempre la fecha completa y el bloque de ventas sin enviar.

## Caja y reporte de ventas

- **Apertura automática.** La primera venta del día abre el turno (`CashSession`) dentro de la misma transacción. El ticket lo avisa: "Se abrió la caja con esta venta".
- **Hora real del cobro.** La venta guarda el momento en que se cobró (`paidAt`), no el momento en que se pudo enviar. Si se cobró sin internet y se sincroniza tres horas después, queda en el día y la hora correctos, y si esa venta abre el turno, el turno arranca con la hora del cobro. `syncedAt` guarda aparte la hora del envío.
- **Fechas absurdas.** Si el reloj del equipo manda una fecha que no se entiende, más de 5 minutos en el futuro o más de 30 días atrás, el servidor usa su propia hora en lugar de rechazar la venta.
- **Cierre manual desde `/reportes`.** No se cierra sola: el sistema no puede saber cuál fue la última venta del día (puede entrar un cliente más a las 21:59). La persona cierra cuando termina el turno y ahí se congelan `totalCash`, `totalTransfer` y `saleCount`. Si después entra otra venta, se abre un turno nuevo automáticamente.
- **Reporte** (`/reportes`): rango de fechas (por defecto hoy, con atajos Hoy / Ayer / Últimos 7 días) y filtro por medio de pago. Los totales de las tarjetas respetan el filtro. El listado se pagina de a 10 ventas (`?page=N` dentro de la URL, respetando fechas y medio de pago) con el resumen "Mostrando 1–10 de N" y `← ANTERIOR` / `SIGUIENTE →`; no hay tope de ventas, se recorre todo el rango. Cada venta muestra su turno.
- **Filtro en el celular**: desde/hasta van uno por línea a todo el ancho, el medio de pago comparte la fila con `VER` y los atajos pasan a tres botones grandes (`Hoy`, `Ayer`, `7 días`) de 48 px de alto, fáciles de tocar. En pantallas grandes los atajos bajan a su propia línea, alineados a la derecha.
- **Turnos en pantalla**: el abierto muestra totales en vivo y el botón `CERRAR CAJA` (con confirmación y el resumen antes de cerrar); los cerrados muestran totales congelados. Se listan los turnos que se solapan con el rango pedido, así un turno abierto ayer y cerrado hoy sigue apareciendo al mirar hoy.
- **Zona horaria**: los cortes y las fechas se calculan en `America/Argentina/Buenos_Aires`, no en la hora del servidor ni del navegador.

## Decisiones de implementación

- **Dinero en centavos enteros.** Se calcula con `Math.round(precio * 100)` y recién al final se pasa a `Decimal(12,2)`. Nunca `Float`.
- **El servidor recalcula todo.** El navegador manda cantidades y un total esperado; si el precio cambió, la venta se rechaza con el total nuevo. No se confía en precios del cliente.
- **Idempotencia por `clientId`.** Cada intento de cobro lleva un UUID generado en el navegador. Si se reintenta (offline, doble clic, dos pestañas), el servidor devuelve la venta existente y no duplica stock.
- **Stock dentro de la transacción**, con movimiento en `StockMovement`. Los productos por kilo no bloquean la venta si falta stock; las unidades sí.
- **Cada ajuste de stock deja rastro.** No se edita la columna `stock` desde el formulario: se crea un movimiento con `delta`, usuario y fecha. El producto muestra los últimos movimientos paginados de a 5, así la pantalla no crece con el tiempo.
- **El turno se abre solo, se cierra a mano.** Abrir es parte del cobro (no tiene sentido un botón extra antes de la primera venta); cerrar es una decisión humana al final del día. Los totales del turno cerrado quedan congelados para que un cambio posterior no reescriba el arqueo.
- **Numeración de ticket** con `Tenant.saleCounter` incrementado dentro de la misma transacción (sin `max + 1`).
- **Base 18 px, botones de 80–112 px, bordes gruesos, alto contraste.** La interfaz está pensada para usarse de pie, con poca luz y sin paciencia.
- **Kilos con punto decimal** (`0.560 kg`), porque se tipea más rápido que la coma; el dinero conserva el formato argentino (`$ 1.500,00`). El diálogo de peso acepta teclado físico: números, punto, borrar, Enter y Escape.

## Offline

El carrito y la cola de ventas viven en `localStorage`. La app, además, es una PWA: se instala y la pantalla de cobro abre sin internet.

1. Si no hay red al confirmar, la venta se guarda en `pos.outbox.v1` con la **hora real del cobro** y el ticket sale como **VENTA GUARDADA**.
2. La venta guardada se asienta con su hora, no con la hora en que se sincronizó: el día del reporte y el turno de caja quedan donde corresponde.
3. El botón `↻` de la barra superior (y el bloque del menú `☰` en el celular) muestra cuántas ventas faltan enviar, con monto, hora, medio de pago y el motivo si el servidor las rechazó.
4. Se reintenta sola al volver la conexión, al abrir cualquier pantalla, al volver a la pestaña y cada 15 segundos mientras haya pendientes. También hay `SINCRONIZAR AHORA` para forzarlo a mano.

## PWA

- **Instalable**: el manifest está en `/manifest.webmanifest` (`app/manifest.ts`) con los íconos de `public/icons/`. Desde el celular se agrega a la pantalla de inicio y abre en pantalla completa (`standalone`).
- **Service worker** (`public/sw.js`): guarda el HTML de la caja y los archivos JS/CSS que necesita, así con el servidor inalcanzable la pantalla de cobro abre igual y las ventas se encolan. No cachea datos ni acciones: todo lo que escribe va al servidor.
- **Navegación**: primero red (con 5 s de espera), después la copia guardada y, si la pantalla no estaba guardada, una página simple con `IR A COBRAR`.
- **Actualizaciones**: al desplegar, subir `VERSION` en `public/sw.js`. En la próxima visita se borra la caché vieja y se guarda todo de nuevo; si no se sube, los equipos pueden quedar con la versión anterior.
- **Íconos**: se regeneran con `node scripts/make-icons.mjs` (usa `sharp`, que ya viene con Next).
- En desarrollo el service worker no se registra (y se desregistra si había uno) para no servir HTML viejo mientras se programa.

## Estructura

```
app/
  actions/
    sales.ts          registerSale (validación + transacción + apertura de caja)
    stock.ts          createProduct, updateProduct, adjustStock, toggleProductActive
    cash.ts           closeCashSession (congela totales del turno)
  page.tsx            carga comercio y productos, monta el POS
  stock/              listado, alta y edición de productos
  reportes/           ventas por fecha y medio de pago + cierre de caja
  globals.css         tokens, botones, impresión
  manifest.ts         manifest de la PWA
components/
  app-header.tsx      navegación Cobrar / Stock / Reportes + sincronización y campanita
  pwa/
    pwa-register.tsx  registra el service worker (solo en producción)
  sync/
    sync-center.tsx   botón ↻, detalle de pendientes y bloque del menú mobile
  pos/
    pos-shell.tsx     estado del carrito, búsqueda, cobro y hora del cobro
    sheets.tsx        forma de pago, efectivo, transferencia, ticket, peso
    ui.tsx            botón, overlay, teclado numérico
  stock/              formulario de producto y ajuste de stock
  reportes/           confirmación de cierre de caja
lib/
  prisma.ts           PrismaClient con driver adapter (pg)
  money.ts            centavos, parseo y formato de cantidades
  dates.ts            hoy, rangos de día y formato en hora argentina
  outbox.ts           cola de ventas sin enviar (+ aviso de cambios)
  sync.ts             estado global, reintentos y envío de la cola
public/
  sw.js               service worker (caché de la caja y apertura offline)
  icons/              íconos de la PWA
scripts/
  make-icons.mjs      regenera los íconos PNG desde el SVG
prisma/
  schema.prisma       Tenant, User, Product, Sale, SaleItem, StockMovement, CashSession
  seed.ts             ALMACEN + administrador y vendedor, sin productos
```

## Verificación hecha

- `pnpm build` y `pnpm exec tsc --noEmit` sin errores.
- Venta por transferencia de $10.000 (1 kg de yerba + 1.5 kg de pan): ticket #0001, `reconciliation = PENDING`, stock descontado (24 → 23; 12.5 → 11 kg).
- Venta en efectivo de $2.300 pagando $5.000: vuelto $2.700, ticket #0002.
- Venta con red simulada caída: guardada en la cola y sincronizada sola al volver, sin duplicar (ticket #0003).
- Alta de "Galletitas Oreo 118 g" con código `7790040111011`, precio y stock inicial: movimiento `ALTA` con nota "Stock inicial".
- Edición del precio (1.850 → 1.950) sin tocar el stock; ajuste manual +6 y movimiento visible en el historial.
- Venta escaneando el código nuevo desde el POS: agrega el producto sin buscar por nombre y descuenta stock.
- Primera venta del día: ticket con "Se abrió la caja con esta venta"; el turno aparece abierto en `/reportes` con totales en vivo.
- Cierre de caja: totales congelados en el turno (2 ventas, $13.600) y visibles después de cerrar; la venta siguiente abrió un turno nuevo.
- Filtros del reporte: efectivo / transferencia / rango de fechas cambian KPIs y listado (por ejemplo 10/11 + transferencia → 3 ventas, $16.100).
- Paginado: `/reportes?from=2026-01-01&to=2026-12-31` muestra 10 ventas y "página 1 de 2"; `?page=2` muestra la venta 11 y conserva fechas y medio de pago. `/stock` muestra 10 productos y `?page=2` los 9 restantes; al buscar vuelve a la página 1.
- Filtro mobile medido a 360 / 390 / 768 / 1024 / 1256 px: sin desborde horizontal, atajos de 48 px de alto en el celular.
- PWA en build de producción: service worker instalado y controlando la página, caché `almacen-1` con el HTML de la caja y 17 archivos; con la red apagada por CDP, recargar `/` abre el buscador y `COBRAR` desde la caché.
- Hora del cobro: venta de prueba cobrada 3 h antes y sincronizada después → `Sale.paidAt` y `CashSession.openedAt` quedan con la hora del cobro, `syncedAt` con la del envío, stock descontado una sola vez y reintento idempotente. Fecha futura y fecha de hace 60 días se reemplazan por la hora del servidor.
- Panel de sincronización: con una venta ya existente y una rechazada en la cola, el reintento automático saca la buena (sin duplicar) y deja la otra con el motivo `Un producto ya no existe. Volvé a cargarlo.`; badge `1 pendiente` y el mismo detalle en el menú `☰`.
- Venta de punta a punta sin red desde el POS: con la red apagada, cobrar en efectivo muestra `VENTA GUARDADA` y la venta queda en la cola con su hora; al reconectar, la sincronización automática la envía sola. En la base queda `paidAt` = hora del cobro, `syncedAt` 6 s después y el ticket con el número que corresponde.
- Barra superior medida a 360 / 390 / 768 / 1024 / 1280 / 1536 px con ventas pendientes: 56 px en celular y 67 px en escritorio, navegación centrada, `↻` visible desde 768 px y el panel sin salirse de la pantalla.
- Lighthouse: accesibilidad 100, buenas prácticas 100, SEO 100.

## Próximos pasos

1. **Autenticación y roles** (Fase 1). Sin esto no se puede saber realmente quién confirmó cada transferencia ni quién cerró la caja.
2. **Anulación de ventas** con reingreso de stock (hoy una venta mal cobrada solo se corrige por base de datos).
3. **Resolver ventas rechazadas desde la pantalla**: hoy quedan listadas con el motivo y se reintentan solas, pero no se pueden corregir ni descartar sin tocar la base.
4. **QR dinámico + webhook** para los clientes que sí escanean (comisión de MP, pero aviso instantáneo).
5. **Conciliación nocturna** contra `POST /v1/account/settlement_report`, cruzando monto + ventana de ±30 min, marcando `DIFERENCIA` lo ambiguo.

> Ojo con la conciliación: el CSV de Mercado Pago **no trae referencia de la venta**. Dos ventas del mismo monto en la misma franja son indistinguibles. El cruce automático confirma el total del día, no la venta individual; los casos ambiguos tienen que quedar para revisión humana.
