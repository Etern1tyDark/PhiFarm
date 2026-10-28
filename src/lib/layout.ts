// Grid templates for B30 summary images, and detection of which card slots are filled.
// All geometry is in the template's reference pixels and scaled by imageWidth / refWidth.

import type { Rect, Rgba } from './imagehash';

export interface CardParts {
  /** Where the full illustration is drawn (it is clipped by the card's slanted mask). */
  illus: Rect;
  diff: Rect; // "AT 17.3"
  crks: Rect; // per-chart RKS "17.0681" (optional on some layouts)
  acc: Rect; // "99.6974%"
}

export interface Section {
  kind: 'phi' | 'best' | 'overflow';
  top: number; // y of the first row
  rows: number; // max rows; trailing empty rows are dropped by detection
  skipFirst?: number; // leading cells of the first row that belong to something else (PSL's date box)
  maxCells?: number; // cap on cells in this section
}

export interface LayoutTemplate {
  id: string;
  name: string;
  refWidth: number;
  cols: number[]; // x of each column's card origin
  card: Rect; // whole card, relative to the origin (used for thumbnails)
  /** Region of crisp text with a crisp top and bottom border; decides whether a slot is filled. */
  presence: Rect;
  rowPitch: number;
  sections: Section[];
  parts: CardParts;
  /** Decimals the card prints, which bounds how exactly accuracy and chart RKS are known. */
  decimals: { acc: number; crks: number };
  note?: string;
}

/**
 * phibot.dev B30 card (also used by its Discord bot). Measured from the 1600px-wide sample
 * on phibot.dev; verified against every card of that sample and of a second player's render.
 */
export const PHIBOT_B30: LayoutTemplate = {
  id: 'phibot-b30',
  name: 'phibot.dev B30 + Overflow (3 columns)',
  refWidth: 1600,
  cols: [43, 569, 1095],
  card: { x: 0, y: 0, w: 465, h: 143 },
  presence: { x: 256, y: 0, w: 200, h: 143 },
  rowPitch: 165.33,
  sections: [
    { kind: 'phi', top: 218, rows: 1 },
    { kind: 'best', top: 383.3, rows: 9 },
    { kind: 'overflow', top: 1943, rows: 10 },
  ],
  parts: {
    illus: { x: 4.5, y: 21, w: 240, h: 126.6 },
    diff: { x: 13, y: 102, w: 66, h: 25 },
    crks: { x: 13, y: 127, w: 66, h: 16 },
    acc: { x: 228, y: 107, w: 117, h: 24 },
  },
  decimals: { acc: 4, crks: 4 },
};

/**
 * Phigros Score Lookup (PSL) Discord bot: two columns, a four-line text block (score, acc,
 * chart RKS, "17.3 AT") left of each jacket. Measured from a 623px-wide render.
 */
export const PSL_B30: LayoutTemplate = {
  id: 'psl-b30',
  name: 'PSL Discord bot B30 (2 columns)',
  refWidth: 623,
  cols: [27, 328],
  card: { x: 0, y: -6, w: 272, h: 92 },
  // The gaps between the four text lines are crisp; the outer border fades on light backgrounds.
  presence: { x: 2, y: 21, w: 70, h: 42 },
  rowPitch: 106.67, // (1795 - 195) / 15 rows
  sections: [
    { kind: 'phi', top: 195, rows: 2, skipFirst: 1 },
    { kind: 'best', top: 408.3, rows: 14, maxCells: 27 },
  ],
  parts: {
    illus: { x: 57, y: -3, w: 172, h: 90.7 },
    diff: { x: 2, y: 63.5, w: 72, h: 20 },
    crks: { x: 2, y: 42.5, w: 72, h: 20 },
    acc: { x: 2, y: 21.5, w: 72, h: 20 },
  },
  decimals: { acc: 2, crks: 2 },
  note: 'PSL prints accuracy to 2 decimals, so each score is only known to ±0.005% and totals to about ±0.002 RKS.',
};

export const TEMPLATES: LayoutTemplate[] = [PHIBOT_B30, PSL_B30];

export interface Slot {
  section: Section['kind'];
  index: number; // 0-based within section (P1 = phi 0, #1 = best 0, #28 = overflow 0)
  card: Rect; // image pixels
  parts: Record<keyof CardParts, Rect>;
}

function lumAt(img: Rgba, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
}

/**
 * Fraction of a horizontal span that has a sharp vertical colour step at row y. Compared per
 * channel, not by luminance: a dark-red panel over a dark-blue background has nearly equal
 * luminance but a very visible border.
 */
function hEdge(img: Rgba, y: number, x0: number, x1: number): number {
  y = Math.round(y);
  if (y < 1 || y >= img.height - 1) return 0;
  const { data, width } = img;
  let hit = 0, n = 0;
  for (let x = Math.max(0, Math.round(x0)); x < Math.min(width, Math.round(x1)); x += 2) {
    const a = ((y + 1) * width + x) * 4, b = ((y - 1) * width + x) * 4;
    const diff = Math.max(
      Math.abs(data[a] - data[b]),
      Math.abs(data[a + 1] - data[b + 1]),
      Math.abs(data[a + 2] - data[b + 2]),
    );
    if (diff > 30) hit++;
    n++;
  }
  return n ? hit / n : 0;
}

