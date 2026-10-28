import { useState } from 'react';
import type { Evaluator } from '../lib/farm';
import { chartKey, LEVELS, type Level, type Meta, type SongMeta } from '../lib/meta';
import { B_SLOTS, chartRks, goodsFromAcc, GOOD_COST } from '../lib/rks';
import { newId, type Rec } from '../state';
import { SongPicker } from './SongPicker';
import { Button, cx, field } from './ui';

interface Props {
  meta: Meta;
  songs: Map<string, SongMeta>;
  recs: Rec[];
  baseline: Map<string, number>; // rec id -> accuracy when imported
  ev: Evaluator;
  onChange: (recs: Rec[]) => void;
}

const fmtAcc = (a: number) => a.toFixed(4);

export function ScoreTable({ meta, songs, recs, baseline, ev, onChange }: Props) {
  const [draft, setDraft] = useState<{ songId: string; level: Level; acc: string }>({ songId: '', level: 'IN', acc: '100' });
  const levelsOf = (songId: string) => LEVELS.filter((l) => songs.get(songId)?.charts[l]);
  const rank = new Map(ev.base.best.map((p, i) => [p.key, i]));
  const phi = new Set(ev.base.phi.map((p) => p.key));

  const update = (id: string, patch: Partial<Rec>, confirms = true) =>
    onChange(recs.map((r) => {
      if (r.id !== id) return r;
      if (patch.songId) {
        const lv = levelsOf(patch.songId);
        if (!lv.includes(patch.level ?? r.level)) patch = { ...patch, level: lv[lv.length - 1] };
      }
      return { ...r, ...patch, doubt: confirms ? clearDoubt(r, patch) : r.doubt };
    }));

  const rows = recs
    .map((r) => {
      const chart = songs.get(r.songId)?.charts[r.level];
      const key = chartKey(r.songId, r.level);
      return { r, chart, key, rks: chart ? chartRks(r.acc, chart.c) : 0 };
    })
    .sort((a, b) => b.rks - a.rks);

  const addHypothetical = () => {
    const chart = songs.get(draft.songId)?.charts[draft.level];
    const acc = Number(draft.acc);
    if (!chart || !(acc >= 0 && acc <= 100)) return;
    onChange([...recs, { id: newId(), slot: '+', songId: draft.songId, level: draft.level, acc, doubt: {}, hypothetical: true }]);
  };

  const th = 'px-2 py-2.5 text-left text-[10px] font-medium tracking-[0.14em] text-ink-500 uppercase whitespace-nowrap';
  const doubtCell = 'bg-doubt/10 ring-1 ring-inset ring-doubt/60';

  return (
    <div className="overflow-x-auto rounded-xl bg-ink-900 ring-1 ring-ink-800">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-ink-800">
          <tr>
            <th className={th}></th>
            <th className={th}>Slot</th>
            <th className={th}>Song</th>
            <th className={th}>Lv</th>
            <th className={cx(th, 'text-right')}>Accuracy</th>
            <th className={cx(th, 'text-right')} title="Good-equivalents below AP: (100 − acc) × N / 35">Goods</th>
            <th className={cx(th, 'text-right')}>RKS</th>
            <th className={th}>Counts</th>
            <th className={th}>What-if</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800/70">
          {rows.map(({ r, chart, key, rks }) => {
            const i = rank.get(key);
            const counted = ev.current(key)?.acc === r.acc;
            const base = baseline.get(r.id);
            const changed = base !== undefined && Math.abs(base - r.acc) > 1e-9;
            const goods = chart ? goodsFromAcc(r.acc, chart.n) : 0;
            return (
              <tr key={r.id} className={cx('transition hover:bg-white/[0.02]', r.hypothetical && 'bg-lv-sp/[0.06]', changed && 'bg-accent/[0.05]')}>
                <td className="py-1.5 pr-1 pl-2">
                  {r.thumb ? (
                    <img className="h-9 w-24 rounded object-cover" src={r.thumb} alt="" />
                  ) : (
                    <Placeholder name={songs.get(r.songId)?.name ?? '?'} level={r.level} />
                  )}
                </td>
                <td className="px-2 text-xs text-ink-500 tabular-nums">{r.hypothetical ? <span className="text-lv-sp">what-if</span> : r.slot}</td>
                <td className={cx('px-2', r.doubt.song && doubtCell)} title={r.doubt.song}>
                  <SongPicker className={cx(field, 'w-full min-w-52 bg-transparent ring-transparent hover:ring-ink-700')} meta={meta} value={r.songId} onChange={(songId) => update(r.id, { songId })} />
                </td>
                <td className={cx('px-2', r.doubt.level && doubtCell)} title={r.doubt.level}>
                  <div className="flex items-center gap-1.5">
                    <select className={cx(field, 'bg-transparent py-0.5 ring-transparent hover:ring-ink-700')} value={r.level} onChange={(e) => update(r.id, { level: e.target.value as Level })}>
                      {levelsOf(r.songId).map((l) => <option key={l}>{l}</option>)}
                      {!chart && <option>{r.level}</option>}
                    </select>
                    {chart && <span className="text-xs text-ink-400 tabular-nums">{chart.c.toFixed(1)}</span>}
                  </div>
                </td>
                <td className={cx('px-2 text-right', r.doubt.acc && doubtCell)} title={r.doubt.acc}>
                  <input
                    className={cx(field, 'w-24 bg-transparent text-right tabular-nums ring-transparent hover:ring-ink-700', changed && 'text-accent')}
                    type="number"
                    step="0.0001"
                    min={0}
                    max={100}
                    value={r.acc}
                    onChange={(e) => update(r.id, { acc: Math.min(100, Math.max(0, Number(e.target.value))) })}
                  />
                  {changed && <div className="text-[10px] text-ink-500 tabular-nums">was {fmtAcc(base!)}</div>}
                </td>
                <td className="px-2 text-right text-ink-300 tabular-nums">
                  {r.acc >= 100 ? <span className="font-semibold text-phi">AP</span> : goods.toFixed(goods % 1 < 0.01 ? 0 : 1)}
                </td>
                <td className="px-2 text-right font-medium tabular-nums">{rks.toFixed(4)}</td>
                <td className="px-2 whitespace-nowrap">
                  {counted && phi.has(key) && <Tag className="bg-phi/15 text-phi">Phi</Tag>}
                  {counted && i !== undefined && i < B_SLOTS && <Tag className="bg-accent/15 text-accent">B{i + 1}</Tag>}
                  {counted && i !== undefined && i >= B_SLOTS && <Tag className="bg-ink-800 text-ink-400">#{i + 1}</Tag>}
                  {!counted && <Tag className="text-ink-500">dup</Tag>}
                </td>
                <td className="px-2 whitespace-nowrap">
                  {chart && (
                    <span className="inline-flex overflow-hidden rounded-md ring-1 ring-ink-700">
                      <button
                        className="px-2 py-1 text-xs text-ink-300 hover:bg-loss/15 hover:text-loss disabled:opacity-30"
                        title="One more Good"
                        disabled={r.acc <= 70}
                        onClick={() => update(r.id, { acc: Math.max(0, r.acc - GOOD_COST / chart.n) }, false)}
                      >+1 G</button>
                      <button
                        className="border-l border-ink-700 px-2 py-1 text-xs text-ink-300 hover:bg-gain/15 hover:text-gain disabled:opacity-30"
                        title="One fewer Good"
                        disabled={r.acc >= 100}
                        onClick={() => update(r.id, { acc: Math.min(100, r.acc + GOOD_COST / chart.n) }, false)}
                      >−1 G</button>
                    </span>
                  )}
                  {changed && <button className="ml-2 text-xs text-accent hover:underline" onClick={() => update(r.id, { acc: base! }, false)}>reset</button>}
                </td>
                <td className="pr-2">
                  <button className="rounded p-1 text-ink-500 hover:bg-loss/10 hover:text-loss" title="Remove" onClick={() => onChange(recs.filter((x) => x.id !== r.id))}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-ink-800 bg-ink-950/40">
          <tr>
            <td className="py-2 pl-2 text-[10px] tracking-[0.14em] text-ink-500 uppercase" colSpan={2}>Add score</td>
            <td className="px-2 py-2">
              <SongPicker
                className={cx(field, 'w-full min-w-52')}
                meta={meta}
                value={draft.songId}
                onChange={(songId) => {
                  const lv = levelsOf(songId);
                  setDraft({ ...draft, songId, level: lv.includes(draft.level) ? draft.level : lv[lv.length - 1] });
                }}
              />
            </td>
            <td className="px-2">
              <select className={field} value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value as Level })}>
                {(draft.songId ? levelsOf(draft.songId) : LEVELS).map((l) => <option key={l}>{l}</option>)}
              </select>
            </td>
            <td className="px-2 text-right">
              <input className={cx(field, 'w-24 text-right tabular-nums')} type="number" step="0.0001" value={draft.acc} onChange={(e) => setDraft({ ...draft, acc: e.target.value })} />
            </td>
            <td className="px-2" colSpan={5}>
              <Button size="sm" variant="primary" onClick={addHypothetical} disabled={!songs.get(draft.songId)?.charts[draft.level]}>
                Add as what-if
              </Button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Stand-in for rows that never came from an image (hand-added, imported, what-if). */
function Placeholder({ name, level }: { name: string; level: Level }) {
  return (
    <div className="relative flex h-9 w-24 items-center overflow-hidden rounded bg-ink-800/70 pl-2" title="No image for this score">
      <span className={cx('absolute inset-y-0 right-0 w-8 -skew-x-12 translate-x-2 opacity-70', LEVEL_BG[level])} />
      <span className="relative font-display text-lg font-semibold text-ink-300">{[...name][0]}</span>
    </div>
  );
}

const LEVEL_BG: Record<Level, string> = { EZ: 'bg-lv-ez', HD: 'bg-lv-hd', IN: 'bg-lv-in', AT: 'bg-lv-at', SP: 'bg-lv-sp' };

function Tag({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cx('mr-1 inline-block rounded px-1.5 py-px text-[11px] font-semibold tabular-nums', className)}>{children}</span>;
}

/** Editing a field is the user's confirmation of it. */
function clearDoubt(r: Rec, patch: Partial<Rec>): Rec['doubt'] {
  const d = { ...r.doubt };
  if ('songId' in patch) delete d.song;
  if ('level' in patch || 'songId' in patch) delete d.level;
  if ('acc' in patch) delete d.acc;
  return d;
}
