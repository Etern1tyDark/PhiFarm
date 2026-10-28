// Recommendation engine: farmability, the three farming modes, and the "next 0.01" path.

import { allCharts, type ChartRef, type Community, type Meta } from './meta';
import {
  B_SLOTS, PHI_SLOTS, TOTAL_SLOTS, accWithGoods, chartRks, computeRks, goodsFromAcc,
  nextDisplayThreshold, type Play, type RksBreakdown,
} from './rks';

/**
 * Evaluates "what is my total if this one chart had accuracy X" in O(30), so recommendation
 * scans over every chart and every Good count stay instant.
 */
export class Evaluator {
  readonly base: RksBreakdown;
  private byKey: Map<string, Play>;
  private sortedRks: Array<{ key: string; rks: number }>;
  private sortedPhi: Array<{ key: string; c: number }>;

  constructor(plays: Play[]) {
    this.base = computeRks(plays);
    this.byKey = new Map(plays.map((p) => [p.key, p]));
    this.sortedRks = this.base.best.map((p) => ({ key: p.key, rks: p.rks }));
    this.sortedPhi = plays.filter((p) => p.acc >= 100).map((p) => ({ key: p.key, c: p.c })).sort((a, b) => b.c - a.c);
  }

  get total() {
    return this.base.total;
  }

  current(key: string): Play | undefined {
    return this.byKey.get(key);
  }

  /** Total RKS if chart `key` (constant c) scored `acc` (never lowers an existing score). */
  totalIf(key: string, c: number, acc: number): number {
    const prev = this.byKey.get(key);
    if (prev && prev.acc >= acc) return this.base.total;
    const rks = chartRks(acc, c);
    let sumB = 0, taken = 0, placed = false;
    for (const e of this.sortedRks) {
      if (taken >= B_SLOTS) break;
      if (e.key === key) continue;
      if (!placed && rks > e.rks) { sumB += rks; taken++; placed = true; if (taken >= B_SLOTS) break; }
      sumB += e.rks;
      taken++;
    }
    if (!placed && taken < B_SLOTS) sumB += rks;
    let sumPhi = 0;
    taken = 0;
    placed = acc < 100;
    for (const e of this.sortedPhi) {
      if (taken >= PHI_SLOTS) break;
      if (e.key === key) continue;
      if (!placed && c > e.c) { sumPhi += c; taken++; placed = true; if (taken >= PHI_SLOTS) break; }
      sumPhi += e.c;
      taken++;
    }
    if (!placed && taken < PHI_SLOTS) sumPhi += c;
    return (sumB + sumPhi) / TOTAL_SLOTS;
  }

  /** Largest Good count (rest Perfect) whose total still reaches `target`, or -1. */
  maxGoodsFor(ref: ChartRef, target: number): number {
    const { c, n } = ref.chart;
    if (this.totalIf(ref.key, c, 100) < target) return -1;
    // Total is monotone non-increasing in Goods, so binary search.
    let lo = 0, hi = Math.floor((n * 30) / 35); // 30 points below 100% = the 70% cutoff
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.totalIf(ref.key, c, accWithGoods(mid, n)) >= target) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

// ---------------------------------------------------------------- farmability

export interface Farmability {
  /** 0..1, higher = easier to hold high accuracy. null when the chart breakdown is unknown. */
  f: number | null;
  /** Share of notes that can never be Good (Drag, Flick). */
  safeShare: number | null;
  densityTerm: number | null; // ln(N) / peak NPS
  communityTerm: number | null;
  /** 0..1, higher = easier to AP (intrinsic estimate, or community AP rate when imported). */
  apEase: number | null;
}

const W_SAFE = 0.45, W_DENSITY = 0.35, W_COMMUNITY = 0.2;

function percentileRanker(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return (v: number) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return sorted.length > 1 ? lo / (sorted.length - 1) : 0.5;
  };
}

/**
 * F = w1 * safeShare + w2 * ln(N)/peakNPS + w3 * community, each term percentile-ranked
 * across all charts so the weights mean what they say. Terms without data drop out and the
 * remaining weights are renormalised.
 */
