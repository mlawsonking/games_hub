#!/usr/bin/env node
// Builds the games hub from games.json into public/. No dependencies.
//   node build.mjs          write public/ and the frame-src in vercel.json
//   node build.mjs --check  write nothing; exit 1 if public/ is stale or vercel.json's
//                           frame-src differs from the published games' origins
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "public");
const CHECK = process.argv.includes("--check");
const SITE = "https://games.michaelking.systems";

// ---------- manifest ----------
const manifest = JSON.parse(readFileSync(join(ROOT, "games.json"), "utf8"));
const STATUSES = ["published", "pending-deploy", "excluded"];
const FLAGS = ["allow-scripts", "allow-same-origin", "allow-forms", "allow-pointer-lock", "allow-downloads",
  "allow-popups", "allow-modals", "allow-orientation-lock"];
const FEATURES = ["clipboard-write", "fullscreen", "gamepad", "autoplay"];
const problems = [];
const need = (ok, msg) => { if (!ok) problems.push(msg); };

function webpSize(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  return null;
}

const seen = new Set();
for (const g of manifest.games) {
  const id = g.slug || "(no slug)";
  need(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug || ""), `${id}: slug must be lowercase words joined by hyphens`);
  need(!seen.has(g.slug), `${id}: duplicate slug`); seen.add(g.slug);
  need(!["fonts", "shots", "404"].includes(g.slug), `${id}: slug is reserved`);
  for (const k of ["title", "oneLine", "url", "status", "reason"]) need(typeof g[k] === "string" && g[k], `${id}: ${k} is required`);
  need(Array.isArray(g.blurb) && g.blurb.length, `${id}: blurb must be a list of paragraphs`);
  need(STATUSES.includes(g.status), `${id}: status must be one of ${STATUSES.join(", ")}`);
  need(Array.isArray(g.controls) && g.controls.every((c) => Array.isArray(c) && c.length === 2), `${id}: controls must be [action, keys] pairs`);
  need(g.mobile && typeof g.mobile.supported === "boolean" && g.mobile.note, `${id}: mobile {supported, note} is required`);
  need(Array.isArray(g.tags), `${id}: tags must be a list`);
  need(/^\d{4}-\d{2}-\d{2}$/.test(g.added || ""), `${id}: added must be YYYY-MM-DD`);
  let u = null; try { u = new URL(g.url); } catch { /* reported below */ }
  need(u && u.protocol === "https:", `${id}: url must be https`);
  need(Array.isArray(g.sandbox) && g.sandbox.includes("allow-scripts"), `${id}: sandbox must be a list including allow-scripts`);
  for (const f of g.sandbox || []) {
    need(FLAGS.includes(f), `${id}: sandbox flag ${f} is not on the reviewed list`);
    need(g.sandboxWhy?.[f], `${id}: sandbox flag ${f} has no reason in sandboxWhy`);
  }
  for (const f of g.allow || []) {
    need(FEATURES.includes(f), `${id}: allow feature ${f} is not on the reviewed list`);
    need(g.allowWhy?.[f], `${id}: allow feature ${f} has no reason in allowWhy`);
  }
  const s = g.screenshot || {};
  need(s.src && s.width && s.height && s.alt, `${id}: screenshot {src, width, height, alt} is required`);
  if (g.status === "published" && s.src) {
    const p = join(ROOT, s.src);
    if (!existsSync(p)) need(false, `${id}: screenshot ${s.src} is missing`);
    else {
      const wh = webpSize(readFileSync(p));
      need(wh && wh[0] === s.width && wh[1] === s.height, `${id}: screenshot is ${wh ? wh.join("x") : "not a webp"}, manifest says ${s.width}x${s.height}`);
    }
  }
}
if (problems.length) { console.error("games.json has problems:\n- " + problems.join("\n- ")); process.exit(1); }

const published = manifest.games.filter((g) => g.status === "published");
const origins = [...new Set(published.map((g) => new URL(g.url).origin))].sort();
const families = manifest.families || {};

