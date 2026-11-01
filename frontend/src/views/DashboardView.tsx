import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
} from 'recharts';
import {
  PenTool,
  Droplet,
  Activity,
  AlertTriangle,
  Clock,
  RefreshCw,
  Sparkles,
  FileScan,
  FileDown,
  Plus,
  Eye,
  ArrowUpDown,
} from 'lucide-react';
import type { CurrentlyInkedRow, DashboardAnalytics } from '../types';
import { LifecycleActionModal } from '../components/ActionModals';

interface Props {
  data: DashboardAnalytics;
  onRefresh: () => void;
  onOpenPen: (id: number) => void;
  onOpenInk: (id: number) => void;
  onOpenScanStudio: () => void;
  onOpenQuickInkUp: () => void;
}

export const DashboardView: React.FC<Props> = ({
  data,
  onRefresh,
  onOpenPen,
  onOpenInk,
  onOpenScanStudio,
  onOpenQuickInkUp,
}) => {
  const { kpis } = data;
  const [sortBy, setSortBy] = useState<'days_inked' | 'pen' | 'ink'>('days_inked');
  const [rankMetric, setRankMetric] = useState<'total_fills' | 'total_days_inked' | 'times_inked'>(
    'total_fills',
  );
  const [previewSampleUrl, setPreviewSampleUrl] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [lifecycleModal, setLifecycleModal] = useState<{
    mode: 'refill' | 'clean';
    row: CurrentlyInkedRow;
  } | null>(null);

  const sortedActive = [...data.currently_inked].sort((a, b) => {
    if (sortBy === 'days_inked') return b.days_inked - a.days_inked;
    if (sortBy === 'pen')
      return `${a.pen_brand} ${a.pen_model}`.localeCompare(`${b.pen_brand} ${b.pen_model}`);
    return `${a.ink_brand} ${a.ink_name}`.localeCompare(`${b.ink_brand} ${b.ink_name}`);
  });

  const topPensSorted = [...data.top_pens]
    .sort((a, b) => b[rankMetric] - a[rankMetric])
    .slice(0, 7);
  const topInksSorted = [...data.top_inks]
    .sort((a, b) => b[rankMetric] - a[rankMetric])
    .slice(0, 7);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Collection &amp; Rotation Analytics
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time overview of currently inked pens, fill cadence, ink stash health, and writing
            samples.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <a
            href="/api/analytics/dashboard.pdf"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-2xs"
            title="Download a clean 2-page shareable PDF snapshot of this dashboard"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Share PDF
          </a>
          <button
            onClick={onOpenScanStudio}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-2xs"
          >
            <FileScan className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            Upload / Review PDF Scan
          </button>
          <button
            onClick={onOpenQuickInkUp}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Ink-Up
          </button>
        </div>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Currently Inked</span>
            <PenTool className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono-num">
              {kpis.currently_inked_count}
              <span className="text-sm font-normal text-zinc-400">
                /{kpis.active_collection_pens}
              </span>
            </span>
            <span className="text-xs font-mono-num px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
              {kpis.rotation_pct}% active
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {kpis.total_pens} total pens in cabinet
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Ink-Ups &amp; Refills</span>
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono-num">
              {kpis.total_sessions + kpis.total_refills}
            </span>
            <span className="text-xs text-zinc-500 font-mono-num">
              ({kpis.total_sessions} fills · {kpis.total_refills} refills)
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {kpis.ytd_sessions} sessions logged YTD · {kpis.total_writing_samples} samples
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Ink Inventory</span>
            <Droplet className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono-num">{kpis.total_inks}</span>
            <span className="text-xs text-zinc-500 font-mono-num">
              {kpis.bottles_count} bottles · {kpis.samples_vial_count} samples
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {kpis.low_or_empty_inks} low or finished containers
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Avg Fill Cycle</span>
            <Clock className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold font-mono-num">{kpis.avg_fill_days}</span>
            <span className="text-xs text-zinc-500">days / fill</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {kpis.total_cleanings} completed cleanings logged
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Maintenance Check</span>
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                kpis.due_for_flush_count > 0 ? 'text-amber-500' : 'text-zinc-400'
              }`}
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold font-mono-num">
              {kpis.due_for_flush_count}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                kpis.due_for_flush_count > 0
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {kpis.due_for_flush_count > 0 ? '≥28d inked' : 'All fresh'}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Flush nudge threshold: 28 days</p>
        </div>
      </div>

      {/* Currently Inked Command Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Currently Inked Rotation
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono-num rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {sortedActive.length} active
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-400">Sort:</span>
            {(['days_inked', 'pen', 'ink'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-2 py-1 rounded-md font-medium transition ${
                  sortBy === key
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {key === 'days_inked' ? 'Days Inked' : key === 'pen' ? 'Pen' : 'Ink'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 px-4">Fountain Pen</th>
                <th className="py-2.5 px-3">Nib</th>
                <th className="py-2.5 px-4">Loaded Ink</th>
                <th className="py-2.5 px-3">Date Inked</th>
                <th className="py-2.5 px-3">Days Inked</th>
                <th className="py-2.5 px-3">Refills</th>
                <th className="py-2.5 px-3">Sample</th>
                <th className="py-2.5 px-4 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {sortedActive.map((row) => (
                <tr
                  key={row.session_id}
                  className="hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => onOpenPen(row.pen_id)}
                      className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                    >
                      {row.pen_brand} {row.pen_model}
                      {row.pen_color && (
                        <span className="ml-1.5 text-zinc-500 font-normal">({row.pen_color})</span>
                      )}
                    </button>
                    <div className="text-[11px] text-zinc-400">{row.filling_mechanism}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num font-medium text-zinc-700 dark:text-zinc-300">
                      {row.nib_size}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => onOpenInk(row.ink_id)}
                      className="inline-flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/15 dark:ring-white/20"
                        style={{ backgroundColor: row.ink_hex }}
                      />
                      <span>
                        {row.ink_brand} {row.ink_name}
                      </span>
                    </button>
                  </td>
                  <td className="py-2.5 px-3 font-mono-num text-zinc-600 dark:text-zinc-400">
                    {row.date_inked}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono-num font-medium ${
                        row.aging === 'attention'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                          : row.aging === 'moderate'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}
                    >
                      {row.days_inked}d
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono-num text-zinc-600 dark:text-zinc-400">
                    {row.refill_count > 0 ? `${row.refill_count}×` : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    {row.sample_url ? (
                      <button
                        onClick={() =>
                          setPreviewSampleUrl({
                            url: row.sample_url!,
                            title: `${row.pen_brand} ${row.pen_model} (${row.nib_size}) × ${row.ink_brand} ${row.ink_name}`,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                      >
                        <Eye className="w-3 h-3" />
                        Sample
                      </button>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => setLifecycleModal({ mode: 'refill', row })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium text-zinc-700 dark:text-zinc-200"
                        title="Log a reservoir refill"
                      >
                        <RefreshCw className="w-3 h-3 text-indigo-500" />
                        Refill
                      </button>
                      <button
                        onClick={() => setLifecycleModal({ mode: 'clean', row })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 font-medium"
                        title="Mark pen cleaned or emptied"
                      >
                        <Sparkles className="w-3 h-3" />
                        Clean
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedActive.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-400">
                    No pens are currently inked. Click "Log Ink-Up" or upload a notebook PDF scan!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 1 Charts: Monthly Cadence + Color Family Collection vs Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              12-Month Activity Cadence
            </h3>
            <p className="text-xs text-zinc-500">
              Monthly breakdown of initial ink-ups, reservoir refills, and pen cleanings
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly_activity} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.2)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e4e4e7',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="inked" name="Ink-Ups" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="refilled" name="Refills" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cleaned" name="Cleaned" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Ink Color Families: Stash vs. Usage
            </h3>
            <p className="text-xs text-zinc-500">
              Compare bottles/samples owned against total fills written per color family
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.color_distribution} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(161,161,170,0.2)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="color_family" tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={58} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #e4e4e7',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="usage_fills" name="Total Fills" radius={[0, 4, 4, 0]}>
                  {data.color_distribution.map((entry, idx) => (
                    <Cell key={idx} fill={entry.hex} />
                  ))}
                </Bar>
                <Bar dataKey="inventory_count" name="Inks Owned" fill="#94a3b8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Most Frequently Used Pens & Inks */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Most Frequently Used Pens &amp; Inks
            </h3>
            <p className="text-xs text-zinc-500">
              Click any item below to open its dedicated detail page &amp; writing samples
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 text-xs">
            {(
              [
                ['total_fills', 'Ink-Ups + Refills'],
                ['times_inked', 'Sessions Count'],
                ['total_days_inked', 'Days Inked'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRankMetric(key)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  rankMetric === key
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Pens */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Top Fountain Pens
            </div>
            {topPensSorted.map((p, idx) => {
              const maxVal = Math.max(1, topPensSorted[0]?.[rankMetric] ?? 1);
              const pct = Math.round((p[rankMetric] / maxVal) * 100);
              return (
                <div key={p.id} className="group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <button
                      onClick={() => onOpenPen(p.id)}
                      className="font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate text-left"
                    >
                      <span className="text-zinc-400 font-mono-num mr-1.5">{idx + 1}.</span>
                      {p.label}
                      <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num text-zinc-500">
                        {p.nib_size}
                      </span>
                    </button>
                    <span className="font-mono-num font-semibold text-zinc-700 dark:text-zinc-300 shrink-0 ml-2">
                      {p[rankMetric]}
                      {rankMetric === 'total_days_inked' ? 'd' : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Top Inks */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Top Inks
            </div>
            {topInksSorted.map((ink, idx) => {
              const maxVal = Math.max(1, topInksSorted[0]?.[rankMetric] ?? 1);
              const pct = Math.round((ink[rankMetric] / maxVal) * 100);
              return (
                <div key={ink.id} className="group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <button
                      onClick={() => onOpenInk(ink.id)}
                      className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate text-left"
                    >
                      <span className="text-zinc-400 font-mono-num">{idx + 1}.</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ink.hex_color }}
                      />
                      <span className="truncate">{ink.label}</span>
                    </button>
                    <span className="font-mono-num font-semibold text-zinc-700 dark:text-zinc-300 shrink-0 ml-2">
                      {ink[rankMetric]}
                      {rankMetric === 'total_days_inked' ? 'd' : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: ink.hex_color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Nib Preference + Bench Warmers (Neglected Collection) + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Nib Distribution */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Nib Size Usage Share
          </h3>
          <p className="text-xs text-zinc-500 mb-4">Total fills across nib grinds</p>
          <div className="space-y-2.5">
            {data.nib_distribution.map((n) => (
              <div
                key={n.nib_size}
                className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 font-mono-num font-semibold">
                    {n.nib_size}
                  </span>
                  <span className="text-zinc-500">{n.pens} pens owned</span>
                </div>
                <span className="font-mono-num font-semibold text-zinc-900 dark:text-zinc-100">
                  {n.fills} fills
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bench Warmers / Rotation Candidates */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Ready for Next Rotation
          </h3>
          <p className="text-xs text-zinc-500 mb-3">
            Uninked pens &amp; inks longest waiting on the shelf
          </p>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Longest Idle Pens
              </div>
              <div className="space-y-1.5">
                {data.neglected_pens.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <button
                      onClick={() => onOpenPen(p.id)}
                      className="text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 truncate text-left"
                    >
                      {p.label}{' '}
                      <span className="text-zinc-400 font-mono-num">[{p.nib_size}]</span>
                    </button>
                    <span className="font-mono-num text-zinc-400 shrink-0 ml-2">
                      {p.days_since_used === null ? 'Never inked' : `${p.days_since_used}d idle`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Longest Idle Inks
              </div>
              <div className="space-y-1.5">
                {data.neglected_inks.slice(0, 4).map((i) => (
                  <div key={i.id} className="flex items-center justify-between">
                    <button
                      onClick={() => onOpenInk(i.id)}
                      className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 truncate text-left"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: i.hex_color }}
                      />
                      <span className="truncate">{i.label}</span>
                    </button>
                    <span className="font-mono-num text-zinc-400 shrink-0 ml-2">
                      {i.days_since_used === null ? 'Untested' : `${i.days_since_used}d ago`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Lifecycle Log */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Recent Lifecycle Events
          </h3>
          <p className="text-xs text-zinc-500 mb-3">Latest ink-ups, refills, and cleanings</p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
            {data.recent_events.slice(0, 8).map((ev) => (
              <div
                key={ev.id}
                className="flex items-start justify-between gap-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800/70 last:border-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        ev.event_type === 'inked'
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                          : ev.event_type === 'refilled'
                            ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                      }`}
                    >
                      {ev.event_type}
                    </span>
                    <button
                      onClick={() => onOpenPen(ev.pen_id)}
                      className="font-medium text-zinc-800 dark:text-zinc-200 hover:underline truncate"
                    >
                      {ev.pen_label}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500 mt-0.5 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ev.ink_hex }}
                    />
                    <button onClick={() => onOpenInk(ev.ink_id)} className="hover:underline truncate">
                      {ev.ink_label}
                    </button>
                  </div>
                </div>
                <span className="font-mono-num text-[11px] text-zinc-400 shrink-0">
                  {ev.event_date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sample quick preview modal */}
      {previewSampleUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          onClick={() => setPreviewSampleUrl(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{previewSampleUrl.title}</span>
              <button
                onClick={() => setPreviewSampleUrl(null)}
                className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="rounded-lg overflow-hidden border border-zinc-200 bg-[#fcfaf4] flex justify-center">
              <img
                src={previewSampleUrl.url}
                alt={previewSampleUrl.title}
                className="max-h-[60vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Lifecycle quick action modal */}
      {lifecycleModal && (
        <LifecycleActionModal
          mode={lifecycleModal.mode}
          sessionId={lifecycleModal.row.session_id}
          penLabel={`${lifecycleModal.row.pen_brand} ${lifecycleModal.row.pen_model}${
            lifecycleModal.row.pen_color ? ` (${lifecycleModal.row.pen_color})` : ''
          } · ${lifecycleModal.row.nib_size}`}
          inkLabel={`${lifecycleModal.row.ink_brand} ${lifecycleModal.row.ink_name}`}
          inkHex={lifecycleModal.row.ink_hex}
          onClose={() => setLifecycleModal(null)}
          onCompleted={onRefresh}
        />
      )}
    </div>
  );
};
