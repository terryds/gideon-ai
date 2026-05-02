import { Link, useLocation } from 'wouter';

const tabs: Array<{ href: string; label: string }> = [
  { href: '/info-signal', label: 'Overview' },
  { href: '/info-signal/runs', label: 'Run history' },
];

export function InfoSignalSubNav() {
  const [loc] = useLocation();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Information Signal</h1>
      <p className="mt-1 text-sm text-slate-600">
        Web search + Claude Haiku decides whether to ping you on Telegram. Conditions are written in natural language.
      </p>
      <nav className="mt-3 -mx-1 flex flex-wrap items-center gap-1 border-b border-slate-200" aria-label="Information Signal sections">
        {tabs.map((t) => {
          const active = loc === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
