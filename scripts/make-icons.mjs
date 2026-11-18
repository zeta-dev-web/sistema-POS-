/**
 * Genera los íconos de la PWA en `public/icons/`.
 * Uso: `node scripts/make-icons.mjs`
 *
 * `sharp` viene con Next (optimización de imágenes); no es una dependencia
 * directa del proyecto, solo se usa acá para rasterizar el SVG.
 */
import { mkdir } from "node:fs/promises";

import sharp from "sharp";

const ART = `
  <!-- Ticket -->
  <path d="M176 112H336V240l-20-16-20 16-20-16-20 16-20-16-20 16-20-16-20 16Z"
        fill="#f7f2e7" stroke="#17130d" stroke-width="20" stroke-linejoin="round" />
  <line x1="208" y1="160" x2="304" y2="160" stroke="#17130d" stroke-width="18" stroke-linecap="round" />
  <line x1="208" y1="200" x2="272" y2="200" stroke="#17130d" stroke-width="18" stroke-linecap="round" />
  <!-- Caja -->
  <rect x="104" y="264" width="304" height="144" rx="28" fill="#17130d" />
  <rect x="152" y="304" width="208" height="28" rx="14" fill="#f7f2e7" />
  <circle cx="360" cy="368" r="16" fill="#f7f2e7" />
`;

/** @param {boolean} maskable */
function buildSvg(maskable) {
  // En el ícono maskable el dibujo se achica al 80% para que ningún recorte
  // de Android (círculo, cuadrado redondeado) le coma los bordes.
  const body = maskable
    ? `<g transform="translate(51.2 51.2) scale(0.8)">${ART}</g>`
    : ART;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f7f2e7" />
  ${body}
</svg>`;
}

const OUTPUT = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

await mkdir("public/icons", { recursive: true });

for (const { file, size, maskable } of OUTPUT) {
  const svg = Buffer.from(buildSvg(maskable));
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${file}`);
  console.log(`public/icons/${file} (${size}×${size})`);
}
