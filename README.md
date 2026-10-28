# PhiFarm

Client-side Phigros RKS farm & push optimizer. Drop a phibot.dev B30 image; PhiFarm reads every
card (jacket perceptual hash + numeric OCR), lets you fix anything doubtful, and ranks what to
play next. Spec: [docs/PRD.md](docs/PRD.md).

```bash
npm install
npm run dev        # app at http://localhost:5173
npm test           # unit + end-to-end OCR tests (OCR tests need `npm run data:fetch` once)
npm run data       # rebuild public/phigros_meta.json from open sources (~2.7 GB streamed, ~100 MB cached)
```

## How it works

- `scripts/fetch-sources.ts` pulls constants/note counts/aliases from `phibot.dev/api/charts`,
  raw chart JSONs and illustrations from `7aGiven/Phigros_Resource`, reducing each chart to
  tap/drag/hold/flick counts, duration and peak NPS. `scripts/build-meta.ts` hashes the jackets
  and writes `public/phigros_meta.json` (~250 KB).
- `src/lib/layout.ts` holds the card-grid template and finds filled slots by text sharpness
  (the background is a blurred illustration, the cards are crisp).
- `src/lib/imagehash.ts` matches jackets with a 256-bit dHash + 4×4 colour grid over the part of
  the illustration no card overlay covers. `src/lib/ocr.ts` reads accuracy, difficulty and per-chart
  RKS with Tesseract restricted to digits/level letters.
- `src/lib/resolve.ts` cross-checks the three numbers (chart RKS = f(acc, C)), so a misread
  badge or accuracy is caught and flagged yellow instead of silently accepted.
- `src/lib/farm.ts` evaluates "total RKS if this chart scored X" in O(30) and drives the
  Unplayed / Dirty Cleanup / Phi3 Sniper modes and the goal planner. The planner greedily takes
  the improvement with the best RKS per unit of effort, where effort is the log of how much of
  your error you remove. Charts you have played are capped at a skill ceiling built from your
  own top scores at that difficulty (there is no public crowd data on what players reach).
  Unplayed charts are expected at your comfort level: the median constant of your best 27, and
  your median accuracy there, dropping 1.5·d + d² percent at d constants above it. APs are only
  proposed within 5 Goods, or 15 Goods on charts no harder than your hardest AP.
- Farmability and AP ease are heuristics from the chart files alone (note-type mix, note count,
  peak density), not from player data.
- UI: React + Tailwind v4. `/` is the landing page, `/app` the tool (a path switch in
  `src/App.tsx`; static hosts must serve `index.html` for `/app`, which Cloudflare Pages does).

## Deviations from the PRD

- **Drag and Flick** are the Perfect-or-Miss notes; Holds can be Good. The safe-note term of
  the Farmability Score uses `(Drag + Flick) / N`.
- **Max Goods**: with accuracy in percent, each Good costs `35 / N` points, so
  `maxGoods = floor(N × (100 − target) / 35)` (the PRD's `/0.35` assumes a 0–1 scale).
- **Community priors** (AP%, FC%, percentiles) have no public source (phib19.top requires a
  TapTap login), so none are bundled. The Data tab imports them as JSON; Farmability, Dirty
  Cleanup and the AP sniper use them when present and renormalise their weights when absent.
- **Layouts**: two verified templates, the phibot.dev / PhiBot render (3 columns + overflow,
  4-decimal accuracy) and the PSL Discord bot (2 columns, 2-decimal accuracy, so totals are only
  known to about ±0.002). Other renders (phi-plugin) need the grid-calibration sliders or manual
  entry until a real sample is measured and added to `TEMPLATES`.
- Songs newer than the open mirror (Introduction, Anomaly, Destination) have constants and note
  counts but no jacket hash or note breakdown; pick them by hand in the table.

## SEO and link previews

Discord, Twitter and most crawlers read only the served HTML, so `vite-seo.ts` writes the head tags
at build time: title, description, canonical URL, Open Graph / Twitter card, and JSON-LD
(`WebApplication` on both pages, `FAQPage` on the landing page, from `src/pages/faq.ts`). It also
emits `app.html` (served at `/app` with its own title and description), `robots.txt` and
`sitemap.xml`. The preview image is `public/og.png` (1200×630).

**Set `VITE_SITE_URL`** (your public origin, no trailing slash, e.g. `https://phifarm.example.com`)
as a build variable in Cloudflare (Settings → Build → Variables and secrets) or in
`.env.production`. Canonical URLs, an absolute `og:image` and the sitemap need it; without it the
build warns and link previews show no image. `public/_headers` sets long-lived caching for the
fingerprinted `/assets/*`.
