import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Level } from '../lib/meta';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export const BASE = import.meta.env.BASE_URL;

export function Logo({ className }: { className?: string }) {
  return (
    <a href={BASE} className={cx('group inline-flex items-center gap-2.5', className)}>
      <span className="grid h-8 w-8 -skew-x-12 place-items-center bg-white text-ink-950 transition group-hover:bg-accent">
        <span className="skew-x-12 font-display text-lg font-bold leading-none">φ</span>
      </span>
      <span className="font-display text-xl font-semibold tracking-wide">PhiFarm</span>
    </a>
  );
}

const LEVEL_STYLE: Record<Level, string> = {
  EZ: 'bg-lv-ez text-ink-950',
  HD: 'bg-lv-hd text-white',
  IN: 'bg-lv-in text-white',
  AT: 'bg-lv-at text-ink-950',
  SP: 'bg-lv-sp text-white',
};

/** In-game style difficulty tag: slanted, coloured by level. */
export function LevelBadge({ level, c, className }: { level: Level; c?: number; className?: string }) {
  return (
    <span className={cx('inline-block shrink-0 -skew-x-12 px-1.5 py-px text-[11px] font-bold leading-4 whitespace-nowrap', LEVEL_STYLE[level], className)}>
      <span className="inline-block skew-x-12 tabular-nums">
        {level}
        {c !== undefined && ` ${c.toFixed(1)}`}
      </span>
    </span>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-white text-ink-950 hover:bg-accent font-semibold',
  secondary: 'bg-ink-800 text-ink-100 ring-1 ring-ink-700 hover:ring-accent/60 hover:text-white',
  ghost: 'text-ink-300 hover:text-white hover:bg-ink-800',
  danger: 'text-loss hover:bg-loss/10',
};

export function btn(variant: Variant = 'secondary', size: 'sm' | 'md' | 'lg' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-1.5 rounded-md transition disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none',
    size === 'sm' && 'px-2 py-1 text-xs',
    size === 'md' && 'px-3 py-1.5 text-sm',
    size === 'lg' && 'px-5 py-2.5 text-base',
    VARIANT[variant],
  );
}

export function Button({ variant, size, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return <button type="button" className={cx(btn(variant, size), className)} {...rest} />;
}

export const field =
  'rounded-md bg-ink-950 px-2 py-1 text-sm text-ink-100 ring-1 ring-ink-700 outline-none transition focus:ring-accent placeholder:text-ink-500';

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-xl bg-ink-900/80 ring-1 ring-ink-800 backdrop-blur', className)}>{children}</section>;
}

/** Number with a sign and fixed decimals, coloured by direction. */
export function Delta({ value, digits = 4, className }: { value: number; digits?: number; className?: string }) {
  const pos = value > 1e-12;
  return (
    <span className={cx('tabular-nums', pos ? 'text-gain' : value < -1e-12 ? 'text-loss' : 'text-ink-400', className)}>
      {pos ? '+' : value < -1e-12 ? '−' : '±'}
      {Math.abs(value).toFixed(digits)}
    </span>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className={cx('relative overflow-hidden rounded-lg px-4 py-3 ring-1', accent ? 'bg-white/[0.06] ring-white/15' : 'bg-ink-900 ring-ink-800')}>
      {accent && <div className="absolute inset-y-0 left-0 w-1 bg-accent" />}
      <div className="text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">{label}</div>
      <div className={cx('font-display font-semibold tabular-nums', accent ? 'text-3xl text-white' : 'text-xl text-ink-100')}>{value}</div>
      {sub && <div className="text-xs text-ink-400">{sub}</div>}
    </div>
  );
}
