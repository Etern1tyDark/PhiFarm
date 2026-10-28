// Full pipeline on the phibot.dev sample: detect -> jacket match -> Tesseract OCR -> resolve.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { afterAll, describe, expect, it } from 'vitest';
import type { Rgba } from '../src/lib/imagehash';
import { autoDetect, slotLabel } from '../src/lib/layout';
import { jacketScorer, matchJacket } from '../src/lib/match';
import type { Meta } from '../src/lib/meta';
import { OCR_WHITELIST, preprocess } from '../src/lib/ocr';
import { dedupe, resolveByOrder, resolveCard, type CardRecord } from '../src/lib/resolve';
import { computeRks } from '../src/lib/rks';

const FIXTURE = join(import.meta.dirname, '..', 'scripts', '.cache', 'fixtures', 'phibot-b30-sample.webp');
const META = join(import.meta.dirname, '..', 'public', 'phigros_meta.json');

// slot -> [level, accuracy], transcribed from the image.
const TRUTH: Record<string, [string, number]> = {
  P1: ['AT', 100], P2: ['AT', 100], P3: ['AT', 100],
  '#1': ['AT', 99.6974], '#2': ['AT', 99.498], '#3': ['AT', 99.4479], '#4': ['AT', 99.7576],
  '#5': ['AT', 99.9746], '#6': ['AT', 99.4364], '#7': ['AT', 99.6716], '#8': ['AT', 99.7489],
  '#9': ['AT', 100], '#10': ['AT', 99.8124], '#11': ['AT', 99.1504], '#12': ['AT', 99.2417],
  '#13': ['AT', 100], '#14': ['AT', 100], '#15': ['AT', 99.8511], '#16': ['AT', 99.3235],
  '#17': ['AT', 99.8953], '#18': ['IN', 100], '#19': ['AT', 99.8617], '#20': ['AT', 98.8199],
  '#21': ['AT', 98.6462], '#22': ['IN', 99.9409], '#23': ['AT', 99.9348], '#24': ['AT', 99.9219],
  '#25': ['AT', 99.9092], '#26': ['AT', 98.2156], '#27': ['AT', 98.5348], '#28': ['AT', 99.8584],
  '#29': ['AT', 99.3178], '#30': ['IN', 99.9514], '#31': ['AT', 99.6606], '#32': ['IN', 100],
  '#33': ['IN', 100],
};

async function toPng(img: Rgba) {
  return sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
}

describe.skipIf(!existsSync(FIXTURE))('pipeline on phibot sample', async () => {
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_char_whitelist: OCR_WHITELIST, tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: '300' });
  afterAll(() => worker.terminate());
  const ocr = async (img: Rgba) => {
    const { data } = await worker.recognize(await toPng(img));
    return { text: data.text, confidence: data.confidence };
  };

  const { data, info } = await sharp(FIXTURE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data: new Uint8Array(data), width: info.width, height: info.height };
  const meta: Meta = JSON.parse(readFileSync(META, 'utf8'));

  it('reads level and accuracy of every card', async () => {
    const det = autoDetect(img, jacketScorer(meta, img));
    const wrong: string[] = [];
    const doubts: string[] = [];
    const records: CardRecord[] = [];
    for (const slot of det.slots) {
      const label = slotLabel(slot);
      const rec = resolveCard(label, matchJacket(meta, img, slot.parts.illus), {
        diff: await ocr(preprocess(img, slot.parts.diff)),
        crks: await ocr(preprocess(img, slot.parts.crks)),
        acc: await ocr(preprocess(img, slot.parts.acc)),
      })!;
      records.push(rec);
      const [lv, acc] = TRUTH[label];
      if (rec.level !== lv || Math.abs(rec.acc - acc) > 1e-6) {
        wrong.push(`${label}: ${rec.level} ${rec.acc} (raw ${JSON.stringify(rec.raw)})`);
      }
      if (Object.keys(rec.doubt).length) doubts.push(`${label}: ${JSON.stringify(rec.doubt)}`);
    }
    console.log(`doubts (${doubts.length}):\n${doubts.join('\n')}`);
    expect(wrong).toEqual([]);

    // The card header prints the player's RKS; our math + constants must reproduce it.
    const plays = dedupe(records).map((r) => ({
      key: `${r.songId}/${r.level}`,
      c: meta.songs.find((s) => s.id === r.songId)!.charts[r.level]!.c,
      acc: r.acc,
    }));
    expect(computeRks(plays).total).toBeCloseTo(16.7176, 4);
  }, 180_000);
});

