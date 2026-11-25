const { chromium } = require('playwright');
const http = require('http');
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><body style="margin:0"><iframe id=f src="${u.searchParams.get('src')}" sandbox="allow-scripts" allow="${u.searchParams.get('allow')||''}" style="width:1280px;height:800px;border:0"></iframe>`);
}).listen(8932);
(async () => {
  const b = await chromium.launch(); const out = {};
  // tidepool touch: 6 taps vs baseline
  for (const taps of [0, 6]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); await p.goto('https://tidepool-chi.vercel.app/'); await p.waitForTimeout(1000);
    const a = await p.evaluate(() => window.__tp.stats.algae);
    for (let i = 0; i < taps; i++) { await p.touchscreen.tap(60 + i * 50, 300); }
    for (let i = taps; i < 6; i++) await p.waitForTimeout(0);
    const c = await p.evaluate(() => window.__tp.stats.algae);
    out['tpTouch' + taps] = [a, c]; await ctx.close();
  }
  // redqueen mobile: tap start, tap strikes, check score; then force draft
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('https://redqueen-mu.vercel.app/'); await p.waitForTimeout(800);
    out.rqStartCard = await p.evaluate(() => { const r = document.querySelector('#start .card').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerHeight]; });
    await p.screenshot({ path: 'rq-390-start.png' });
    await p.touchscreen.tap(195, (await p.locator('#startBtn').boundingBox()).y + 10); await p.waitForTimeout(600);
    for (let i = 0; i < 8; i++) { await p.touchscreen.tap(195, 400); await p.waitForTimeout(400); }
    out.rqTouchScore = await p.evaluate(() => window.__rq.stats.score);
    // tap a tool card
    const t2 = await p.locator('.tool').nth(2).boundingBox(); await p.touchscreen.tap(t2.x + t2.width / 2, t2.y + 10);
    out.rqTouchTool = await p.evaluate(() => [...document.querySelectorAll('.tool')].map(t => t.className).join('|'));
    // wait for the draft at tide 2 (35 s)
    await p.waitForFunction(() => getComputedStyle(document.getElementById('draft')).display !== 'none', null, { timeout: 45000 }).catch(() => {});
    out.rqDraft = await p.evaluate(() => [...document.querySelectorAll('.boon')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }));
    await p.screenshot({ path: 'rq-390-draft.png' });
    out.rqErrs = errs; await ctx.close();
  }
  // clipboard with allow
  for (const allow of ['', 'clipboard-write']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(`http://localhost:8932/?src=${encodeURIComponent('https://redqueen-mu.vercel.app/')}&allow=${allow}`); await p.waitForTimeout(2000);
    const fr = p.frames().find(f => f.url().includes('redqueen'));
    // jump to final screen via the end-of-run path: click copy on final after forcing
    out['clip:' + allow] = await fr.evaluate(() => navigator.clipboard.writeText('x').then(() => 'ok', e => e.name));
    out['clipErrs:' + allow] = errs; await ctx.close();
  }
  console.log(JSON.stringify(out)); await b.close(); srv.close();
})();
