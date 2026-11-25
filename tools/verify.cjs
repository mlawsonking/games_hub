// Browser verification for the games hub. Needs `node tools/serve.mjs 4173` running and the
// playwright package (not a dependency of this repo): NODE_PATH=$(npm root -g) node tools/verify.cjs
// Writes screenshots (deviceScaleFactor 2) and evidence/verify.json.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:4173";
const OUT = path.join(__dirname, "..", "evidence");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "games.json"), "utf8"));
const published = manifest.games.filter((g) => g.status === "published");
const VIEWS = [["390", 390, 844], ["1440", 1440, 900]];
const results = { pages: [], play: [], nojs: null, notFound: null, summary: {} };

async function ctxFor(browser, w, h, scheme, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 2, hasTouch: w < 500, ...extra });
  // Record CSP violations in hub documents (localhost) only.
  await ctx.addInitScript(() => {
    if (location.origin !== "http://localhost:4173") return;
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return ctx;
}

function watch(page) {
  const log = { hubErrors: [], gameErrors: [], requests: [] };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const u = m.location().url || "";
    // A 404 page's own document status is the intended response, not an error in the page.
    if (/status of 404/.test(m.text()) && u === page.url() && /404|no-such|missing/.test(u)) { log.expected404 = (log.expected404 || 0) + 1; return; }
    (u && !u.startsWith(BASE) ? log.gameErrors : log.hubErrors).push(m.text() + (u ? ` (${u})` : ""));
  });
  page.on("pageerror", (e) => log.hubErrors.push("pageerror: " + e.message));
  page.on("request", (r) => log.requests.push({ url: r.url(), t: Date.now() }));
  return log;
}
const foreign = (reqs, before = Infinity) => reqs.filter((r) => !r.url.startsWith(BASE) && !r.url.startsWith("data:") && r.t < before).map((r) => r.url);

