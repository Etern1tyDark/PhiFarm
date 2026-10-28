import { useEffect, useRef, useState } from 'react';
import { autoDetect, slotLabel, TEMPLATES, type Detection } from '../lib/layout';
import { jacketScorer } from '../lib/match';
import type { Meta } from '../lib/meta';
import { calibrate, detectSlots, loadImage, scan, type LoadedImage, type ScannedRecord } from '../lib/scan';
import { Button, cx, field } from './ui';

interface Props {
  meta: Meta;
  onScanned: (recs: ScannedRecord[]) => void;
  /** Smaller drop zone when scores already exist. */
  compact?: boolean;
}

// Jacket-fit score: the right template scores ~0.7-0.8 on real images, a wrong one ~0.0.
const LOW_SCORE = 0.35;

export function ImportPanel({ meta, onScanned, compact }: Props) {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [det, setDet] = useState<Detection | null>(null);
  const [cal, setCal] = useState({ templateId: TEMPLATES[0].id, dx: 0, dy: 0, scale: 1 });
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);

  async function onFile(file: File) {
    setError(null);
    try {
      const l = await loadImage(file);
      setLoaded(l);
      const d = autoDetect(l.img, jacketScorer(meta, l.img));
      setCal({ templateId: d.template.id, dx: 0, dy: 0, scale: 1 });
      setDet(d);
    } catch (e) {
      setError(`Could not read that image: ${(e as Error).message}`);
    }
  }

  // Re-detect when calibration changes.
  useEffect(() => {
    if (!loaded) return;
    const base = TEMPLATES.find((t) => t.id === cal.templateId) ?? TEMPLATES[0];
    const t = cal.dx || cal.dy || cal.scale !== 1 ? calibrate(base, cal.dx, cal.dy, cal.scale) : base;
    setDet(detectSlots(loaded.img, t, jacketScorer(meta, loaded.img)));
  }, [loaded, cal, meta]);

  // Draw the detected grid over a scaled-down copy of the image.
  useEffect(() => {
    const c = preview.current;
    if (!c || !loaded || !det) return;
    const k = Math.min(1, 520 / loaded.img.width);
    c.width = Math.round(loaded.img.width * k);
    c.height = Math.round(loaded.img.height * k);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(loaded.canvas, 0, 0, c.width, c.height);
    ctx.lineWidth = 1.5;
    for (const s of det.slots) {
      const box = (r: { x: number; y: number; w: number; h: number }, color: string) => {
        ctx.strokeStyle = color;
        ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
      };
      box(s.card, '#ffffff');
      box(s.parts.illus, '#f5c542');
      box(s.parts.acc, '#4ade80');
      box(s.parts.diff, '#38bdf8');
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.fillText(slotLabel(s), s.card.x * k + 2, s.card.y * k - 2);
    }
  }, [loaded, det]);

  async function run() {
    if (!loaded || !det) return;
    setError(null);
    try {
      const recs = await scan(meta, loaded, det, (d, t) => setProgress([d, t]));
      onScanned(recs);
    } catch (e) {
      setError(`OCR failed: ${(e as Error).message}. The OCR engine downloads from a CDN on first use, so check your connection.`);
    } finally {
      setProgress(null);
    }
  }

  const low = det && det.score < LOW_SCORE;
  const slider = 'w-full accent-[var(--color-accent)]';

  return (
    <div className="space-y-4">
      <label
        className={cx(
          'group relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-xl border-2 border-dashed px-6 text-center transition outline-none',
          compact ? 'py-5' : 'py-14',
          drag ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-900/60 hover:border-ink-500 focus-visible:border-accent',
        )}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onPaste={(e) => {
          const f = [...e.clipboardData.files][0];
          if (f) onFile(f);
        }}
        tabIndex={0}
      >
        <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {!compact && (
          <span className="grid h-12 w-12 -skew-x-12 place-items-center bg-white/10 text-2xl transition group-hover:bg-accent group-hover:text-ink-950">
            <span className="skew-x-12">↑</span>
          </span>
        )}
        <span className={cx('font-display font-semibold', compact ? 'text-base' : 'text-xl')}>Drop, paste or pick your B30 image</span>
        <span className="text-sm text-ink-400">phibot.dev / PhiBot or PSL Discord bot render · read entirely in your browser</span>
      </label>

      {error && <p className="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss ring-1 ring-loss/30">{error}</p>}

      {loaded && det && (
        <div className="grid gap-5 rounded-xl bg-ink-900 p-4 ring-1 ring-ink-800 md:grid-cols-[minmax(0,320px)_1fr]">
          <canvas ref={preview} className="max-h-[520px] w-full rounded-lg object-contain ring-1 ring-ink-800" />
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[10px] tracking-[0.14em] text-ink-500 uppercase">Detected layout</div>
              <div className="font-display text-lg font-semibold">{det.template.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-ink-300">
                <span>
                  Match <b className={low ? 'text-doubt' : 'text-gain'}>{Math.round(det.score * 100)}%</b>
                </span>
                <span><b className="text-ink-50">{det.slots.length}</b> cards found</span>
              </div>
            </div>
            {det.template.note && !low && <p className="text-xs leading-relaxed text-ink-400">{det.template.note}</p>}
            {low && (
              <p className="rounded-lg bg-doubt/10 px-3 py-2 text-sm text-doubt ring-1 ring-doubt/30">
                This image doesn't line up with a known layout. Nudge the grid below until the white boxes sit on the cards,
                or enter scores by hand.
              </p>
            )}
            <details open={!!low} className="group rounded-lg bg-ink-950/50 px-3 py-2 ring-1 ring-ink-800">
              <summary className="cursor-pointer text-sm text-ink-300 select-none hover:text-white">Grid calibration</summary>
              <div className="mt-3 grid gap-3 text-sm">
                <label className="grid gap-1">
                  <span className="text-xs text-ink-400">Template</span>
                  <select className={field} value={cal.templateId} onChange={(e) => setCal({ ...cal, templateId: e.target.value })}>
                    {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                {([['Shift X', 'dx', -200, 200, 1], ['Shift Y', 'dy', -400, 400, 1], ['Scale', 'scale', 0.6, 1.4, 0.005]] as const).map(
                  ([name, k, min, max, step]) => (
                    <label key={k} className="grid gap-1">
                      <span className="flex justify-between text-xs text-ink-400">
                        {name} <span className="tabular-nums">{k === 'scale' ? cal.scale.toFixed(3) : `${cal[k]}px`}</span>
                      </span>
                      <input className={slider} type="range" min={min} max={max} step={step} value={cal[k]} onChange={(e) => setCal({ ...cal, [k]: +e.target.value })} />
                    </label>
                  ),
                )}
              </div>
            </details>
            <div className="mt-auto space-y-2">
              <Button variant="primary" size="lg" className="w-full" disabled={!!progress || !det.slots.length} onClick={run}>
                {progress ? `Reading cards… ${progress[0]}/${progress[1]}` : `Read ${det.slots.length} cards`}
              </Button>
              {progress && (
                <div className="h-1 overflow-hidden rounded bg-ink-800">
                  <div className="h-full bg-accent transition-all" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
                </div>
              )}
              <p className="text-[11px] text-ink-500">First run downloads the OCR engine (~4 MB) from a CDN.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
