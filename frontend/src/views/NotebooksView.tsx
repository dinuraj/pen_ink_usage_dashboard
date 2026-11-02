import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Edit3,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { NotebookOut } from '../types';
import {
  CompanyFilterCombobox,
  matchesRatingFilter,
  RatingFilterSelect,
  type RatingFilterValue,
  SortableTh,
  StarRating,
} from '../components/FilterSortControls';

interface Props {
  notebooks: NotebookOut[];
  onRefresh: () => void;
}

const BINDING_TYPES = [
  'Thread-Bound',
  'Stitched / Stapled',
  'Spiral / Wire-O',
  'Disc-Bound',
  'Ring-Bound',
  'Perfect Bound (Glued)',
  'Softcover',
  'Hardcover',
  'Traveler’s Insert',
  'Loose Leaf',
];
const SIZES = ['A4', 'A5', 'B5', 'B6', 'A6', 'A7', 'TN Regular', 'TN Passport', 'Pocket', 'Letter', 'Custom'];
const RULINGS = ['Dot Grid', 'Ruled', 'Blank', 'Grid', 'French Ruled', 'Planner', 'Mixed'];
const USAGE_TYPES = [
  'Daily Journal',
  'Ink Testing / Swatches',
  'Commonplace Book',
  'Work Notes',
  'Planner',
  'Sketching',
  'Calligraphy Practice',
  'Letter Writing',
  'Study Notes',
  'Travel Journal',
  'Other',
];
const PAPER_TYPES = [
  'Tomoe River',
  'Midori MD',
  'Clairefontaine',
  'Rhodia',
  'Cosmo Air Light',
  'Kokuyo',
  'Life Bank',
  'Leuchtturm',
  'Apica',
  'Regalia',
  'Other',
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  in_use: {
    label: 'In Use',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/70',
  },
  stash: {
    label: 'Unused Stash',
    cls: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  },
  finished: {
    label: 'Finished',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
  },
};
const STATUS_RANK: Record<string, number> = { in_use: 1, stash: 2, finished: 3 };

type SortKey =
  | 'brand'
  | 'name'
  | 'size'
  | 'page_count'
  | 'ruling'
  | 'paper_gsm'
  | 'usage_type'
  | 'status'
  | 'start_date'
  | 'completion_pct'
  | 'rating';

const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = {
  brand: 'asc',
  name: 'asc',
  size: 'asc',
  page_count: 'desc',
  ruling: 'asc',
  paper_gsm: 'desc',
  usage_type: 'asc',
  status: 'asc',
  start_date: 'desc',
  completion_pct: 'desc',
  rating: 'desc',
};

type FormState = {
  brand: string;
  name: string;
  page_count: string;
  binding_type: string;
  size: string;
  ruling: string;
  paper_type: string;
  paper_gsm: string;
  usage_type: string;
  status: string;
  start_date: string;
  end_date: string;
  completion_pct: number;
  rating: number | null;
  custom_notes: string;
};

const EMPTY_FORM: FormState = {
  brand: '',
  name: '',
  page_count: '',
  binding_type: 'Thread-Bound',
  size: 'A5',
  ruling: 'Dot Grid',
  paper_type: '',
  paper_gsm: '',
  usage_type: 'Daily Journal',
  status: 'in_use',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  completion_pct: 0,
  rating: null,
  custom_notes: '',
};

function toForm(nb: NotebookOut): FormState {
  return {
    brand: nb.brand,
    name: nb.name,
    page_count: nb.page_count ? String(nb.page_count) : '',
    binding_type: nb.binding_type,
    size: nb.size,
    ruling: nb.ruling,
    paper_type: nb.paper_type,
    paper_gsm: nb.paper_gsm ? String(nb.paper_gsm) : '',
    usage_type: nb.usage_type,
    status: nb.status,
    start_date: nb.start_date ?? '',
    end_date: nb.end_date ?? '',
    completion_pct: nb.completion_pct,
    rating: nb.rating,
    custom_notes: nb.custom_notes,
  };
}

const inputCls =
  'w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm';
const labelCls = 'block font-medium text-zinc-600 dark:text-zinc-400 mb-1';
const selectCls =
  'px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950';

