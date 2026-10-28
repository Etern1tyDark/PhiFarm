// Step 1 of the data build: download every open source we need into scripts/.cache.
// Chart JSONs are large (~2.7 GB total), so each one is reduced to its stats immediately
// and only the stats are cached. Re-running resumes where it left off.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE = join(import.meta.dirname, '.cache');
const RES = 'https://raw.githubusercontent.com/7aGiven/Phigros_Resource';
const PHIBOT_CHARTS = 'https://phibot.dev/api/charts';

export interface PhibotSong {
  id: string;
  song: string;
  composer: string;
  aliases: string[];
  charts: Record<string, [number, number]>; // level -> [constant, notes]
}

export interface ChartStats {
  notes: number;
  tap: number;
  drag: number;
  hold: number;
  flick: number;
  durationSec: number;
  peakNps: number; // max notes inside any 1-second window
}

interface RawNote { type: number; time: number; holdTime: number }
interface RawLine { bpm: number; notesAbove: RawNote[]; notesBelow: RawNote[] }

export function chartStats(chart: { judgeLineList: RawLine[] }): ChartStats {
  const times: number[] = [];
  const counts = [0, 0, 0, 0, 0];
  let end = 0;
  for (const line of chart.judgeLineList) {
    // Official format: one time unit = 1.875 / bpm seconds (a 1/32 beat).
    const unit = 1.875 / line.bpm;
    for (const n of [...line.notesAbove, ...line.notesBelow]) {
      counts[n.type]++;
      const t = n.time * unit;
      times.push(t);
      end = Math.max(end, t + (n.type === 3 ? n.holdTime * unit : 0));
    }
  }
  times.sort((a, b) => a - b);
  let peak = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] >= 1) j++;
    peak = Math.max(peak, i - j + 1);
  }
  return {
    notes: times.length,
    tap: counts[1], drag: counts[2], hold: counts[3], flick: counts[4],
    durationSec: Math.round(end * 10) / 10,
    peakNps: peak,
  };
}

async function exists(p: string) {
  try { await access(p); return true; } catch { return false; }
}

async function fetchRetry(url: string, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return r;
      throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function main() {
  await mkdir(join(CACHE, 'jackets'), { recursive: true });

  const songs: PhibotSong[] = await (await fetchRetry(PHIBOT_CHARTS)).json();
  await writeFile(join(CACHE, 'phibot_charts.json'), JSON.stringify(songs));
  console.log(`phibot: ${songs.length} songs`);

  const statsPath = join(CACHE, 'chart_stats.json');
  const stats: Record<string, ChartStats | null> =
    (await exists(statsPath)) ? JSON.parse(await readFile(statsPath, 'utf8')) : {};

  const jobs = songs.flatMap((s) => Object.keys(s.charts).map((lv) => ({ id: s.id, lv })))
    .filter((j) => !(`${j.id}/${j.lv}` in stats));
  let done = 0;
  await pool(jobs, 8, async ({ id, lv }) => {
    const r = await fetchRetry(`${RES}/chart/${encodeURIComponent(id)}/${lv}.json`);
    stats[`${id}/${lv}`] = r.ok ? chartStats(await r.json()) : null;
    if (++done % 25 === 0) {
      console.log(`charts ${done}/${jobs.length}`);
      await writeFile(statsPath, JSON.stringify(stats));
    }
  });
  await writeFile(statsPath, JSON.stringify(stats));

  await pool(songs, 8, async (s) => {
    const name = s.id.replace(/\.0$/, '');
    // Most songs share one illustration; a few have one per difficulty (`<name>_IN.png`).
    const variants = ['', ...Object.keys(s.charts).map((lv) => `_${lv}`)];
    for (const v of variants) {
      const out = join(CACHE, 'jackets', `${name}${v}.png`);
      if (await exists(out)) return;
      const r = await fetchRetry(`${RES}/illustrationLowRes/${encodeURIComponent(name + v)}.png`);
      if (r.ok) await writeFile(out, Buffer.from(await r.arrayBuffer()));
      if (r.ok && v === '') return;
    }
    if (!(await exists(join(CACHE, 'jackets', `${name}.png`)))) console.warn(`no shared jacket for ${s.id}`);
  });
  // Real phibot.dev B30 render used by the OCR tests.
  const fixture = join(CACHE, 'fixtures', 'phibot-b30-sample.webp');
  if (!(await exists(fixture))) {
    await mkdir(join(CACHE, 'fixtures'), { recursive: true });
    const r = await fetchRetry('https://phibot.dev/landing/b30-sample-full.webp');
    if (r.ok) await writeFile(fixture, Buffer.from(await r.arrayBuffer()));
  }
  console.log('fetch complete');
}

main();