export function computeFarmability(meta: Meta, community: Record<string, Community>): Map<string, Farmability> {
  const charts = allCharts(meta);
  const withStats = charts.filter((r) => r.chart.nps && r.chart.drag !== undefined);
  const safe = (r: ChartRef) => (r.chart.drag! + r.chart.flick!) / r.chart.n;
  const dens = (r: ChartRef) => Math.log(r.chart.n) / r.chart.nps!;
  const comm = (k: string) => community[k]?.top10 ?? (community[k]?.ap !== undefined ? 100 * community[k].ap! : undefined);
  const pSafe = percentileRanker(withStats.map(safe));
  const pDens = percentileRanker(withStats.map(dens));
  // AP ease only matters for charts strong enough to reach a Phi slot, so rank among those;
  // including EZ/HD would squash every hard chart into the top percentile.
  const hard = withStats.filter((r) => r.chart.c >= 13);
  const pNps = percentileRanker(hard.map((r) => r.chart.nps!));
  const pN = percentileRanker(hard.map((r) => r.chart.n));
  const pSafeHard = percentileRanker(hard.map(safe));
  const commVals = charts.map((r) => comm(r.key)).filter((v): v is number => v !== undefined);
  const pComm = percentileRanker(commVals);
  const apVals = charts.map((r) => community[r.key]?.ap).filter((v): v is number => v !== undefined);
  const pAp = percentileRanker(apVals);

  const out = new Map<string, Farmability>();
  for (const r of charts) {
    const has = r.chart.nps !== undefined && r.chart.drag !== undefined;
    const cv = comm(r.key);
    const terms: Array<[number, number]> = [];
    const safeShare = has ? safe(r) : null;
    const densityTerm = has ? dens(r) : null;
    if (has) terms.push([W_SAFE, pSafe(safeShare!)], [W_DENSITY, pDens(densityTerm!)]);
    if (cv !== undefined) terms.push([W_COMMUNITY, pComm(cv)]);
    const wSum = terms.reduce((s, [w]) => s + w, 0);
    const ap = community[r.key]?.ap;
    out.set(r.key, {
      f: wSum ? terms.reduce((s, [w, v]) => s + w * v, 0) / wSum : null,
      safeShare,
      densityTerm,
      communityTerm: cv ?? null,
      apEase: ap !== undefined
        ? pAp(ap)
        : has ? 0.4 * (1 - pNps(r.chart.nps!)) + 0.3 * (1 - pN(r.chart.n)) + 0.3 * pSafeHard(safeShare!) : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- modes

export interface Recommendation {
  ref: ChartRef;
  /** Accuracy/Goods to aim for; goods = -1 means only an AP helps. */
  goods: number;
  acc: number;
  rks: number; // chart RKS at that accuracy
  gain: number; // total RKS change at that accuracy
  apGain: number; // total RKS change for an AP
  slot: string; // human description of what it replaces
  rankValue: number; // what the list is sorted by
  note?: string;
}

function replaceLabel(ev: Evaluator, rks: number, key: string): string {
  const cur = ev.base.best.findIndex((p) => p.key === key);
  if (cur >= 0 && cur < B_SLOTS) return `upgrades your #${cur + 1}`;
  if (ev.base.best.length < B_SLOTS) return `fills empty slot #${ev.base.best.length + 1}`;
  const idx = ev.base.best.slice(0, B_SLOTS).findIndex((p) => rks > p.rks);
  return `enters at #${idx + 1}, pushes out your #${B_SLOTS}`;
}

/** Mode 1: charts above the B27 floor that you have no score on. */
export function unplayed(ev: Evaluator, meta: Meta, farm: Map<string, Farmability>): Recommendation[] {
  const floor = ev.base.bFloor;
  const out: Recommendation[] = [];
  for (const ref of allCharts(meta)) {
    if (ref.chart.c <= floor || ev.current(ref.key)) continue;
    // Strictly above the current total, i.e. the chart actually enters the B27.
    const goods = ev.maxGoodsFor(ref, ev.total + 1e-7);
    if (goods < 0) continue;
    const acc = accWithGoods(goods, ref.chart.n);
    const rks = chartRks(acc, ref.chart.c);
    out.push({
      ref, goods, acc, rks,
      gain: ev.totalIf(ref.key, ref.chart.c, acc) - ev.total,
      apGain: ev.totalIf(ref.key, ref.chart.c, 100) - ev.total,
      slot: replaceLabel(ev, rks, ref.key),
      rankValue: farm.get(ref.key)?.f ?? -1,
    });
  }
  return out.sort((a, b) => b.rankValue - a.rankValue || b.apGain - a.apGain);
}

export interface CleanupRec extends Recommendation {
  currentAcc: number;
  goodsCut: number; // Goods to remove for the shown gain
  gainPerGood: number;
}

/** Mode 2: existing scores where removing 2-4 Goods buys the most RKS per Good. */
export function dirtyCleanup(ev: Evaluator, meta: Meta, community: Record<string, Community>): CleanupRec[] {
  const out: CleanupRec[] = [];
  for (const ref of allCharts(meta)) {
    const cur = ev.current(ref.key);
    if (!cur || cur.acc >= 100) continue;
    const { c, n } = ref.chart;
    let best: { k: number; gain: number; acc: number } | null = null;
    for (let k = 1; k <= 4; k++) {
      const acc = Math.min(100, cur.acc + (35 * k) / n);
      const gain = ev.totalIf(ref.key, c, acc) - ev.total;
      if (k >= 2 || acc >= 100) {
        if (gain > 0 && (!best || gain / k > best.gain / best.k)) best = { k, gain, acc };
      }
      if (acc >= 100) break;
    }
    if (!best) continue;
    const cm = community[ref.key];
    const notes: string[] = [];
    if (cm?.top10 !== undefined && cur.acc < cm.top10) notes.push(`below community top 10% (${cm.top10}%)`);
    else if (cm?.top25 !== undefined && cur.acc < cm.top25) notes.push(`below community top 25% (${cm.top25}%)`);
    const rks = chartRks(best.acc, c);
    out.push({
      ref,
      currentAcc: cur.acc,
      goodsCut: best.k,
      goods: Math.max(0, Math.floor(goodsFromAcc(best.acc, n) + 1e-9)),
      acc: best.acc,
      rks,
      gain: best.gain,
      gainPerGood: best.gain / best.k,
      apGain: ev.totalIf(ref.key, c, 100) - ev.total,
      slot: replaceLabel(ev, rks, ref.key),
      rankValue: best.gain / best.k,
      note: notes.join('; ') || undefined,
    });
  }
  return out.sort((a, b) => b.rankValue - a.rankValue);
}

/** Mode 3: AP targets that would enter your Phi3. */
export function phiSniper(ev: Evaluator, meta: Meta, farm: Map<string, Farmability>): Recommendation[] {
  const floor = ev.base.phi.length >= PHI_SLOTS ? ev.base.phiFloor : 0;
  const out: Recommendation[] = [];
  for (const ref of allCharts(meta)) {
    const cur = ev.current(ref.key);
    if (ref.chart.c <= floor || (cur && cur.acc >= 100)) continue;
    const apGain = ev.totalIf(ref.key, ref.chart.c, 100) - ev.total;
    if (apGain <= 0) continue;
    const ease = farm.get(ref.key)?.apEase ?? -1;
    out.push({
      ref, goods: 0, acc: 100, rks: ref.chart.c, gain: apGain, apGain,
      slot: ev.base.phi.length < PHI_SLOTS ? `fills empty P${ev.base.phi.length + 1}` : `replaces P3 (${floor.toFixed(1)})`,
      // Ease first, but weigh by payoff so a trivial +0.0003 does not top the list.
      rankValue: ease * 0.7 + Math.min(1, apGain / 0.02) * 0.3,
      note: cur ? `your best: ${cur.acc.toFixed(4)}% (${goodsFromAcc(cur.acc, ref.chart.n).toFixed(1)} Goods from AP)` : 'unplayed',
    });
  }
  return out.sort((a, b) => b.rankValue - a.rankValue);
}

export interface PathStep {
  ref: ChartRef;
  goods: number;
  acc: number;
  currentAcc?: number;
  goodsCut?: number; // for existing scores: Goods to remove
  /** Accuracy points above what you already do (existing) or are expected to do (unplayed). */
  effort: number;
}

/** Your best-N scores are practised; a new chart starts well below them, so unplayed charts carry this extra effort. */
const UNPLAYED_MARGIN = 1.0;

/** In the skill ceiling, a score on an easier chart counts this much lower per constant of difference. */
const BEYOND_HARDEST = 1.0;

/**
 * Expected accuracy falls by ABOVE_COMFORT * d + ABOVE_COMFORT_SQ * d² at d constants above your
 * comfort level: a little harder costs a little, far harder costs a lot.
 */
const ABOVE_COMFORT = 1.5;
const ABOVE_COMFORT_SQ = 1.0;
/** ...and rises this much per constant below it, up to EASY_CAP. */
const BELOW_COMFORT = 0.3;
const EASY_CAP = 99.8;

/**
 * Accuracy you would likely get on a chart of constant c, from your comfort level: the median
 * constant of your best 27, and your median accuracy on charts at or below it. A straight trend
 * line through your scores is a poor guide, because your hardest scores are the few hard charts
 * that suit you; a new chart well above your level usually goes much worse.
 */
export function expectedAccuracy(plays: Play[]): (c: number) => number {
  if (!plays.length) return () => 98;
  const median = (xs: number[]) => {
    const v = [...xs].sort((a, b) => a - b);
    return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  };
  const top = [...plays].sort((a, b) => chartRks(b.acc, b.c) - chartRks(a.acc, a.c)).slice(0, B_SLOTS);
  const comfort = median(top.map((p) => p.c));
  const easy = top.filter((p) => p.c <= comfort);
  const base = median((easy.length >= 3 ? easy : top).map((p) => p.acc));
  return (c) =>
    c > comfort
      ? base - ABOVE_COMFORT * (c - comfort) - ABOVE_COMFORT_SQ * (c - comfort) ** 2
      : Math.max(base, Math.min(EASY_CAP, base + BELOW_COMFORT * (comfort - c)));
}

/** Single-chart moves that reach `target` (default: the next displayed 0.01), least effort first. */
export function nextStepPaths(
  ev: Evaluator, meta: Meta, limit = 10, target = nextDisplayThreshold(ev.total),
): { target: number; steps: PathStep[] } {
  const expected = expectedAccuracy(ev.base.best);
  const steps: PathStep[] = [];
  for (const ref of allCharts(meta)) {
    const goods = ev.maxGoodsFor(ref, target);
    if (goods < 0) continue;
    const acc = accWithGoods(goods, ref.chart.n);
    const cur = ev.current(ref.key);
    steps.push({
      ref, goods, acc,
      currentAcc: cur?.acc,
      goodsCut: cur ? Math.max(1, Math.ceil(goodsFromAcc(cur.acc, ref.chart.n) - goods - 1e-9)) : undefined,
      effort: cur ? acc - cur.acc : acc - expected(ref.chart.c) + UNPLAYED_MARGIN,
    });
  }
  steps.sort((a, b) => a.effort - b.effort || a.ref.chart.c - b.ref.chart.c);
  return { target, steps: steps.slice(0, limit) };
}

// ---------------------------------------------------------------- goal planner

/**
 * Effort to raise accuracy from a to b, as the log of how much of your error you remove
 * (the floor keeps an AP finite but expensive). Halving your Goods costs the same anywhere, so
 * 99.0 -> 99.5 counts as more work than 99.96 -> AP.
 */
/** 100 + floor: an AP (zero errors) is ~ln(10) harder than getting within 1 Good of it on a 350-note chart. */
const AP_FLOOR = 100.1;

export function effortBetween(a: number, b: number): number {
  return b <= a ? 0 : Math.log((AP_FLOOR - a) / (AP_FLOOR - b));
}

export interface PlanStep {
  ref: ChartRef;
  fromAcc?: number; // undefined = no score yet
  toAcc: number;
  goods: number; // Goods allowed at toAcc (0 = AP)
  goodsCut?: number; // for existing scores
  gain: number; // total RKS this step adds, in plan order
  effort: number;
}

export interface Plan {
  target: number;
  start: number;
  end: number;
  reached: boolean;
  steps: PlanStep[];
}

/** Improvement sizes tried on an existing score: a few Goods, or a share of all your Goods there. */
const GOODS_CUTS = [1, 2];
const GOODS_SHARES = [0.1, 0.25, 0.5];
/** New charts: your expected accuracy, or a quarter of its Goods removed. An AP sight-read is not a plan. */
const UNPLAYED_FRACTIONS = [1, 0.75];
const MAX_STEPS = 600;
/**
 * APs considered realistic: your score is within NEAR_AP Goods, or the chart is no harder than
 * your hardest AP and you are within CLOSE_AP Goods. An AP from 50 Goods off is not a plan.
 */
const NEAR_AP = 5;
const CLOSE_AP = 15;
/** How far past your demonstrated level a plan may push a chart. */
const STRETCH = 0.1;
/** APs are usually hand-picked friendly charts, so as evidence of skill they count as this. */
const AP_EVIDENCE = 99.9;
const CEILING_SAMPLES = 3;

/**
 * The accuracy you have shown you can hold at constant c. Each score is evidence: as-is for
 * charts at least as hard, BEYOND_HARDEST lower per constant for easier ones. The ceiling is
 * the mean of your CEILING_SAMPLES strongest pieces of evidence (one friendly chart should not
 * set the bar for a whole level), plus a little STRETCH. Without crowd data on what players at
 * your level reach, your own top scores are the honest ceiling.
 */
export function skillCeiling(plays: Play[]): (c: number) => number {
  return (c) => {
    const ev = plays
      .map((p) => Math.min(p.acc, AP_EVIDENCE) - BEYOND_HARDEST * Math.max(0, c - p.c))
      .sort((a, b) => b - a)
      .slice(0, CEILING_SAMPLES);
    if (!ev.length) return 100;
    return Math.min(100, ev.reduce((sum, x) => sum + x, 0) / ev.length + STRETCH);
  };
}

/**
 * Greedy plan to reach `target`: repeatedly take the single improvement with the best total-RKS
 * gain per unit of effort, re-evaluating after each. Several improvements on one chart merge
 * into one step.
 */
export function planGoal(plays: Play[], meta: Meta, target: number): Plan {
  const charts = allCharts(meta);
  const cur = new Map(plays.map((p) => [p.key, p]));
  const expected = expectedAccuracy(plays);
  let ev = new Evaluator(plays);
  const start = ev.total;
  const hardestAp = Math.max(0, ...plays.filter((p) => p.acc >= 100).map((p) => p.c));
  const original = new Map(plays.map((p) => [p.key, p.acc]));
  const ceiling = skillCeiling(plays);
  const steps = new Map<string, PlanStep>();

  for (let i = 0; i < MAX_STEPS && ev.total < target; i++) {
    let best: { ref: ChartRef; acc: number; gain: number; effort: number; score: number } | null = null;
    // A chart can only help if it can beat the B27 floor or the Phi floor.
    const floor = Math.min(ev.base.bFloor, ev.base.phi.length >= PHI_SLOTS ? ev.base.phiFloor : 0);
    for (const ref of charts) {
      const { c, n } = ref.chart;
      if (c <= floor) continue;
      const p = cur.get(ref.key);
      if (p && p.acc >= 100) continue;
      const options: number[] = [];
      let from: number;
      // Judged on your real score, not on where earlier plan steps already pushed it.
      const orig = original.get(ref.key);
      // Non-AP targets stop at least one Good short of AP; anything closer is an AP in all but name.
      // A chart you have never played is capped at your expected level for it, not your best.
      const cap = Math.min(orig === undefined ? expected(c) : Math.max(ceiling(c), orig), accWithGoods(1, n));
      if (p) {
        from = p.acc;
        const have = goodsFromAcc(p.acc, n);
        for (const k of [...GOODS_CUTS, ...GOODS_SHARES.map((f) => Math.round(have * f))]) {
          const a = p.acc + (35 * k) / n;
          if (k >= 1 && a < 100 && a <= cap) options.push(a);
        }
        if (cap < 100 && cap > p.acc) options.push(cap);
        const origGoods = orig === undefined ? Infinity : goodsFromAcc(orig, n);
        if (origGoods <= NEAR_AP || (c <= hardestAp && origGoods <= CLOSE_AP)) options.push(100);
      } else {
        from = expected(c) - UNPLAYED_MARGIN;
        if (from < 70) continue;
        const g = Math.floor((n * (100 - from)) / 35);
        for (const f of UNPLAYED_FRACTIONS) {
          const a = accWithGoods(Math.floor(g * f), n);
          if (a <= cap) options.push(a);
        }
      }
      for (const acc of options) {
        const gain = ev.totalIf(ref.key, c, acc) - ev.total;
        if (gain <= 1e-7) continue;
        // A new chart has to be learnt before any of it counts: charge the first step a bit extra.
        const effort = effortBetween(from, acc) + (p ? 0 : 0.15);
        // Gain past the goal is worth nothing, so cheap moves that just finish the job win.
        const score = Math.min(gain, target - ev.total) / Math.max(effort, 0.01);
        if (!best || score > best.score) best = { ref, acc, gain, effort, score };
      }
    }
    if (!best) break;

    const { ref, acc, gain, effort } = best;
    const prev = cur.get(ref.key);
    const step = steps.get(ref.key);
    steps.set(ref.key, {
      ref,
      fromAcc: step ? step.fromAcc : prev?.acc,
      toAcc: acc,
      goods: Math.max(0, Math.floor(goodsFromAcc(acc, ref.chart.n) + 1e-9)),
      gain: (step?.gain ?? 0) + gain,
      effort: (step?.effort ?? 0) + effort,
    });
    cur.set(ref.key, { key: ref.key, c: ref.chart.c, acc });
    ev = new Evaluator([...cur.values()]);
  }

  const out = [...steps.values()].map((s) => ({
    ...s,
    goodsCut: s.fromAcc !== undefined
      ? Math.max(1, Math.round(goodsFromAcc(s.fromAcc, s.ref.chart.n) - goodsFromAcc(s.toAcc, s.ref.chart.n)))
      : undefined,
  }));
  return { target, start, end: ev.total, reached: ev.total >= target, steps: out.sort((a, b) => b.gain / b.effort - a.gain / a.effort) };
}
