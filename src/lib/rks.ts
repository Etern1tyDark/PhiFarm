// Phigros RKS math.
//
// Accuracy: 100 * (Perfect + 0.65 * Good) / N, so every Good costs 35/N percentage points.
// Single-chart RKS: C at 100%, ((acc - 55) / 45)^2 * C for 70% <= acc < 100%, else 0.
// Player RKS: (sum of best 27 chart RKS + sum of the 3 highest AP constants) / 30.

export const B_SLOTS = 27;
export const PHI_SLOTS = 3;
export const TOTAL_SLOTS = B_SLOTS + PHI_SLOTS;
export const GOOD_COST = 35; // percentage points * N lost per Good

export function chartRks(acc: number, c: number): number {
  if (acc >= 100) return c;
  if (acc < 70) return 0;
  return ((acc - 55) / 45) ** 2 * c;
}

/** Lowest accuracy that yields at least `rks` on a chart of constant `c` (Infinity if unreachable). */
export function accForRks(rks: number, c: number): number {
  if (rks <= 0) return 0;
  if (rks > c) return Infinity;
  if (rks === c) return 100;
  return Math.max(70, 55 + 45 * Math.sqrt(rks / c));
}

/** Accuracy with `goods` Goods and everything else Perfect. */
export function accWithGoods(goods: number, notes: number): number {
  return 100 - (GOOD_COST * goods) / notes;
}

/** Most Goods (rest Perfect) that still reach `targetAcc`. */
export function maxGoods(targetAcc: number, notes: number): number {
  if (targetAcc > 100) return -1;
  // Small epsilon so an exact boundary (e.g. 99.65% on N=100 with 1 Good) counts as reached.
  return Math.floor((notes * (100 - targetAcc)) / GOOD_COST + 1e-9);
}

/** Good-equivalents implied by an accuracy (fractional when Bads/Misses are involved). */
export function goodsFromAcc(acc: number, notes: number): number {
  return ((100 - acc) * notes) / GOOD_COST;
}

export interface Play {
  key: string; // `${songId}/${level}`
  c: number;
  acc: number;
}

export interface RksBreakdown {
  total: number;
  best: Array<Play & { rks: number }>; // sorted by rks desc, all plays
  phi: Array<Play & { rks: number }>; // top 3 APs by constant
  bFloor: number; // rks of the 27th best play (0 when fewer than 27 plays)
  phiFloor: number; // constant of the 3rd best AP (0 when fewer than 3 APs)
}

export function computeRks(plays: Play[]): RksBreakdown {
  const best = plays
    .map((p) => ({ ...p, rks: chartRks(p.acc, p.c) }))
    .sort((a, b) => b.rks - a.rks);
  const phi = best.filter((p) => p.acc >= 100).sort((a, b) => b.c - a.c).slice(0, PHI_SLOTS);
  const sumB = best.slice(0, B_SLOTS).reduce((s, p) => s + p.rks, 0);
  const sumPhi = phi.reduce((s, p) => s + p.c, 0);
  return {
    total: (sumB + sumPhi) / TOTAL_SLOTS,
    best,
    phi,
    bFloor: best.length >= B_SLOTS ? best[B_SLOTS - 1].rks : 0,
    phiFloor: phi.length >= PHI_SLOTS ? phi[PHI_SLOTS - 1].c : 0,
  };
}

/** Total RKS after replacing (or adding) one play, computed exactly. */
export function totalWith(plays: Play[], next: Play): number {
  const others = plays.filter((p) => p.key !== next.key);
  const prev = plays.find((p) => p.key === next.key);
  // A score never goes down in-game, so keep the better of the two.
  const kept = prev && prev.acc > next.acc ? prev : next;
  return computeRks([...others, kept]).total;
}

/** In-game display shows two decimals, rounded half-up. */
export function displayRks(total: number): string {
  return (Math.round(total * 100 + 1e-9) / 100).toFixed(2);
}

/** Smallest raw total that shows one 0.01 step higher than the current display. */
export function nextDisplayThreshold(total: number): number {
  return (Math.round(total * 100 + 1e-9) + 0.5) / 100;
}
