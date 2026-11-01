import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  PenTool,
  Droplet,
  FileScan,
  Images,
  Settings,
  Sun,
  Moon,
  Plus,
  Feather,
} from 'lucide-react';
import { api } from './api';
import type {
  AppSettingsStatus,
  DashboardAnalytics,
  InkOut,
  PenOut,
} from './types';
import { DashboardView } from './views/DashboardView';
import { PensView } from './views/PensView';
import { PenDetailView } from './views/PenDetailView';
import { InksView } from './views/InksView';
import { InkDetailView } from './views/InkDetailView';
import { ScanStudioView } from './views/ScanStudioView';
import { SamplesView } from './views/SamplesView';
import { SettingsView } from './views/SettingsView';
import { QuickInkUpModal } from './components/ActionModals';

type RouteState =
  | { tab: 'dashboard' }
  | { tab: 'pens'; penId?: number }
  | { tab: 'inks'; inkId?: number }
  | { tab: 'scans'; batchId?: number; pageNumber?: number; sampleId?: number }
  | { tab: 'samples' }
  | { tab: 'settings' };

function parseHash(): RouteState {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const [seg, idStr] = pathPart.split('/');
  if (seg === 'pens') {
    return idStr ? { tab: 'pens', penId: Number(idStr) } : { tab: 'pens' };
  }
  if (seg === 'inks') {
    return idStr ? { tab: 'inks', inkId: Number(idStr) } : { tab: 'inks' };
  }
  if (seg === 'scans') {
    const qs = new URLSearchParams(queryPart || '');
    return {
      tab: 'scans',
      batchId: qs.get('batch') ? Number(qs.get('batch')) : undefined,
      pageNumber: qs.get('page') ? Number(qs.get('page')) : undefined,
      sampleId: qs.get('sample') ? Number(qs.get('sample')) : undefined,
    };
  }
  if (seg === 'samples') return { tab: 'samples' };
  if (seg === 'settings') return { tab: 'settings' };
  return { tab: 'dashboard' };
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<RouteState>(parseHash);
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');

  const [dashboard, setDashboard] = useState<DashboardAnalytics | null>(null);
  const [pens, setPens] = useState<PenOut[]>([]);
  const [inks, setInks] = useState<InkOut[]>([]);
  const [settings, setSettings] = useState<AppSettingsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuickInkUp, setShowQuickInkUp] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: RouteState) => {
    let hash = `#/${next.tab}`;
    if (next.tab === 'pens' && next.penId) hash = `#/pens/${next.penId}`;
    if (next.tab === 'inks' && next.inkId) hash = `#/inks/${next.inkId}`;
    if (next.tab === 'scans' && (next.batchId || next.pageNumber || next.sampleId)) {
      const qs = new URLSearchParams();
      if (next.batchId) qs.set('batch', String(next.batchId));
      if (next.pageNumber) qs.set('page', String(next.pageNumber));
      if (next.sampleId) qs.set('sample', String(next.sampleId));
      hash = `#/scans?${qs.toString()}`;
    }
    window.location.hash = hash;
    setRoute(next);
  };

  const openScanPage = (batchId: number, pageNumber: number, sampleId?: number) => {
    navigate({ tab: 'scans', batchId, pageNumber, sampleId });
  };

  const refreshAll = useCallback(async () => {
    try {
      setError(null);
      const [dashRes, pensRes, inksRes, settingsRes] = await Promise.all([
        api.getDashboard(),
        api.listPens(),
        api.listInks(),
        api.getSettings(),
      ]);
      setDashboard(dashRes);
      setPens(pensRes);
      setInks(inksRes);
      setSettings(settingsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const navItems: Array<{
    key: RouteState['tab'];
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number;
  }> = [
    {
      key: 'dashboard',
      label: 'Overview',
      icon: LayoutDashboard,
      badge: dashboard?.kpis.currently_inked_count,
    },
    { key: 'pens', label: 'Pen Cabinet', icon: PenTool, badge: pens.length || undefined },
    { key: 'inks', label: 'Ink Library', icon: Droplet, badge: inks.length || undefined },
    { key: 'scans', label: 'PDF Scan Studio', icon: FileScan },
    {
      key: 'samples',
      label: 'Writing Samples',
      icon: Images,
      badge: dashboard?.kpis.total_writing_samples,
    },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Sidebar */}
      <aside className="print:hidden w-full md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <button
              onClick={() => navigate({ tab: 'dashboard' })}
              className="flex items-center gap-2.5 text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center">
                <Feather className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight leading-none">
                  Nib &amp; Ink
                </div>
                <div className="text-[10px] text-zinc-400 font-mono-num mt-0.5">
                  USAGE ANALYTICS
                </div>
              </div>
            </button>

            <button
              onClick={() => setDark((d) => !d)}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              title="Toggle Light / Dark Mode"
            >
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="p-3">
            <button
              onClick={() => setShowQuickInkUp(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-2xs mb-3 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Quick Log Ink-Up
            </button>

            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = route.tab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => navigate({ tab: item.key } as RouteState)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                      active
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 ${
                          active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'
                        }`}
                      />
                      {item.label}
                    </span>
                    {item.badge !== undefined && (
                      <span className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono-num rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="hidden md:block p-4 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Mode</span>
            <span className="font-mono-num text-zinc-600 dark:text-zinc-300">Local Personal</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Vision OCR</span>
            <span
              className={
                settings?.gemini_configured
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'text-zinc-400'
              }
            >
              {settings?.gemini_configured ? 'Gemini Active' : 'Demo / Manual'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-5 md:p-7 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="py-24 text-center text-xs text-zinc-400">
            Initializing collection analytics...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-5 text-xs text-red-700 dark:text-red-300">
            <strong>Backend Connection Error:</strong> {error}
          </div>
        ) : (
          <>
            {route.tab === 'dashboard' && dashboard && (
              <DashboardView
                data={dashboard}
                onRefresh={refreshAll}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
                onOpenScanStudio={() => navigate({ tab: 'scans' })}
                onOpenQuickInkUp={() => setShowQuickInkUp(true)}
              />
            )}

            {route.tab === 'pens' && !route.penId && (
              <PensView
                pens={pens}
                onRefresh={refreshAll}
                onSelectPen={(id) => navigate({ tab: 'pens', penId: id })}
              />
            )}

            {route.tab === 'pens' && route.penId && (
              <PenDetailView
                penId={route.penId}
                allPens={pens}
                allInks={inks}
                onBack={() => navigate({ tab: 'pens' })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenScanPage={openScanPage}
                onGlobalRefresh={refreshAll}
              />
            )}

            {route.tab === 'inks' && !route.inkId && (
              <InksView
                inks={inks}
                onRefresh={refreshAll}
                onSelectInk={(id) => navigate({ tab: 'inks', inkId: id })}
              />
            )}

            {route.tab === 'inks' && route.inkId && (
              <InkDetailView
                inkId={route.inkId}
                allPens={pens}
                allInks={inks}
                onBack={() => navigate({ tab: 'inks' })}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
                onOpenScanPage={openScanPage}
                onGlobalRefresh={refreshAll}
              />
            )}

            {route.tab === 'scans' && (
              <ScanStudioView
                pens={pens}
                inks={inks}
                geminiConfigured={Boolean(settings?.gemini_configured)}
                initialBatchId={route.batchId}
                initialPageNumber={route.pageNumber}
                initialSampleId={route.sampleId}
                onCommitted={refreshAll}
                onOpenSettings={() => navigate({ tab: 'settings' })}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
              />
            )}

            {route.tab === 'samples' && (
              <SamplesView
                pens={pens}
                inks={inks}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
                onOpenScanPage={openScanPage}
                onGlobalRefresh={refreshAll}
              />
            )}

            {route.tab === 'settings' && settings && (
              <SettingsView settings={settings} onRefreshAll={refreshAll} />
            )}
          </>
        )}
      </main>

      {showQuickInkUp && pens.length > 0 && inks.length > 0 && (
        <QuickInkUpModal
          pens={pens}
          inks={inks}
          onClose={() => setShowQuickInkUp(false)}
          onCompleted={refreshAll}
        />
      )}
    </div>
  );
};
