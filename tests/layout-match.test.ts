// End-to-end check of slot detection + jacket matching against the real phibot.dev sample.
// The fixture is fetched by `npm run data:fetch`; the test is skipped when it is absent.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { autoDetect, slotLabel } from '../src/lib/layout';
import { jacketScorer, matchJacket } from '../src/lib/match';
import type { Meta } from '../src/lib/meta';

const FIXTURE = join(import.meta.dirname, '..', 'scripts', '.cache', 'fixtures', 'phibot-b30-sample.webp');
const META = join(import.meta.dirname, '..', 'public', 'phigros_meta.json');

// Read off the image by hand: slot label -> song id prefix.
const TRUTH: Record<string, string> = {
  P1: 'BANGINGSTRIKE', P2: 'Stasis.Maozon', P3: 'Cuvism',
  '#1': 'DESTRUCTION321', '#2': 'QZKagoRequiem', '#3': 'Igallta', '#4': 'Hydra',
  '#5': 'ReEndofaDream', '#6': 'ERABYECONNEC10N', '#7': 'WhatdoyouwantmorethanaHappyending',
  '#8': '玩具狂奏曲終焉', '#9': 'BANGINGSTRIKE', '#10': 'DerRichter', '#11': 'DistortedFate',
  '#12': '祈-我ら神祖', '#13': 'Stasis.Maozon', '#14': 'Cuvism', '#15': 'slips',
  '#16': 'AbsoluTedisoRdeR', '#17': 'Spasmodic', '#18': '夢の降る日に', '#19': 'DiamondDust',
  '#20': 'DerSchneid', '#21': 'Rrharil', '#22': 'GungnirFracture', '#23': 'AvataarReincarnationofKalpa',
  '#24': 'ATHAZA', '#25': 'PRAGMATISMRESURRECTION', '#26': 'ExoplanetaryMirage', '#27': 'EntrancetotheChaos',
  '#28': 'Lyrith迷宮リリス', '#29': 'Archidoxen', '#30': '彩', '#31': 'volcanic', '#32': 'DistortedFate',
  '#33': 'ERABYECONNEC10N',
};

describe.skipIf(!existsSync(FIXTURE))('phibot B30 sample', async () => {
  const { data, info } = await sharp(FIXTURE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data: new Uint8Array(data), width: info.width, height: info.height };
  const meta: Meta = JSON.parse(readFileSync(META, 'utf8'));

  it('finds exactly the 36 filled slots (P1-P3, #1-#33)', () => {
    const det = autoDetect(img, jacketScorer(meta, img));
    expect(det.template.id).toBe('phibot-b30');
    expect(det.score).toBeGreaterThan(0.6);
    expect(det.slots.map(slotLabel)).toEqual(Object.keys(TRUTH));
  });

  it('matches every jacket to the right song', () => {
    const det = autoDetect(img, jacketScorer(meta, img));
    const wrong: string[] = [];
    for (const slot of det.slots) {
      const [best] = matchJacket(meta, img, slot.parts.illus);
      const label = slotLabel(slot);
      if (!best.song.id.startsWith(TRUTH[label])) wrong.push(`${label}: got ${best.song.id}`);
    }
    expect(wrong).toEqual([]);
  });
});
