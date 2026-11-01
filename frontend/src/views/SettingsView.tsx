import React, { useState } from 'react';
import { KeyRound, Download, RotateCcw, Cloud, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import type { AppSettingsStatus } from '../types';

interface Props {
  settings: AppSettingsStatus;
  onRefreshAll: () => void;
}

export const SettingsView: React.FC<Props> = ({ settings, onRefreshAll }) => {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [reseeding, setReseeding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings(apiKey);
      setApiKey('');
      setMsg('Gemini Vision API key updated locally.');
      onRefreshAll();
    } finally {
      setSaving(false);
    }
  };

  const handleReseed = async () => {
    if (
      !window.confirm(
        'Reset database and regenerate fresh demo pens, inks, usage sessions, and the demo 2-page notebook PDF?',
      )
    )
      return;
    setReseeding(true);
    try {
      await api.reseedDemo();
      setMsg('Demo collection and sample PDF regenerated!');
      onRefreshAll();
    } finally {
      setReseeding(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Settings, Backup &amp; Cloud Readiness
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Manage Gemini Vision OCR credentials, export portable backups, or reset demo seed data.
        </p>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>{msg}</span>
        </div>
      )}

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
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste AIza... Gemini API key"
            className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-sm font-mono-num"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium"
          >
            {saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>
      </form>

      {/* Local Data Backup & Demo Reset */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <h3 className="text-sm font-semibold">Portable Local Backup &amp; Demo Controls</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center text-xs">
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

          <button
            type="button"
            disabled={reseeding}
            onClick={handleReseed}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {reseeding ? 'Regenerating Demo...' : 'Reset to Fresh Demo Seed Data'}
          </button>
        </div>
      </div>

      {/* Cloud Architecture Note */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2 text-xs">
        <div className="flex items-center gap-2 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
          <Cloud className="w-4 h-4 text-sky-500" />
          <span>Cloud-Ready Architecture</span>
        </div>
        <p className="text-zinc-500 leading-relaxed">
          Active storage adapter: <code className="font-mono-num">{settings.storage_backend}</code>.
          When you are ready to promote this personal app to a private cloud deployment (Railway,
          Render, Fly.io, or Cloud Run), follow{' '}
          <code className="font-mono-num">docs/CLOUD_MIGRATION.md</code> in your workspace to point{' '}
          <code className="font-mono-num">DATABASE_URL</code> at managed PostgreSQL and{' '}
          <code className="font-mono-num">STORAGE_BACKEND=s3</code> at Cloudflare R2 / S3.
        </p>
      </div>
    </div>
  );
};
