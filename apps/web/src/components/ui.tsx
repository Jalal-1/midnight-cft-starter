// Small presentational helpers shared by the panels.
import { useState, type ReactNode } from 'react';

export const inputClass =
  'w-full rounded-lg border border-night-600 bg-night-800 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-glow-400 focus:ring-2 focus:ring-glow-400/30 disabled:cursor-not-allowed disabled:opacity-60';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-glow-400/40 disabled:cursor-not-allowed disabled:opacity-60';
export const primaryButton = `${base} bg-glow-400 text-night-950 hover:bg-glow-300`;
export const secondaryButton = `${base} border border-night-600 bg-night-800 text-slate-100 hover:border-glow-400`;

export function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-4 animate-spin rounded-full border-2 ${dark ? 'border-night-950/30 border-t-night-950' : 'border-slate-500/40 border-t-slate-200'}`}
    />
  );
}

export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="w-full rounded-2xl border border-night-700 bg-night-900/60 p-5 backdrop-blur">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
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

export function Mono({ value, truncate = true, title }: { value: string; truncate?: boolean; title?: string }) {
  const shown = truncate && value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
  return (
    <span className="font-mono text-sm text-slate-100" title={title ?? value}>
      {shown}
    </span>
  );
}

export function CopyButton({ value }: { value: string }) {
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
      className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-night-700 hover:text-slate-100"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex min-w-0 items-center gap-1 text-right">{children}</div>
    </div>
  );
}
