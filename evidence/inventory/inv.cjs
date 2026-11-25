const { chromium } = require('playwright');
const http = require('http');
const GAMES = {
  tidepool: 'https://tidepool-chi.vercel.app/',
  redqueen: 'https://redqueen-mu.vercel.app/',
};
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const src = u.searchParams.get('src'), sb = u.searchParams.get('sb') ?? '', allow = u.searchParams.get('allow') ?? '';
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><body style="margin:0"><iframe id=f src="${src}" ${sb === 'NONE' ? '' : `sandbox="${sb}"`} allow="${allow}" style="width:1280px;height:800px;border:0"></iframe>`);
}).listen(8931);
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const [k, url] of Object.entries(GAMES)) {
    const r = out[k] = {};
    // direct at 390 and 1280
    for (const [w, h, mobile] of [[390, 844, true], [1280, 800, false]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
      const p = await ctx.newPage(); const errs = [];
      p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      p.on('pageerror', e => errs.push('pageerror: ' + e.message));
      await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1500);
      const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        overflowing: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'; }).map(e => e.id || e.className || e.tagName).slice(0, 12) }));
      if (k === 'redqueen') { // start a run
        if (mobile) await p.tap('#startBtn'); else await p.click('#startBtn');
        await p.waitForTimeout(800);
        const tools = await p.evaluate(() => { const t = document.getElementById('tools').getBoundingClientRect(); return { left: t.left, right: t.right }; });
        r['tools' + w] = tools;
        const s0 = await p.evaluate(() => window.__rq ? JSON.stringify(window.__rq.stats) : Object.keys(window).filter(x => x.startsWith('__')).join(','));
        r['hook' + w] = s0;
        if (mobile) { for (let i = 0; i < 6; i++) { await p.touchscreen.tap(195, 380); await p.waitForTimeout(350); } }
        else { await p.keyboard.press('2'); for (let i = 0; i < 6; i++) { await p.mouse.click(640, 380); await p.waitForTimeout(350); } }
      } else {
        const before = await p.evaluate(() => window.__tp.stats.algae);
        if (mobile) await p.touchscreen.tap(195, 400); else await p.mouse.click(640, 400);
        await p.waitForTimeout(100);
        const after = await p.evaluate(() => window.__tp.stats.algae);
        r['tapAlgae' + w] = [before, after];
        if (!mobile) { await p.keyboard.press('s'); await p.waitForTimeout(300); r.stormTicker = await p.textContent('#ticker'); }
      }
      await p.waitForTimeout(500);
      const ov2 = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      r['direct' + w] = { ov, ov2, errs };
      await p.screenshot({ path: `${k}-direct-${w}.png` });
      await ctx.close();
    }
    // sandbox matrix
    for (const sb of ['allow-scripts', 'allow-scripts allow-same-origin', 'NONE']) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
      const p = await ctx.newPage(); const errs = [];
      p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
      p.on('pageerror', e => errs.push('pageerror: ' + e.message));
      await p.goto(`http://localhost:8931/?src=${encodeURIComponent(url)}&sb=${encodeURIComponent(sb)}`);
      await p.waitForTimeout(2500);
      const fr = p.frames().find(f => f.url().startsWith(url));
      const res = { errs };
      try {
        if (k === 'tidepool') {
          const a = await fr.evaluate(() => window.__tp.stats);
          await p.mouse.click(640, 400); await p.waitForTimeout(100);
          const bb = await fr.evaluate(() => window.__tp.stats);
          await p.keyboard.press('s'); await p.waitForTimeout(300);
          res.stats = [a, bb]; res.ticker = await fr.textContent('#ticker');
          await fr.click('#bt-sound'); await p.waitForTimeout(300);
          res.sound = await fr.evaluate(() => document.getElementById('bt-sound').className);
          res.ls = await fr.evaluate(() => { try { localStorage.setItem('x', '1'); return 'ok'; } catch (e) { return e.name; } });
        } else {
          await fr.click('#startBtn'); await p.waitForTimeout(600);
          await p.keyboard.press('3'); await p.waitForTimeout(100);
          for (let i = 0; i < 4; i++) { await p.mouse.click(640, 380); await p.waitForTimeout(300); }
          res.stats = await fr.evaluate(() => window.__rq ? window.__rq.stats : null);
          res.sel = await fr.evaluate(() => [...document.querySelectorAll('.tool')].map(t => t.className).join('|'));
          res.ls = await fr.evaluate(() => { try { localStorage.setItem('x', '1'); return 'ok'; } catch (e) { return e.name; } });
          res.clip = await fr.evaluate(() => navigator.clipboard.writeText('x').then(() => 'ok', e => e.name + ': ' + e.message));
        }
      } catch (e) { res.fail = e.message; }
      r['sb:' + sb] = res;
      if (sb === 'allow-scripts') await p.screenshot({ path: `${k}-iframe-allow-scripts.png` });
      await ctx.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
})();
