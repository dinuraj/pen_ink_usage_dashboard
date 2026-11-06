import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  BookOpen,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { AdminLoginModal } from './components/AdminLoginModal';
import type {
  AppSettingsStatus,
  DashboardAnalytics,
  InkOut,
  NotebookOut,
  PenOut,
} from './types';
import { DashboardView } from './views/DashboardView';
import { PensView } from './views/PensView';
import { PenDetailView } from './views/PenDetailView';
import { InksView } from './views/InksView';
import { InkDetailView } from './views/InkDetailView';
import { NotebooksView } from './views/NotebooksView';
import { ScanStudioView } from './views/ScanStudioView';
import { SamplesView } from './views/SamplesView';
import { SettingsView } from './views/SettingsView';
import { PairingStudioView } from './views/PairingStudioView';
import { QuickInkUpModal } from './components/ActionModals';
import { getPenCabinetState, getInkLibraryState } from './utils/navigationState';

type RouteState =
  | { tab: 'dashboard' }
  | { tab: 'pens'; penId?: number }
  | { tab: 'inks'; inkId?: number }
  | { tab: 'pairing'; penId?: number; inkId?: number }
  | { tab: 'notebooks' }
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
  if (seg === 'pairing') {
    const qs = new URLSearchParams(queryPart || '');
    return {
      tab: 'pairing',
      penId: qs.get('pen') ? Number(qs.get('pen')) : undefined,
      inkId: qs.get('ink') ? Number(qs.get('ink')) : undefined,
    };
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
  if (seg === 'notebooks') return { tab: 'notebooks' };
  if (seg === 'samples') return { tab: 'samples' };
  if (seg === 'settings') return { tab: 'settings' };
  return { tab: 'dashboard' };
}