/** Best edge strength within ±r pixels of y. */
function edgeNear(img: Rgba, y: number, x0: number, x1: number, r: number): number {
  let best = 0;
  for (let d = -r; d <= r; d++) best = Math.max(best, hEdge(img, y + d, x0, x1));
  return best;
}

/** Fraction of pixels in a rect with a sharp horizontal luminance step (text, borders). */
function sharpness(img: Rgba, r: Rect): number {
  const step = Math.max(1, Math.round(r.w / 120));
  let hit = 0, n = 0;
  for (let y = Math.round(r.y); y < Math.min(img.height, r.y + r.h); y += step) {
    for (let x = Math.max(1, Math.round(r.x)); x < Math.min(img.width - 1, r.x + r.w); x += step) {
      if (Math.abs(lumAt(img, x + step, y) - lumAt(img, x - step, y)) > 40) hit++;
      n++;
    }
  }
  return n ? hit / n : 0;
}

/**
 * Score text is crisp while the background is a heavily blurred illustration, so text
 * sharpness separates filled slots (>= 0.11 on phibot samples) from empty ones (<= 0.06).
 * The text panel must also have a crisp top or bottom border, to reject unrelated text.
 */
function cardPresence(img: Rgba, t: LayoutTemplate, s: number, left: number, top: number): number {
  const p = t.presence;
  const x0 = (left + p.x) * s;
  const x1 = (left + p.x + p.w) * s;
  const r = Math.max(2, Math.round(3 * s));
  const edge = Math.max(edgeNear(img, (top + p.y) * s, x0, x1, r), edgeNear(img, (top + p.y + p.h) * s, x0, x1, r));
  if (edge < 0.5) return 0;
  return sharpness(img, { x: x0, y: (top + p.y + p.h * 0.2) * s, w: x1 - x0, h: p.h * 0.75 * s });
}

interface Cell { sec: Section; index: number; left: number; top: number; first: boolean }

/** Grid cells of a section in reading order, honouring skipFirst / maxCells. */
function* cells(t: LayoutTemplate, sec: Section, dy: number): Generator<Cell> {
  let index = 0;
  for (let r = 0; r < sec.rows; r++) {
    for (let c = 0; c < t.cols.length; c++) {
      if (r === 0 && c < (sec.skipFirst ?? 0)) continue;
      if (sec.maxCells !== undefined && index >= sec.maxCells) return;
      yield { sec, index: index++, left: t.cols[c], top: sec.top + r * t.rowPitch + dy, first: c === 0 };
    }
  }
}

const PRESENT = 0.08;
const FULL = 0.12;

/**
 * How well the template sits on the image at vertical shift dy. Presence alone is a poor
 * guide: its edge test tolerates a few pixels, so the bottoms of text lines can pass for card
 * borders one line off. Real panel borders are near-perfect horizontal steps, so the fit is
 * the exact (±1px) border strength of each expected card, weighted by its text presence.
 */
export function alignment(img: Rgba, t: LayoutTemplate, s: number, dy: number): { score: number; fit: number } {
  let sum = 0, fit = 0, n = 0;
  const p = t.presence;
  const r = Math.max(1, Math.ceil(s / 2));
  for (const sec of t.sections) {
    if (sec.kind === 'overflow') continue;
    for (const cell of cells(t, sec, dy)) {
      if ((cell.top + t.card.y + t.card.h) * s > img.height) break;
      const x0 = (cell.left + p.x) * s, x1 = (cell.left + p.x + p.w) * s;
      const present = Math.min(1, cardPresence(img, t, s, cell.left, cell.top) / FULL);
      const border = Math.max(
        edgeNear(img, (cell.top + p.y) * s, x0, x1, r),
        edgeNear(img, (cell.top + p.y + p.h) * s, x0, x1, r),
      );
      sum += present;
      fit += present * border;
      n++;
    }
  }
  return n ? { score: sum / n, fit: fit / n } : { score: 0, fit: 0 };
}

/** Vertical shift (reference px) that best fits; searching well under half a row pitch keeps it off neighbouring rows. */
function refineOffset(img: Rgba, t: LayoutTemplate, s: number): { dy: number; score: number } {
  const reach = Math.min(16, Math.floor(t.rowPitch * 0.15));
  let best = { dy: 0, ...alignment(img, t, s, 0) };
  for (let d = 1; d <= reach; d++) {
    for (const dy of [-d, d]) {
      const a = alignment(img, t, s, dy);
      if (a.fit > best.fit + 1e-6) best = { dy, ...a };
    }
  }
  return { dy: best.dy, score: best.score };
}

