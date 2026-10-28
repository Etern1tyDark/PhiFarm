import type { ReactNode } from 'react';
import { BASE, btn, cx, Delta, LevelBadge, Logo } from '../components/ui';
import type { Level } from '../lib/meta';

const APP = `${BASE}app`;

/** Illustrative plan, shaped exactly like the app's goal panel. */
const EXAMPLE: Array<{ song: string; level: Level; c: number; from: string; to: string; cut: number; gain: number }> = [
  { song: 'BANGING STRIKE', level: 'AT', c: 16.8, from: '99.96%', to: 'AP', cut: 2, gain: 0.0144 },
  { song: "Rrhar'il", level: 'AT', c: 17.6, from: '98.20%', to: '98.95%', cut: 28, gain: 0.0184 },
  { song: 'Igallta', level: 'AT', c: 17.4, from: '98.65%', to: '98.96%', cut: 10, gain: 0.0079 },
  { song: 'Entrance to the Chaos', level: 'AT', c: 17.6, from: '98.66%', to: '98.97%', cut: 11, gain: 0.0078 },
];

function PlanPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" />
      <div className="rounded-2xl bg-ink-900/90 p-5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-[0.16em] text-ink-500 uppercase">Goal</div>
            <div className="font-display text-3xl font-semibold tabular-nums">
              16.54 <span className="text-ink-500">→</span> <span className="text-accent">16.60</span>
            </div>
          </div>
          <span className="-skew-x-12 bg-gain/15 px-2 py-1 text-xs font-semibold text-gain">
            <span className="inline-block skew-x-12">4 charts</span>
          </span>
        </div>
        <ol className="mt-4 divide-y divide-ink-800">
          {EXAMPLE.map((s) => (
            <li key={s.song} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.song}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-400">
                  <LevelBadge level={s.level} c={s.c} />
                  <span>
                    {s.from} → <span className="text-ink-100">{s.to}</span> · cut {s.cut} Goods
                  </span>
                </div>
              </div>
              <Delta value={s.gain} className="text-sm font-semibold" />
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-lg bg-ink-950/60 px-3 py-2 text-xs text-ink-400 ring-1 ring-ink-800">
          Example plan. Yours is built from your own scores.
        </div>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, children, className }: { id?: string; eyebrow: string; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cx('mx-auto max-w-6xl px-4 py-20', className)}>
      <div className="mb-10 max-w-2xl">
        <div className="mb-2 text-xs font-semibold tracking-[0.2em] text-accent uppercase">{eyebrow}</div>
        <h2 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="relative rounded-xl bg-ink-900/70 p-6 ring-1 ring-ink-800">
      <span className="mb-4 inline-grid h-10 w-10 -skew-x-12 place-items-center bg-white font-display text-lg font-bold text-ink-950">
        <span className="skew-x-12">{n}</span>
      </span>
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-400">{children}</p>
    </div>
  );
}

function Feature({ title, tag, children }: { title: string; tag: string; children: ReactNode }) {
  return (
    <div className="group rounded-xl bg-ink-900/70 p-6 ring-1 ring-ink-800 transition hover:ring-ink-600">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-ink-500 uppercase group-hover:text-accent">{tag}</div>
      <h3 className="mt-1 font-display text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-400">{children}</p>
    </div>
  );
}

function Formula({ label, children, note }: { label: string; children: ReactNode; note: ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-900/70 p-6 ring-1 ring-ink-800">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-ink-500 uppercase">{label}</div>
      <div className="mt-3 overflow-x-auto font-mono text-sm whitespace-nowrap text-ink-50">{children}</div>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">{note}</p>
    </div>
  );
}