export const App: React.FC = () => {
  const { isAdmin, authEnabled, logout } = useAuth();
  const [route, setRoute] = useState<RouteState>(parseHash);
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');

  const [dashboard, setDashboard] = useState<DashboardAnalytics | null>(null);
  const [pens, setPens] = useState<PenOut[]>([]);
  const [inks, setInks] = useState<InkOut[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookOut[]>([]);
  const [settings, setSettings] = useState<AppSettingsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuickInkUp, setShowQuickInkUp] = useState<boolean>(false);
  const [quickInkUpInit, setQuickInkUpInit] = useState<{ penId?: number; inkId?: number } | null>(null);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  const openQuickInkUp = (penId?: number, inkId?: number) => {
    setQuickInkUpInit(penId || inkId ? { penId, inkId } : null);
    setShowQuickInkUp(true);
  };

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
    if (next.tab === 'pairing') {
      const qs = new URLSearchParams();
      if (next.penId) qs.set('pen', String(next.penId));
      if (next.inkId) qs.set('ink', String(next.inkId));
      const qStr = qs.toString();
      hash = qStr ? `#/pairing?${qStr}` : `#/pairing`;
    }
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
      const [dashRes, pensRes, inksRes, settingsRes, notebooksRes] = await Promise.all([
        api.getDashboard(),
        api.listPens(),
        api.listInks(),
        api.getSettings(),
        api.listNotebooks(),
      ]);
      setDashboard(dashRes);
      setPens(pensRes);
      setInks(inksRes);
      setSettings(settingsRes);
      setNotebooks(notebooksRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Context-aware sequence for Next/Previous Pen navigation
  const activePenIds = useMemo(() => {
    const state = getPenCabinetState();
    if (state.filteredPenIds && state.filteredPenIds.length > 0) {
      if (route.tab === 'pens' && route.penId && state.filteredPenIds.includes(route.penId)) {
        return state.filteredPenIds;
      }
    }
    return pens.map((p) => p.id);
  }, [pens, route]);

  const currentPenIdx = route.tab === 'pens' && route.penId ? activePenIds.indexOf(route.penId) : -1;
  const prevPenId = currentPenIdx > 0 ? activePenIds[currentPenIdx - 1] : undefined;
  const nextPenId = currentPenIdx >= 0 && currentPenIdx < activePenIds.length - 1 ? activePenIds[currentPenIdx + 1] : undefined;
  const prevPen = prevPenId ? pens.find((p) => p.id === prevPenId) : undefined;
  const nextPen = nextPenId ? pens.find((p) => p.id === nextPenId) : undefined;

  // Context-aware sequence for Next/Previous Ink navigation
  const activeInkIds = useMemo(() => {
    const state = getInkLibraryState();
    if (state.filteredInkIds && state.filteredInkIds.length > 0) {
      if (route.tab === 'inks' && route.inkId && state.filteredInkIds.includes(route.inkId)) {
        return state.filteredInkIds;
      }
    }
    return inks.map((i) => i.id);
  }, [inks, route]);

  const currentInkIdx = route.tab === 'inks' && route.inkId ? activeInkIds.indexOf(route.inkId) : -1;
  const prevInkId = currentInkIdx > 0 ? activeInkIds[currentInkIdx - 1] : undefined;
  const nextInkId = currentInkIdx >= 0 && currentInkIdx < activeInkIds.length - 1 ? activeInkIds[currentInkIdx + 1] : undefined;
  const prevInk = prevInkId ? inks.find((i) => i.id === prevInkId) : undefined;
  const nextInk = nextInkId ? inks.find((i) => i.id === nextInkId) : undefined;

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
    { key: 'pairing', label: 'Pairing Studio', icon: Sparkles },
    { key: 'notebooks', label: 'Notebooks', icon: BookOpen, badge: notebooks.length || undefined },
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

            <div className="flex items-center gap-1.5">
              {authEnabled && (
                isAdmin ? (
                  <button
                    onClick={() => logout()}
                    className="p-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:opacity-80 transition"
                    title="Admin Mode Active (Click to Lock / Switch to Read-Only)"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
                    title="Public Read-Only View (Click to Unlock Admin Mode)"
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </button>
                )
              )}

              <button
                onClick={() => setDark((d) => !d)}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                title="Toggle Light / Dark Mode"
              >
                {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-3">
            {isAdmin ? (
              <button
                onClick={() => openQuickInkUp()}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-2xs mb-3 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Quick Log Ink-Up
              </button>
            ) : authEnabled ? (
              <button
                onClick={() => setShowLoginModal(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 text-xs font-medium mb-3 transition"
              >
                <Lock className="w-3.5 h-3.5" />
                Unlock Admin to Edit
              </button>
            ) : null}

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
            <span>Access Mode</span>
            <span
              className={`font-medium ${
                isAdmin
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-zinc-500'
              }`}
            >
              {isAdmin ? 'Admin (Full Edit)' : 'Public (Read-Only)'}
            </span>
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
                onOpenQuickInkUp={() => openQuickInkUp()}
                onOpenPairingStudio={() => navigate({ tab: 'pairing' })}
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
                prevPen={prevPen}
                nextPen={nextPen}
                currentIndex={currentPenIdx >= 0 ? currentPenIdx : undefined}
                totalCount={activePenIds.length}
                onBack={() => navigate({ tab: 'pens' })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenScanPage={openScanPage}
                onGlobalRefresh={refreshAll}
                onOpenPairing={(penId) => navigate({ tab: 'pairing', penId })}
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
                prevInk={prevInk}
                nextInk={nextInk}
                currentIndex={currentInkIdx >= 0 ? currentInkIdx : undefined}
                totalCount={activeInkIds.length}
                onBack={() => navigate({ tab: 'inks' })}
                onOpenPen={(id) => navigate({ tab: 'pens', penId: id })}
                onOpenInk={(id) => navigate({ tab: 'inks', inkId: id })}
                onOpenScanPage={openScanPage}
                onGlobalRefresh={refreshAll}
                onOpenPairing={(inkId) => navigate({ tab: 'pairing', inkId })}
              />
            )}

            {route.tab === 'pairing' && (
              <PairingStudioView
                initialPenId={route.penId}
                initialInkId={route.inkId}
                onOpenPen={(id: number) => navigate({ tab: 'pens', penId: id })}
                onOpenInk={(id: number) => navigate({ tab: 'inks', inkId: id })}
                onOpenInkUpModal={(penId: number, inkId: number) => openQuickInkUp(penId, inkId)}
              />
            )}

            {route.tab === 'notebooks' && (
              <NotebooksView notebooks={notebooks} onRefresh={refreshAll} />
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
              <SettingsView
                settings={settings}
                onRefreshAll={refreshAll}
                onOpenLoginModal={() => setShowLoginModal(true)}
              />
            )}
          </>
        )}
      </main>

      {showQuickInkUp && pens.length > 0 && inks.length > 0 && (
        <QuickInkUpModal
          pens={pens}
          inks={inks}
          defaultPenId={quickInkUpInit?.penId}
          defaultInkId={quickInkUpInit?.inkId}
          onClose={() => {
            setShowQuickInkUp(false);
            setQuickInkUpInit(null);
          }}
          onCompleted={refreshAll}
        />
      )}

      <AdminLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={refreshAll}
      />
    </div>
  );
};
