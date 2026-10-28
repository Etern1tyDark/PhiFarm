import type { Community, Level, Meta, SongMeta } from './lib/meta';
import { chartKey } from './lib/meta';
import type { CardRecord } from './lib/resolve';
import type { Play } from './lib/rks';

export interface Rec {
  id: string;
  slot: string; // "P1", "#12", or "+" for hand-added / hypothetical
  songId: string;
  level: Level;
  acc: number;
  doubt: CardRecord['doubt'];
  thumb?: string;
  hypothetical?: boolean;
}

let seq = 0;
export const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function songIndex(meta: Meta): Map<string, SongMeta> {
  return new Map(meta.songs.map((s) => [s.id, s]));
}

/** One Play per chart (best accuracy wins), skipping records that don't resolve to a chart. */
export function toPlays(recs: Rec[], songs: Map<string, SongMeta>): Play[] {
  const best = new Map<string, Play>();
  for (const r of recs) {
    const chart = songs.get(r.songId)?.charts[r.level];
    if (!chart) continue;
    const key = chartKey(r.songId, r.level);
    const prev = best.get(key);
    if (!prev || r.acc > prev.acc) best.set(key, { key, c: chart.c, acc: r.acc });
  }
  return [...best.values()];
}

export interface ExportFile {
  app: 'phifarm';
  version: 1;
  exportedAt: string;
  records: Array<Pick<Rec, 'slot' | 'songId' | 'level' | 'acc'> & { hypothetical?: boolean }>;
}

export function exportJson(recs: Rec[]): string {
  const file: ExportFile = {
    app: 'phifarm',
    version: 1,
    exportedAt: new Date().toISOString(),
    records: recs.map(({ slot, songId, level, acc, hypothetical }) => ({
      slot, songId, level, acc, ...(hypothetical ? { hypothetical } : {}),
    })),
  };
  return JSON.stringify(file, null, 2);
}

export function importJson(text: string, songs: Map<string, SongMeta>): Rec[] {
  const file = JSON.parse(text) as ExportFile;
  if (file.app !== 'phifarm' || !Array.isArray(file.records)) throw new Error('Not a PhiFarm export');
  return file.records.map((r) => ({
    id: newId(),
    slot: r.slot,
    songId: r.songId,
    level: r.level,
    acc: Number(r.acc),
    hypothetical: r.hypothetical,
    doubt: songs.get(r.songId)?.charts[r.level] ? {} : { song: 'not in chart data' },
  }));
}

/** Community priors file: { "<songId>/<level>": { ap, fc, median, top25, top10 } }. */
export function parseCommunity(text: string): Record<string, Community> {
  const raw = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Expected an object keyed by "songId/level"');
  const out: Record<string, Community> = {};
  for (const [k, v] of Object.entries(raw as Record<string, Community>)) {
    if (!/\/(EZ|HD|IN|AT|SP)$/.test(k) || typeof v !== 'object') continue;
    out[k] = v;
  }
  return out;
}

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the export button is the durable path.
  }
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
