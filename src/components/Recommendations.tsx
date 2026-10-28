import { useState, type ReactNode } from 'react';
import type { CleanupRec, Farmability, Recommendation } from '../lib/farm';
import type { ChartRef } from '../lib/meta';
import { Button, Delta, LevelBadge } from './ui';

const PAGE = 24;

function ChartTitle({ refx }: { refx: ChartRef }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-ink-50" title={refx.song.name}>{refx.song.name}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-400">
        <LevelBadge level={refx.level} c={refx.chart.c} />
        <span className="truncate">{refx.song.composer}</span>
      </div>
    </div>
  );
}

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div title={hint}>
      <div className="flex justify-between text-[10px] tracking-wider text-ink-500 uppercase">
        <span>{label}</span>
        <span className="text-ink-300 tabular-nums">{Math.round(value * 100)}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded bg-ink-800">
        <div className="h-full rounded bg-accent/80" style={{ width: `${Math.max(3, value * 100)}%` }} />
      </div>
    </div>
  );
}

function ChartFacts({ refx, f }: { refx: ChartRef; f?: Farmability }) {
  const { chart } = refx;
  return (
    <div className="space-y-2">
      {f && f.f !== null ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Meter
            label="Farmability"
            value={f.f}
            hint={'Estimate from the chart file only, not player data. Percentile ranks: 45% share of Drag + Flick notes (they can never be Good), 35% ln(notes) ÷ peak notes per second' + (f.communityTerm !== null ? ', 20% community data.' : '. Ignores reading and patterns.')}
          />
          {f.apEase !== null && (
            <Meter
              label="AP ease"
              value={f.apEase}
              hint="Estimate from the chart file only, not player data. Among charts of constant 13+: 40% low peak notes per second, 30% fewer notes, 30% Drag + Flick share. Ignores reading and patterns."
            />
          )}
        </div>
      ) : (
        <div className="text-[11px] text-ink-500">No note breakdown for this chart yet.</div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-400 tabular-nums">
        <span>{chart.n} notes</span>
        {chart.nps !== undefined && <span>peak {chart.nps}/s</span>}
        {chart.drag !== undefined && (
          <span title="Tap / Drag / Hold / Flick. Drags and Flicks can never be Good.">
            T{chart.tap} D{chart.drag} H{chart.hold} F{chart.flick}
          </span>
        )}
      </div>
    </div>
  );
}

function Card({ rank, r, f, children, gain, gainLabel, onTry }: {
  rank: number;
  r: Recommendation;
  f?: Farmability;
  children: ReactNode;
  gain: number;
  gainLabel: string;
  onTry: () => void;
}) {
  return (
    <li className="group relative flex flex-col gap-3 overflow-hidden rounded-xl bg-ink-900 p-4 ring-1 ring-ink-800 transition hover:ring-ink-600">
      <span className="pointer-events-none absolute -top-3 right-2 font-display text-6xl font-bold text-white/[0.04] tabular-nums">{rank}</span>
      <div className="flex items-start justify-between gap-3">
        <ChartTitle refx={r.ref} />
        <div className="shrink-0 text-right">
          <Delta value={gain} className="font-display text-xl font-semibold" />
          <div className="text-[10px] tracking-wider text-ink-500 uppercase">{gainLabel}</div>
        </div>
      </div>
      <div className="text-sm leading-relaxed text-ink-300">{children}</div>
      <ChartFacts refx={r.ref} f={f} />
      <Button size="sm" className="mt-auto self-start" onClick={onTry}>Try in What-if →</Button>
    </li>
  );
}

function Grid<T extends Recommendation>({ items, empty, card }: { items: T[]; empty: string; card: (r: T, i: number) => ReactNode }) {
  const [shown, setShown] = useState(PAGE);
  if (!items.length) return <p className="rounded-xl bg-ink-900 p-8 text-center text-ink-400 ring-1 ring-ink-800">{empty}</p>;
  return (
    <>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.slice(0, shown).map(card)}</ol>
      {shown < items.length && (
        <div className="mt-4 text-center">
          <Button onClick={() => setShown(shown + PAGE)}>Show more ({items.length - shown} left)</Button>
        </div>
      )}
    </>
  );
}

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-ink-50">{children}</b>;
const goodsText = (g: number) => (g === 0 ? 'an AP' : `≤ ${g} Good${g === 1 ? '' : 's'}`);

interface ListProps<T> {
  items: T[];
  farm: Map<string, Farmability>;
  onTry: (r: T) => void;
}

export function UnplayedList({ items, farm, onTry }: ListProps<Recommendation>) {
  return (
    <Grid
      items={items}
      empty="Nothing above your B27 floor is missing. Check Dirty cleanup instead."
      card={(r, i) => (
        <Card key={r.ref.key} rank={i + 1} r={r} f={farm.get(r.ref.key)} gain={r.apGain} gainLabel="if AP" onTry={() => onTry(r)}>
          <B>{goodsText(r.goods)}</B> ({r.acc.toFixed(2)}%) already beats your floor: {r.rks.toFixed(3)} RKS, {r.slot}{' '}
          (<Delta value={r.gain} />).
        </Card>
      )}
    />
  );
}

export function CleanupList({ items, farm, onTry }: ListProps<CleanupRec>) {
  return (
    <Grid
      items={items}
      empty="No existing score gains RKS from cutting a few Goods."
      card={(r, i) => (
        <Card key={r.ref.key} rank={i + 1} r={r} f={farm.get(r.ref.key)} gain={r.gain} gainLabel={`cut ${r.goodsCut}`} onTry={() => onTry(r)}>
          {r.currentAcc.toFixed(4)}% → <B>{r.acc >= 100 ? 'AP' : `${r.acc.toFixed(4)}%`}</B> by cutting{' '}
          <B>{r.goodsCut} Good{r.goodsCut === 1 ? '' : 's'}</B>. <Delta value={r.gainPerGood} /> per Good, {r.slot}.
          {r.note && <div className="mt-1 text-xs text-doubt">{r.note}</div>}
        </Card>
      )}
    />
  );
}

export function PhiList({ items, farm, onTry }: ListProps<Recommendation>) {
  return (
    <Grid
      items={items}
      empty="No AP would raise your RKS: your Phi3 already holds the top constants."
      card={(r, i) => (
        <Card key={r.ref.key} rank={i + 1} r={r} f={farm.get(r.ref.key)} gain={r.apGain} gainLabel="AP" onTry={() => onTry(r)}>
          AP {r.slot}. {r.note && <span className="text-ink-400">{r.note[0].toUpperCase() + r.note.slice(1)}.</span>}
        </Card>
      )}
    />
  );
}
