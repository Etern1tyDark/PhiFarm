import { describe, expect, it } from 'vitest';
import { Evaluator } from '../src/lib/farm';
import { accForRks, accWithGoods, chartRks, computeRks, maxGoods, nextDisplayThreshold, totalWith, type Play } from '../src/lib/rks';

describe('single chart math', () => {
  it('matches the RKS formula at its boundaries', () => {
    expect(chartRks(100, 16.5)).toBe(16.5);
    expect(chartRks(69.99, 16.5)).toBe(0);
    expect(chartRks(70, 16)).toBeCloseTo(((70 - 55) / 45) ** 2 * 16, 12);
    expect(chartRks(99.0, 15)).toBeCloseTo((44 / 45) ** 2 * 15, 12);
  });

  it('inverts accuracy <-> rks', () => {
    for (const c of [12.3, 15.8, 17.6]) {
      for (const acc of [70, 85.5, 98.25, 99.9]) expect(accForRks(chartRks(acc, c), c)).toBeCloseTo(acc, 9);
    }
  });

  it('prices one Good at 35/N points', () => {
    expect(accWithGoods(1, 1000)).toBeCloseTo(99.965, 12);
    expect(maxGoods(99.965, 1000)).toBe(1);
    expect(maxGoods(99.9649, 1000)).toBe(1);
    expect(maxGoods(99.966, 1000)).toBe(0);
    expect(maxGoods(99.5, 1400)).toBe(20);
  });

  it('rounds the display half-up', () => {
    expect(nextDisplayThreshold(16.5445)).toBeCloseTo(16.545, 12);
    expect(nextDisplayThreshold(16.546)).toBeCloseTo(16.555, 12);
  });
});

// Deterministic pseudo-random plays.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

describe('Evaluator.totalIf', () => {
  it('agrees with a full recompute for random replacements', () => {
    const r = rng(7);
    for (let trial = 0; trial < 40; trial++) {
      const n = Math.floor(r() * 50) + 1;
      const plays: Play[] = Array.from({ length: n }, (_, i) => ({
        key: `s${i}`,
        c: Math.round((10 + r() * 7.6) * 10) / 10,
        acc: r() < 0.25 ? 100 : 90 + r() * 10,
      }));
      const ev = new Evaluator(plays);
      expect(ev.total).toBeCloseTo(computeRks(plays).total, 12);
      for (let k = 0; k < 30; k++) {
        const existing = r() < 0.5 && n > 0;
        const key = existing ? `s${Math.floor(r() * n)}` : `new${k}`;
        const c = existing ? plays.find((p) => p.key === key)!.c : Math.round((10 + r() * 7.6) * 10) / 10;
        const acc = r() < 0.3 ? 100 : 95 + r() * 5;
        expect(ev.totalIf(key, c, acc)).toBeCloseTo(totalWith(plays, { key, c, acc }), 12);
      }
    }
  });
});

describe('planGoal', () => {
  it('reaches the goal, and applying its steps gives exactly the reported total', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { planGoal } = await import('../src/lib/farm');
    const { allCharts } = await import('../src/lib/meta');
    const meta = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'public', 'phigros_meta.json'), 'utf8'));
    // A synthetic player: 30 hard charts at 98.5-99.8%, three easy APs.
    const charts = allCharts(meta).filter((r) => r.chart.c >= 15.5).slice(0, 33);
    const plays: Play[] = charts.map((r, i) => ({ key: r.key, c: r.chart.c, acc: i < 3 ? 100 : 98.5 + (i % 7) * 0.2 }));
    const start = computeRks(plays).total;
    for (const goal of [start + 0.005, start + 0.05]) {
      const plan = planGoal(plays, meta, goal);
      expect(plan.reached).toBe(true);
      const applied = new Map(plays.map((p) => [p.key, p]));
      for (const s of plan.steps) applied.set(s.ref.key, { key: s.ref.key, c: s.ref.chart.c, acc: s.toAcc });
      expect(computeRks([...applied.values()]).total).toBeCloseTo(plan.end, 9);
      expect(plan.end).toBeGreaterThanOrEqual(goal);
      for (const s of plan.steps) if (s.fromAcc !== undefined) expect(s.toAcc).toBeGreaterThan(s.fromAcc);
    }
  });
});
