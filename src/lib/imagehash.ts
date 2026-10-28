// Perceptual jacket hashing, shared by the build script (Node + sharp) and the browser (canvas).
// Both sides feed raw RGBA pixels here, so the hashes are bit-identical across environments.

export interface Rgba {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Part of an illustration that is never covered by card overlays (rank tag, difficulty
 * badge, slanted mask). Expressed as fractions of the full illustration.
 */
export const HASH_REGION = { u0: 0.31, u1: 0.83, v0: 0.09, v1: 0.82 };

export interface JacketHash {
  /** 16x16 difference hash, as 8 uint32 words (256 bits). */
  d: number[];
  /** 4x4 grid of mean RGB, 48 bytes. */
  c: number[];
}

/** Box-filter `rect` of `img` down to gw x gh cells; returns [r,g,b] per cell. */
function sampleGrid(img: Rgba, rect: Rect, gw: number, gh: number): Float64Array {
  const out = new Float64Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.floor(rect.y + (rect.h * gy) / gh);
    const y1 = Math.max(y0 + 1, Math.floor(rect.y + (rect.h * (gy + 1)) / gh));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor(rect.x + (rect.w * gx) / gw);
      const x1 = Math.max(x0 + 1, Math.floor(rect.x + (rect.w * (gx + 1)) / gw));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
          const i = (y * img.width + x) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const o = (gy * gw + gx) * 3;
      n = n || 1;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

export function hashRegion(img: Rgba, rect: Rect): JacketHash {
  const G = 16;
  const grid = sampleGrid(img, rect, G + 1, G);
  const lum = (i: number) => 0.299 * grid[i * 3] + 0.587 * grid[i * 3 + 1] + 0.114 * grid[i * 3 + 2];
  const d = new Array(8).fill(0);
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const bit = y * G + x;
      if (lum(y * (G + 1) + x) > lum(y * (G + 1) + x + 1)) d[bit >>> 5] |= 1 << (bit & 31);
    }
  }
  const c = Array.from(sampleGrid(img, rect, 4, 4), (v) => Math.round(v));
  return { d: d.map((w) => w >>> 0), c };
}

/** Hash of a full illustration (the reference side). */
export function hashIllustration(img: Rgba): JacketHash {
  const { u0, u1, v0, v1 } = HASH_REGION;
  return hashRegion(img, {
    x: img.width * u0,
    y: img.height * v0,
    w: img.width * (u1 - u0),
    h: img.height * (v1 - v0),
  });
}

/** Hash of an illustration that a card drew into `placed` (image pixel coordinates). */
export function hashPlaced(img: Rgba, placed: Rect): JacketHash {
  const { u0, u1, v0, v1 } = HASH_REGION;
  return hashRegion(img, {
    x: placed.x + placed.w * u0,
    y: placed.y + placed.h * v0,
    w: placed.w * (u1 - u0),
    h: placed.h * (v1 - v0),
  });
}

function popcount(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** 0 = identical, ~1 = unrelated. Structure dominates; colour breaks near-ties. */
export function hashDistance(a: JacketHash, b: JacketHash): number {
  let bits = 0;
  for (let i = 0; i < 8; i++) bits += popcount((a.d[i] ^ b.d[i]) >>> 0);
  let col = 0;
  for (let i = 0; i < 48; i++) col += Math.abs(a.c[i] - b.c[i]);
  return 0.75 * (bits / 128) + 0.25 * (col / (48 * 128));
}
