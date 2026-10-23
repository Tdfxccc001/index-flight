import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Exercise the actual production files under a repository-style Pages subpath.
const mount = '/index-flight/';
const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!pathname.startsWith(mount)) { res.writeHead(404).end(); return; }
  const file = path.resolve(root, pathname.slice(mount.length) || 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}${mount}`;
let browser;
try {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500 });
    const page = await context.newPage();
    const errors = [], external = [], failedResponses = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith(new URL(base).origin + '/'))
        external.push(request.url());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failedResponses.push(response.url());
    });
    await page.goto(base);
    await page.getByRole('button', { name: '开始飞行' }).waitFor();
    await page.waitForFunction(() => document.querySelector('#build-status')?.dataset.connection === 'online');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert.equal(await page.evaluate(() => window.__game), undefined);
    assert.equal(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname), mount + 'sw.js');
    await page.getByRole('button', { name: '开始飞行' }).click();
    await page.waitForFunction(() => Number(document.querySelector('#score')?.textContent.replaceAll(',', '')) > 0);
    await page.waitForTimeout(600);
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: `test-results/pages-${viewport.width}.png` });
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: '开始飞行' }).waitFor();
    await page.waitForFunction(() => document.querySelector('#build-status')?.dataset.connection === 'offline');
    await page.getByRole('button', { name: '开始飞行' }).click();
    await page.waitForFunction(() => Number(document.querySelector('#score')?.textContent.replaceAll(',', '')) > 0);
    assert.deepEqual(errors, [], 'runtime errors');
    assert.deepEqual(external, [], 'external runtime dependencies');
    assert.deepEqual(failedResponses, [], 'missing production resources');
    console.log(`PASS ${viewport.width}x${viewport.height}: Pages subpath, flight, Worker, offline restart, no external requests or debug hooks`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