// ---------- colour: one hue per game, contrast-checked ----------
// Light and dark grounds the game ink must sit on (must match the tokens in src/style.css).
const GROUNDS = { light: ["#ebe6da", "#f6f3eb"], dark: ["#161618", "#212125"] };
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function oklch(L, C, H) {
  const h = (H * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lr = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  if (lr.some((v) => v < -0.0005 || v > 1.0005)) return null; // out of sRGB gamut
  return lr.map((v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; });
}
function inGamut(L, C, H) { for (let c = C; c >= 0; c -= 0.005) { const rgb = oklch(L, c, H); if (rgb) return rgb; } return oklch(L, 0, H); }
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
function hueOf(g) {
  if (typeof g.hue === "number") return g.hue;
  let h = 2166136261; for (const ch of g.slug) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 360;
}
function inkFor(H, grounds, dir) { // darkest-first (light theme) or lightest-first (dark theme) that passes 4.6:1
  for (let i = 0; i <= 100; i++) {
    const L = dir < 0 ? 0.70 - i * 0.005 : 0.62 + i * 0.005;
    const rgb = inGamut(L, 0.15, H);
    if (grounds.every((gr) => contrast(rgb, hex2rgb(gr)) >= 4.6)) return toHex(rgb);
  }
  throw new Error("no ink passes contrast for hue " + H);
}
const COLOURS = Object.fromEntries(published.map((g) => {
  const H = hueOf(g);
  return [g.slug, { hue: H, led: toHex(inGamut(0.80, 0.17, H)), light: inkFor(H, GROUNDS.light, -1), dark: inkFor(H, GROUNDS.dark, 1) }];
}));

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const host = (url) => new URL(url).host;
const fullTitle = (g) => (g.subtitle ? `${g.title}: ${g.subtitle}` : g.title);
const words = (n) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ?? String(n);
const shot = (g, { eager = false, cls = "" } = {}) =>
  `<img class="${cls}" src="/${esc(g.screenshot.src)}" width="${g.screenshot.width}" height="${g.screenshot.height}" alt="${esc(g.screenshot.alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;

// Latest = the last entry, in manifest order, among those added most recently.
const byDate = [...published].sort((a, b) => a.added.localeCompare(b.added));
const featured = published.find((g) => g.featured) || byDate[byDate.length - 1];

const ICON = {
  phone: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  keyboard: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2.5" y="6.5" width="19" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7.5 14h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  out: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function phoneNote(g, tag = "p") {
  const ok = g.mobile.supported;
  return `<${tag} class="phone ${ok ? "phone-yes" : "phone-no"}">${ok ? ICON.phone : ICON.keyboard}<span><b>${ok ? "Phone: yes." : "Phone: no."}</b> ${esc(g.mobile.note)}</span></${tag}>`;
}

// Controls: alternatives split on "or"; key-like tokens become keycaps, other words stay text.
const KEYWORD = /^(Esc|Tab|Enter|Space|Shift|Ctrl|Alt|[A-Za-z0-9.?<>/])$/;
function keys(spec) {
  return spec.split(/,?\s+or\s+/).map((alt) => {
    if (/^Arrow keys$/.test(alt)) return "<kbd>Arrow keys</kbd>";
    const toks = alt.split(/\s+/);
    if (toks.every((t) => KEYWORD.test(t) || t === "to")) return toks.map((t) => (t === "to" ? '<span class="to">to</span>' : `<kbd>${esc(t)}</kbd>`)).join(" ");
    return toks.map((t) => (KEYWORD.test(t.replace(/,$/, "")) && t.length <= 2 && t !== "a" ? `<kbd>${esc(t.replace(/,$/, ""))}</kbd>${t.endsWith(",") ? "," : ""}` : esc(t))).join(" ");
  }).join(' <span class="or">or</span> ');
}

function page({ title, desc, body, cls = "", script = false, path }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/big-shoulders-display-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/atkinson-hyperlegible-next-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
${script ? '<script src="/hub.js" defer></script>\n' : ""}</head>
<body class="${cls}">
<a class="skip" href="#main">Skip to content</a>
<header class="mast">
  <a class="brand" href="/"${path === "/" ? ' aria-current="page"' : ""}><span class="brand-led" aria-hidden="true"></span><span class="brand-word">Games</span></a>
  <span class="mast-by">by Michael King</span>
  ${path === "/" ? "" : '<a class="mast-back" href="/">All games</a>'}
</header>
${body}
<footer class="foot">
  <p>Unlisted and not indexed. No analytics and no trackers. This hub talks to no other site; a game's own site loads only after you press Play, inside a sandboxed frame.</p>
</footer>
</body>
</html>
`;
}

function bezel(g, inner, { led = true } = {}) {
  return `<div class="bezel"><div class="screen">${inner}</div>${led ? '<span class="led" aria-hidden="true"></span>' : ""}</div>`;
}

