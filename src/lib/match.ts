import { hashDistance, hashPlaced, type Rect, type Rgba } from './imagehash';
import type { JacketScorer } from './layout';
import type { Level, Meta, SongMeta } from './meta';

export interface JacketMatch {
  song: SongMeta;
  level?: Level; // set when the song uses a per-difficulty illustration
  dist: number;
}

/** Songs ranked by jacket similarity (best first, one entry per song+variant). */
export function matchJacket(meta: Meta, img: Rgba, illus: Rect, top = 5): JacketMatch[] {
  const h = hashPlaced(img, illus);
  const out: JacketMatch[] = [];
  for (const song of meta.songs) {
    for (const j of song.jackets) out.push({ song, level: j.level, dist: hashDistance(h, j) });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, top);
}

/** Distance to the closest jacket of any song, for layout alignment and slot detection. */
export function jacketScorer(meta: Meta, img: Rgba): JacketScorer {
  const all = meta.songs.flatMap((s) => s.jackets);
  return (illus) => {
    const h = hashPlaced(img, illus);
    let best = Infinity;
    for (const j of all) best = Math.min(best, hashDistance(h, j));
    return best;
  };
}
