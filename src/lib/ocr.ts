// Numeric OCR on tightly cropped card sub-regions, and parsing/validation of what it reads.
// Engine-agnostic: the browser and the Node tests each supply a Recognizer.

import type { Rect, Rgba } from './imagehash';
import { LEVELS, type Level } from './meta';

/** No chart is rated above this; anything larger is a misread. */
const MAX_CONSTANT = 18.5;

export const OCR_WHITELIST = '0123456789.%EZHDINATSP ';

export interface OcrResult {
  text: string;
  confidence: number; // 0..100
}

export type Recognizer = (img: Rgba) => Promise<OcrResult>;

/**
 * Crop `rect`, upscale to ~`targetH` px tall, and binarise with Otsu so the (bright) card text
 * becomes black on white, which is what Tesseract is trained on.
 */
export function preprocess(img: Rgba, rect: Rect, targetH = 72, stretchX = 1): Rgba {
  const scale = targetH / rect.h;
  const sx = scale * stretchX; // widening condensed fonts helps Tesseract separate thin glyphs
  const w = Math.max(1, Math.round(rect.w * sx));
  const h = Math.max(1, Math.round(rect.h * scale));
  const lum = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Bilinear sample from the source.
      const srcX = Math.min(img.width - 1.001, Math.max(0, rect.x + (x + 0.5) / sx - 0.5));
      const sy = Math.min(img.height - 1.001, Math.max(0, rect.y + (y + 0.5) / scale - 0.5));
      const x0 = Math.floor(srcX), y0 = Math.floor(sy), fx = srcX - x0, fy = sy - y0;
      const L = (xx: number, yy: number) => {
        const i = (yy * img.width + xx) * 4;
        return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      };
      lum[y * w + x] =
        L(x0, y0) * (1 - fx) * (1 - fy) + L(x0 + 1, y0) * fx * (1 - fy) +
        L(x0, y0 + 1) * (1 - fx) * fy + L(x0 + 1, y0 + 1) * fx * fy;
    }
  }
  const thr = otsu(lum);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = lum[i] > thr ? 1 : 0;
  dropNonText(ink, w, h);
  // Pad with white so glyphs never touch the border.
  const pad = Math.round(targetH * 0.25);
  const W = w + pad * 2, H = h + pad * 2;
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x]) {
        const i = ((y + pad) * W + x + pad) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width: W, height: H };
}

/**
 * Remove ink that cannot be text: blobs reaching the right edge (the neighbouring jacket
 * bleeding into the crop), thin rules (text-box borders), and shapes much taller than the
 * glyphs. Small dots are kept: decimal points matter.
 */
function dropNonText(ink: Uint8Array, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1);
  const comps: Array<{ px: number[]; x0: number; x1: number; y0: number; y1: number }> = [];
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || label[start] >= 0) continue;
    const c = { px: [] as number[], x0: w, x1: 0, y0: h, y1: 0 };
    const stack = [start];
    label[start] = comps.length;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      c.px.push(i);
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (ink[j] && label[j] < 0) { label[j] = comps.length; stack.push(j); }
        }
      }
    }
    comps.push(c);
  }
  // Glyph height: median height of the components that look like characters.
  const heights = comps.map((c) => c.y1 - c.y0 + 1).filter((v) => v > h * 0.3 && v < h * 0.95).sort((a, b) => a - b);
  const glyph = heights.length ? heights[heights.length >> 1] : h * 0.6;
  // The text band: vertical span of glyph-sized components. Specks and dashed rules entirely
  // above or below it are noise (Tesseract's single-line mode can give up on them).
  const glyphs = comps.filter((c) => Math.abs(c.y1 - c.y0 + 1 - glyph) <= glyph * 0.35);
  const bandTop = glyphs.length ? Math.min(...glyphs.map((c) => c.y0)) : 0;
  const bandBottom = glyphs.length ? Math.max(...glyphs.map((c) => c.y1)) : h - 1;
  for (const c of comps) {
    const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1;
    const touchesRight = c.x1 >= w - 1;
    const rule = ch <= Math.max(2, glyph * 0.2) && cw > glyph * 1.5;
    const tooTall = ch > glyph * 1.5;
    const outsideBand = c.y1 < bandTop - 1 || c.y0 > bandBottom + 1;
    if (touchesRight || rule || tooTall || outsideBand) for (const i of c.px) ink[i] = 0;
  }
}

function otsu(values: Float64Array): number {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  return thr;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "AT 17.3" -> { level: 'AT', constant: 17.3 }. Either part may be missing. */
export function parseDifficulty(text: string): { level?: Level; constant?: number } {
  const t = clean(text).toUpperCase();
  const lv = LEVELS.find((l) => t.includes(l)) ?? levelByLetters(t);
  // Small badges often lose the decimal point: "173AT" is 17.3.
  const num = t.match(/(\d{1,2})\.(\d)/) ?? t.match(/(?<!\d)(\d{2})(\d)(?!\d)/);
  return { level: lv, constant: num ? Number(`${num[1]}.${num[2]}`) : undefined };
}

/** Each letter belongs to exactly one difficulty name, so partial badges still vote: "3A" is AT. */
const LETTER_LEVEL: Record<string, Level> = { E: 'EZ', Z: 'EZ', H: 'HD', D: 'HD', I: 'IN', N: 'IN', A: 'AT', T: 'AT', S: 'SP', P: 'SP' };

function levelByLetters(t: string): Level | undefined {
  const votes = new Map<Level, number>();
  for (const ch of t) if (LETTER_LEVEL[ch]) votes.set(LETTER_LEVEL[ch], (votes.get(LETTER_LEVEL[ch]) ?? 0) + 1);
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : undefined;
}

/** "99.6974%" -> 99.6974. Accepts a missing decimal point when exactly 6-7 digits were read. */
export function parseAccuracy(text: string): number | undefined {
  const t = clean(text).replace(/\s/g, '');
  let m = t.match(/(\d{2,3})\.(\d{2,4})/);
  if (m) {
    const v = Number(`${m[1]}.${m[2]}`);
    return v >= 0 && v <= 100 ? v : undefined;
  }
  m = t.match(/^(\d{6,7})%?$/);
  if (m) {
    const d = m[1];
    const v = Number(`${d.slice(0, d.length - 4)}.${d.slice(-4)}`);
    return v <= 100 ? v : undefined;
  }
  return undefined;
}

/** "17.0681" (phibot) or "17.08" (PSL) */
export function parseChartRks(text: string, decimals = 4): number | undefined {
  const t = clean(text).replace(/\s/g, '');
  const m = t.match(/(\d{1,2})\.(\d{2,4})/);
  let v: number | undefined;
  if (m) v = Number(`${m[1]}.${m[2]}`);
  else {
    // A dropped decimal point is recoverable when exactly two integer digits remain: "1691" -> 16.91.
    const d = t.match(/(?<!\d)(\d+)(?!\d)/)?.[1];
    if (d && d.length === 2 + decimals) v = Number(`${d.slice(0, 2)}.${d.slice(2)}`);
  }
  return v !== undefined && v <= MAX_CONSTANT ? v : undefined;
}