function cart(g, { wide = false, level = 3 } = {}) {
  const meta = [...g.tags, g.year].filter(Boolean).map(esc).join(" · ");
  return `<article class="cart g-${g.slug}${wide ? " cart-wide" : ""}">
  ${bezel(g, shot(g))}
  <div class="plate">
    <p class="cart-meta">${meta}</p>
    <h${level} class="cart-title"><a href="/${g.slug}/">${esc(g.title)}</a></h${level}>
    ${g.subtitle ? `<p class="cart-sub">${esc(g.subtitle)}</p>` : ""}
    <p class="cart-line">${esc(g.oneLine)}</p>
    ${phoneNote(g)}
  </div>
</article>`;
}

// Group the shelf: a family with two or more published games becomes one band.
function shelfGroups(list) {
  const out = [], done = new Set();
  for (const g of list) {
    if (done.has(g.slug)) continue;
    const kin = g.family ? list.filter((x) => x.family === g.family) : [g];
    kin.forEach((x) => done.add(x.slug));
    out.push(kin.length > 1 ? { family: g.family, games: kin } : { games: [g] });
  }
  return out;
}

// ---------- pages ----------
function home() {
  const phones = published.filter((g) => g.mobile.supported).length;
  const f = featured;
  const kin = f.family ? published.filter((x) => x.family === f.family && x !== f) : [];
  const groups = shelfGroups(published);
  const shelf = groups.map((gr) => {
    if (!gr.family) return cart(gr.games[0], { wide: true });
    const fam = families[gr.family] || {};
    return `<section class="family" aria-labelledby="fam-${esc(gr.family.toLowerCase())}">
  <header class="family-head">
    <p class="family-kicker">A pair · ${words(gr.games.length)} games, one sea</p>
    <h3 class="family-title" id="fam-${esc(gr.family.toLowerCase())}">${esc(fam.title || gr.family)}</h3>
    ${fam.line ? `<p class="family-line">${esc(fam.line)}</p>` : ""}
  </header>
  <div class="pair">
${gr.games.map((g) => cart(g, { level: 4 })).join("\n")}
  </div>
</section>`;
  }).join("\n");

  const body = `<main id="main" class="home">
<section class="hero" aria-labelledby="hero-h">
  <div class="hero-copy">
    <p class="kicker">Michael King · games</p>
    <h1 class="hero-title" id="hero-h">Small games, played in place.</h1>
    <p class="hero-dek">Each game is its own site. This page loads nothing from any of them; a game starts only when you press Play on its page.</p>
    <dl class="tally">
      <div><dt>Playable here</dt><dd>${published.length}</dd></div>
      <div><dt>Work on a phone</dt><dd>${phones}</dd></div>
      <div><dt>Need a keyboard</dt><dd>${published.length - phones}</dd></div>
    </dl>
  </div>
  <figure class="feature g-${f.slug}">
    <a class="feature-set" href="/${f.slug}/" aria-label="${esc(fullTitle(f))}">${bezel(f, shot(f, { eager: true }))}</a>
    <figcaption class="feature-cap">
      <p class="feature-kicker"><span class="tag-latest">Latest</span> Added ${day(f.added)}${f.family ? ` · ${esc(f.family)} pair` : ""}</p>
      <h2 class="feature-title"><a href="/${f.slug}/">${esc(f.title)}</a></h2>
      <p class="feature-line">${esc(f.oneLine)}</p>
      ${phoneNote(f)}
      ${kin.length ? `<p class="feature-kin">Pairs with ${kin.map((k) => `<a href="/${k.slug}/">${esc(k.title)}</a>`).join(", ")}.</p>` : ""}
    </figcaption>
  </figure>
</section>
<section class="shelf" aria-labelledby="shelf-h">
  <h2 class="sec-h" id="shelf-h">The shelf <span class="sec-count">${published.length} games</span></h2>
${shelf}
</section>
</main>`;
  return page({ title: "Games · Michael King", desc: "Small games by Michael King, played in place.", body, cls: "p-home", path: "/" });
}

