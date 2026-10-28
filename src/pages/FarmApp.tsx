import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { GoalPanel } from '../components/GoalPanel';
import { ImportPanel } from '../components/ImportPanel';
import { CleanupList, PhiList, UnplayedList } from '../components/Recommendations';
import { ScoreTable } from '../components/ScoreTable';
import { BASE, btn, Button, cx, Delta, Logo, Panel, Stat } from '../components/ui';
import { computeFarmability, dirtyCleanup, Evaluator, nextStepPaths, phiSniper, planGoal, unplayed } from '../lib/farm';
import type { ChartRef, Community, Meta } from '../lib/meta';
import { B_SLOTS, computeRks, displayRks, nextDisplayThreshold } from '../lib/rks';
import type { ScannedRecord } from '../lib/scan';
import {
  download, exportJson, importJson, load, newId, parseCommunity, save, songIndex, toPlays, type Rec,
} from '../state';

type Tab = 'scores' | 'unplayed' | 'cleanup' | 'phi' | 'data';
const TABS: Array<[Tab, string, string]> = [
  ['scores', 'My B30', 'Verify OCR, simulate Goods'],
  ['unplayed', 'Unplayed', 'Charts above your floor you have no score on'],
  ['cleanup', 'Cleanup', 'Existing scores worth a few Goods'],
  ['phi', 'Phi3', 'APs that enter your top 3'],
  ['data', 'Data', 'Export, import, community priors'],
];

