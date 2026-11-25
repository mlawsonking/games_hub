const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  let p = await ctx.newPage();
  await p.goto('https://tidepool-chi.vercel.app/'); if(process.argv[2]==='rq') {} else await p.waitForTimeout(3000);
  for (let i = 0; i < 4; i++) { await p.mouse.click(300 + i * 220, 300 + (i % 2) * 200); await p.waitForTimeout(400); }
  await p.mouse.move(200, 600); await p.mouse.down(); for (let i = 0; i < 20; i++) { await p.mouse.move(200 + i * 30, 600 - i * 10); await p.waitForTimeout(16); } await p.mouse.up();
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'tidepool-1280.png' });
  console.log(await p.evaluate(() => JSON.stringify(window.__tp.stats)));
  p = await ctx.newPage();
  await p.goto('https://redqueen-mu.vercel.app/'); await p.waitForTimeout(1000);
  await p.click('#startBtn');
  const pts = [[400, 300], [800, 450], [600, 250], [900, 300], [500, 500], [700, 380]];
  for (let r = 0; r < 4; r++) for (const [x, y] of pts) { await p.mouse.click(x, y); await p.waitForTimeout(300); }
  await p.keyboard.press('2'); for (const [x, y] of pts) { await p.mouse.click(x, y); await p.waitForTimeout(450); }
  await p.mouse.move(660, 360); await p.waitForTimeout(1800);
  await p.screenshot({ path: 'redqueen-1280.png' });
  console.log(await p.evaluate(() => JSON.stringify(window.__rq.stats)));
  await b.close();
})();