const CompletionBar: React.FC<{
  value: number;
  onChange?: (next: number) => void;
}> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const color = value >= 100 ? 'bg-emerald-500' : value >= 50 ? 'bg-indigo-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="w-20 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      {editing && onChange ? (
        <input
          type="number"
          min={0}
          max={100}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(Math.max(0, Math.min(100, Number(e.target.value))))}
          onBlur={() => {
            setEditing(false);
            if (draft !== value) onChange(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="w-14 px-1.5 py-0.5 rounded border border-indigo-300 bg-white dark:bg-zinc-950 text-[11px] font-mono-num"
        />
      ) : (
        <button
          type="button"
          disabled={!onChange}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="text-[11px] font-mono-num text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 hover:underline"
          title="Click to update completion %"
        >
          {value}%
        </button>
      )}
    </div>
  );
};

export const NotebooksView: React.FC<Props> = ({ notebooks, onRefresh }) => {
  const { isAdmin } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyExact, setCompanyExact] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_use' | 'stash' | 'finished'>('all');
  const [usageFilter, setUsageFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState<RatingFilterValue>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const companyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notebooks) counts.set(n.brand, (counts.get(n.brand) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [notebooks]);

  const usageOptions = useMemo(
    () => Array.from(new Set(notebooks.map((n) => n.usage_type).filter(Boolean))).sort(),
    [notebooks],
  );
  const sizeOptions = useMemo(
    () => Array.from(new Set(notebooks.map((n) => n.size).filter(Boolean))).sort(),
    [notebooks],
  );

  const kpis = useMemo(
    () => ({
      total: notebooks.length,
      inUse: notebooks.filter((n) => n.status === 'in_use').length,
      stash: notebooks.filter((n) => n.status === 'stash').length,
      finished: notebooks.filter((n) => n.status === 'finished').length,
      pages: notebooks.reduce((acc, n) => acc + (n.page_count ?? 0), 0),
    }),
    [notebooks],
  );

  const hasActiveFilters =
    Boolean(companyFilter.trim()) ||
    Boolean(nameQuery.trim()) ||
    statusFilter !== 'all' ||
    usageFilter !== 'all' ||
    sizeFilter !== 'all' ||
    ratingFilter !== 'all';

  const resetFilters = () => {
    setCompanyFilter('');
    setCompanyExact(false);
    setNameQuery('');
    setStatusFilter('all');
    setUsageFilter('all');
    setSizeFilter('all');
    setRatingFilter('all');
  };

  const handleSort = (key: string) => {
    const k = key as SortKey;
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(DEFAULT_DIR[k]);
    }
  };

  const rows = useMemo(() => {
    const comp = companyFilter.trim().toLowerCase();
    const needle = nameQuery.trim().toLowerCase();
    const filtered = notebooks.filter((n) => {
      if (comp) {
        if (companyExact ? n.brand.toLowerCase() !== comp : !n.brand.toLowerCase().includes(comp))
          return false;
      }
      if (needle) {
        const hay = `${n.name} ${n.paper_type} ${n.ruling} ${n.custom_notes}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (usageFilter !== 'all' && n.usage_type !== usageFilter) return false;
      if (sizeFilter !== 'all' && n.size !== sizeFilter) return false;
      if (!matchesRatingFilter(n.rating, ratingFilter)) return false;
      return true;
    });

    const mult = sortDir === 'asc' ? 1 : -1;
    const tie = (a: NotebookOut, b: NotebookOut) =>
      a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
    const nullsLast = (
      a: NotebookOut,
      b: NotebookOut,
      av: number | string | null | undefined,
      bv: number | string | null | undefined,
    ) => {
      const aN = av === null || av === undefined || av === '';
      const bN = bv === null || bv === undefined || bv === '';
      if (aN !== bN) return aN ? 1 : -1;
      if (aN && bN) return tie(a, b);
      const diff =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return mult * diff || tie(a, b);
    };

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'brand':
          return mult * a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
        case 'name':
          return mult * a.name.localeCompare(b.name) || tie(a, b);
        case 'size':
          return mult * a.size.localeCompare(b.size) || tie(a, b);
        case 'page_count':
          return nullsLast(a, b, a.page_count, b.page_count);
        case 'ruling':
          return mult * a.ruling.localeCompare(b.ruling) || tie(a, b);
        case 'paper_gsm':
          return nullsLast(a, b, a.paper_gsm, b.paper_gsm);
        case 'usage_type':
          return mult * a.usage_type.localeCompare(b.usage_type) || tie(a, b);
        case 'status':
          return (
            mult * ((STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)) || tie(a, b)
          );
        case 'start_date':
          return nullsLast(a, b, a.start_date, b.start_date);
        case 'completion_pct':
          return mult * (a.completion_pct - b.completion_pct) || tie(a, b);
        case 'rating':
          return nullsLast(a, b, a.rating, b.rating);
        default:
          return tie(a, b);
      }
    });
  }, [
    notebooks,
    companyFilter,
    companyExact,
    nameQuery,
    statusFilter,
    usageFilter,
    sizeFilter,
    ratingFilter,
    sortKey,
    sortDir,
  ]);

  const quickUpdate = async (id: number, patch: Partial<NotebookOut>) => {
    await api.updateNotebook(id, patch);
    onRefresh();
  };

  const handleCompletionChange = async (nb: NotebookOut, pct: number) => {
    const patch: Partial<NotebookOut> = { completion_pct: pct };
    if (pct >= 100 && nb.status !== 'finished') {
      patch.status = 'finished';
      if (!nb.end_date) patch.end_date = new Date().toISOString().slice(0, 10);
    } else if (pct > 0 && nb.status === 'stash') {
      patch.status = 'in_use';
      if (!nb.start_date) patch.start_date = new Date().toISOString().slice(0, 10);
    }
    await quickUpdate(nb.id, patch);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, start_date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const openEdit = (nb: NotebookOut) => {
    setEditingId(nb.id);
    setForm(toForm(nb));
    setModalOpen(true);
  };

  const handleDelete = async (nb: NotebookOut) => {
    if (!window.confirm(`Delete notebook "${nb.brand} ${nb.name}"?`)) return;
    await api.deleteNotebook(nb.id);
    onRefresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<NotebookOut> = {
        brand: form.brand.trim(),
        name: form.name.trim(),
        page_count: form.page_count ? Number(form.page_count) : null,
        binding_type: form.binding_type,
        size: form.size,
        ruling: form.ruling,
        paper_type: form.paper_type.trim(),
        paper_gsm: form.paper_gsm ? Number(form.paper_gsm) : null,
        usage_type: form.usage_type,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        completion_pct: form.completion_pct,
        rating: form.rating,
        custom_notes: form.custom_notes,
      };
      if (editingId) await api.updateNotebook(editingId, payload);
      else await api.createNotebook(payload);
      setModalOpen(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const meta = STATUS_META[status] ?? { label: status, cls: STATUS_META.stash.cls };
    return (
      <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${meta.cls}`}>
        {meta.label}
      </span>
    );
  };

  const thProps = { activeKey: sortKey, direction: sortDir, onSort: handleSort };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Notebooks &amp; Paper
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {hasActiveFilters
              ? `Showing ${rows.length} of ${notebooks.length} notebooks`
              : `${notebooks.length} notebooks across ${companyOptions.length} companies`}{' '}
            · Click any column header to sort · Click % or stars to update inline
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Notebook
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(
          [
            ['Total Notebooks', kpis.total, 'all'],
            ['Currently In Use', kpis.inUse, 'in_use'],
            ['Unused Stash', kpis.stash, 'stash'],
            ['Finished', kpis.finished, 'finished'],
          ] as const
        ).map(([label, val, key]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`text-left rounded-xl border p-3 transition ${
              statusFilter === key
                ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300'
            }`}
          >
            <div className="text-[11px] text-zinc-500">{label}</div>
            <div className="text-xl font-semibold font-mono-num">{val}</div>
          </button>
        ))}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <div className="text-[11px] text-zinc-500">Total Pages</div>
          <div className="text-xl font-semibold font-mono-num">{kpis.pages.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <CompanyFilterCombobox
            value={companyFilter}
            exact={companyExact}
            onChange={(v, ex) => {
              setCompanyFilter(v);
              setCompanyExact(ex);
            }}
            companies={companyOptions}
            placeholder={`Company (${companyOptions.length})`}
            allLabel="All Companies"
          />
          <div className="relative min-w-[180px] flex-1 max-w-[230px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Book name, paper, notes..."
              className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border focus:outline-none ${
                nameQuery
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/30'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
              }`}
            />
            {nameQuery && (
              <button
                type="button"
                onClick={() => setNameQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className={selectCls}
          >
            <option value="all">All Statuses</option>
            <option value="in_use">In Use</option>
            <option value="stash">Unused Stash</option>
            <option value="finished">Finished</option>
          </select>
          <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value)} className={selectCls}>
            <option value="all">All Usage Types</option>
            {usageOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} className={selectCls}>
            <option value="all">All Sizes</option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <RatingFilterSelect value={ratingFilter} onChange={setRatingFilter} />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'}`}
            title="Table"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'}`}
            title="Cards"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {notebooks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-14 text-center space-y-3">
          <BookOpen className="w-8 h-8 mx-auto text-zinc-300" />
          <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No notebooks yet</div>
          <p className="text-xs text-zinc-500">Start tracking your journals, paper and completion progress.</p>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
          >
            <Plus className="w-3.5 h-3.5" />
            Add your first notebook
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <SortableTh label="Company" sortKey="brand" {...thProps} className="pl-4" />
                  <SortableTh label="Book Name" sortKey="name" {...thProps} />
                  <SortableTh label="Size / Binding" sortKey="size" {...thProps} />
                  <SortableTh label="Pages" sortKey="page_count" {...thProps} align="right" />
                  <SortableTh label="Ruling" sortKey="ruling" {...thProps} />
                  <SortableTh label="Paper / GSM" sortKey="paper_gsm" {...thProps} />
                  <SortableTh label="Usage Type" sortKey="usage_type" {...thProps} />
                  <SortableTh label="Status" sortKey="status" {...thProps} />
                  <SortableTh label="Start / End" sortKey="start_date" {...thProps} />
                  <SortableTh label="Completion" sortKey="completion_pct" {...thProps} />
                  <SortableTh label="Rating" sortKey="rating" {...thProps} />
                  {isAdmin && <th className="py-2.5 pl-3 pr-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {rows.map((nb) => (
                  <tr key={nb.id} className="hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 pl-4 pr-3 font-medium text-zinc-700 dark:text-zinc-300">{nb.brand}</td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      {nb.name}
                      {nb.custom_notes && (
                        <div className="text-[11px] font-normal text-zinc-400 truncate max-w-[220px]" title={nb.custom_notes}>
                          {nb.custom_notes}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num font-medium">{nb.size}</span>
                      <span className="ml-1.5 text-[11px] text-zinc-400">{nb.binding_type}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">{nb.page_count ?? '—'}</td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">{nb.ruling}</td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {nb.paper_type || '—'}
                      {nb.paper_gsm ? <span className="ml-1 font-mono-num text-zinc-400">{nb.paper_gsm}gsm</span> : null}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">{nb.usage_type}</td>
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <select
                          value={nb.status}
                          onChange={(e) => void quickUpdate(nb.id, { status: e.target.value })}
                          className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-[11px] font-medium cursor-pointer"
                        >
                          <option value="in_use">In Use</option>
                          <option value="stash">Stash</option>
                          <option value="finished">Finished</option>
                        </select>
                      ) : (
                        <StatusBadge status={nb.status} />
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono-num text-zinc-500 whitespace-nowrap">
                      {nb.start_date || '—'}
                      {nb.end_date && <div className="text-[10px] text-zinc-400">→ {nb.end_date}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      <CompletionBar
                        value={nb.completion_pct}
                        onChange={isAdmin ? (v) => void handleCompletionChange(nb, v) : undefined}
                      />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StarRating
                        value={nb.rating}
                        onChange={isAdmin ? (r) => quickUpdate(nb.id, { rating: r }) : undefined}
                      />
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(nb)}
                          className="p-1 rounded text-zinc-400 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          title="Edit notebook"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDelete(nb)}
                          className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          title="Delete notebook"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-zinc-400">
                      No notebooks match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((nb) => (
            <div
              key={nb.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{nb.brand}</div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{nb.name}</h3>
                  <p className="text-xs text-zinc-500">
                    {nb.size} · {nb.binding_type} · {nb.ruling}
                    {nb.page_count ? ` · ${nb.page_count}p` : ''}
                  </p>
                  {(nb.paper_type || nb.paper_gsm) && (
                    <p className="text-[11px] text-zinc-400">
                      {nb.paper_type}
                      {nb.paper_gsm ? ` ${nb.paper_gsm}gsm` : ''}
                    </p>
                  )}
                </div>
                <StatusBadge status={nb.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <CompletionBar value={nb.completion_pct} onChange={(v) => void handleCompletionChange(nb, v)} />
                <StarRating value={nb.rating} onChange={(r) => quickUpdate(nb.id, { rating: r })} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500">
                <span>
                  {nb.usage_type} · {nb.start_date || 'Not started'}
                  {nb.end_date ? ` → ${nb.end_date}` : ''}
                </span>
                {isAdmin && (
                  <span className="flex items-center gap-1">
                    <button onClick={() => openEdit(nb)} className="p-1 rounded hover:text-indigo-600" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => void handleDelete(nb)} className="p-1 rounded hover:text-red-600" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{editingId ? 'Edit Notebook' : 'Add Notebook'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <datalist id="nb-binding">{BINDING_TYPES.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="nb-size">{SIZES.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="nb-ruling">{RULINGS.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="nb-usage">{USAGE_TYPES.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="nb-paper">{PAPER_TYPES.map((v) => <option key={v} value={v} />)}</datalist>
            <datalist id="nb-brand">{companyOptions.map((c) => <option key={c.name} value={c.name} />)}</datalist>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className={labelCls}>Company *</label>
                <input required list="nb-brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g., Leuchtturm1917, Midori" className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Book Name *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Hobonichi Techo Cousin 2026" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Page Count</label>
                <input type="number" min={1} value={form.page_count} onChange={(e) => setForm({ ...form, page_count: e.target.value })} className={`${inputCls} font-mono-num`} />
              </div>
              <div>
                <label className={labelCls}>Binding Type</label>
                <input list="nb-binding" value={form.binding_type} onChange={(e) => setForm({ ...form, binding_type: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Size</label>
                <input list="nb-size" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ruling</label>
                <input list="nb-ruling" value={form.ruling} onChange={(e) => setForm({ ...form, ruling: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Paper Type</label>
                <input list="nb-paper" value={form.paper_type} onChange={(e) => setForm({ ...form, paper_type: e.target.value })} placeholder="e.g., Tomoe River" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Paper Weight (gsm)</label>
                <input type="number" min={20} max={600} value={form.paper_gsm} onChange={(e) => setForm({ ...form, paper_gsm: e.target.value })} placeholder="e.g., 52, 68, 80" className={`${inputCls} font-mono-num`} />
              </div>
              <div>
                <label className={labelCls}>Usage Type</label>
                <input list="nb-usage" value={form.usage_type} onChange={(e) => setForm({ ...form, usage_type: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  <option value="in_use">In Use</option>
                  <option value="stash">Unused Stash</option>
                  <option value="finished">Finished</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Start Date</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Completion Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className={labelCls}>Completion: {form.completion_pct}%</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.completion_pct}
                  onChange={(e) => setForm({ ...form, completion_pct: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </div>
              <div className="col-span-2 md:col-span-3 flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 px-3 py-2">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">Rating</span>
                <StarRating value={form.rating} onChange={(r) => setForm({ ...form, rating: r })} size="md" showLabel />
              </div>
              <div className="col-span-2 md:col-span-3">
                <label className={labelCls}>Notes (fountain pen friendliness, ghosting, bleed, sheen, dry time...)</label>
                <textarea rows={3} value={form.custom_notes} onChange={(e) => setForm({ ...form, custom_notes: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Notebook'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
