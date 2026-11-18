/* Service worker del POS.
 *
 * Objetivo: que la pantalla de cobro abra sin internet. No intenta ser una
 * app offline completa: cachea el HTML de las pantallas ya visitadas y los
 * archivos de la aplicación, y deja pasar sin tocar los datos del servidor
 * (acciones, consultas RSC).
 *
 * Al cambiar la app, subir VERSION: en la próxima visita se borra la caché
 * vieja y se guarda todo de nuevo.
 */

const VERSION = "1";
const CACHE = `almacen-${VERSION}`;

/** Lo mínimo para que la caja arranque sin red. */
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

const NAVIGATION_TIMEOUT_MS = 5000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Si una URL falla no se cae toda la instalación.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (error) {
            // Se reintenta solo al navegar.
          }
        }),
      );

      // Los archivos JS/CSS que necesita la pantalla guardada. En la primera
      // visita el service worker todavía no controlaba la página, así que sin
      // esto la caja abriría sin estilos ni comportamiento.
      try {
        const html = await (await cache.match("/"))?.text();
        if (html) {
          const assets = [
            ...new Set(html.match(/\/_next\/static\/[^"'\s)>]+/g) ?? []),
          ].slice(0, 120);
          await Promise.all(
            assets.map(async (url) => {
              try {
                await cache.add(new Request(url, { cache: "reload" }));
              } catch (error) {
                // Un archivo que falta no rompe la instalación.
              }
            }),
          );
        }
      } catch (error) {
        // Sin HTML guardado: se cachea al navegar.
      }

      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("almacen-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Las ventas y cualquier escritura van siempre al servidor: si no hay red,
  // la cola del POS se encarga de reintentarlas.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Respuestas de navegación interna de Next: datos frescos o nada.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
    if (response && response.ok && isHtml(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    return offlinePage();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function isHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function offlinePage() {
  return new Response(
    `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sin internet · Almacén</title>
    <style>
      body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #f7f2e7; color: #17130d; font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; padding: 24px; }
      main { max-width: 26rem; text-align: center; }
      h1 { font-size: 2rem; margin: 0 0 8px; }
      p { font-size: 1.05rem; font-weight: 600; color: #4b4438; margin: 0 0 24px; }
      a { display: block; background: #17130d; color: #f7f2e7; text-decoration: none; font-weight: 900; font-size: 1.4rem; padding: 20px; border-radius: 14px; border: 2px solid #17130d; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sin internet</h1>
      <p>Esta pantalla no está guardada en el equipo. La caja sí funciona sin conexión: las ventas quedan guardadas y se envían al reconectar.</p>
      <a href="/">IR A COBRAR</a>
    </main>
  </body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
