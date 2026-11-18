const STEPS = [
  {
    command: "DATABASE_URL en .env local o variables de Render",
    note: "Configura la conexión a Neon.",
  },
  { command: "pnpm db:push", note: "Crea las tablas." },
  {
    command: "pnpm db:seed",
    note: "Crea ALMACEN con un administrador y un vendedor, sin productos.",
  },
];

export function SetupNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="text-xs font-black tracking-[0.24em] text-ink-2 uppercase">Almacén · Caja</p>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-2 rounded-xl border-2 border-ink/20 bg-white/70 p-3 font-mono text-sm break-words text-ink-2">
          {detail}
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <li key={step.command} className="chunky rounded-2xl bg-white p-4">
            <p className="text-sm font-black uppercase">
              {index + 1}. {step.note}
            </p>
            <code className="mt-2 block overflow-x-auto rounded-lg bg-ink p-3 text-sm text-paper">
              {step.command}
            </code>
          </li>
        ))}
      </ol>

      <p className="text-sm font-semibold text-ink-2">
        Después recargá esta página. En producción, cargá <code>DATABASE_URL</code> en las variables de Render.
      </p>
    </main>
  );
}
