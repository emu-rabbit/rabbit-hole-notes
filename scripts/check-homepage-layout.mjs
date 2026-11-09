// Optional real-browser regression after `npm run check` (Node 22+).
// Supply an external Playwright installation; no website runtime dependency:
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs CHROME_PATH=/path/to/chrome node scripts/check-homepage-layout.mjs
// SCREENSHOT_DIR=/absolute/directory also saves the eight 390/1280px review images.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const screenshotDirectory = process.env.SCREENSHOT_DIR && resolve(process.env.SCREENSHOT_DIR);
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const screenshots = [];
const server = spawn(process.execPath, ['src/web/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
const stopped = once(server, 'exit');
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', () => reject(new Error('Preview server exited before listening')));
    server.stdout.on('data', bytes => {
      const address = String(bytes).match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (address) resolve(address + '/');
    });
  });
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  if (screenshotDirectory) mkdirSync(screenshotDirectory, { recursive: true });
  for (const width of [320, 390, 768, 1280, 1440]) for (const locale of ['zh-TW', 'en']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 500, hasTouch: width < 500 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(base + (locale === 'en' ? 'en/' : '') + '#after-building');
      await page.waitForLoadState('networkidle');
      const paragraphs = await page.locator('.after-building-copy > p:not(.sponsor-invitation)').evaluateAll(elements => elements.map(p => {
        const rows = new Map();
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) for (let i = 0; i < node.length; i++) {
          const range = document.createRange();
          range.setStart(node, i); range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          const key = Math.round(rect.top);
          const row = rows.get(key) || { text: '', left: rect.left, right: rect.right };
          row.text += node.data[i]; row.right = Math.max(row.right, rect.right);
          rows.set(key, row);
        }
        const style = getComputedStyle(p);
        const contentWidth = p.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const lines = [...rows.values()];
        return { lines: lines.map(row => row.text.trim()), firstLineFraction: (lines[0].right - lines[0].left) / contentWidth };
      }));
      assert.equal(paragraphs.length, 5);
      for (const [index, paragraph] of paragraphs.entries()) {
        const last = paragraph.lines.at(-1);
        if (locale === 'zh-TW') assert.ok((last.match(/\p{Script=Han}/gu) || []).length >= 10, `${locale} ${width}px paragraph ${index + 1}: short tail ${last}`);
        else assert.ok((last.match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || []).length >= 3, `${locale} ${width}px paragraph ${index + 1}: one-word tail ${last}`);
        assert.ok(!/^[）)]/.test(last), 'closing bracket stays with the explanation');
        if (width >= 1280 && paragraph.lines.length > 2) assert.ok(paragraph.firstLineFraction > .85, `paragraph ${index + 1} should use its available width`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const selector of ['.software-example', '.closing-tail']) for (const element of await page.locator(selector).all()) {
        assert.equal(await element.evaluate(e => new Set([...e.getClientRects()].map(rect => Math.round(rect.top))).size), 1, selector + ' remains on one line');
      }
      const link = page.locator('.software-example a');
      assert.equal(await link.getAttribute('href'), 'https://obsidian.md/');
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      if (width === 390) {
        const original = page.url(); const pending = page.waitForEvent('popup'); await link.click();
        const popup = await pending; await popup.waitForLoadState('domcontentloaded');
        assert.equal(new URL(popup.url()).origin, 'https://obsidian.md');
        assert.equal(await popup.evaluate(() => window.opener === null), true);
        assert.equal(page.url(), original); await popup.close();
      }
      if (screenshotDirectory && [390, 1280].includes(width)) {
        const path = resolve(screenshotDirectory, `pr23-${locale}-closing-${width}.png`);
        await page.locator('.after-building').screenshot({ path }); record(path, locale, width, 'closing');
      }
      const other = locale === 'en' ? 'zh-TW' : 'en';
      await page.locator(`.language-switcher [data-locale="${other}"]`).click(); await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.closing-tail').count(), 5, 'language switching retains the tail groups');
      await page.goto(base + (locale === 'en' ? 'reader-en/' : 'reader/') + 'index.html'); await page.waitForLoadState('networkidle');
      if (width < 500) await page.locator('.nav-toggle').click();
      const download = page.locator('.example-download'); await download.scrollIntoViewIfNeeded();
      assert.equal(await download.textContent(), locale === 'en' ? 'Download example (unzip for Obsidian)' : '下載範例（解壓縮後適用 Obsidian）');
      assert.equal(await download.locator('span').count(), 2);
      for (const span of await download.locator('span').all()) assert.equal(await span.evaluate(e => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].map(rect => Math.round(rect.top))).size; }), 1);
      assert.equal(await download.evaluate(e => e.scrollWidth <= e.clientWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (screenshotDirectory && [390, 1280].includes(width)) {
        const path = resolve(screenshotDirectory, `pr23-${locale}-download-${width}.png`);
        await page.screenshot({ path }); record(path, locale, width, 'download');
      }
      const downloaded = page.waitForEvent('download'); await download.click(); const file = await downloaded;
      assert.equal(file.suggestedFilename(), locale === 'en' ? 'emu-rabbit-en.zip' : 'emu-rabbit-tw.zip'); await file.delete();
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ locale, width, paragraphs, noOverflow: true, downloadUnitsIntact: true }));
    } finally { await context.close(); }
  }
  if (screenshotDirectory) writeFileSync(resolve(screenshotDirectory, 'manifest.json'), JSON.stringify({ source, screenshots }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill(); await stopped;
}
function record(path, locale, width, kind) {
  const png = readFileSync(path);
  screenshots.push({ path, locale, width, kind, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20), source });
}
