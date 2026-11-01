import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { InkOut } from '../types';
import {
  CompanyFilterCombobox,
  matchesRatingFilter,
  RatingFilterSelect,
  type RatingFilterValue,
  SortableTh,
  StarRating,
} from '../components/FilterSortControls';

interface Props {
  inks: InkOut[];
  onRefresh: () => void;
  onSelectInk: (id: number) => void;
}

type InkSortKey =
  | 'brand'
  | 'name'
  | 'rating'
  | 'color_family'
  | 'format'
  | 'volume_ml'
  | 'remaining_level'
  | 'total_fills'
  | 'total_days_inked'
  | 'sample_count'
  | 'has_review';

const INK_SORT_OPTIONS: Array<{ key: InkSortKey; label: string; defaultDir: 'asc' | 'desc' }> = [
  { key: 'brand', label: 'Ink Company', defaultDir: 'asc' },
  { key: 'name', label: 'Ink Name', defaultDir: 'asc' },
  { key: 'rating', label: 'Rating (★)', defaultDir: 'desc' },
  { key: 'color_family', label: 'Color Family', defaultDir: 'asc' },
  { key: 'format', label: 'Format', defaultDir: 'asc' },
  { key: 'volume_ml', label: 'Size (ml)', defaultDir: 'desc' },
  { key: 'remaining_level', label: 'Remaining Level', defaultDir: 'desc' },
  { key: 'total_fills', label: 'Fills', defaultDir: 'desc' },
  { key: 'total_days_inked', label: 'Total Days', defaultDir: 'desc' },
  { key: 'sample_count', label: 'Samples', defaultDir: 'desc' },
  { key: 'has_review', label: 'Review Link', defaultDir: 'desc' },
];

const COLOR_FAMILIES = [
  'Blue',
  'Teal',
  'Green',
  'Red',
  'Purple',
  'Brown',
  'Orange',
  'Black',
  'Grey',
  'Pink',
];

const LEVEL_LABELS: Record<string, string> = {
  full: 'Full (100%)',
  '75_pct': '75%',
  half: 'Half (50%)',
  low: 'Low (<25%)',
  empty: 'Empty',
};

const LEVEL_PCT: Record<string, number> = {
  full: 100,
  '75_pct': 75,
  half: 50,
  low: 20,
  empty: 0,
};

const FORMAT_RANK: Record<string, number> = {
  bottle: 1,
  sample_vial: 2,
  cartridge: 3,
};

