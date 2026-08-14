import { chromium } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE" viewBox="0 0 128 128">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
</defs>
<rect x="0" y="0" width="128" height="128" rx="28" fill="url(#bg)"/>
<rect x="0" y="0" width="128" height="62" rx="28" fill="url(#gloss)"/>
<circle cx="64" cy="70" r="38" pathLength="360" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-dasharray="200 360" stroke-dashoffset="-170"/>
<line x1="64" y1="70" x2="80" y2="48" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>
<circle cx="64" cy="70" r="10.5" fill="#ffffff"/>
</svg>`;

const TILE = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.45" r="0.62"><stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="440" height="280" rx="56" fill="url(#bg)"/>
<rect width="440" height="280" rx="56" fill="url(#glow)"/>
<g transform="translate(220 140) scale(2.2) translate(-64 -70)">
<circle cx="64" cy="70" r="38" pathLength="360" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" stroke-dasharray="200 360" stroke-dashoffset="-170"/>
<line x1="64" y1="70" x2="80" y2="48" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>
<circle cx="64" cy="70" r="10.5" fill="#ffffff"/>
</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();

const render = async (html, outPath, width, height) => {
  await page.setViewportSize({ width, height });
  await page.setContent('<!DOCTYPE html><html style="background:transparent"><body style="margin:0;background:transparent">' + html + '</body></html>');
  await page.screenshot({
    path: outPath,
    omitBackground: true,
    clip: { x: 0, y: 0, width, height },
  });
  console.log('rendered', outPath);
};

for (const size of [16, 32, 48, 128]) {
  await render(SVG.replaceAll('SIZE', String(size)), resolve(root, 'icons', `icon${size}.png`), size, size);
}
await render(TILE, resolve(root, 'store-assets', 'output', 'store-promo-tile.png'), 440, 280);

await browser.close();
