// Renders public/favicon.svg into the PNG icons that Android and iOS need for
// "Add to Home screen". Run with: node scripts/make-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();

/** `pad` is the share of the canvas kept clear around the artwork (maskable icons need ~10%). */
async function render(size, pad, name, fullBleed) {
  const inner = Math.round(size * (1 - pad * 2));
  const art = fullBleed
    ? svg.replace(/<rect[^>]*\/>/, '<rect width="64" height="64" fill="#1D5FD0"/>')
    : svg;
  const html = `<body style="margin:0;background:${fullBleed ? '#1D5FD0' : 'transparent'}">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
      <div style="width:${inner}px;height:${inner}px">${art.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
    </div></body>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  const png = await page.screenshot({ omitBackground: !fullBleed });
  await writeFile(new URL(`../public/${name}`, import.meta.url), png);
  console.log(name, png.length, 'bytes');
}

await render(192, 0, 'icon-192.png', false);
await render(512, 0, 'icon-512.png', false);
await render(512, 0.1, 'icon-maskable-512.png', true);
await render(180, 0.08, 'apple-touch-icon.png', true);
await browser.close();
