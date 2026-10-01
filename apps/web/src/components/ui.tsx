// Small presentational helpers shared by the panels.
import { useEffect, useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryId } from '../midnight/glossary';

export const inputClass =
  'w-full rounded-lg border border-night-600 bg-night-800 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-glow-400 focus:ring-2 focus:ring-glow-400/30 disabled:cursor-not-allowed disabled:opacity-60';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-glow-400/40 disabled:cursor-not-allowed disabled:opacity-60';
export const primaryButton = `${base} bg-glow-400 text-night-950 hover:bg-glow-300`;
export const secondaryButton = `${base} border border-night-600 bg-night-800 text-slate-100 hover:border-glow-400`;
export const ghostButton = 'rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-night-700 hover:text-slate-100';

export function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-4 shrink-0 animate-spin rounded-full border-2 ${dark ? 'border-night-950/30 border-t-night-950' : 'border-slate-500/40 border-t-slate-200'}`}
    />
  );
}

/** A dashboard panel: fixed to its grid cell, scrolls internally. */
export function Panel({ title, aside, children, className = 'flex-1' }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-2xl border border-night-700 bg-night-900/60 backdrop-blur ${className}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-night-700 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        {aside}
      </header>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      {children}
    </p>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-night-600 bg-night-800 text-slate-300';
  return <p className={`rounded-md border px-3 py-2 text-xs ${cls}`}>{children}</p>;
}

export function Mono({ value, truncate = true, title }: { value: string; truncate?: boolean; title?: string }) {
  const shown = truncate && value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
  return (
    <span className="font-mono text-sm text-slate-100" title={title ?? value}>
      {shown}
    </span>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className={ghostButton}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Label / value row. The label can be a <Term> so every field explains itself. */
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-right">{children}</div>
    </div>
  );
}

/**
 * A field name with a "?" that reveals its glossary entry on hover or focus.
 * The copy comes from the OpenZeppelin module's own documentation.
 */
export function Term({ id, children, align = 'left' }: { id: GlossaryId; children?: ReactNode; align?: 'left' | 'right' }) {
  const entry = GLOSSARY[id];
  return (
    <span className="group relative inline-flex items-center gap-1">
      <span>{children ?? entry.title}</span>
      <button
        type="button"
        aria-label={`What is ${entry.title}?`}
        className="inline-flex size-4 items-center justify-center rounded-full border border-night-600 text-[10px] leading-none text-slate-400 transition hover:border-glow-400 hover:text-slate-100 focus:outline-none focus:ring-1 focus:ring-glow-400"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-30 mt-1.5 w-72 rounded-lg border border-night-600 bg-night-800 p-3 text-left text-xs font-normal normal-case tracking-normal text-slate-200 shadow-xl shadow-black/40 group-hover:visible group-focus-within:visible ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        <span className="mb-1 block font-semibold text-slate-50">{entry.title}</span>
        {entry.short}
      </span>
    </span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-2xl border border-night-600 bg-night-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-night-700 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} className={ghostButton} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