export default function Landing() {
  return (
    // overflow-x-clip: decorative glows bleed past the edge on phones; clip keeps the sticky header working.
    <div className="min-h-screen overflow-x-clip bg-stage">
      <header className="sticky top-0 z-20 border-b border-ink-800/60 bg-ink-950/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <a className="hidden px-3 py-1.5 text-ink-300 hover:text-white sm:block" href="#how">How it works</a>
            <a className="hidden px-3 py-1.5 text-ink-300 hover:text-white sm:block" href="#math">The math</a>
            <a className={btn('primary')} href={APP}>Open app</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <div className="mb-5 inline-flex -skew-x-12 items-center gap-2 bg-white/5 px-3 py-1 text-xs text-ink-300 ring-1 ring-white/10">
            <span className="skew-x-12">Phigros RKS optimizer · free · runs in your browser</span>
          </div>
          <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            Know exactly which <span className="text-accent">Goods</span> to cut.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Drop your B30 image. PhiFarm reads every card, then tells you the cheapest way to your next RKS goal:
            which scores to clean up, which charts to farm, and which APs actually move your number.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className={btn('primary', 'lg')} href={APP}>Read my B30 →</a>
            <a className={btn('secondary', 'lg')} href="#how">How it works</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-400">
            <span>✓ phibot.dev &amp; PSL bot images</span>
            <span>✓ Nothing uploaded</span>
            <span>✓ Checks its own readings</span>
          </div>
        </div>
        <PlanPreview />
      </section>

      {/* Proof strip */}
      <div className="border-y border-ink-800/80 bg-ink-950/50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center md:grid-cols-4">
          {[
            ['1,045', 'charts with constants'],
            ['330', 'songs matched by jacket'],
            ['102 / 102', 'cards read on 3 real B30 images'],
            ['3 / 3', 'reproduce the RKS printed on them'],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="font-display text-2xl font-semibold tabular-nums sm:text-3xl">{v}</div>
              <div className="mt-1 text-xs text-ink-400">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <Section id="how" eyebrow="How it works" title="From screenshot to plan in under a minute">
        <div className="grid gap-4 md:grid-cols-3">
          <Step n={1} title="Drop your B30">
            Paste or drop the image your bot gives you. PhiFarm detects the layout, finds every card, and matches each jacket
            against all 330 songs.
          </Step>
          <Step n={2} title="Check the numbers">
            Accuracy, difficulty and per-chart RKS are read separately and checked against each other. Anything that doesn't
            add up is highlighted, usually nothing.
          </Step>
          <Step n={3} title="Set a goal">
            Pick a target like 16.60 or 16.75. You get a plan of the cheapest improvements to get there, and can try any of
            them in the what-if simulator.
          </Step>
        </div>
      </Section>

      <Section eyebrow="What you get" title="Four ways to find RKS" className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <Feature tag="Goal planner" title="Reach any RKS">
            Set 16.00, 17.00 or just the next 0.01. The planner picks improvements by RKS per unit of effort, where effort is
            how much of your error you'd have to remove, so a 2-Good AP beats a 50-Good overhaul.
          </Feature>
          <Feature tag="Dirty cleanup" title="Scores worth a few Goods">
            Your existing scores ranked by RKS gained per Good removed. Often the fastest win is a chart you already nearly
            own.
          </Feature>
          <Feature tag="Phi3 sniper" title="APs that count">
            Only your three best APs count (sadly. You should definitely still grind for phis!). This lists the ones above 
            your Phi floor.
          </Feature>
          <Feature tag="Unplayed" title="Free RKS you're missing">
            Charts above your B27 floor that you have no score on, ranked by farmability: high note counts, low peak density,
            and lots of drags and flicks.
          </Feature>
        </div>
      </Section>

      <Section id="math" eyebrow="The math" title="Nothing hand-wavy" className="pt-0">
        <div className="grid gap-4 lg:grid-cols-3">
          <Formula label="Your RKS" note="Your best 27 chart RKS, plus the constants of your 3 best APs, divided by 30.">
            (Σ best27 + Σ phi3) / 30
          </Formula>
          <Formula label="One chart" note={<>Below 70% a chart is worth nothing; an AP is worth exactly its constant C.</>}>
            ((acc − 55) / 45)² × C
          </Formula>
          <Formula label="One Good" note={<>A Good scores 65% of a Perfect, so on an N-note chart each Good costs 35/N accuracy points.</>}>
            acc = 100 − 35 × goods / N
          </Formula>
        </div>
      </Section>

      <Section eyebrow="Privacy & data" title="Your image never leaves your device" className="pt-0">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-ink-900/70 p-6 text-sm leading-relaxed text-ink-400 ring-1 ring-ink-800">
            OCR and matching run in your browser with Tesseract and a 250 KB chart database. There are no accounts and no
            server. Your scores stay in your browser, and you can export them as a file.
          </div>
          <div className="rounded-xl bg-ink-900/70 p-6 text-sm leading-relaxed text-ink-400 ring-1 ring-ink-800">
            Constants, note counts and aliases come from{' '}
            <a className="text-ink-200 underline decoration-ink-600 hover:decoration-accent" href="https://phibot.dev" target="_blank" rel="noreferrer">phibot.dev</a>;
            note breakdowns and jacket fingerprints from the open{' '}
            <a className="text-ink-200 underline decoration-ink-600 hover:decoration-accent" href="https://github.com/7aGiven/Phigros_Resource" target="_blank" rel="noreferrer">Phigros_Resource</a>{' '}
            mirror. PhiFarm is a fan project, not affiliated with Pigeon Games.
          </div>
        </div>
      </Section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="relative overflow-hidden rounded-2xl bg-white px-8 py-12 text-ink-950 sm:px-12">
          <div className="absolute inset-y-0 -right-10 w-1/2 -skew-x-12 bg-accent/40" />
          <div className="relative">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Your next 0.01 might be a couple of Goods away.</h2>
            <a className="mt-6 inline-flex items-center rounded-md bg-ink-950 px-5 py-2.5 font-semibold text-white transition hover:bg-ink-800" href={APP}>
              Find it →
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-800 py-8 text-center text-xs text-ink-500">
        PhiFarm · a tool by <a className="text-ink-200 underline decoration-ink-600 hover:decoration-accent" href="https://github.com/Etern1tyDark" target="_blank" rel="noreferrer">eter</a>.
      </footer>
    </div>
  );
}