function gamePage(g) {
  const kin = g.family ? published.filter((x) => x.family === g.family && x !== g) : [];
  const others = [...kin, ...published.filter((x) => x !== g && !kin.includes(x))];
  const meta = [g.family ? `${g.family} pair` : null, ...g.tags].filter(Boolean).map(esc).join(" · ");
  const flags = g.sandbox.map((f) => `<li><code>${esc(f)}</code> ${esc(g.sandboxWhy[f])}</li>`).join("\n        ");
  const feats = (g.allow || []).map((f) => `<li><code>allow="${esc(f)}"</code> ${esc(g.allowWhy[f])}</li>`).join("\n        ");
  const body = `<main id="main" class="game g-${g.slug} ${g.mobile.supported ? "mob-yes" : "mob-no"}">
<div class="game-head">
  <p class="kicker">${meta}</p>
  <h1 class="game-title">${esc(g.title)}${g.subtitle ? `<span class="game-sub">${esc(g.subtitle)}</span>` : ""}</h1>
  <p class="game-line">${esc(g.oneLine)}</p>
</div>
<section class="console" aria-label="Play ${esc(g.title)}" data-console data-url="${esc(g.url)}" data-title="${esc(fullTitle(g))}" data-sandbox="${esc(g.sandbox.join(" "))}" data-allow="${esc((g.allow || []).join("; "))}">
  <div class="bezel">
    <div class="screen" data-screen>
      ${shot(g, { eager: true, cls: "poster" })}
      <div class="insert" data-insert>
        <a class="play" href="${esc(g.url)}" data-play><span class="play-led" aria-hidden="true"></span>Play</a>
        <p class="insert-note">${g.mobile.supported ? "" : `${ICON.keyboard}<span>Needs a keyboard.</span> `}Loads from <span class="mono">${esc(host(g.url))}</span></p>
      </div>
      <button class="exit-fs" type="button" data-exit hidden>Exit full screen</button>
    </div>
  </div>
  <div class="deck">
    <span class="led" aria-hidden="true"></span>
    <p class="state" data-state role="status">Off. Nothing from the game has loaded.</p>
    <div class="deck-btns">
      <button type="button" data-fs hidden>Full screen</button>
      <button type="button" class="stop" data-stop hidden>Stop</button>
      <a class="newtab" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${ICON.out}Open in new tab</a>
    </div>
  </div>
  <p class="hint" data-hint hidden>Keys go to the game. If they stop, click the game. In full screen, Esc leaves full screen first.</p>
</section>
<div class="game-body">
  <div class="game-main">
    <section class="about" aria-labelledby="about-h">
      <h2 class="sec-h" id="about-h">About</h2>
      ${g.blurb.map((p) => `<p>${esc(p)}</p>`).join("\n      ")}
    </section>
    <section class="controls" aria-labelledby="controls-h">
      <h2 class="sec-h" id="controls-h">Controls</h2>
      <dl class="keys">
        ${g.controls.map(([what, k]) => `<div><dt>${esc(what)}</dt><dd>${keys(k)}</dd></div>`).join("\n        ")}
      </dl>
    </section>
  </div>
  <aside class="rail">
    <section class="rail-card phone-card" aria-labelledby="phone-h">
      <h2 class="rail-h" id="phone-h">On a phone</h2>
      ${phoneNote(g)}
    </section>
    <section class="rail-card" aria-labelledby="facts-h">
      <h2 class="rail-h" id="facts-h">Facts</h2>
      <dl class="facts">
        ${g.madeWith ? `<div><dt>Made with</dt><dd>${esc(g.madeWith)}</dd></div>` : ""}
        ${g.year ? `<div><dt>Year</dt><dd>${esc(g.year)}</dd></div>` : ""}
        <div><dt>On the shelf</dt><dd>${day(g.added)}</dd></div>
        <div><dt>Plays from</dt><dd class="mono">${esc(host(g.url))}</dd></div>
      </dl>
    </section>
    <section class="rail-card" aria-labelledby="frame-h">
      <h2 class="rail-h" id="frame-h">What the frame allows</h2>
      <ul class="flags">
        ${flags}${feats ? "\n        " + feats : ""}
      </ul>
      <p class="flags-rest">Everything else is off: no pop-ups, no dialogs, no navigating this page. The game never sees this hub's address.</p>
    </section>
  </aside>
</div>
${others.length ? `<nav class="more" aria-labelledby="more-h">
  <h2 class="sec-h" id="more-h">${kin.length ? "Its pair, and the rest of the shelf" : "Also on the shelf"}</h2>
  <div class="more-row">
${others.map((o) => cart(o, { level: 3 })).join("\n")}
  </div>
</nav>` : ""}
</main>`;
  return page({ title: `${fullTitle(g)} · Games`, desc: g.oneLine, body, cls: "p-game", script: true, path: `/${g.slug}/` });
}

