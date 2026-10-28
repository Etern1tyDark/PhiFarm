// Fuse jacket matches with the OCR'd difficulty / chart-RKS / accuracy text into one record.
// The three numbers on a card are redundant (rks = f(acc, C)), so each can check the others.

import type { JacketMatch } from './match';
import { chartKey, LEVELS, type ChartMeta, type Level, type Meta } from './meta';
import { parseAccuracy, parseChartRks, parseDifficulty, type OcrResult } from './ocr';
import { accForRks, chartRks } from './rks';

export interface CardRecord {
  slot: string; // "P1", "#12"
  songId: string;
  level: Level;
  acc: number;
  /** Fields that deserve a human look (highlighted yellow in the table). */
  doubt: { song?: string; level?: string; acc?: string };
  raw?: { diff: string; crks: string; acc: string; jacketDist: number };
}

export const SONG_DIST_OK = 0.33; // correct matches score <= 0.29 even on an 800px JPEG
export const SONG_GAP_OK = 0.1; // runner-ups score >= 0.44

/**
 * How far printed chart RKS may sit from chartRks(printed acc, C) purely through rounding:
 * one unit in the last place of each, with the accuracy's error scaled by dRKS/dAcc.
 */
export function rksTolerance(acc: number, c: number, decimals: Decimals): number {
  const slope = acc >= 100 ? 0 : (2 * (acc - 55) * c) / 45 ** 2;
  return 10 ** -decimals.crks + 10 ** -decimals.acc * slope + 1e-9;
}

export interface Decimals { acc: number; crks: number }

export function resolveCard(
  slot: string,
  matches: JacketMatch[],
  ocr: { diff: OcrResult; crks: OcrResult; acc: OcrResult },
  decimals: Decimals = { acc: 4, crks: 4 },
): CardRecord | null {
  if (!matches.length) return null;
  const diff = parseDifficulty(ocr.diff.text);
  const crks = parseChartRks(ocr.crks.text, decimals.crks);
  let acc = parseAccuracy(ocr.acc.text);
  const doubt: CardRecord['doubt'] = {};
  if (slot.startsWith('P') && acc !== undefined && acc < 100) {
    // Phi slots are APs by definition; a non-100 reading is an OCR slip.
    doubt.acc = `read ${acc}% on an AP slot`;
    acc = 100;
  }

  // Score every (song, level) pairing; lower is better.
  let best: { m: JacketMatch; level: Level; chart: ChartMeta; score: number } | null = null;
  for (const m of matches) {
    for (const [lv, chart] of Object.entries(m.song.charts) as [Level, ChartMeta][]) {
      if (m.level && m.level !== lv) continue;
      // With no other evidence, prefer harder levels: B30 entries are almost always IN/AT.
      let score = m.dist + 0.01 * (LEVELS.length - LEVELS.indexOf(lv));
      if (diff.level) score += diff.level === lv ? 0 : 0.3;
      if (diff.constant !== undefined) score += Math.abs(diff.constant - chart.c) < 0.05 ? 0 : 0.3;
      if (acc !== undefined && crks !== undefined) {
        // Two independent numbers agreeing through the RKS formula outweighs a misread badge.
        score += Math.abs(chartRks(acc, chart.c) - crks) < rksTolerance(acc, chart.c, decimals) ? -0.5 : 0;
      }
      if (!best || score < best.score) best = { m, level: lv, chart, score };
    }
  }
  if (!best) return null;

  const second = matches.find((x) => x.song.id !== best.m.song.id);
  if (best.m.dist > SONG_DIST_OK) doubt.song = 'weak jacket match';
  else if (second && second.dist - best.m.dist < SONG_GAP_OK) doubt.song = `close to ${second.song.name}`;
  if (best.m.song.id !== matches[0].song.id) doubt.song = 'picked by difficulty text, not jacket';
  // acc + chart RKS pin down the constant exactly, which settles the level even when the
  // small difficulty badge OCRs badly.
  const rksConfirms =
    acc !== undefined && crks !== undefined &&
    Math.abs(chartRks(acc, best.chart.c) - crks) < rksTolerance(acc, best.chart.c, decimals);
  if (!rksConfirms) {
    if (!diff.level || diff.level !== best.level) doubt.level = `read "${ocr.diff.text.trim()}"`;
    else if (diff.constant !== undefined && Math.abs(diff.constant - best.chart.c) >= 0.05) {
      doubt.level = `card says ${diff.constant}, data says ${best.chart.c}`;
    }
  }

  // A sub-70% reading (worth 0 RKS) on a card in someone's best list is almost always a lost
  // leading digit ("00.0000" for "100.0000"); a readable chart RKS knows better.
  if (acc !== undefined && acc < 70 && crks !== undefined && crks >= 0.6 * best.chart.c && crks <= best.chart.c) {
    doubt.acc ??= `read ${acc}%, using chart RKS`;
    acc = undefined;
  }
  if (acc === undefined) {
    // Below ~60% of the constant (accuracy under ~90%) a "chart RKS" is far more likely a misread
    // than a real top-30 score.
    if (crks !== undefined && crks <= best.chart.c && crks >= 0.6 * best.chart.c) {
      acc = Math.min(100, Math.round(accForRks(crks, best.chart.c) * 1e4) / 1e4);
      doubt.acc = 'derived from chart RKS';
    } else {
      acc = 0;
      doubt.acc = 'unreadable';
    }
  } else if (crks !== undefined && Math.abs(chartRks(acc, best.chart.c) - crks) >= rksTolerance(acc, best.chart.c, decimals)) {
    const implied = accForRks(crks, best.chart.c);
    // A single misread glyph ("93.82" for "99.82") is fixable when exactly one one-character
    // change of the reading agrees with the chart RKS.
    const read = acc.toFixed(decimals.acc);
    const fixes = oneCharVariants(read)
      .map(Number)
      .filter((a) => a <= 100 && Math.abs(chartRks(a, best!.chart.c) - crks) < rksTolerance(a, best!.chart.c, decimals));
    if (fixes.length === 1) {
      doubt.acc ??= `corrected ${read}% using chart RKS`;
      acc = fixes[0];
    } else {
      doubt.acc ??= `chart RKS ${crks} implies ${Number.isFinite(implied) ? implied.toFixed(4) : 'an impossible'}%`;
    }
  }

  return {
    slot,
    songId: best.m.song.id,
    level: best.level,
    acc,
    doubt,
    raw: { diff: ocr.diff.text.trim(), crks: ocr.crks.text.trim(), acc: ocr.acc.text.trim(), jacketDist: best.m.dist },
  };
}

