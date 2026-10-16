// Renders public/pwa-512.svg to the PNG icons the install prompts need.
//
// Run: node scripts/render-icons.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const pub = path.resolve('public');
const svg = fs.readFileSync(path.join(pub, 'pwa-512.svg'), 'utf8');

// `any`: the icon as drawn. `maskable`: full-bleed background with the art
// shrunk into the 80% safe zone, so a circular or squircle mask never clips it.
const page = (size, maskable) => `<!doctype html><html><body style="margin:0;background:${maskable ? '#0f172a' : 'transparent'}">
<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
  <div style="width:${maskable ? size * 0.8 : size}px;height:${maskable ? size * 0.8 : size}px">${svg.replace(/width="192" height="192"/, 'width="100%" height="100%"')}</div>
</div></body></html>`;

const targets = [
  ['pwa-192.png', 192, false],
  ['pwa-512.png', 512, false],
  ['pwa-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, size, maskable] of targets) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(page(size, maskable));
    await p.screenshot({ path: path.join(pub, name), omitBackground: !maskable });
    await p.close();
    console.log(name, fs.statSync(path.join(pub, name)).size, 'bytes');
  }
  await browser.close();
})();
