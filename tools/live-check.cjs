const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w,h,m] of [[1440,900,false],[390,844,true]]) {
    const ctx = await b.newContext({ viewport:{width:w,height:h}, isMobile:m, hasTouch:m });
    for (const slug of ['foundry-severance','tidepool','red-queen','word-from-below']) {
      const p = await ctx.newPage(); const errs=[]; const csp=[];
      p.on('console', c => { if (c.type()==='error') (c.text().includes('Content Security Policy')?csp:errs).push(c.text().slice(0,100)); });
      p.on('pageerror', e => errs.push(e.message.slice(0,100)));
      await p.goto(`https://games.michaelking.systems/${slug}/`, {waitUntil:'networkidle'});
      const play = p.locator('button:has-text("Play"), a:has-text("Play")').first();
      await play.click();
      await p.waitForTimeout(4000);
      const frame = p.frames().find(f => f.url().includes('vercel.app'));
      let body = 0; try { body = frame ? (await frame.evaluate(() => document.body.innerText.length + document.querySelectorAll('canvas,button,svg').length)) : 0; } catch(e) {}
      console.log(w, slug, 'frame:', frame ? new URL(frame.url()).host : 'NONE', 'content:', body, 'errors:', errs.length, 'csp:', csp.length, errs.concat(csp).slice(0,2).join(' | '));
      if (w===1440 && slug==='word-from-below') await p.screenshot({path:'/home/user/games_hub/evidence/live-wfb-1440.png'});
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
})();
