import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Instrument a served COPY of the production bundle. dist stays byte-for-byte
// deployable; no debug hooks are added to the shipped game.
const root = path.resolve('dist');
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html',
  );
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  const ext = path.extname(file);
  res.setHeader(
    'Content-Type',
    {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
    }[ext] || 'application/octet-stream',
  );
  let data = fs.readFileSync(file);
  if (/^index-.*\.js$/.test(path.basename(file))) {
    const source = data.toString();
    const instrumented = source.replace(
      /try\{const (\w+)=new (\w+);/,
      'try{const $1=window.__game=new $2;',
    );
    assert.notEqual(source, instrumented, 'production game instrumentation found');
    data = instrumented;
  }
  res.end(data);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : undefined),
    args: process.argv.includes('--hardware')
      ? []
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const reports = [];
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      serviceWorkers: 'block',
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__game?.state === 'home');
    if (process.argv.includes('--worker-only')) {
      const results = await page.evaluate(async () => {
        const g = window.__game;
        g.action('start');
        g.action('pause');
        const timings = [];
        for (let i = 0; i < 12; i++) {
          const start = performance.now();
          const result = await g.planner.check(g.flight, g.rows, g.time, { x: 0, y: 0 });
          timings.push({
            wallMs: performance.now() - start,
            workerMs: result.durationMs,
            safe: result.safe,
            visited: result.visited,
          });
        }
        return timings;
      });
      console.log(JSON.stringify({ width, results }));
      await page.close();
      continue;
    }
    await page.evaluate(() => {
      const g = window.__game;
      const make = g.makeRow.bind(g);
      g.makeRow = (z) => {
        const r = make(z);
        r.columns.forEach((c) => (c.height = 0.1));
        return r;
      };
      g.start();
      g.beginFlight();
      g.flight.x = 2.375;
      g.flight.y = 2;
      g.previous = { ...g.flight };
      const events = [];
      g.diagnostics = {
        events,
        waitMs: 0,
        waitingAt: undefined,
        record(type, time, durationMs, detail) {
          events.push({ type, time, durationMs, detail, at: performance.now() });
        },
        wait(time) {
          if (this.waitingAt === undefined) {
            this.waitingAt = performance.now();
            this.record('wait-start', time);
          }
        },
        endWait(time) {
          if (this.waitingAt !== undefined) {
            const ms = performance.now() - this.waitingAt;
            this.waitMs += ms;
            this.record('wait-end', time, ms);
            this.waitingAt = undefined;
          }
        },
      };
    });
    await page
      .waitForFunction(
        () => window.__game.time >= 20 || ['dead', 'dying'].includes(window.__game.state),
        null,
        { timeout: 120000 },
      )
      .catch(async (error) => {
        console.log(
          await page.evaluate(() => ({
            state: window.__game.state,
            time: window.__game.time,
            planning: window.__game.planning,
            events: window.__game.diagnostics.events.slice(-10),
          })),
        );
        throw error;
      });
    const report = await page.evaluate(() => {
      const g = window.__game;
      g.state = 'paused';
      const events = g.diagnostics.events;
      const frames = events.filter((e) => e.type === 'frame');
      const plans = events.filter((e) => e.type === 'plan');
      return {
        waitMs: g.diagnostics.waitMs,
        passes: events.filter((e) => e.type === 'pass').length,
        planMs: plans.map((e) => [e.durationMs, e.detail]),
        longFrames: frames.filter((e) => e.durationMs > 50).length,
        score: g.score.score,
        events,
      };
    });
    assert.ok(report.passes >= 10, JSON.stringify(report));
    // Force a slow planner independently of machine speed. Waiting should draw
    // once, remain responsive to Escape, and resume as soon as a result arrives.
    await page.evaluate(() => {
      const g = window.__game;
      g.start();
      g.beginFlight();
      g.planning = true;
      g.planCommitTime = 0;
      g.renderCalls = 0;
      const render = g.world.render.bind(g.world);
      g.world.render = (...args) => {
        g.renderCalls++;
        return render(...args);
      };
    });
    await page.waitForTimeout(350);
    const waiting = await page.evaluate(() => ({
      draws: window.__game.renderCalls,
      time: window.__game.time,
    }));
    if (!process.argv.includes('--before'))
      assert.equal(waiting.draws, 1, 'static planning wait redraws only once');
    assert.equal(waiting.time, 0, 'safety commit still waits');
    await page.keyboard.press('Escape');
    assert.equal(
      await page.evaluate(() => window.__game.state),
      'paused',
      'pause remains responsive',
    );
    await page.evaluate(() => {
      const g = window.__game;
      g.stagedSpawn = { safe: false, startTime: 0, startDistance: 0 };
      g.action('resume');
      g.beginFlight();
    });
    await page.waitForFunction(() => window.__game.time > 0.05);
    report.waitingRegression = waiting;
    reports.push({ width, ...report });
    console.log(JSON.stringify({ width, ...report, events: undefined }));
    await page.close();
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(
    `test-results/pages-performance-${process.argv.includes('--hardware') ? 'default-gpu' : 'software'}-${process.argv.includes('--before') ? 'before' : 'after'}.json`,
    JSON.stringify(reports, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