// Real renders from a player, kept out of git (scripts/.cache). Each prints its own RKS.
const USER_FIXTURES: Array<{ file: string; template: string; slots: number; rks?: number; tol?: number; songDoubts?: number }> = [
  { file: 'user-phibot-b30.png', template: 'phibot-b30', slots: 36, rks: 16.5445, tol: 0.00005 },
  // PSL prints 2-decimal accuracy, so totals are only known to about ±0.002.
  { file: 'user-psl-b30.png', template: 'psl-b30', slots: 30, rks: 16.5445, tol: 0.002 },
  // Other players' renders, checked against the RKS printed on them.
  { file: 'friend-psl-b30.png', template: 'psl-b30', slots: 30, rks: 15.22, tol: 0.005 },
  { file: 'clockatiel-psl.png', template: 'psl-b30', slots: 30, rks: 16.36, tol: 0.005 }, // dots drawn over jackets
  { file: 'xiangyuyu-phibot-zh.png', template: 'phibot-b30', slots: 36, rks: 15.4597, tol: 0.00005 }, // Chinese UI, blue panels
  // Newer 4-decimal PSL at low resolution; one card has a missing-texture jacket nobody can match.
  { file: 'eggeggegg-psl4.png', template: 'psl-b30', slots: 30, songDoubts: 1 },
];

for (const fx of USER_FIXTURES) {
  const path = join(import.meta.dirname, '..', 'scripts', '.cache', 'fixtures', fx.file);
  describe.skipIf(!existsSync(path))(`pipeline on ${fx.file}`, async () => {
    const worker = await createWorker('eng');
    await worker.setParameters({ tessedit_char_whitelist: OCR_WHITELIST, tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: '300' });
    afterAll(() => worker.terminate());
    const ocr = async (img: Rgba) => {
      const { data } = await worker.recognize(await toPng(img));
      return { text: data.text, confidence: data.confidence };
    };
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data: new Uint8Array(data), width: info.width, height: info.height };
    const meta: Meta = JSON.parse(readFileSync(META, 'utf8'));

    it('detects the layout, reads every card and reproduces the printed RKS', async () => {
      const det = autoDetect(img, jacketScorer(meta, img));
      expect(det.template.id).toBe(fx.template);
      expect(det.slots.length).toBe(fx.slots);
      const records: CardRecord[] = [];
      for (const slot of det.slots) {
        records.push(resolveCard(slotLabel(slot), matchJacket(meta, img, slot.parts.illus), {
          diff: await ocr(preprocess(img, slot.parts.diff)),
          crks: await ocr(preprocess(img, slot.parts.crks)),
          acc: await ocr(preprocess(img, slot.parts.acc)),
        }, det.template.decimals)!);
      }
      expect(records.filter((r) => r.doubt.song).length).toBe(fx.songDoubts ?? 0);
      if (fx.rks === undefined) return;
      const plays = dedupe(resolveByOrder(records, meta)).map((r) => ({
        key: `${r.songId}/${r.level}`,
        c: meta.songs.find((s) => s.id === r.songId)!.charts[r.level]!.c,
        acc: r.acc,
      }));
      expect(Math.abs(computeRks(plays).total - fx.rks)).toBeLessThan(fx.tol!);
    }, 180_000);
  });
}
