// Step 2 of the data build: turn scripts/.cache into public/phigros_meta.json.
// Run `npm run data:fetch` first.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { hashIllustration } from '../src/lib/imagehash';
import type { ChartMeta, Level, Meta, SongMeta } from '../src/lib/meta';
import type { ChartStats, PhibotSong } from './fetch-sources';

const CACHE = join(import.meta.dirname, '.cache');
const OUT = join(import.meta.dirname, '..', 'public', 'phigros_meta.json');

async function loadRgba(path: string) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

async function main() {
  const songs: PhibotSong[] = JSON.parse(await readFile(join(CACHE, 'phibot_charts.json'), 'utf8'));
  const stats: Record<string, ChartStats | null> = JSON.parse(await readFile(join(CACHE, 'chart_stats.json'), 'utf8'));
  const jacketFiles = new Set(await readdir(join(CACHE, 'jackets')));

  const out: SongMeta[] = [];
  for (const s of songs) {
    const base = s.id.replace(/\.0$/, '');
    const jackets: SongMeta['jackets'] = [];
    for (const f of [`${base}.png`, ...Object.keys(s.charts).map((lv) => `${base}_${lv}.png`)]) {
      if (!jacketFiles.has(f)) continue;
      const level = f.match(/_(EZ|HD|IN|AT|SP)\.png$/)?.[1] as Level | undefined;
      jackets.push({ ...(level ? { level } : {}), ...hashIllustration(await loadRgba(join(CACHE, 'jackets', f))) });
    }
    const charts: SongMeta['charts'] = {};
    for (const [lv, [c, n]] of Object.entries(s.charts)) {
      const st = stats[`${s.id}/${lv}`];
      const chart: ChartMeta = { c, n };
      if (st) {
        Object.assign(chart, {
          tap: st.tap, drag: st.drag, hold: st.hold, flick: st.flick,
          dur: st.durationSec, nps: st.peakNps,
        });
      }
      charts[lv as Level] = chart;
    }
    out.push({ id: s.id, name: s.song, composer: s.composer, aliases: s.aliases ?? [], jackets, charts });
  }

  const meta: Meta = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      'https://phibot.dev/api/charts (constants, note counts, aliases)',
      'https://github.com/7aGiven/Phigros_Resource (raw charts, illustrations)',
    ],
    songs: out,
  };
  await writeFile(OUT, JSON.stringify(meta));
  const nCharts = out.reduce((n, s) => n + Object.keys(s.charts).length, 0);
  const noJacket = out.filter((s) => !s.jackets.length).map((s) => s.name);
  console.log(`wrote ${OUT}: ${out.length} songs, ${nCharts} charts; no jacket: ${noJacket.join(', ') || 'none'}`);
}

main();
