import { useEffect, useState } from 'react';
import type { PathStep, Plan, PlanStep } from '../lib/farm';
import type { ChartRef } from '../lib/meta';
import { displayRks } from '../lib/rks';
import { Button, cx, Delta, field, LevelBadge, Panel } from './ui';

interface Props {
  total: number;
  /** Displayed RKS the player wants (2 decimals), or null for "next 0.01". */
  goal: number | null;
  /** Raw total that shows as the goal. */
  target: number;
  plan: Plan | null; // null while computing
  single: PathStep[];
  onGoal: (goal: number | null) => void;
  onTry: (ref: ChartRef, acc: number) => void;
  onApplyPlan: () => void;
}

const accText = (acc: number) => (acc >= 100 ? 'AP' : `${acc.toFixed(2)}%`);

function StepRow({ s, onTry }: { s: PlanStep; onTry: Props['onTry'] }) {
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <button className="block max-w-full truncate text-left font-medium text-ink-50 hover:text-accent" onClick={() => onTry(s.ref, s.toAcc)} title="Apply this step in What-if">
          {s.ref.song.name}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
          <LevelBadge level={s.ref.level} c={s.ref.chart.c} />
          {s.fromAcc === undefined ? (
            <span>
              new chart → <span className="text-ink-100">{accText(s.toAcc)}</span>
              {s.goods > 0 && ` (≤ ${s.goods} Goods)`}
            </span>
          ) : (
            <span>
              {s.fromAcc.toFixed(2)}% → <span className="text-ink-100">{accText(s.toAcc)}</span>
              <span className="text-ink-500"> · cut {s.goodsCut} Good{s.goodsCut === 1 ? '' : 's'}</span>
            </span>
          )}
        </div>
      </div>
      <Delta value={s.gain} className="pt-0.5 text-sm font-semibold" />
    </li>
  );
}

/** Goal input + the plan to reach it. */
export function GoalPanel({ total, goal, target, plan, single, onGoal, onTry, onApplyPlan }: Props) {
  const label = (goal ?? Number(displayRks(target))).toFixed(2);
  const [text, setText] = useState(label);
  const [showSingle, setShowSingle] = useState(false);
  useEffect(() => setText(label), [label]);

  const shown = Number(displayRks(total));
  const round2 = (x: number) => Math.round(x * 100) / 100;
  // Round milestones above where you are: the next .x0/.x5, then the next two quarters.
  const up = (step: number, above: number) => round2(Math.ceil((above + 1e-9) / step) * step);
  const milestones = [...new Set([up(0.05, shown + 0.01), up(0.25, shown + 0.06), up(0.25, shown + 0.31)])];
  const presets: Array<[string, number | null]> = [
    ['Next 0.01', null],
    ...milestones.map((v): [string, number] => [v.toFixed(2), v]),
  ];
  const commit = () => {
    const v = round2(Number(text));
    if (!Number.isFinite(v) || v <= shown) return setText(label);
    onGoal(v);
  };
  const need = target - total;

  return (
    <Panel className="p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Goal</h2>
        <span className="text-xs text-ink-400">
          needs <Delta value={need} className="font-medium" />
        </span>
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          className={cx(field, 'w-full font-display text-lg tabular-nums')}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          aria-label="Goal RKS"
        />
        <Button type="submit" variant="primary">Plan</Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map(([label, v]) => {
          const active = v === null ? goal === null : goal !== null && Math.abs(goal - v) < 1e-9;
          return (
            <button
              key={label}
              onClick={() => onGoal(v)}
              className={cx(
                '-skew-x-12 px-2 py-0.5 text-xs transition',
                active ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-white',
              )}
            >
              <span className="inline-block skew-x-12">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-ink-800 pt-3">
        {!plan ? (
          <p className="animate-pulse py-6 text-center text-sm text-ink-400">Planning…</p>
        ) : plan.steps.length === 0 ? (
          <p className="py-4 text-sm text-ink-400">No realistic improvement raises your RKS. Add more scores first.</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-ink-400">
              <span>
                {plan.steps.length} chart{plan.steps.length === 1 ? '' : 's'} → <span className="text-ink-100 tabular-nums">{plan.end.toFixed(4)}</span>{' '}
                (shows {displayRks(plan.end)})
              </span>
            </div>
            {!plan.reached && (
              <p className="mt-2 rounded-lg bg-doubt/10 px-3 py-2 text-xs leading-relaxed text-doubt ring-1 ring-doubt/30">
                Not reachable at your current level: this plan already takes every chart to about your best demonstrated
                accuracy and gets to {plan.end.toFixed(4)}. Higher needs you to play above your current best, or new APs.
              </p>
            )}
            <ol className="divide-y divide-ink-800/70">
              {plan.steps.map((s) => <StepRow key={s.ref.key} s={s} onTry={onTry} />)}
            </ol>
            <Button className="mt-2 w-full" onClick={onApplyPlan}>Apply whole plan in What-if</Button>
          </>
        )}
      </div>

      {single.length > 0 && (
        <div className="mt-4 border-t border-ink-800 pt-3">
          <button className="flex w-full items-center justify-between text-sm text-ink-300 hover:text-white" onClick={() => setShowSingle(!showSingle)}>
            <span>One-chart options ({single.length})</span>
            <span className={cx('transition', showSingle && 'rotate-90')}>›</span>
          </button>
          {showSingle && (
            <ul className="mt-2 space-y-2 text-sm">
              {single.map((s) => (
                <li key={s.ref.key} className="flex items-center justify-between gap-2">
                  <button className="min-w-0 truncate text-left hover:text-accent" onClick={() => onTry(s.ref, s.acc)}>
                    {s.ref.song.name} <LevelBadge level={s.ref.level} c={s.ref.chart.c} className="ml-1" />
                  </button>
                  <span className="shrink-0 text-xs text-ink-400">
                    {s.currentAcc !== undefined ? `cut ${s.goodsCut} → ` : 'new → '}
                    {accText(s.acc)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-snug text-ink-500">
        Shows as {label} at raw ≥ {target.toFixed(4)} (the game rounds to 2 decimals). Effort counts how much of your
        error you'd remove. Charts you've played are capped near your best scores at that difficulty; new charts at your
        typical accuracy for their level, which drops quickly above the charts you usually play. APs are only suggested
        within 5 Goods, or within 15 on charts no harder than your hardest AP.
      </p>
    </Panel>
  );
}