async function settle(page) {
  // load lazy images, then return to the top
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();

  // 1. Static pages in both themes and widths.
  const pages = [["/", "home"], ...published.map((g) => [`/${g.slug}/`, g.slug]), ["/no-such-page/", "404"]];
  for (const [url, name] of pages) for (const [vw, w, h] of VIEWS) for (const scheme of ["light", "dark"]) {
    const ctx = await ctxFor(browser, w, h, scheme);
    const page = await ctx.newPage();
    const log = watch(page);
    const resp = await page.goto(BASE + url, { waitUntil: "load" });
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "load" }); // second view: fonts cached, as a returning visitor sees it
    await settle(page);
    const info = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      iframes: document.querySelectorAll("iframe").length,
      csp: window.__csp,
      robots: document.querySelector('meta[name="robots"]')?.content,
      fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
    }));
    const headers = resp.headers();
    const shot = ["home", "foundry-severance"].includes(name) || name === "404" ? `${name}-${vw}-${scheme}.jpg` : null;
    if (shot) await page.screenshot({ path: path.join(OUT, shot), fullPage: true, quality: 85 });
    if (name === "home" || name === "foundry-severance") await page.screenshot({ path: path.join(OUT, `${name}-${vw}-${scheme}-fold.jpg`), quality: 85 });
    results.pages.push({ url, vw, scheme, status: resp.status(), xRobots: headers["x-robots-tag"], ...info,
      hubErrors: log.hubErrors, expected404: log.expected404 || 0, foreignRequests: foreign(log.requests), shot });
    await ctx.close();
  }

  // 2. Play every published game at both widths.
  for (const g of published) for (const [vw, w, h] of VIEWS) {
    const ctx = await ctxFor(browser, w, h, "light");
    const page = await ctx.newPage();
    const log = watch(page);
    await page.goto(`${BASE}/${g.slug}/`, { waitUntil: "load" });
    await page.waitForTimeout(500);
    const r = { game: g.slug, vw };
    r.iframesBeforePlay = await page.locator("iframe").count();
    r.foreignBeforePlay = foreign(log.requests);
    const tPlay = Date.now();
    if (w < 500) await page.locator("[data-play]").tap(); else await page.locator("[data-play]").click();
    const frameEl = page.locator("iframe.frame");
    await frameEl.waitFor();
    r.focusInGame = await page.evaluate(() => document.activeElement?.tagName === "IFRAME");
    const attrs = await frameEl.evaluate((f) => ({ src: f.src, sandbox: f.getAttribute("sandbox"), allow: f.getAttribute("allow"), referrer: f.referrerPolicy }));
    Object.assign(r, attrs);
    await page.waitForTimeout(2500);
    const frame = page.frames().find((f) => f.url().startsWith(new URL(g.url).origin));
    r.frameLoaded = !!frame;
    r.foreignAfterPlayOrigins = [...new Set(foreign(log.requests).map((u) => new URL(u).origin))];
    r.otherOriginBeforePlay = foreign(log.requests, tPlay).length;
    const box = await frameEl.boundingBox();
    r.frameBox = box && [Math.round(box.width), Math.round(box.height)];
    await page.screenshot({ path: path.join(OUT, `play-${g.slug}-${vw}-1-on.jpg`), quality: 85 });

    // Input: a key (FOUNDRY, Red Queen) or a tap/click (Tidepool, Red Queen), proven from inside the game.
    if (g.slug === "foundry-severance") {
      // The setup screen needs its POWER ON button (bare Enter does nothing there, by the game's design).
      const power = frame.getByText(/power on/i).first();
      await power.scrollIntoViewIfNeeded();
      await power.click();
      await page.waitForTimeout(1500);
      r.focusAfterPowerOn = await page.evaluate(() => document.activeElement?.tagName === "IFRAME");
      const keys = {};
      for (const k of ["ArrowRight", "ArrowDown", "i"]) {
        const before = await frameEl.screenshot();
        await page.keyboard.press(k);
        await page.waitForTimeout(600);
        keys[k] = !before.equals(await frameEl.screenshot());
      }
      r.keysChangedFrame = keys;
      r.keyChangedFrame = Object.values(keys).some(Boolean);
      r.keyEvidence = `play-${g.slug}-${vw}-2-after-key.jpg`;
      await page.screenshot({ path: path.join(OUT, r.keyEvidence), quality: 85 });
    } else if (g.slug === "tidepool") {
      const a = await frame.evaluate(() => window.__tp.stats.algae);
      await page.keyboard.press("s");
      await page.waitForTimeout(250);
      r.keyStorm = await frame.evaluate(() => document.getElementById("ticker").textContent);
      for (let i = 0; i < 5; i++) { const x = box.x + box.width * (0.2 + i * 0.15), y = box.y + box.height * 0.5; if (w < 500) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
      const b = await frame.evaluate(() => window.__tp.stats.algae);
      r.tapPlants = [a, b];
      await page.screenshot({ path: path.join(OUT, `play-${g.slug}-${vw}-2-after-input.jpg`), quality: 85 });
    } else if (g.slug === "red-queen") {
      const start = await frame.locator("#startBtn").boundingBox();
      if (w < 500) await page.touchscreen.tap(start.x + 20, start.y + 10); else await page.mouse.click(start.x + 20, start.y + 10);
      await page.waitForTimeout(500);
      if (w >= 500) { await page.keyboard.press("3"); r.keySelectsTool = await frame.evaluate(() => document.querySelectorAll(".tool")[2].classList.contains("sel")); }
      for (let i = 0; i < 6; i++) { const x = box.x + box.width * 0.5, y = box.y + box.height * 0.4; if (w < 500) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(350); }
      r.score = await frame.evaluate(() => window.__rq.stats.score);
      await page.screenshot({ path: path.join(OUT, `play-${g.slug}-${vw}-2-after-input.jpg`), quality: 85 });
    }

    // Full screen (where the browser offers it), visible exit, then Stop.
    const fsBtn = page.locator("[data-fs]");
    r.fullscreenOffered = await fsBtn.isVisible();
    if (r.fullscreenOffered && w >= 500) {
      await fsBtn.click();
      await page.waitForTimeout(600);
      r.fullscreenEntered = await page.evaluate(() => !!document.fullscreenElement);
      r.exitVisibleInFullscreen = await page.locator("[data-exit]").isVisible();
      await page.screenshot({ path: path.join(OUT, `play-${g.slug}-${vw}-3-fullscreen.jpg`), quality: 85 });
      await page.locator("[data-exit]").click();
      await page.waitForTimeout(400);
      r.fullscreenExited = await page.evaluate(() => !document.fullscreenElement);
      r.focusAfterFullscreen = await page.evaluate(() => document.activeElement?.tagName === "IFRAME");
    }
    await page.locator("[data-stop]").click();
    await page.waitForTimeout(300);
    r.iframesAfterStop = await page.locator("iframe").count();
    r.focusOnPlayAfterStop = await page.evaluate(() => document.activeElement?.hasAttribute("data-play"));
    r.newTabLink = await page.locator(".newtab").evaluate((a) => ({ href: a.href, target: a.target, rel: a.rel }));
    r.csp = await page.evaluate(() => window.__csp);
    r.hubErrors = log.hubErrors;
    r.gameErrors = log.gameErrors;
    results.play.push(r);
    await ctx.close();
  }

  // 3. JavaScript off: everything visible, Play is a plain link to the game.
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/foundry-severance/`);
    results.nojs = await page.evaluate(() => ({
      playHref: document.querySelector("[data-play]").href,
      playVisible: !!document.querySelector("[data-play]").offsetParent,
      controlsRows: document.querySelectorAll(".keys > div").length,
      phoneNote: document.querySelector(".phone-card .phone").textContent.trim(),
      iframes: document.querySelectorAll("iframe").length,
    }));
    await ctx.close();
  }

  // 4. 404 status.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const resp = await page.goto(`${BASE}/missing/`);
    results.notFound = { status: resp.status(), title: await page.title() };
    await ctx.close();
  }

  const P = results.pages, Y = results.play;
  results.summary = {
    pagesChecked: P.length,
    hubConsoleErrors: P.reduce((n, p) => n + p.hubErrors.length, 0) + Y.reduce((n, p) => n + p.hubErrors.length, 0),
    cspViolations: P.reduce((n, p) => n + (p.csp || []).length, 0) + Y.reduce((n, p) => n + (p.csp || []).length, 0),
    foreignRequestsWithoutPlay: P.reduce((n, p) => n + p.foreignRequests.length, 0),
    foreignRequestsBeforePlay: Y.reduce((n, p) => n + p.otherOriginBeforePlay + p.foreignBeforePlay.length, 0),
    horizontalOverflow: P.filter((p) => p.scrollWidth > Number(p.vw)).map((p) => `${p.url}@${p.vw}`),
    allNoindex: P.every((p) => p.xRobots === "noindex, nofollow" && p.robots === "noindex, nofollow"),
    playsLoaded: Y.filter((p) => p.frameLoaded).length + "/" + Y.length,
    focusIntoGame: Y.filter((p) => p.focusInGame).length + "/" + Y.length,
    foundryKey: Y.filter((p) => p.game === "foundry-severance").map((p) => `${p.vw}: ${JSON.stringify(p.keysChangedFrame)}`),
  };
  fs.writeFileSync(path.join(OUT, "verify.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.summary, null, 2));
  console.log(JSON.stringify(results.play.map(({ game, vw, focusInGame, frameBox, keyChangedFrame, keyStorm, tapPlants, keySelectsTool, score, fullscreenEntered, exitVisibleInFullscreen, fullscreenExited, iframesAfterStop, gameErrors, sandbox, allow }) =>
    ({ game, vw, focusInGame, frameBox, keyChangedFrame, keyStorm, tapPlants, keySelectsTool, score, fullscreenEntered, exitVisibleInFullscreen, fullscreenExited, iframesAfterStop, gameErrors, sandbox, allow }))));
  console.log(JSON.stringify(results.nojs), JSON.stringify(results.notFound));
  await browser.close();
})();