/** Every string that differs from `s` in exactly one digit. */
function oneCharVariants(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (!/\d/.test(s[i])) continue;
    for (let d = 0; d <= 9; d++) if (String(d) !== s[i]) out.push(s.slice(0, i) + d + s.slice(i + 1));
  }
  return out;
}

/** Keep one record per chart (P-slots duplicate B27 entries), preferring the higher accuracy. */
export function dedupe(records: CardRecord[]): CardRecord[] {
  const byKey = new Map<string, CardRecord>();
  for (const r of records) {
    const k = chartKey(r.songId, r.level);
    const prev = byKey.get(k);
    if (!prev || r.acc > prev.acc) byKey.set(k, r);
  }
  return [...byKey.values()];
}

/**
 * B30 cards are sorted by chart RKS, so a card whose level could not be read must fit between
 * its neighbours. Picks the only level that does, and drops the doubt when that settles it.
 */
export function resolveByOrder<T extends CardRecord>(records: T[], meta: Meta): T[] {
  const songs = new Map(meta.songs.map((s) => [s.id, s]));
  const rank = (slot: string) => (slot.startsWith('#') ? Number(slot.slice(1)) : NaN);
  const ordered = records.filter((r) => Number.isFinite(rank(r.slot))).sort((a, b) => rank(a.slot) - rank(b.slot));
  const rksOf = (r: CardRecord) => {
    const c = songs.get(r.songId)?.charts[r.level]?.c;
    return c === undefined ? NaN : chartRks(r.acc, c);
  };
  const fixed = new Map<T, T>();
  ordered.forEach((r, i) => {
    if (!r.doubt.level || !(r.acc > 0)) return;
    const song = songs.get(r.songId);
    if (!song) return;
    const hi = i > 0 ? rksOf(ordered[i - 1]) : Infinity;
    const lo = i < ordered.length - 1 ? rksOf(ordered[i + 1]) : -Infinity;
    const tol = 0.01;
    const fits = (Object.entries(song.charts) as [Level, ChartMeta][]).filter(([, ch]) => {
      const v = chartRks(r.acc, ch.c);
      return v <= (Number.isNaN(hi) ? Infinity : hi) + tol && v >= (Number.isNaN(lo) ? -Infinity : lo) - tol;
    });
    if (fits.length === 1) {
      const doubt = { ...r.doubt };
      delete doubt.level;
      fixed.set(r, { ...r, level: fits[0][0], doubt });
    }
  });
  return records.map((r) => fixed.get(r) ?? r);
}