export const InksView: React.FC<Props> = ({ inks, onRefresh, onSelectInk }) => {
  // Separate Ink Company & Ink Name filters + facets
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyExact, setCompanyExact] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [colorFilter, setColorFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState<RatingFilterValue>('all');

  // Column sorting
  const [sortKey, setSortKey] = useState<InkSortKey>('brand');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [viewMode, setViewMode] = useState<'table' | 'swatches'>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [updatingFormatId, setUpdatingFormatId] = useState<number | null>(null);

  // Add Ink form state
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [colorFamily, setColorFamily] = useState('Blue');
  const [hexColor, setHexColor] = useState('#1d4ed8');
  const [format, setFormat] = useState('bottle');
  const [volumeMl, setVolumeMl] = useState(50);
  const [quantity, setQuantity] = useState(1);
  const [remainingLevel, setRemainingLevel] = useState('full');
  const [newInkRating, setNewInkRating] = useState<number | null>(null);
  const [moiUrl, setMoiUrl] = useState('');
  const [tags, setTags] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const companyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of inks) {
      counts.set(i.brand, (counts.get(i.brand) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([cname, count]) => ({ name: cname, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inks]);

  const handleSort = (key: string) => {
    const typedKey = key as InkSortKey;
    if (sortKey === typedKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      const meta = INK_SORT_OPTIONS.find((o) => o.key === typedKey);
      setSortKey(typedKey);
      setSortDir(meta?.defaultDir ?? 'asc');
    }
  };

  const hasActiveFilters =
    Boolean(companyFilter.trim()) ||
    Boolean(nameQuery.trim()) ||
    colorFilter !== 'all' ||
    formatFilter !== 'all' ||
    levelFilter !== 'all' ||
    ratingFilter !== 'all';

  const resetFilters = () => {
    setCompanyFilter('');
    setCompanyExact(false);
    setNameQuery('');
    setColorFilter('all');
    setFormatFilter('all');
    setLevelFilter('all');
    setRatingFilter('all');
  };

  const handleQuickRatingChange = async (inkId: number, nextRating: number | null) => {
    await api.updateInk(inkId, { rating: nextRating });
    onRefresh();
  };

  const handleQuickFormatChange = async (ink: InkOut, nextFormat: string) => {
    if (nextFormat === ink.format) return;
    setUpdatingFormatId(ink.id);
    try {
      const patch: Record<string, unknown> = { format: nextFormat };
      if (nextFormat === 'sample_vial' && ink.volume_ml >= 15) {
        patch.volume_ml = 4;
      } else if (nextFormat === 'cartridge' && ink.volume_ml >= 15) {
        patch.volume_ml = 1;
      } else if (nextFormat === 'bottle' && ink.volume_ml <= 10) {
        patch.volume_ml = 50;
      }
      await api.updateInk(ink.id, patch);
      onRefresh();
    } finally {
      setUpdatingFormatId(null);
    }
  };

  const sortedAndFiltered = useMemo(() => {
    const compNeedle = companyFilter.trim().toLowerCase();
    const nameNeedle = nameQuery.trim().toLowerCase();

    const filtered = inks.filter((i) => {
      if (compNeedle) {
        if (companyExact) {
          if (i.brand.toLowerCase() !== compNeedle) return false;
        } else if (!i.brand.toLowerCase().includes(compNeedle)) {
          return false;
        }
      }
      if (nameNeedle) {
        const hay = `${i.name} ${i.properties_tags} ${i.color_family}`.toLowerCase();
        if (!hay.includes(nameNeedle)) return false;
      }
      if (colorFilter !== 'all' && i.color_family !== colorFilter) return false;
      if (formatFilter !== 'all' && i.format !== formatFilter) return false;
      if (levelFilter !== 'all' && i.remaining_level !== levelFilter) return false;
      if (!matchesRatingFilter(i.rating, ratingFilter)) return false;
      return true;
    });

    const mult = sortDir === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const tieBreak = () => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);

      switch (sortKey) {
        case 'brand':
          return mult * a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
        case 'name':
          return mult * a.name.localeCompare(b.name) || tieBreak();
        case 'rating': {
          const aNull = !a.rating;
          const bNull = !b.rating;
          if (aNull !== bNull) return aNull ? 1 : -1;
          return mult * ((a.rating ?? 0) - (b.rating ?? 0)) || tieBreak();
        }
        case 'color_family':
          return mult * a.color_family.localeCompare(b.color_family) || tieBreak();
        case 'format': {
          const rankDiff = (FORMAT_RANK[a.format] ?? 9) - (FORMAT_RANK[b.format] ?? 9);
          if (rankDiff !== 0) return mult * rankDiff;
          return mult * (a.volume_ml - b.volume_ml) || tieBreak();
        }
        case 'volume_ml': {
          const totalA = a.volume_ml * (a.quantity || 1);
          const totalB = b.volume_ml * (b.quantity || 1);
          return mult * (totalA - totalB) || tieBreak();
        }
        case 'remaining_level': {
          const pctA = LEVEL_PCT[a.remaining_level] ?? 50;
          const pctB = LEVEL_PCT[b.remaining_level] ?? 50;
          return mult * (pctA - pctB) || tieBreak();
        }
        case 'total_fills': {
          const fillsA = a.times_inked + a.total_refills;
          const fillsB = b.times_inked + b.total_refills;
          return mult * (fillsA - fillsB) || tieBreak();
        }
        case 'total_days_inked':
          return mult * (a.total_days_inked - b.total_days_inked) || tieBreak();
        case 'sample_count':
          return mult * (a.sample_count - b.sample_count) || tieBreak();
        case 'has_review': {
          const hasA = Boolean(a.mountain_of_ink_url.trim()) ? 1 : 0;
          const hasB = Boolean(b.mountain_of_ink_url.trim()) ? 1 : 0;
          return mult * (hasA - hasB) || tieBreak();
        }
        default:
          return tieBreak();
      }
    });
  }, [
    inks,
    companyFilter,
    companyExact,
    nameQuery,
    colorFilter,
    formatFilter,
    levelFilter,
    ratingFilter,
    sortKey,
    sortDir,
  ]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createInk({
        brand,
        name,
        color_family: colorFamily,
        hex_color: hexColor,
        format,
        volume_ml: volumeMl,
        quantity,
        remaining_level: remainingLevel,
        rating: newInkRating,
        mountain_of_ink_url: moiUrl,
        properties_tags: tags,
        custom_notes: customNotes,
      });
      setBrand('');
      setName('');
      setQuantity(1);
      setNewInkRating(null);
      setMoiUrl('');
      setTags('');
      setCustomNotes('');
      setShowAddModal(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const moiSearchHref = `https://www.google.com/search?q=${encodeURIComponent(
    `site:mountainofink.com ${brand} ${name}`.trim(),
  )}`;

  const totalBottles = inks
    .filter((i) => i.format === 'bottle')
    .reduce((acc, i) => acc + (i.quantity || 1), 0);
  const totalSampleVials = inks
    .filter((i) => i.format === 'sample_vial')
    .reduce((acc, i) => acc + (i.quantity || 1), 0);
  const totalCartridges = inks
    .filter((i) => i.format === 'cartridge')
    .reduce((acc, i) => acc + (i.quantity || 1), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Ink Library &amp; Inventory
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {hasActiveFilters
              ? `Showing ${sortedAndFiltered.length} of ${inks.length} inks`
              : `${inks.length} inks across ${companyOptions.length} companies`}{' '}
            · {totalBottles} bottles · {totalSampleVials} sample vials
            {totalCartridges > 0 ? ` · ${totalCartridges} cartridges` : ''} · Click any column
            header to sort or change Format inline
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Ink to Inventory
        </button>
      </div>

      {/* Separate Company & Name Filters + Sort Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Filter 1: Ink Company */}
          <CompanyFilterCombobox
            value={companyFilter}
            exact={companyExact}
            onChange={(val, isExact) => {
              setCompanyFilter(val);
              setCompanyExact(isExact);
            }}
            companies={companyOptions}
            placeholder={`Ink Company (${companyOptions.length})`}
            allLabel="All Ink Companies"
          />

          {/* Filter 2: Ink Name / Properties */}
          <div className="relative min-w-[190px] flex-1 max-w-[240px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Filter ink name or tags..."
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
                title="Clear ink name filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          >
            <option value="all">All Colors</option>
            {COLOR_FAMILIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          >
            <option value="all">All Formats</option>
            <option value="bottle">Bottles</option>
            <option value="sample_vial">Sample Vials</option>
            <option value="cartridge">Cartridges</option>
          </select>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          >
            <option value="all">All Levels</option>
            <option value="full">Full (100%)</option>
            <option value="75_pct">75%</option>
            <option value="half">Half (50%)</option>
            <option value="low">Low (&lt;25%)</option>
            <option value="empty">Empty</option>
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

        {/* Sort selector + View mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            <select
              value={sortKey}
              onChange={(e) => {
                const nextKey = e.target.value as InkSortKey;
                const meta = INK_SORT_OPTIONS.find((o) => o.key === nextKey);
                setSortKey(nextKey);
                setSortDir(meta?.defaultDir ?? 'asc');
              }}
              aria-label="Sort inks by"
              className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
            >
              {INK_SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={sortDir === 'asc' ? 'Ascending (click for Descending)' : 'Descending (click for Ascending)'}
            >
              {sortDir === 'asc' ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded ${
                viewMode === 'table' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'
              }`}
              title="Compact Inventory Table"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('swatches')}
              className={`p-1.5 rounded ${
                viewMode === 'swatches' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'
              }`}
              title="Color Swatch Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <SortableTh
                    label="Company"
                    sortKey="brand"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    className="pl-4"
                  />
                  <SortableTh
                    label="Ink Name"
                    sortKey="name"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Rating"
                    sortKey="rating"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Color"
                    sortKey="color_family"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Format"
                    sortKey="format"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Size"
                    sortKey="volume_ml"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Remaining Level"
                    sortKey="remaining_level"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Fills"
                    sortKey="total_fills"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Days"
                    sortKey="total_days_inked"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Samples"
                    sortKey="sample_count"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Review Link"
                    sortKey="has_review"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                    className="pr-4"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {sortedAndFiltered.map((ink) => {
                  const pct = LEVEL_PCT[ink.remaining_level] ?? 50;
                  return (
                    <tr
                      key={ink.id}
                      onClick={() => onSelectInk(ink.id)}
                      className="cursor-pointer hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 pl-4 pr-3 font-medium text-zinc-700 dark:text-zinc-300">
                        {ink.brand}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-4 h-4 rounded-md shrink-0 ring-1 ring-black/15 dark:ring-white/20"
                            style={{ backgroundColor: ink.hex_color }}
                          />
                          <div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {ink.name}
                              {ink.currently_in_pens_count > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-medium">
                                  In {ink.currently_in_pens_count} pen
                                  {ink.currently_in_pens_count > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {ink.properties_tags && (
                              <div className="text-[11px] text-zinc-400">{ink.properties_tags}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <StarRating
                          value={ink.rating}
                          onChange={(next) => handleQuickRatingChange(ink.id, next)}
                        />
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                        {ink.color_family}
                      </td>
                      <td
                        className="py-2.5 px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={ink.format}
                          disabled={updatingFormatId === ink.id}
                          onChange={(e) => void handleQuickFormatChange(ink, e.target.value)}
                          aria-label={`Container format for ${ink.brand} ${ink.name}`}
                          className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 hover:border-indigo-400 focus:outline-none cursor-pointer"
                        >
                          <option value="bottle">Bottle</option>
                          <option value="sample_vial">Sample Vial</option>
                          <option value="cartridge">Cartridge</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {ink.quantity > 1 ? `${ink.quantity} × ` : ''}
                        {ink.volume_ml}ml
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                pct <= 20 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono-num text-zinc-600 dark:text-zinc-400">
                            {LEVEL_LABELS[ink.remaining_level] || ink.remaining_level}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-medium">
                        {ink.times_inked + ink.total_refills}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-zinc-600 dark:text-zinc-400">
                        {ink.total_days_inked}d
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-zinc-500">
                        {ink.sample_count}
                      </td>
                      <td
                        className="py-2.5 pl-3 pr-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ink.mountain_of_ink_url ? (
                          <a
                            href={ink.mountain_of_ink_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
                          >
                            MoI
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedAndFiltered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-zinc-400">
                      No inks match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedAndFiltered.map((ink) => (
            <div
              key={ink.id}
              onClick={() => onSelectInk(ink.id)}
              className="cursor-pointer group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-indigo-400 transition"
            >
              <div
                className="h-24 p-3 flex items-end justify-between gap-2"
                style={{ backgroundColor: ink.hex_color }}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <select
                    value={ink.format}
                    disabled={updatingFormatId === ink.id}
                    onChange={(e) => void handleQuickFormatChange(ink, e.target.value)}
                    aria-label={`Container format for ${ink.brand} ${ink.name}`}
                    className="px-2 py-0.5 rounded text-[10px] font-mono-num bg-black/55 text-white backdrop-blur-xs border border-white/20 cursor-pointer"
                  >
                    <option value="bottle" className="text-zinc-900 bg-white">
                      {ink.volume_ml}ml Bottle
                    </option>
                    <option value="sample_vial" className="text-zinc-900 bg-white">
                      {ink.volume_ml}ml Sample
                    </option>
                    <option value="cartridge" className="text-zinc-900 bg-white">
                      {ink.volume_ml}ml Cartridge
                    </option>
                  </select>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono-num bg-white/90 text-zinc-900 font-semibold">
                  {LEVEL_LABELS[ink.remaining_level] || ink.remaining_level}
                </span>
              </div>
              <div className="p-3.5 space-y-2">
                <div>
                  <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    {ink.brand}
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {ink.name}
                  </h3>
                </div>
                <div>
                  <StarRating
                    value={ink.rating}
                    onChange={(next) => handleQuickRatingChange(ink.id, next)}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 font-mono-num">
                  <span>{ink.times_inked + ink.total_refills} fills</span>
                  <span>{ink.sample_count} samples</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Ink Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Add Ink to Library</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Ink Company / Brand *
                </label>
                <input
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g., Pilot Iroshizuku, Diamine"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Ink Name *
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Tsuki-yo, Writer's Blood"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Color Family
                </label>
                <select
                  value={colorFamily}
                  onChange={(e) => setColorFamily(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                >
                  {COLOR_FAMILIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Swatch Hex Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hexColor}
                    onChange={(e) => setHexColor(e.target.value)}
                    className="h-8 w-10 rounded cursor-pointer border border-zinc-300"
                  />
                  <input
                    type="text"
                    value={hexColor}
                    onChange={(e) => setHexColor(e.target.value)}
                    className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Container Format
                </label>
                <select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value);
                    if (e.target.value === 'sample_vial') setVolumeMl(4);
                    else if (e.target.value === 'cartridge') setVolumeMl(1);
                    else if (e.target.value === 'bottle') setVolumeMl(50);
                  }}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                >
                  <option value="bottle">Bottle</option>
                  <option value="sample_vial">Sample Vial</option>
                  <option value="cartridge">Cartridge Pack</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Size (ml)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={volumeMl}
                    onChange={(e) => setVolumeMl(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Level
                  </label>
                  <select
                    value={remainingLevel}
                    onChange={(e) => setRemainingLevel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-1.5 py-1.5 text-sm"
                  >
                    <option value="full">Full</option>
                    <option value="75_pct">75%</option>
                    <option value="half">Half</option>
                    <option value="low">Low</option>
                    <option value="empty">Empty</option>
                  </select>
                </div>
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-zinc-600 dark:text-zinc-400">
                    Mountain of Ink Review URL (mountainofink.com)
                  </label>
                  {(brand || name) && (
                    <a
                      href={moiSearchHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Lookup on Mountain of Ink
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={moiUrl}
                  onChange={(e) => setMoiUrl(e.target.value)}
                  placeholder="https://mountainofink.com/blog/..."
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>

              <div className="col-span-2 flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 px-3 py-2">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">
                  Rating (Optional)
                </span>
                <StarRating
                  value={newInkRating}
                  onChange={setNewInkRating}
                  size="md"
                  showLabel
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Properties Tags (Optional)
                </label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g., Shading, Red Sheen, Waterproof"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Standalone Custom Notes
                </label>
                <textarea
                  rows={3}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Dry time, paper compatibility, favorite nib widths..."
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? 'Saving...' : 'Add Ink'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