/** Distance (0 = identical, ~0.6+ = unrelated) from the best-matching song jacket at `illus`. */
export type JacketScorer = (illus: Rect) => number;

/** Jacket distances below this mean a real card sits there, whatever its colours. */
const JACKET_PRESENT = 0.35;
const JACKET_SAMPLES = 12;

/**
 * Alignment by jackets: at the right offset nearly every expected card's illustration matches a
 * known song closely; one row off, nothing does. Unlike border detection this does not care
 * whether panels contrast with the background (blue panels on a blue backdrop defeat edges).
 */
function refineByJackets(img: Rgba, t: LayoutTemplate, s: number, jacket: JacketScorer): { dy: number; score: number } {
  const fixed = t.sections
    .filter((sec) => sec.kind !== 'overflow')
    .flatMap((sec) => [...cells(t, sec, 0)]);
  const step = Math.max(1, Math.floor(fixed.length / JACKET_SAMPLES));
  const sample = fixed.filter((_, i) => i % step === 0).slice(0, JACKET_SAMPLES);
  const fitAt = (dy: number) => {
    let sum = 0, n = 0;
    for (const cell of sample) {
      const top = cell.top + dy;
      if ((top + t.card.y + t.card.h) * s > img.height || (top + t.card.y) * s < 0) continue;
      const q = t.parts.illus;
      sum += Math.max(0, 1 - jacket({ x: (cell.left + q.x) * s, y: (top + q.y) * s, w: q.w * s, h: q.h * s }) / 0.5);
      n++;
    }
    return n ? sum / n : 0;
  };
  const reach = Math.floor(t.rowPitch * 0.3);
  let best = { dy: 0, score: fitAt(0) };
  for (let dy = -reach; dy <= reach; dy += 2) {
    const f = fitAt(dy);
    if (f > best.score + 1e-6 || (Math.abs(f - best.score) <= 1e-6 && Math.abs(dy) < Math.abs(best.dy))) best = { dy, score: f };
  }
  for (const dy of [best.dy - 1, best.dy + 1]) {
    const f = fitAt(dy);
    if (f > best.score + 1e-6) best = { dy, score: f };
  }
  // Pixel-exact pass: jacket fit is sharp near the optimum; visible card borders add a smaller
  // vote (they help where text boxes overlap jackets). Ties go to the jacket's own best.
  let fine = { dy: best.dy, v: -1 };
  for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const dy = best.dy + d;
    const v = fitAt(dy) + 0.3 * alignment(img, t, s, dy).fit;
    if (v > fine.v + 1e-6) fine = { dy, v };
  }
  return { dy: fine.dy, score: best.score };
}

export interface Detection {
  template: LayoutTemplate;
  score: number; // how well the template fits the always-filled cells, 0..1
  slots: Slot[];
}

/**
 * Find filled card slots. With a jacket scorer (the normal case), alignment and presence use
 * jacket matches, with border/sharpness checks as a fallback for songs without a jacket hash.
 */
export function detectSlots(img: Rgba, t: LayoutTemplate, jacket?: JacketScorer): Detection {
  const s = img.width / t.refWidth;
  const { dy, score } = jacket ? refineByJackets(img, t, s, jacket) : refineOffset(img, t, s);
  const slots: Slot[] = [];
  for (const sec of t.sections) {
    let rowHits = 0;
    for (const cell of cells(t, sec, dy)) {
      if ((cell.top + t.card.y + t.card.h) * s > img.height) break;
      // Overflow has no fixed length: stop at the first empty row.
      if (sec.kind === 'overflow' && cell.first && cell.index > 0) {
        if (rowHits === 0) break;
        rowHits = 0;
      }
      const scale = (q: Rect): Rect => ({ x: (cell.left + q.x) * s, y: (cell.top + q.y) * s, w: q.w * s, h: q.h * s });
      const illus = scale(t.parts.illus);
      const present =
        cardPresence(img, t, s, cell.left, cell.top) >= PRESENT || (jacket !== undefined && jacket(illus) < JACKET_PRESENT);
      if (!present) continue;
      rowHits++;
      slots.push({
        section: sec.kind,
        index: cell.index,
        card: scale(t.card),
        parts: {
          illus,
          diff: scale(t.parts.diff),
          crks: scale(t.parts.crks),
          acc: scale(t.parts.acc),
        },
      });
    }
  }
  return { template: t, score, slots };
}

/** Try every template; the caller should ask for manual calibration when score is low. */
export function autoDetect(img: Rgba, jacket?: JacketScorer, templates = TEMPLATES): Detection {
  return templates
    .map((t) => detectSlots(img, t, jacket))
    .sort((a, b) => b.score - a.score)[0];
}

export function slotLabel(slot: Pick<Slot, 'section' | 'index'>): string {
  if (slot.section === 'phi') return `P${slot.index + 1}`;
  return `#${slot.index + 1 + (slot.section === 'overflow' ? 27 : 0)}`;
}
