import React, { useEffect, useState, useCallback } from 'react';
import {
  KeyRound,
  Download,
  RotateCcw,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowUpRight,
  ArrowDownLeft,
  Archive,
  RefreshCw,
  Lock,
  Clock,
  HardDrive,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { AppSettingsStatus, SyncStatus, BackupRecord } from '../types';

interface Props {
  settings: AppSettingsStatus;
  onRefreshAll: () => void;
  onOpenLoginModal?: () => void;
}

export const SettingsView: React.FC<Props> = ({ settings, onRefreshAll, onOpenLoginModal }) => {
  const { isAdmin } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncActionLoading, setSyncActionLoading] = useState<'push' | 'pull' | 'backup' | null>(null);

  const fetchSyncStatus = useCallback(async () => {
    setSyncLoading(true);
    try {
      const status = await api.sync.getStatus();
      setSyncStatus(status);
    } catch (err) {
      console.warn('Failed to fetch sync status', err);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSyncStatus();
  }, [fetchSyncStatus]);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      if (onOpenLoginModal) onOpenLoginModal();
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await api.updateSettings(apiKey);
      setApiKey('');
      setMsg('Gemini Vision API key updated locally.');
      onRefreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerBackup = async () => {
    if (!isAdmin) {
      if (onOpenLoginModal) onOpenLoginModal();
      return;
    }
    setSyncActionLoading('backup');
    setMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.sync.createBackup();
      setMsg(`Database backup created: ${res.backup.filename}`);
      void fetchSyncStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setSyncActionLoading(null);
    }
  };

  const handlePushToCloud = async () => {
    if (!isAdmin) {
      if (onOpenLoginModal) onOpenLoginModal();
      return;
    }
    if (
      !window.confirm(
        'Push local SQLite database & uploads to Supabase Cloud? A timestamped versioned backup will be created automatically first.',
      )
    ) {
      return;
    }
    setSyncActionLoading('push');
    setMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.sync.push();
      setMsg(res.message);
      void fetchSyncStatus();
      onRefreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cloud push failed');
    } finally {
      setSyncActionLoading(null);
    }
  };

  const handlePullFromCloud = async () => {
    if (!isAdmin) {
      if (onOpenLoginModal) onOpenLoginModal();
      return;
    }
    if (
      !window.confirm(
        'Pull latest data from Supabase Cloud into local database? A timestamped versioned backup will be created automatically first.',
      )
    ) {
      return;
    }
    setSyncActionLoading('pull');
    setMsg(null);
    setErrorMsg(null);
    try {
      const res = await api.sync.pull();
      setMsg(res.message);
      void fetchSyncStatus();
      onRefreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cloud pull failed');
    } finally {
      setSyncActionLoading(null);
    }
  };

  const handleReseed = async () => {
    if (!isAdmin) {
      if (onOpenLoginModal) onOpenLoginModal();
      return;
    }
    if (
      !window.confirm(
        'WARNING: This will replace your current collection with demo pens and inks! Are you ABSOLUTELY sure?',
      )
    ) {
      return;
    }
    setReseeding(true);
    setMsg(null);
    setErrorMsg(null);
    try {
      await api.reseedDemo();
      setMsg('Demo collection and sample PDF regenerated!');
      onRefreshAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to reseed database');
    } finally {
      setReseeding(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Settings, Cloud Sync &amp; Backups
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Manage cloud synchronization, automated versioned database backups, OCR credentials, and portable archives.
        </p>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-xs text-red-800 dark:text-red-200">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Cloud Synchronization & Versioned Backups (Option A) */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Cloud Sync &amp; Versioned Backups
              </h3>
              <p className="text-xs text-zinc-500">
                1-Click bidirectional synchronization between Local SQLite and Supabase Cloud
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {syncStatus?.cloud_connected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Cloud Connected
              </span>
            ) : syncStatus?.cloud_configured ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Configured (Unreachable)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Local Only
              </span>
            )}

            <button
              onClick={fetchSyncStatus}
              disabled={syncLoading}
              title="Refresh Sync Status"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Sync Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <button
            type="button"
            disabled={!syncStatus?.cloud_connected || syncActionLoading !== null || !isAdmin}
            onClick={handlePushToCloud}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 text-xs font-medium transition"
          >
            <ArrowUpRight className="w-4 h-4 shrink-0" />
            <span>
              {syncActionLoading === 'push' ? 'Pushing to Cloud...' : 'Push Local → Cloud'}
            </span>
          </button>

          <button
            type="button"
            disabled={!syncStatus?.cloud_connected || syncActionLoading !== null || !isAdmin}
            onClick={handlePullFromCloud}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 text-xs font-medium transition"
          >
            <ArrowDownLeft className="w-4 h-4 shrink-0" />
            <span>
              {syncActionLoading === 'pull' ? 'Pulling from Cloud...' : 'Pull Cloud → Local'}
            </span>
          </button>

          <button
            type="button"
            disabled={syncActionLoading !== null || !isAdmin}
            onClick={handleTriggerBackup}
            className="flex items-center justify-center gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 text-xs font-medium transition"
          >
            <Archive className="w-4 h-4 shrink-0" />
            <span>
              {syncActionLoading === 'backup' ? 'Backing Up...' : 'Create DB Backup Now'}
            </span>
          </button>
        </div>

        {!isAdmin && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>You are viewing in Public Read-Only mode. Admin unlock is required to sync or backup.</span>
            </div>
            {onOpenLoginModal && (
              <button
                type="button"
                onClick={onOpenLoginModal}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-medium text-[11px] hover:bg-amber-500 transition"
              >
                Unlock
              </button>
            )}
          </div>
        )}

        {/* Sync Metadata & Git Versioning Note */}
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80 text-xs space-y-2 text-zinc-600 dark:text-zinc-400">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <strong>Last Cloud Push:</strong>{' '}
              {syncStatus?.last_push ? new Date(syncStatus.last_push).toLocaleString() : 'Never'}
            </span>
            <span>
              <strong>Last Cloud Pull:</strong>{' '}
              {syncStatus?.last_pull ? new Date(syncStatus.last_pull).toLocaleString() : 'Never'}
            </span>
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
              <strong>Local Backups:</strong> {syncStatus?.backups_count ?? 0} saved
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-200/50 dark:border-zinc-800/50 pt-2">
            Every Push or Pull creates an atomic, date-stamped, and versioned SQLite snapshot inside{' '}
            <code className="font-mono-num text-zinc-700 dark:text-zinc-300">backups/db/</code>. This folder is whitelisted in Git and committed to your repository so your data is version-controlled and recoverable at any point.
          </p>
        </div>

        {/* Versioned Backups Table */}
        {syncStatus?.recent_backups && syncStatus.recent_backups.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Versioned Backup History ({syncStatus.recent_backups.length} recorded)
              </h4>
              <span className="text-[11px] font-mono-num text-zinc-400">
                Folder: backups/db/
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
                  <tr>
                    <th className="py-2 px-3 font-medium">Version</th>
                    <th className="py-2 px-3 font-medium">Filename</th>
                    <th className="py-2 px-3 font-medium">Trigger</th>
                    <th className="py-2 px-3 font-medium">Records</th>
                    <th className="py-2 px-3 font-medium">Size</th>
                    <th className="py-2 px-3 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono-num text-[11px]">
                  {syncStatus.recent_backups.map((b: BackupRecord) => (
                    <tr key={b.filename} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <td className="py-2 px-3">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px]">
                          v{b.version}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300 font-medium">
                        {b.filename}
                      </td>
                      <td className="py-2 px-3 text-zinc-500 font-sans capitalize">
                        {b.trigger.replace('_', ' ')}
                      </td>
                      <td className="py-2 px-3 text-zinc-500">
                        {b.counts.pens} pens &bull; {b.counts.inks} inks &bull; {b.counts.sessions} sess
                      </td>
                      <td className="py-2 px-3 text-zinc-500">
                        {formatFileSize(b.size_bytes)}
                      </td>
                      <td className="py-2 px-3 text-zinc-400 font-sans">
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Gemini Vision API Configuration */}
      <form
        onSubmit={handleSaveKey}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold">Gemini Vision OCR Configuration</h3>
          </div>
          <span
            className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              settings.gemini_configured
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {settings.gemini_configured
              ? `Configured (${settings.gemini_key_masked})`
              : 'Not Configured (Offline Mode)'}
          </span>
        </div>

        <p className="text-xs text-zinc-500 leading-relaxed">
          Used exclusively when you upload new notebook scans or click{' '}
          <strong>Re-Run Vision Extraction</strong> ({settings.gemini_model}). Saved locally to your
          gitignored <code className="font-mono-num">.env</code> file —{' '}
          <strong>never stored inside <code className="font-mono-num">pen_ink.db</code></strong> so
          your database stays safe to commit to GitHub. Get a free API key at{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 dark:text-indigo-400 underline font-medium"
          >
            Google AI Studio
          </a>
          .
        </p>

        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            disabled={!isAdmin}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isAdmin ? 'Paste AIza... Gemini API key' : 'Unlock Admin mode to change API key'}
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-sm font-mono-num disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={saving || !isAdmin}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>
      </form>

      {/* Local Data Backup & Demo Reset */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold">Portable Local Backup &amp; Collection Controls</h3>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-center text-xs">
          {Object.entries(settings.counts).map(([k, v]) => (
            <div
              key={k}
              className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800"
            >
              <div className="font-mono-num text-lg font-semibold">{v}</div>
              <div className="text-[11px] text-zinc-500 capitalize">{k}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href="/api/settings/export-backup"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
          >
            <Download className="w-3.5 h-3.5" />
            Download Full Backup Archive (.zip)
          </a>

          {isAdmin && (
            <button
              type="button"
              disabled={reseeding}
              onClick={handleReseed}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {reseeding ? 'Regenerating Demo...' : 'Reset to Fresh Demo Seed Data'}
            </button>
          )}
        </div>
      </div>

      {/* Cloud Architecture Note */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          <Cloud className="w-4 h-4 text-sky-500" />
          <span>Cloud &amp; Local Hybrid Architecture</span>
        </div>
        <p className="text-zinc-500 leading-relaxed">
          Storage adapter: <code className="font-mono-num">{settings.storage_backend}</code>.
          Local database uses SQLite with automatic versioned Git snapshots in <code className="font-mono-num">backups/db/</code>.
          Cloud deployment uses Supabase PostgreSQL with pooled connections and S3 storage on Render.
        </p>
      </div>
    </div>
  );
};
