# Games hub: design

The hub is a sibling of Isomorph (`personal_publication/DESIGN.md`): same standard of craft and privacy, but a
different job and so a different identity. Isomorph is a magazine you read. The hub is a place you play.

## 1. Identity: the bezel

**The hub is the cabinet around the screen.** Its pages are matte and physical, so that each game's own screen
is the only light on the page.

- Every game sits in a **bezel**: a dark surround with a thicker chin, the same in both themes, because the
  games are dark screens. The screenshot (or, after Play, the game itself) is the screen.
- Each bezel has an **LED**. It is off by default, lights in the game's colour when the game is running, and
  warms on hover and focus, like a power light. The featured game's LED is lit because it is the one "on" on
  the home page. The house LED next to the wordmark is lit because the hub itself is on.
- Under each bezel is a **label plate**: a paper card with a stripe in the game's colour, its title set like
  embossed type, its one line, and the phone note. It is a cartridge label, not a "card".
- The hub's case is warm putty in light and graphite in dark. Neither theme glows.

## 2. Principles

1. **The game is the light source.** Nothing in the hub glows, animates on its own or competes with a
   screenshot. *Rules out:* gradients, neon, hero video, autoplaying anything, a game preview iframe on home.
2. **Nothing loads until Play.** A game is another site. The hub makes no request to it, and has no iframe,
   until the person presses Play on that game's page. *Rules out:* `loading="lazy"` iframes, hover previews,
   prefetching game URLs, link previews.
3. **Honest apparatus.** Every device says something true: the LED shows running state, the tally counts
   published games, the phone note says exactly what was observed at 390 px, the "What the frame allows" list
   is the iframe's real sandbox with a reason for each flag. *Rules out:* "Works everywhere!", star ratings,
   play counts, fake progress.
4. **One entry, one screenshot.** The page is generated from `games.json`. A new game needs no new markup,
   colour or CSS by hand. *Rules out:* per-game templates, hand-made banners.
5. **Readable without script.** Every word, control list and note is in the HTML. Without JavaScript the
   Play control is a plain link to the game. *Rules out:* client-rendered content, JS-only navigation.
6. **Private by construction.** CSP `default-src 'self'`, self-hosted fonts, `noindex` header and meta,
   `no-referrer`. *Rules out:* analytics, CDNs, embeds, `style=""`, `<style>`, inline scripts and handlers.

## 3. Type

| Role | Face | Where |
|---|---|---|
| Display | Big Shoulders Display 800 (static, Latin, 14 KB) | hero, game titles, section heads, the Play key, tally numerals |
| Text and UI | Atkinson Hyperlegible Next (variable 200 to 800, Latin, 34 KB) | body, notes, buttons, labels |
| Keys and data | JetBrains Mono 400 to 500 (14 KB, shared with Isomorph) | keycaps, domains, tags, dates, sandbox flags |

Big Shoulders is condensed and blunt, like lettering on a cabinet or a cartridge, and it is always set in
capitals. Atkinson Hyperlegible was drawn for legibility, which matters most in the phone notes and controls.
All three are SIL OFL 1.1 (licences in `fonts/`). Total 62 KB, budget 200 KB. Display and text are preloaded
with `font-display: optional`, so a late font never shifts the layout (CLS 0).

Controls are drawn as **keycaps**: `<kbd>` with a heavier bottom edge. Alternatives are joined by a quiet "or".

## 4. Colour

- Tokens live on `:root` in `src/style.css` and are redefined once under `prefers-color-scheme: dark`.
  The hub follows the system theme; there is no toggle.
- Light: case `#ebe6da`, deeper case `#e1dbcc`, label `#f6f3eb`, ink `#1c1a16`, muted `#5a554b`.
  Dark: case `#161618`, label `#212125`, ink `#ecebe5`, muted `#a6a49c`. Bezel and screen are dark in both.
- **Each game owns one hue.** `build.mjs` takes `hue` from the manifest (chosen from the game's own UI:
  FOUNDRY's amber, Tidepool's teal, Red Queen's red) or derives one from the slug. From it the build makes
  `--g-led` (OKLCH lightness 0.80, the LED and the 404 bars) and `--g-ink` (searched in OKLCH until it passes
  4.6:1 on the case and the label in each theme), written into `style.css` as `.g-<slug>` rules. The game colour
  is used for the label stripe, the kicker, the subtitle, sandbox flag names and focus rings, never for body text
  or big fills.
- Muted text passes 5.3:1 or more on every ground in both themes.

## 5. Layout

- One page width (86 rem) and one gutter (16 px minimum). Nothing scrolls sideways at 390 px.
- **Home.** A hero, never a list: the headline and an honest tally (playable, work on a phone, need a keyboard)
  on the left; the latest game in a large lit bezel on the right with its phone note. Then **the shelf**:
  a game on its own gets a wide row (bezel left, plate right); games that share a `family` become one band
  (the Tidepool pair) with a line saying how they relate.
- **Game page.** Title, then the console: the bezel with the screenshot under a scrim and a physical Play key,
  then a deck with the LED, a live status line, Full screen, Stop and Open in new tab. Below: About and Controls,
  with a rail for the phone note, facts and what the frame allows. Then the rest of the shelf, family first.
- **While playing on a phone**, a touch game takes the full width and most of the height; a keyboard game keeps
  its frame and its note.
- **404** is a bezel showing "No signal" over colour bars, one per published game, each a link to it.

## 6. Motion

One moment: when a game starts, its frame powers on (a CRT-style line opening to the full screen, 420 ms).
Otherwise only responses: the LED warming on hover, the bezel lifting 3 px, the Play key pressing in.
`prefers-reduced-motion: reduce` turns all of it off. Nothing starts invisible; nothing moves on scroll.

## 7. What the hub will never do

- Request anything from another origin before Play, or load fonts, scripts, images or analytics from one.
- Write inline style or script, or relax the CSP to make something easier.
- Show a game that is not `published`, or put its origin in `frame-src`.
- Grant a sandbox flag or permission without a written reason in the manifest; grant
  `allow-top-navigation` or `allow-popups-to-escape-sandbox` at all; or host a game on the hub's own origin,
  where `allow-same-origin` would hand it the hub.
- Claim a game works on a phone without trying it at 390 px.
- Make a game page look like another: the bezel and plate are shared, the hue and the screenshot are the game's.
- Link to itself from the portfolio, or ask to be indexed.
