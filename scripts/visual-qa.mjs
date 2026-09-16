import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/DELL/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'outputs');
const base = process.env.PJT_QA_BASE || 'http://127.0.0.1:4173';
const qaLabel = process.env.PJT_QA_LABEL ? `${process.env.PJT_QA_LABEL}-` : '';
const remoteRoutes = Boolean(process.env.PJT_QA_BASE);
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});

async function verifyViewport(name, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${name} has horizontal overflow`);

  await page.screenshot({ path: path.join(output, `qa-${qaLabel}${name}-hero.png`) });
  for (const sectionId of ['doctor', 'consult', 'contact']) {
    const section = page.locator(`#${sectionId}`);
    await section.scrollIntoViewIfNeeded();
    await page.waitForFunction((selector) => [...document.querySelectorAll(`${selector} .reveal`)].every((item) => item.classList.contains('is-visible')), `#${sectionId}`);
    await page.waitForTimeout(900);
    await section.screenshot({ path: path.join(output, `qa-${qaLabel}${name}-${sectionId}.png`) });
  }

  await page.goto(`${base}/?consult=sleep#consult`, { waitUntil: 'networkidle' });
  assert.match(await page.locator('#detail').inputValue(), /睡眠/);
  await page.close();
  return dimensions;
}

const desktop = await verifyViewport('desktop', { width: 1440, height: 1000 });
const mobile = await verifyViewport('mobile', { width: 390, height: 844 });

const detailPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
const detailRoutes = remoteRoutes
  ? ['/directions', '/doctors', '/notes', '/appointment', '/privacy', '/service-notice', '/enterprise']
  : ['/directions.html', '/doctors.html', '/notes.html', '/appointment.html', '/privacy.html', '/service-notice.html', '/enterprise.html'];
for (const pathname of detailRoutes) {
  const response = await detailPage.goto(`${base}${pathname}`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200, `${pathname} did not load`);
  const overflow = await detailPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${pathname} has horizontal overflow`);
}
await detailPage.close();
await browser.close();

console.log(`Visual QA passed. Desktop ${desktop.clientWidth}px, mobile ${mobile.clientWidth}px, no horizontal overflow on 8 pages.`);
