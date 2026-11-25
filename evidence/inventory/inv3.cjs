const { chromium } = require('playwright');
const http = require('http');
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); res.setHeader('content-type', 'text/html');
  res.end(`<!doctype html><body style="margin:0"><iframe id=f src="https://redqueen-mu.vercel.app/" sandbox="allow-scripts" allow="${u.searchParams.get('allow')||''}" style="width:1280px;height:800px;border:0"></iframe>`);
}).listen(8933);
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const allow of ['', 'clipboard-write']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage(); const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(`http://localhost:8933/?allow=${allow}`); await p.waitForTimeout(2000);
    const fr = p.frames().find(f => f.url().includes('redqueen'));
    await fr.click('#startBtn');
    await fr.evaluate(() => { window.__rq.spam(0, 3); window.__rq.tick(60 * 215, 0); });
    await p.waitForTimeout(500);
    out['final:' + allow] = await fr.evaluate(() => getComputedStyle(document.getElementById('final')).display);
    await fr.click('#copyBtn'); await p.waitForTimeout(300);
    out['btn:' + allow] = await fr.textContent('#copyBtn');
    out['clip:' + allow] = await fr.evaluate(() => navigator.clipboard.writeText('x').then(() => 'ok', e => e.name));
    out['errs:' + allow] = errs; await ctx.close();
  }
  console.log(JSON.stringify(out)); await b.close(); srv.close();
})();
