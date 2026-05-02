import { useEffect, useState } from 'react';
import { Link, Redirect, Route, Router, Switch, useLocation } from 'wouter';
import Dashboard from './pages/Dashboard.tsx';
import Settings from './pages/Settings.tsx';
import Setup from './pages/Setup.tsx';
import Runs from './pages/Runs.tsx';
import RedditTracker from './pages/RedditTracker.tsx';
import TwitterTracker from './pages/TwitterTracker.tsx';
import ExaPeopleTracker from './pages/ExaPeopleTracker.tsx';
import InfoSignalOverview from './pages/InfoSignalOverview.tsx';
import InfoSignalRuns from './pages/InfoSignalRuns.tsx';
import { api } from './api.ts';

const ROUTER_BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

function NavLink({
  href,
  label,
  alsoActiveOn = [],
}: {
  href: string;
  label: string;
  alsoActiveOn?: string[];
}) {
  const [loc] = useLocation();
  const active = loc === href || alsoActiveOn.includes(loc);
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

export default function App() {
  return (
    <Router base={ROUTER_BASE}>
      <AppInner />
    </Router>
  );
}

function AppInner() {
  const [loc] = useLocation();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.onboarding
      .status()
      .then((s) => {
        if (!cancelled) setOnboarded(s.onboarded);
      })
      .catch(() => {
        if (!cancelled) setOnboarded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (onboarded === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-slate-500 dark:text-slate-400">
        Loading…
      </div>
    );
  }

  if (!onboarded && loc !== '/setup') {
    return <Redirect to="/setup" />;
  }

  if (loc === '/setup') {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <Setup />
      </main>
    );
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg"
          >
            <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded bg-indigo-600 text-xs text-white">G</span>
            <span>Gideon AI Dashboard</span>
          </Link>
          <nav className="-mx-1 flex flex-wrap items-center gap-1 overflow-x-auto" aria-label="Primary">
            <NavLink href="/" label="Finance Signal" alsoActiveOn={['/runs']} />
            <NavLink href="/reddit" label="Reddit Tracker" />
            <NavLink href="/twitter" label="Twitter Tracker" />
            <NavLink href="/exa" label="Exa People" />
            <NavLink
              href="/info-signal"
              label="Information Signal"
              alsoActiveOn={['/info-signal/runs']}
            />
            <NavLink href="/settings" label="Settings" />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/reddit" component={RedditTracker} />
          <Route path="/twitter" component={TwitterTracker} />
          <Route path="/exa" component={ExaPeopleTracker} />
          <Route path="/info-signal" component={InfoSignalOverview} />
          <Route path="/info-signal/runs" component={InfoSignalRuns} />
          <Route path="/runs" component={Runs} />
          <Route path="/settings" component={Settings} />
          <Route>
            <p className="text-slate-600 dark:text-slate-400">Not found.</p>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
