// Browser pipeline: image file -> detected slots -> jacket match + OCR -> CardRecords.
import { createScheduler, createWorker, PSM, type Scheduler } from 'tesseract.js';
import type { Rect, Rgba } from './imagehash';
import { detectSlots, slotLabel, type Detection, type LayoutTemplate } from './layout';
import { matchJacket } from './match';
import type { Meta } from './meta';
import { OCR_WHITELIST, preprocess, type OcrResult } from './ocr';
import { resolveByOrder, resolveCard, type CardRecord } from './resolve';

export interface LoadedImage {
  img: Rgba;
  canvas: HTMLCanvasElement;
}

export async function loadImage(file: Blob): Promise<LoadedImage> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { img: { data, width: bmp.width, height: bmp.height }, canvas };
}

/** Shift and scale a template, for images that are cropped or padded differently. */
export function calibrate(t: LayoutTemplate, dx: number, dy: number, scale: number): LayoutTemplate {
  return {
    ...t,
    id: `${t.id}+cal`,
    refWidth: t.refWidth / scale,
    cols: t.cols.map((x) => x + dx / scale),
    sections: t.sections.map((s) => ({ ...s, top: s.top + dy / scale })),
  };
}

let scheduler: Promise<Scheduler> | null = null;

function getScheduler() {
  scheduler ??= (async () => {
    const s = createScheduler();
    const workers = await Promise.all(
      Array.from({ length: Math.min(3, navigator.hardwareConcurrency || 2) }, async () => {
        const w = await createWorker('eng');
        await w.setParameters({
          tessedit_char_whitelist: OCR_WHITELIST,
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          user_defined_dpi: '300',
        });
        return w;
      }),
    );
    workers.forEach((w) => s.addWorker(w));
    return s;
  })();
  return scheduler;
}

function toCanvas(img: Rgba): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

async function ocr(img: Rgba, rect: Rect): Promise<OcrResult> {
  const s = await getScheduler();
  const { data } = await s.addJob('recognize', toCanvas(preprocess(img, rect)));
  return { text: data.text, confidence: data.confidence };
}

function thumbnail(src: HTMLCanvasElement, r: Rect): string {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = Math.round((160 * r.h) / r.w);
  c.getContext('2d')!.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

export interface ScannedRecord extends CardRecord {
  thumb: string;
}

export async function scan(
  meta: Meta,
  loaded: LoadedImage,
  det: Detection,
  onProgress: (done: number, total: number) => void,
): Promise<ScannedRecord[]> {
  let done = 0;
  onProgress(0, det.slots.length);
  const results = await Promise.all(
    det.slots.map(async (slot) => {
      const [diff, crks, acc] = await Promise.all([
        ocr(loaded.img, slot.parts.diff),
        ocr(loaded.img, slot.parts.crks),
        ocr(loaded.img, slot.parts.acc),
      ]);
      const rec = resolveCard(slotLabel(slot), matchJacket(meta, loaded.img, slot.parts.illus), { diff, crks, acc }, det.template.decimals);
      onProgress(++done, det.slots.length);
      return rec && { ...rec, thumb: thumbnail(loaded.canvas, slot.card) };
    }),
  );
  return resolveByOrder(results.filter((r): r is ScannedRecord => r !== null), meta);
}

export { detectSlots };
