import type { JacketHash } from './imagehash';

export const LEVELS = ['EZ', 'HD', 'IN', 'AT', 'SP'] as const;
export type Level = (typeof LEVELS)[number];

/** Community aggregates for one chart. Not bundled (no public source); importable as JSON. */
export interface Community {
  ap?: number; // AP rate, 0..1
  fc?: number; // FC rate, 0..1
  median?: number; // accuracy %
  top25?: number; // accuracy % at the 75th percentile of players
  top10?: number; // accuracy % at the 90th percentile of players
}

export interface ChartMeta {
  c: number; // chart constant
  n: number; // total notes
  // Breakdown from the raw chart file; absent for charts newer than the open chart mirror.
  tap?: number;
  drag?: number;
  hold?: number;
  flick?: number;
  dur?: number; // seconds
  nps?: number; // peak notes in any 1 s window
}

export interface SongMeta {
  id: string;
  name: string;
  composer: string;
  aliases: string[];
  jackets: Array<JacketHash & { level?: Level }>;
  charts: Partial<Record<Level, ChartMeta>>;
}

export interface Meta {
  version: number;
  generatedAt: string;
  sources: string[];
  songs: SongMeta[];
}

export interface ChartRef {
  key: string; // `${songId}/${level}`
  song: SongMeta;
  level: Level;
  chart: ChartMeta;
}

export function chartKey(songId: string, level: Level) {
  return `${songId}/${level}`;
}

export function allCharts(meta: Meta): ChartRef[] {
  return meta.songs.flatMap((song) =>
    (Object.entries(song.charts) as [Level, ChartMeta][]).map(([level, chart]) => ({
      key: chartKey(song.id, level),
      song,
      level,
      chart,
    })),
  );
}
