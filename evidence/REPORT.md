# Games hub: verification report

Date: 2026-11-25. Build: `public/` from `games.json` (3 published: FOUNDRY, Tidepool, Red Queen; Word From Below
`pending-deploy`, so it is not rendered and not in `frame-src`). Served locally by `tools/serve.mjs`, which applies
every header in `vercel.json`. Browser: Playwright's Chromium 1243 (`/opt/pw-browsers`), nothing installed.
Raw results: `verify.json` and `lighthouse-*.json`. Screenshots are deviceScaleFactor 2 (JPEG quality 85).
Rerun: `node tools/serve.mjs &` then `NODE_PATH=$(npm root -g) node tools/verify.cjs`.

## Results

| Check | Result |
|---|---|
| `node build.mjs --check` | OK: 17 files current; frame-src = foundry-severance, redqueen-mu, tidepool-chi (`.vercel.app`); fonts 62,292 bytes |
| Headers on every response | CSP as specified, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` |
| `<meta name="robots" content="noindex, nofollow">` | on all 20 page views |
| Inline style or script | none (`--check` greps every generated page; the CSP has no `unsafe-inline`) |
| Hub console errors | 0 across 20 page views and 6 plays (the 404 page's own 404 status is excluded, as intended) |
| CSP violations | 0 (a `securitypolicyviolation` listener in every hub document) |
| Other-origin requests before Play | 0 on every page view; 0 before the Play click on each game page |
| Horizontal overflow | none at 390 or 1440, light or dark |
| Play, all 3 games at 390 and 1440 | 6/6 frames loaded; focus in the iframe on start 6/6; Stop removes the iframe 6/6 and returns focus to Play |
| FOUNDRY accepts a key | yes: after its POWER ON button, ArrowRight and ArrowDown changed the frame at both widths, `i` at 1440 (`play-foundry-severance-1440-2-after-key.jpg`: "Plank wall blocks the way") |
| Tidepool input | `S` started a storm ("a storm churns the water"); 5 taps (390) or clicks (1440) added plants (115 to 139; 182 to 233) |
| Red Queen input | `3` selected the Jolt card; taps (390) and clicks (1440) scored 523 and 203 |
| Full screen (1440) | entered, "Exit full screen" visible, exit worked, focus back in the game, for all 3 |
| JavaScript off | Play is a plain link to `https://foundry-severance.vercel.app/`; all 8 control rows and the phone note visible; no iframe |
| 404 | status 404, a "No signal" page with one colour bar per published game |
| Console errors inside the game frames | none for any of the three |

## Lighthouse 12.8.2, mobile

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Home | **100** | 100 | 100 | 63 | 1.1 s | 1.8 s | 0 | 0 ms |
| FOUNDRY | 100 | 100 | 100 | 63 | 1.1 s | 1.8 s | 0 | 0 ms |
| Red Queen | 100 | 100 | 100 | 63 | 1.1 s | 1.8 s | 0 | 0 ms |
| Tidepool | 100 | 100 | 100 | 63 | 1.1 s | 1.8 s | 0 | 0 ms |

SEO 63 is by design: the only failing audit is `is-crawlable` ("Page is blocked from indexing"), which is the noindex.

## Inventory of the two new games

Both were read from their served HTML (each is one file with inline CSS and script), loaded directly at 390x844
(touch) and 1280x800, and framed from the local server with different sandbox sets. Scripts: `inventory/*.cjs`.

**Tidepool** (`https://tidepool-chi.vercel.app/`, page title "TIDEPOOL — a small ocean that runs itself").
- A self-running evolution simulation. Controls, from its help panel and code: click or tap drops nutrients, drag
  stirs a current, `S` or the storm button calls a storm, a ♪ button toggles a drone whose pitch follows population,
  `?` opens help. No score and no end.
- 390 px: no horizontal overflow; its own CSS hides the stats panel under 640 px. Touch works (pointer events,
  `touch-action: none`): taps added plants. `inventory/tidepool-direct-390.webp`.
- Sandbox: runs fully with `allow-scripts` alone (storm, taps, sound toggle). It uses no storage, so
  `allow-same-origin` is not needed. No forms, pop-ups, downloads or clipboard. No console errors.

**Red Queen** (`https://redqueen-mu.vercel.app/`, page title "TIDEPOOL: RED QUEEN").
- **Related to Tidepool**: the same title prefix, visual language and `tide()` water-current function. It turns
  the sea into a game: a 3:30 run, three tools (Net, Lure, Jolt) on `1 2 3` or by tapping a card, click or tap to
  strike, a power draft every 35 s tide, and a daily-challenge seed. Presented as the Tidepool pair.
- 390 px: no page overflow, and touch works (taps start a run and score). But the tool bar is 398 px wide and loses
  4 px each side, and the power draft's three 150 px cards span -103 to 493 px, so only the middle card is fully on
  screen (`inventory/red-queen-390-power-draft.webp`). The phone note says so.
- Sandbox: `allow-scripts` alone. No storage, forms or pop-ups. Its Copy result button calls
  `navigator.clipboard.writeText`, which the iframe's permissions policy blocks unless the frame has
  `allow="clipboard-write"`; with it, the copy succeeds. Without it the button still shows "COPIED" (the rejection is
  not caught). So the manifest grants `allow: ["clipboard-write"]`, with that reason.
- Observed bugs in the game (not the hub): the multiplier under the score is printed unrounded, for example
  "EXPLOIT ×3.7926894293843754 Lure" (visible in its screenshot), and the tool card descriptions overflow into their
  bars at 1280. No console errors.

**Framing.** Neither sends `X-Frame-Options` or a CSP. Both rendered and ran inside sandboxed iframes on
`localhost`, and on the hub's game pages under the hub's CSP.

## Best screenshots

1. `home-1440-light-fold.jpg`: the hero and the lit featured bezel.
2. `home-390-dark.jpg`: the whole home page on a phone, dark.
3. `play-foundry-severance-1440-2-after-key.jpg`: FOUNDRY running in place after keys.
4. `play-red-queen-390-2-after-input.jpg`: a touch game taking the phone width while it runs.

Also: `foundry-severance-{390,1440}-{light,dark}.jpg`, `404-*.jpg`, `play-*-3-fullscreen.jpg`.

## Not covered

- Real phones and real touch hardware (Chromium emulation only); iOS Safari, which has no element full screen
  (the Full screen button hides itself when the API is missing).
- The live domain: DNS and Vercel are not set up yet, so headers were verified on the local server only.
- The local servers used for this report were stopped afterwards.
