# games_hub

Michael King's games hub, for **games.michaelking.systems**. A static site generated from one manifest.

Public but unlinked: nothing on michaelking.systems links here, every page is `noindex` (header and meta),
and there are no analytics or trackers. The only other origins a visitor's browser ever contacts are the
games themselves, and only after pressing Play. Design rules: [DESIGN.md](DESIGN.md).

## Layout

| Path | What |
|---|---|
| `games.json` | The manifest. The only file you edit to add, hide or change a game. |
| `shots/` | One 1280x800 webp screenshot per game (source). |
| `build.mjs` | Generates `public/` and the `frame-src` in `vercel.json`. Node 18+, no dependencies. |
| `src/` | Hand-written `style.css`, `hub.js` (click to play) and `icon.svg`. |
| `fonts/` | Self-hosted woff2 files and their OFL licences (62 KB). |
| `public/` | Generated output. Committed, and it is exactly what Vercel serves. |
| `vercel.json` | Headers (CSP, `X-Robots-Tag`, `Referrer-Policy`, `nosniff`), `outputDirectory`, trailing slashes. |
| `tools/serve.mjs` | Local server that applies `vercel.json` like Vercel does. |
| `tools/verify.cjs` | Playwright checks and screenshots (see `evidence/REPORT.md`). |

```sh
node build.mjs            # regenerate public/ and vercel.json frame-src
node build.mjs --check    # fail if public/ is stale or frame-src differs from the published origins
node tools/serve.mjs      # http://localhost:4173
```

## Adding a game

1. Put a real 1280x800 screenshot of the game in play at `shots/<slug>.webp` (quality about 78; 25 to 45 KB).
2. Add one entry to `games.json`:

   | Field | Notes |
   |---|---|
   | `slug` | URL path, `/<slug>/`. Lowercase words joined by hyphens. |
   | `title`, `subtitle` | Title as the game shows it; subtitle optional. |
   | `oneLine`, `blurb` | One sentence; then a list of paragraphs. Only what you observed in the game. |
   | `controls` | `[action, keys]` pairs. In `keys`, "or" separates alternatives; single keys, `Esc`, `Tab`, `Enter`, `Space` and `Arrow keys` render as keycaps. |
   | `mobile` | `{ "supported": true/false, "note": "..." }`. Try it at 390 px first; say what fails. |
   | `url` | The game's https URL. Its origin goes into `frame-src` while the game is published. |
   | `sandbox`, `sandboxWhy` | Minimum flags, each with a reason. Start from `allow-scripts` alone and add only what breaks without it. |
   | `allow`, `allowWhy` | Permissions-policy features for the iframe (for example `clipboard-write`), each with a reason. |
   | `status`, `reason` | `published` (rendered, framed), `pending-deploy` or `excluded` (neither). |
   | `screenshot` | `{ src, width, height, alt }`. The build checks the file's real dimensions. |
   | `year`, `madeWith`, `tags` | If known. |
   | `hue` | Optional, 0 to 360: the game's colour, taken from its own UI. Otherwise derived from the slug. |
   | `family` | Optional. Games sharing a family are shown together; describe it once under `families`. |
   | `added` | `YYYY-MM-DD`. The latest added published game is featured on home (or set `"featured": true`). |

3. Check that the game can be framed: its site must not send `X-Frame-Options`, and any CSP
   `frame-ancestors` must include `https://games.michaelking.systems`.
4. `node build.mjs`, then `node build.mjs --check`, look at it with `node tools/serve.mjs`, and commit
   `games.json`, `shots/`, `public/` and `vercel.json` together.

To hide a game, set its status to `pending-deploy` or `excluded` and rebuild: its page, screenshot and origin
all leave the output and the CSP.

## Deploying on Vercel

1. Vercel: Add New, Project, import `mlawsonking/games_hub`.
2. Framework Preset: **Other**. Root Directory: the repo root.
3. Build Command: **override it and leave it empty**. Output Directory: `public` (also set in `vercel.json`).
   No environment variables.

Why no build command: `public/` is committed, so what is reviewed in a pull request is byte for byte what
ships, the deploy does not depend on a Node version, and `node build.mjs --check` (run before committing, or
in CI) fails if anyone edits the manifest without regenerating. Using `node build.mjs` as the build command
would also work, since the build is deterministic, but it would rewrite `vercel.json` inside the deploy and
add a step that can only reproduce what is already committed.

After the first deploy, Settings, Domains: add `games.michaelking.systems`. Vercel shows the DNS record it wants.

## DNS (Namecheap)

michaelking.systems uses Namecheap DNS. In Namecheap: Domain List, Manage, Advanced DNS, Add New Record:

| Type | Host | Value | TTL |
|---|---|---|---|
| CNAME | `games` | the target Vercel shows for the domain (for example `cname.vercel-dns.com.`, or a project-specific `...vercel-dns-0xx.com.`) | Automatic |

Use exactly the value Vercel displays. Then wait for Vercel to verify the domain and issue the certificate.

## Word From Below

Its manifest entry is `pending-deploy`. To publish it: create its Vercel project (see `DEPLOY.md` in
`word_from_below`), merge that repo's `hub-framing` branch (adds `https://games.michaelking.systems` to its
`frame-ancestors`), set its status to `published` here, rebuild, check, commit.
