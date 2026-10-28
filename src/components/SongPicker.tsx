import { useId, useMemo, useState } from 'react';
import type { Meta, SongMeta } from '../lib/meta';

const label = (s: SongMeta) => `${s.name} — ${s.composer}`;

/** Free-text song search over names and aliases (aliases include Chinese nicknames). */
export function SongPicker({ meta, value, onChange, className }: {
  meta: Meta;
  value: string;
  onChange: (songId: string) => void;
  className?: string;
}) {
  const id = useId();
  const current = meta.songs.find((s) => s.id === value);
  const [text, setText] = useState<string | null>(null);
  const lookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of meta.songs) {
      m.set(label(s).toLowerCase(), s.id);
      if (!m.has(s.name.toLowerCase())) m.set(s.name.toLowerCase(), s.id);
      for (const a of s.aliases ?? []) if (!m.has(a.toLowerCase())) m.set(a.toLowerCase(), s.id);
    }
    return m;
  }, [meta]);

  return (
    <>
      <input
        className={className}
        list={id}
        value={text ?? current?.name ?? ''}
        title={current ? label(current) : undefined}
        placeholder="Search song or alias"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setText(e.target.value);
          const hit = lookup.get(e.target.value.trim().toLowerCase());
          if (hit) {
            onChange(hit);
            setText(null);
          }
        }}
        onBlur={() => setText(null)}
      />
      <datalist id={id}>
        {meta.songs.map((s) => <option key={s.id} value={label(s)} />)}
      </datalist>
    </>
  );
}
