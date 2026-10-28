// Build-time SEO: the site is a client-rendered SPA with two pages, but link previews (Discord,
// Twitter, Slack) and many crawlers read only the served HTML. This plugin writes the head tags
// into index.html, emits a second copy for /app with its own title and description, and generates
// robots.txt and sitemap.xml.
//
// Set VITE_SITE_URL (e.g. https://phifarm.example.com) at build time: canonical URLs, og:image and
// the sitemap must be absolute.
import { loadEnv, type Plugin } from 'vite';
import { FAQ } from './src/pages/faq';

type Page = 'home' | 'app';

const NAME = 'PhiFarm';
const ACCENT = '#7dd3fc'; // Discord uses theme-color as the embed's left stripe
const OG_ALT = 'PhiFarm: a plan of the Goods to cut to raise your Phigros RKS, built from your B30 image';

const PAGES: Record<Page, { path: string; title: string; description: string; fallback: string }> = {
  home: {
    path: '/',
    title: 'PhiFarm – Phigros RKS Calculator & B30 Push Planner',
    description:
      'Drop your Phigros B30 screenshot and get the exact Goods to cut, the charts to farm and the APs to aim for to reach your RKS goal. Free, runs in your browser.',
    fallback:
      '<h1>PhiFarm: Phigros RKS calculator and B30 push planner</h1><p>Drop your Phigros B30 image and get the exact Goods to cut, the charts to farm and the APs to aim for to reach your RKS goal. Free, and everything runs in your browser.</p><p><a href="/app">Open the app</a></p>',
  },
  app: {
    path: '/app',
    title: 'PhiFarm App – Read your B30 and plan your RKS',
    description:
      'Scan a PhiBot or PSL B30 image, fix any misread cards, simulate Good counts and get the cheapest plan to your target RKS. Nothing is uploaded.',
    fallback:
      '<h1>PhiFarm app</h1><p>Drop a PhiBot or PSL B30 image to read your scores and plan the cheapest route to your target Phigros RKS.</p><p><a href="/">About PhiFarm</a></p>',
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

function headTags(page: Page, site: string, base: string): string {
  const { title, description, path } = PAGES[page];
  const url = site ? site + path : '';
  const image = site ? `${site}/og.png` : `${base}og.png`;
  const meta: string[] = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<meta name="theme-color" content="${ACCENT}" />`,
    ...(url ? [`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`] : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${NAME}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(OG_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${esc(OG_ALT)}" />`,
  ];
  if (page === 'app') meta.push(`<link rel="preload" href="${base}phigros_meta.json" as="fetch" crossorigin />`);

  const graph: unknown[] = [
    {
      '@type': 'WebApplication',
      name: NAME,
      description: PAGES.home.description,
      ...(site ? { url: site + '/' } : {}),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript',
      inLanguage: 'en',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ];
  if (page === 'home') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: FAQ.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  meta.push(ld({ '@context': 'https://schema.org', '@graph': graph }));
  return meta.join('\n    ');
}

const SEO_BLOCK = /<!--seo-->[\s\S]*?<!--\/seo-->/;
const FALLBACK_BLOCK = /<!--fallback-->[\s\S]*?<!--\/fallback-->/;

export function seo(): Plugin {
  let site = '';
  let base = '/';
  return {
    name: 'phifarm-seo',
    configResolved(config) {
      base = config.base;
      site = (loadEnv(config.mode, config.root, 'VITE_').VITE_SITE_URL ?? '').replace(/\/+$/, '');
      if (config.command === 'build' && !site) {
        config.logger.warn(
          '[seo] VITE_SITE_URL is not set: canonical URLs, absolute og:image and sitemap.xml are skipped, ' +
            'so link previews will not show an image. Set it to your public origin, e.g. https://phifarm.example.com',
        );
      }
    },
    transformIndexHtml(html) {
      return html
        .replace(SEO_BLOCK, `<!--seo-->\n    ${headTags('home', site, base)}\n    <!--/seo-->`)
        .replace(FALLBACK_BLOCK, `<!--fallback-->${PAGES.home.fallback}<!--/fallback-->`);
    },
    // After Vite's own html plugin has emitted index.html (and hashed asset URLs are in it).
    generateBundle: { order: 'post', handler(_, bundle) {
      const index = bundle['index.html'];
      if (index?.type === 'asset') {
        const home = String(index.source);
        // app.html, not app/index.html: Workers static assets serve /app from app.html without a redirect.
        this.emitFile({
          type: 'asset',
          fileName: 'app.html',
          source: home
            .replace(SEO_BLOCK, `<!--seo-->\n    ${headTags('app', site, base)}\n    <!--/seo-->`)
            .replace(FALLBACK_BLOCK, `<!--fallback-->${PAGES.app.fallback}<!--/fallback-->`),
        });
      }
      const day = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`,
      });
      if (site) {
        const urls = (Object.keys(PAGES) as Page[])
          .map((p) => `  <url><loc>${site}${PAGES[p].path}</loc><lastmod>${day}</lastmod></url>`)
          .join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      }
    } },
  };
}
