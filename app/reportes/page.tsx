import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { SetupNotice } from "@/components/pos/setup-notice";
import { CloseCash } from "@/components/reportes/close-cash";
import { dayBounds, humanDate, humanTime, isValidISODate, shiftISO, todayISO } from "@/lib/dates";
import { money } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SALES_PER_PAGE = 10;

type Method = "ALL" | "CASH" | "TRANSFER";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  MP_QR: "QR",
  CARD: "Tarjeta",
};

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; method?: string; page?: string }>;
}) {
  const params = await searchParams;
  const today = todayISO();

  const from = isValidISODate(params.from) ? params.from : today;
  const to = isValidISODate(params.to) ? params.to : today;
  const method: Method =
    params.method === "CASH" || params.method === "TRANSFER" ? params.method : "ALL";

  const requestedPage = Number(params.page);
  const pageParam =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) {
    return <SetupNotice title="Falta configurar el comercio" detail="Corré el seed para crear el almacén." />;
  }

  const range = dayBounds(from, to);

  const where = {
    tenantId: tenant.id,
    status: "PAID" as const,
    paidAt: { gte: range.gte, lte: range.lte },
    ...(method === "ALL" ? {} : { paymentMethod: method }),
  };

  const [grouped, saleCount, sessionRows, openSession] = await Promise.all([
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where,
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.sale.count({ where }),
    // Turnos que se solapan con el rango: uno abierto ayer y cerrado hoy
    // también tiene que verse al mirar el día de hoy.
    prisma.cashSession.findMany({
      where: {
        tenantId: tenant.id,
        openedAt: { lte: range.lte },
        OR: [{ closedAt: null }, { closedAt: { gte: range.gte } }],
      },
      orderBy: { openedAt: "desc" },
      take: 20,
    }),
    prisma.cashSession.findFirst({
      where: { tenantId: tenant.id, status: "OPEN" },
      orderBy: { openedAt: "desc" },
    }),
  ]);

  const count = saleCount;
  const totalPages = Math.max(1, Math.ceil(count / SALES_PER_PAGE));
  const page = Math.min(pageParam, totalPages);

  const sales = await prisma.sale.findMany({
    where,
    orderBy: { paidAt: "desc" },
    skip: (page - 1) * SALES_PER_PAGE,
    take: SALES_PER_PAGE,
    include: {
      user: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  const cash = Number(grouped.find((row) => row.paymentMethod === "CASH")?._sum.total ?? 0);
  const transfer = Number(
    grouped.find((row) => row.paymentMethod === "TRANSFER")?._sum.total ?? 0,
  );
  const total = cash + transfer;

  // Totales en vivo del turno abierto (los cerrados ya los tienen congelados).
  let live = { cash: 0, transfer: 0, count: 0 };
  if (openSession) {
    const openGrouped = await prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: { sessionId: openSession.id, status: "PAID" },
      _sum: { total: true },
      _count: { _all: true },
    });
    live = {
      cash: Number(openGrouped.find((row) => row.paymentMethod === "CASH")?._sum.total ?? 0),
      transfer: Number(
        openGrouped.find((row) => row.paymentMethod === "TRANSFER")?._sum.total ?? 0,
      ),
      count: openGrouped.reduce((acc, row) => acc + row._count._all, 0),
    };
  }

  const sessions =
    openSession && !sessionRows.some((session) => session.id === openSession.id)
      ? [openSession, ...sessionRows]
      : sessionRows;

  const quickLinks = [
    { label: "Hoy", short: "Hoy", from: today, to: today },
    { label: "Ayer", short: "Ayer", from: shiftISO(today, -1), to: shiftISO(today, -1) },
    {
      label: "Últimos 7 días",
      short: "7 días",
      from: shiftISO(today, -6),
      to: today,
    },
  ];

  const queryFor = (nextFrom: string, nextTo: string) =>
    `/reportes?from=${nextFrom}&to=${nextTo}${method === "ALL" ? "" : `&method=${method}`}`;

  const pageHref = (next: number) => `${queryFor(from, to)}&page=${next}`;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <AppHeader tenantName={tenant.name} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <p className="text-xs font-black tracking-[0.22em] text-ink-2 uppercase">Control</p>
        <h2 className="text-3xl font-black tracking-tight">Reporte de ventas</h2>

        <form
          method="get"
          action="/reportes"
          className="chunky mt-4 rounded-2xl bg-white p-4 sm:flex sm:flex-wrap sm:items-end sm:gap-3"
        >
          <div className="grid gap-3 sm:flex sm:flex-1 sm:flex-wrap sm:items-end sm:gap-3">
            <label className="block">
              <span className="text-[10px] font-black tracking-wide text-ink-2 uppercase">Desde</span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="chunky mt-1 block w-full rounded-lg bg-white px-3 py-2 text-base font-semibold sm:w-auto"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-black tracking-wide text-ink-2 uppercase">Hasta</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="chunky mt-1 block w-full rounded-lg bg-white px-3 py-2 text-base font-semibold sm:w-auto"
              />
            </label>

            {/* En mobile el select ocupa el lugar libre y VER va a su derecha. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:contents">
              <label className="block min-w-0">
                <span className="text-[10px] font-black tracking-wide text-ink-2 uppercase">
                  Medio de pago
                </span>
                <select
                  name="method"
                  defaultValue={method}
                  className="chunky mt-1 block w-full rounded-lg bg-white px-3 py-2.5 text-base font-semibold sm:w-auto"
                >
                  <option value="ALL">Todos</option>
                  <option value="CASH">Efectivo</option>
                  <option value="TRANSFER">Transferencia</option>
                </select>
              </label>

              <button type="submit" className="btn btn-dark h-12 px-5 text-base">
                VER
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-0 sm:flex sm:basis-full sm:flex-wrap sm:justify-end xl:ml-auto xl:basis-auto">
            {quickLinks.map((link) => {
              const active = link.from === from && link.to === to;
              return (
                <Link
                  key={link.label}
                  href={queryFor(link.from, link.to)}
                  className={`flex h-12 items-center justify-center rounded-xl border-2 border-ink px-2 text-sm font-black transition-colors sm:h-auto sm:rounded-full sm:px-3 sm:py-1 sm:text-xs ${
                    active ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-2"
                  }`}
                >
                  <span className="sm:hidden">{link.short}</span>
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </form>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="chunky rounded-2xl bg-cash p-4 text-white">
            <p className="text-[10px] font-black tracking-[0.18em] uppercase opacity-90">Efectivo</p>
            <p className="tnum text-3xl font-black">{money(cash)}</p>
          </div>
          <div className="chunky rounded-2xl bg-transfer p-4 text-white">
            <p className="text-[10px] font-black tracking-[0.18em] uppercase opacity-90">
              Transferencia
            </p>
            <p className="tnum text-3xl font-black">{money(transfer)}</p>
          </div>
          <div className="chunky rounded-2xl bg-ink p-4 text-paper">
            <p className="text-[10px] font-black tracking-[0.18em] uppercase opacity-80">Total</p>
            <p className="tnum text-3xl font-black">{money(total)}</p>
          </div>
          <div className="chunky rounded-2xl bg-white p-4">
            <p className="text-[10px] font-black tracking-[0.18em] text-ink-2 uppercase">Ventas</p>
            <p className="tnum text-3xl font-black">{count}</p>
            <p className="text-xs font-semibold text-ink-2">
              {method === "ALL" ? "todos los medios" : METHOD_LABEL[method]}
            </p>
          </div>
        </div>

        <section className="mt-7">
          <h3 className="text-sm font-black tracking-[0.18em] text-ink-2 uppercase">Cajas</h3>
          {sessions.length === 0 ? (
            <p className="mt-2 rounded-xl bg-paper-2 px-4 py-3 text-sm font-semibold text-ink-2">
              No hay turnos de caja en este período.
            </p>
          ) : (
            <ul className="mt-2 grid gap-3">
              {sessions.map((session) => {
                const isOpen = session.status === "OPEN";
                const sessionCash = isOpen ? live.cash : Number(session.totalCash);
                const sessionTransfer = isOpen ? live.transfer : Number(session.totalTransfer);
                const sessionCount = isOpen ? live.count : session.saleCount;

                return (
                  <li key={session.id} className="chunky rounded-2xl bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black">
                            {humanDate(session.openedAt)} · {humanTime(session.openedAt)}
                            {session.closedAt ? ` → ${humanTime(session.closedAt)}` : " → ahora"}
                          </p>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide text-white uppercase ${
                              isOpen ? "bg-ok" : "bg-ink-2"
                            }`}
                          >
                            {isOpen ? "Abierta" : "Cerrada"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-ink-2">
                          {sessionCount} {sessionCount === 1 ? "venta" : "ventas"} · efectivo{" "}
                          <span className="tnum font-black text-ink">{money(sessionCash)}</span> ·
                          transferencia{" "}
                          <span className="tnum font-black text-ink">{money(sessionTransfer)}</span>
                        </p>
                      </div>

                      {isOpen ? (
                        <div className="w-full sm:w-64">
                          <CloseCash cash={live.cash} transfer={live.transfer} count={live.count} />
                        </div>
                      ) : (
                        <div className="text-right">
                          <p className="text-[10px] font-black tracking-wide text-ink-2 uppercase">
                            Total del turno
                          </p>
                          <p className="tnum text-xl font-black">
                            {money(sessionCash + sessionTransfer)}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-black tracking-[0.18em] text-ink-2 uppercase">Ventas</h3>
            <p className="text-xs font-semibold text-ink-2">
              {humanDate(range.gte)} al {humanDate(range.lte)}
            </p>
          </div>

          {sales.length === 0 ? (
            <p className="mt-2 rounded-xl bg-paper-2 px-4 py-6 text-center text-base font-semibold text-ink-2">
              No hay ventas en ese período.
            </p>
          ) : (
            <ul className="chunky mt-2 divide-y-2 divide-ink/10 overflow-hidden rounded-2xl bg-white">
              {sales.map((sale) => (
                <li
                  key={sale.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-black">
                      #{String(sale.number).padStart(4, "0")}{" "}
                      <span className="font-semibold text-ink-2">
                        · {humanDate(sale.paidAt ?? sale.createdAt)}{" "}
                        {humanTime(sale.paidAt ?? sale.createdAt)}
                      </span>
                    </p>
                    <p className="text-xs font-semibold text-ink-2">
                      <span
                        className={
                          sale.paymentMethod === "CASH"
                            ? "font-black text-cash"
                            : "font-black text-transfer"
                        }
                      >
                        {METHOD_LABEL[sale.paymentMethod] ?? sale.paymentMethod}
                      </span>
                      {" · "}
                      {sale._count.items} {sale._count.items === 1 ? "ítem" : "ítems"}
                      {sale.user?.name ? ` · ${sale.user.name}` : ""}
                    </p>
                  </div>
                  <p className="tnum text-lg font-black">{money(Number(sale.total))}</p>
                </li>
              ))}
            </ul>
          )}

          {count > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink-2">
                Mostrando{" "}
                <span className="tnum font-black text-ink">
                  {(page - 1) * SALES_PER_PAGE + 1}–{Math.min(page * SALES_PER_PAGE, count)}
                </span>{" "}
                de {count} · página {page} de {totalPages}
              </p>

              <nav aria-label="Páginas de ventas" className="flex w-full items-center gap-2 sm:w-auto">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="btn btn-ghost h-12 flex-1 px-4 text-sm sm:flex-none">
                    ← ANTERIOR
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="btn btn-ghost h-12 flex-1 px-4 text-sm opacity-40 sm:flex-none"
                  >
                    ← ANTERIOR
                  </span>
                )}

                {page < totalPages ? (
                  <Link href={pageHref(page + 1)} className="btn btn-ghost h-12 flex-1 px-4 text-sm sm:flex-none">
                    SIGUIENTE →
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="btn btn-ghost h-12 flex-1 px-4 text-sm opacity-40 sm:flex-none"
                  >
                    SIGUIENTE →
                  </span>
                )}
              </nav>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