function notFound() {
  const bars = published.map((g) => `<a class="bar g-${g.slug}" href="/${g.slug}/"><span>${esc(g.title)}</span></a>`).join("");
  const body = `<main id="main" class="lost">
  <div class="bezel lost-set"><div class="screen lost-screen">
    <p class="lost-sig">No signal</p>
    <nav class="bars" aria-label="Games">${bars}</nav>
  </div><span class="led" aria-hidden="true"></span></div>
  <div class="lost-copy">
    <p class="kicker">404</p>
    <h1 class="lost-title">Nothing on this channel.</h1>
    <p>There is no page at this address. Pick a game from the bars, or go back to <a href="/">the shelf</a>.</p>
  </div>
</main>`;
  return page({ title: "No signal · Games", desc: "Page not found.", body, cls: "p-lost", path: "/404" });
}

function gameCss() {
  const rules = published.map((g) => {
    const c = COLOURS[g.slug];
    const { width: w, height: h } = g.screenshot;
    return `.g-${g.slug}{--g-led:${c.led};--g-ink:${c.light};--g-hue:${c.hue}}\n` +
      `.g-${g.slug} .console .screen{aspect-ratio:${w} / ${h}}\n` +
      `.g-${g.slug} .console .bezel{max-width:calc((100svh - 10rem) * ${(w / h).toFixed(4)} + 2rem)}`;
  });
  const dark = published.map((g) => `.g-${g.slug}{--g-ink:${COLOURS[g.slug].dark}}`);
  return `\n/* ---- generated by build.mjs from games.json: one hue per game (OKLCH), ink checked at 4.6:1 ---- */\n${rules.join("\n")}\n@media (prefers-color-scheme: dark){\n${dark.join("\n")}\n}\n`;
}

// ---------- assemble ----------
const files = new Map(); // relative path in public/ -> Buffer
const put = (p, data) => files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
put("index.html", home());
for (const g of published) put(`${g.slug}/index.html`, gamePage(g));
put("404.html", notFound());
put("style.css", readFileSync(join(ROOT, "src/style.css"), "utf8") + gameCss());
put("hub.js", readFileSync(join(ROOT, "src/hub.js")));
put("icon.svg", readFileSync(join(ROOT, "src/icon.svg")));
for (const f of readdirSync(join(ROOT, "fonts"))) put(`fonts/${f}`, readFileSync(join(ROOT, "fonts", f)));
for (const g of published) put(g.screenshot.src, readFileSync(join(ROOT, g.screenshot.src)));

const fontBytes = [...files].filter(([p]) => p.endsWith(".woff2")).reduce((n, [, b]) => n + b.length, 0);
if (fontBytes > 200 * 1024) { console.error(`fonts are ${fontBytes} bytes, over the 200 KB budget`); process.exit(1); }

// vercel.json: frame-src is generated from the published origins.
const vercelPath = join(ROOT, "vercel.json");
const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
const cspHeader = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy");
const frameSrcOf = (csp) => (csp.match(/frame-src ([^;]*)/)?.[1] || "").trim().split(/\s+/).filter(Boolean).sort();
const wantCsp = cspHeader.value.replace(/frame-src [^;]*/, `frame-src ${origins.join(" ")}`);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [relative(OUT, p)]; });
}

if (CHECK) {
  const errs = [];
  const onDisk = new Set(walk(OUT));
  for (const [p, buf] of files) {
    if (!onDisk.has(p)) errs.push(`missing: public/${p}`);
    else if (!readFileSync(join(OUT, p)).equals(buf)) errs.push(`stale: public/${p}`);
    onDisk.delete(p);
  }
  for (const p of onDisk) errs.push(`unexpected: public/${p}`);
  const have = frameSrcOf(cspHeader.value);
  if (have.join(" ") !== origins.join(" ")) errs.push(`vercel.json frame-src is [${have.join(" ")}], published origins are [${origins.join(" ")}]`);
  for (const [p, buf] of files) if (p.endsWith(".html") && /\sstyle=|<style|\son[a-z]+=|<script>|<script(?![^>]*\ssrc=)/i.test(buf.toString())) errs.push(`inline style or script in public/${p}`);
  if (errs.length) { console.error("build --check FAILED:\n- " + errs.join("\n- ") + "\nRun `node build.mjs` and commit."); process.exit(1); }
  console.log(`build --check OK: ${files.size} files current; frame-src = ${origins.join(" ")}; fonts ${fontBytes} bytes`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [p, buf] of files) { mkdirSync(dirname(join(OUT, p)), { recursive: true }); writeFileSync(join(OUT, p), buf); }
  if (cspHeader.value !== wantCsp) { cspHeader.value = wantCsp; writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n"); }
  console.log(`built ${files.size} files into public/ (${published.length} published: ${published.map((g) => g.slug).join(", ")}); frame-src = ${origins.join(" ")}`);
}