export default function FarmApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [recs, setRecs] = useState<Rec[]>(() => {
    // Thumbnails live in their own key so a full storage quota only costs pictures, not scores.
    const thumbs = load<Record<string, string>>('phifarm.thumbs', {});
    return load<Rec[]>('phifarm.recs', []).map((r) => (thumbs[r.id] ? { ...r, thumb: thumbs[r.id] } : r));
  });
  const [baseline, setBaseline] = useState<Record<string, number>>(() => load('phifarm.baseline', {}));
  const [community, setCommunity] = useState<Record<string, Community>>(() => load('phifarm.community', {}));
  const [goal, setGoal] = useState<number | null>(() => load('phifarm.goal', null));
  const [tab, setTab] = useState<Tab>('scores');
  const [scanOpen, setScanOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}phigros_meta.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setMeta)
      .catch((e) => setMetaError(String(e)));
  }, []);
  useEffect(() => save('phifarm.recs', recs.map((r) => ({ ...r, thumb: undefined }))), [recs]);
  const thumbKey = recs.map((r) => (r.thumb ? r.id : '')).join();
  useEffect(() => {
    save('phifarm.thumbs', Object.fromEntries(recs.filter((r) => r.thumb).map((r) => [r.id, r.thumb!])));
    // Only re-save when the set of thumbnails changes, not on every accuracy edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbKey]);
  useEffect(() => save('phifarm.baseline', baseline), [baseline]);
  useEffect(() => save('phifarm.community', community), [community]);
  useEffect(() => save('phifarm.goal', goal), [goal]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  const songs = useMemo(() => (meta ? songIndex(meta) : new Map()), [meta]);
  const plays = useMemo(() => toPlays(recs, songs), [recs, songs]);
  const ev = useMemo(() => new Evaluator(plays), [plays]);
  const baseTotal = useMemo(() => {
    const base = recs
      .filter((r) => !r.hypothetical && baseline[r.id] !== undefined)
      .map((r) => ({ ...r, acc: baseline[r.id] }));
    return computeRks(toPlays(base, songs)).total;
  }, [recs, baseline, songs]);
  const farm = useMemo(() => (meta ? computeFarmability(meta, community) : new Map()), [meta, community]);
  const lists = useMemo(() => {
    if (!meta) return null;
    return { unplayed: unplayed(ev, meta, farm), cleanup: dirtyCleanup(ev, meta, community), phi: phiSniper(ev, meta, farm) };
  }, [ev, meta, farm, community]);

  // A goal of 16.60 means "shows as 16.60"; the game rounds, so 16.595 is enough.
  const activeGoal = goal !== null && goal > Number(displayRks(ev.total)) ? goal : null;
  const target = activeGoal === null ? nextDisplayThreshold(ev.total) : activeGoal - 0.005;
  // The planner can take a few hundred ms on far goals; let typing and steppers stay responsive.
  const deferredPlays = useDeferredValue(plays);
  const deferredTarget = useDeferredValue(target);
  const plan = useMemo(
    () => (meta && deferredPlays.length ? planGoal(deferredPlays, meta, deferredTarget) : null),
    [meta, deferredPlays, deferredTarget],
  );
  const stale = deferredPlays !== plays || deferredTarget !== target;
  const single = useMemo(() => (meta ? nextStepPaths(ev, meta, 8, target).steps : []), [ev, meta, target]);

  if (metaError) {
    return <Centered><p className="text-loss">Could not load chart data: {metaError}</p></Centered>;
  }
  if (!meta || !lists) {
    return <Centered><p className="animate-pulse text-ink-400">Loading chart data…</p></Centered>;
  }

  const setNewBaseline = (rs: Rec[]) => setBaseline(Object.fromEntries(rs.filter((r) => !r.hypothetical).map((r) => [r.id, r.acc])));

  function onScanned(scanned: ScannedRecord[]) {
    const rs: Rec[] = scanned.map((s) => ({ id: newId(), slot: s.slot, songId: s.songId, level: s.level, acc: s.acc, doubt: s.doubt, thumb: s.thumb }));
    setRecs(rs);
    setNewBaseline(rs);
    setScanOpen(false);
    window.scrollTo({ top: 0 });
    const doubts = rs.filter((r) => Object.keys(r.doubt).length).length;
    setMsg(`Read ${rs.length} cards. ${doubts ? `${doubts} need a look (yellow cells).` : 'Every card cross-checked cleanly.'}`);
    setTab('scores');
  }

  /** Apply scores as what-if, never lowering an existing one. */
  function applyScores(changes: Array<{ ref: ChartRef; acc: number }>) {
    let next = recs;
    for (const { ref, acc } of changes) {
      const existing = next.find((r) => r.songId === ref.song.id && r.level === ref.level);
      next = existing
        ? next.map((r) => (r === existing ? { ...r, acc: Math.max(r.acc, acc) } : r))
        : [...next, { id: newId(), slot: '+', songId: ref.song.id, level: ref.level, acc, doubt: {}, hypothetical: true }];
    }
    setRecs(next);
    setTab('scores');
  }
  const tryScore = (ref: ChartRef, acc: number) => applyScores([{ ref, acc }]);

  const delta = ev.total - baseTotal;
  const doubtCount = recs.filter((r) => Object.keys(r.doubt).length).length;
  const counts: Partial<Record<Tab, number>> = { unplayed: lists.unplayed.length, cleanup: lists.cleanup.length, phi: lists.phi.length };
  const empty = recs.length === 0;

  return (
    <div className="min-h-screen bg-stage">
      <header className="sticky top-0 z-20 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          {!empty && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-ink-400 sm:inline">RKS</span>
              <span className="font-display text-lg font-semibold tabular-nums">{ev.total.toFixed(4)}</span>
              {Math.abs(delta) > 1e-9 && <Delta value={delta} className="text-xs" />}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-16">
        {msg && (
          <div className="fixed right-4 bottom-4 z-30 max-w-sm rounded-lg bg-ink-800 px-4 py-3 text-sm shadow-2xl ring-1 ring-ink-700" role="status">
            {msg}
            <button className="ml-3 text-ink-400 hover:text-white" onClick={() => setMsg(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {empty ? (
          <div className="mx-auto max-w-3xl py-8">
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">Read your B30</h1>
            <p className="mt-2 text-ink-400">
              Drop a phibot.dev or PSL bot image. PhiFarm finds every card, reads it, and checks each number against the others.
            </p>
            <div className="mt-6">
              <ImportPanel meta={meta} onScanned={onScanned} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-400">
              <span>No image?</span>
              <label className={btn('ghost', 'sm')}>
                Import a saved .json
                <input type="file" accept="application/json,.json" hidden onChange={readFile((t) => importInto(t))} />
              </label>
              <Button variant="ghost" size="sm" onClick={() => setRecs([{ id: newId(), slot: '+', songId: meta.songs[0].id, level: 'IN', acc: 99, doubt: {}, hypothetical: false }])}>
                Enter scores by hand
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                accent
                label="RKS"
                value={ev.total.toFixed(4)}
                sub={
                  <>
                    shows as {displayRks(ev.total)}
                    {Math.abs(delta) > 1e-9 && <> · what-if <Delta value={delta} /></>}
                  </>
                }
              />
              <Stat label="B27 floor" value={ev.base.bFloor.toFixed(4)} sub={`${Math.min(ev.base.best.length, B_SLOTS)}/27 filled`} />
              <Stat label="Phi floor" value={ev.base.phiFloor ? ev.base.phiFloor.toFixed(1) : '—'} sub={`${ev.base.phi.length}/3 APs`} />
              <Stat label="Scores" value={recs.length} sub={doubtCount ? <span className="text-doubt">{doubtCount} to check</span> : 'all verified'} />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <nav className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-ink-800 [scrollbar-width:none]">
                  {TABS.map(([id, label, hint]) => (
                    <button
                      key={id}
                      title={hint}
                      onClick={() => setTab(id)}
                      className={cx(
                        '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition',
                        tab === id ? 'border-accent text-white' : 'border-transparent text-ink-400 hover:text-ink-100',
                      )}
                    >
                      {label}
                      {id === 'scores' && doubtCount > 0 && <span className="rounded-full bg-doubt px-1.5 text-[10px] font-bold text-ink-950">{doubtCount}</span>}
                      {counts[id] !== undefined && <span className="text-[11px] text-ink-500 tabular-nums">{counts[id]}</span>}
                    </button>
                  ))}
                </nav>

                {tab === 'scores' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-ink-400">
                        Yellow cells need a look. Step Goods to see your RKS change live.
                      </p>
                      <Button size="sm" onClick={() => setScanOpen(!scanOpen)}>{scanOpen ? 'Close scanner' : 'Scan another image'}</Button>
                    </div>
                    {scanOpen && <ImportPanel meta={meta} onScanned={onScanned} compact />}
                    <ScoreTable meta={meta} songs={songs} recs={recs} baseline={new Map(Object.entries(baseline))} ev={ev} onChange={setRecs} />
                  </div>
                )}
                {tab === 'unplayed' && (
                  <TabIntro text={`Charts above your B27 floor (${ev.base.bFloor.toFixed(4)}) with no score in your table, ranked by farmability. The Goods shown are the most you can take and still beat your floor.`}>
                    <UnplayedList items={lists.unplayed} farm={farm} onTry={(r) => tryScore(r.ref, r.acc)} />
                  </TabIntro>
                )}
                {tab === 'cleanup' && (
                  <TabIntro text="Your scores where removing 2–4 Goods buys the most RKS per Good.">
                    <CleanupList items={lists.cleanup} farm={farm} onTry={(r) => tryScore(r.ref, r.acc)} />
                  </TabIntro>
                )}
                {tab === 'phi' && (
                  <TabIntro
                    text={
                      ev.base.phi.length < 3
                        ? `${ev.base.phi.length}/3 Phi slots filled, so any AP counts. Ranked by AP ease weighted by payoff.`
                        : `Your Phi floor is ${ev.base.phiFloor.toFixed(1)}: only APs on harder charts help. Ranked by AP ease weighted by payoff.`
                    }
                  >
                    <PhiList items={lists.phi} farm={farm} onTry={(r) => tryScore(r.ref, 100)} />
                  </TabIntro>
                )}
                {tab === 'data' && (
                  <DataTab
                    meta={meta}
                    recs={recs}
                    community={community}
                    onImport={importInto}
                    onCommunity={(text) => {
                      try {
                        const c = parseCommunity(text);
                        setCommunity(c);
                        setMsg(`Loaded community priors for ${Object.keys(c).length} charts.`);
                      } catch (e) {
                        setMsg(`Community import failed: ${(e as Error).message}`);
                      }
                    }}
                    onClearCommunity={() => setCommunity({})}
                    onCommit={() => {
                      const rs = recs.map((r) => ({ ...r, hypothetical: false }));
                      setRecs(rs);
                      setNewBaseline(rs);
                      setMsg('What-if scores saved as your baseline.');
                    }}
                    onClear={() => {
                      setRecs([]);
                      setBaseline({});
                    }}
                  />
                )}
              </div>

              <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:rounded-xl">
                <div className={cx('transition-opacity', stale && 'opacity-60')}>
                  <GoalPanel
                    total={ev.total}
                    goal={activeGoal}
                    target={target}
                    plan={plan}
                    single={single}
                    onGoal={setGoal}
                    onTry={tryScore}
                    onApplyPlan={() => plan && applyScores(plan.steps.map((s) => ({ ref: s.ref, acc: s.toAcc })))}
                  />
                </div>
              </aside>
            </div>
          </>
        )}

        <footer className="mt-16 border-t border-ink-800 pt-6 text-center text-xs text-ink-500">
          Chart data {new Date(meta.generatedAt).toLocaleDateString()} from phibot.dev and the Phigros_Resource mirror ·{' '}
          <a className="hover:text-ink-300" href={BASE}>About PhiFarm</a> · Made by <a className="text-ink-200 underline decoration-ink-600 hover:decoration-accent" href="https://github.com/Etern1tyDark" target="_blank" rel="noreferrer">eter</a>.

        </footer>
      </main>
    </div>
  );

  function importInto(text: string) {
    try {
      const rs = importJson(text, songs);
      setRecs(rs);
      setNewBaseline(rs);
      setMsg(`Imported ${rs.length} scores.`);
      setTab('scores');
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }
}

function readFile(cb: (t: string) => void) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) f.text().then(cb);
    e.target.value = '';
  };
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-stage">{children}</div>;
}

function TabIntro({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">{text}</p>
      {children}
    </div>
  );
}

function DataTab(props: {
  meta: Meta;
  recs: Rec[];
  community: Record<string, Community>;
  onImport: (text: string) => void;
  onCommunity: (text: string) => void;
  onClearCommunity: () => void;
  onCommit: () => void;
  onClear: () => void;
}) {
  const nCharts = props.meta.songs.reduce((n, s) => n + Object.keys(s.charts).length, 0);
  const h = 'font-display text-lg font-semibold';
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel className="p-5">
        <h2 className={h}>Your scores</h2>
        <p className="mt-1 text-sm text-ink-400">Save your verified table so you never read the same image twice.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!props.recs.length} onClick={() => download(`phifarm-${new Date().toISOString().slice(0, 10)}.json`, exportJson(props.recs))}>
            Export .json
          </Button>
          <label className={btn()}>
            Import .json
            <input type="file" accept="application/json,.json" hidden onChange={readFile(props.onImport)} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-800 pt-4">
          <Button disabled={!props.recs.some((r) => r.hypothetical)} onClick={props.onCommit}>Keep what-if scores as real</Button>
          <Button variant="danger" disabled={!props.recs.length} onClick={() => confirm('Remove all scores?') && props.onClear()}>Clear all</Button>
        </div>
      </Panel>

      <Panel className="p-5">
        <h2 className={h}>Community priors</h2>
        <p className="mt-1 text-sm text-ink-400">
          Optional. No public source publishes per-chart AP rates or accuracy percentiles, so none are bundled. If you have
          them, load a JSON object keyed by <code className="text-ink-200">songId/level</code>:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink-950 p-3 text-[11px] text-ink-300 ring-1 ring-ink-800">
          {`{ "Igallta.SeURa.0/AT": {\n    "ap": 0.004, "fc": 0.03,\n    "median": 98.1, "top25": 99.1, "top10": 99.6 } }`}
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className={btn()}>
            Load priors .json
            <input type="file" accept="application/json,.json" hidden onChange={readFile(props.onCommunity)} />
          </label>
          {Object.keys(props.community).length > 0 && (
            <>
              <span className="text-sm text-ink-300">{Object.keys(props.community).length} charts loaded</span>
              <Button variant="danger" size="sm" onClick={props.onClearCommunity}>Remove</Button>
            </>
          )}
        </div>
      </Panel>

      <Panel className="p-5 md:col-span-2">
        <h2 className={h}>Chart data</h2>
        <p className="mt-1 text-sm text-ink-400">
          {props.meta.songs.length} songs and {nCharts} charts, built {new Date(props.meta.generatedAt).toLocaleString()}. Sources:{' '}
          {props.meta.sources.join(' · ')}.
        </p>
      </Panel>
    </div>
  );
}
