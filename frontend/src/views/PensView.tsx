import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { PenOut } from '../types';
import {
  CompanyFilterCombobox,
  matchesRatingFilter,
  MultiTagFilterDropdown,
  PEN_TAG_OPTIONS,
  PenTagBadge,
  PenTagsInlineEditor,
  RatingFilterSelect,
  type RatingFilterValue,
  SortableTh,
  StarRating,
  UNTAGGED_FILTER_VALUE,
} from '../components/FilterSortControls';

interface Props {
  pens: PenOut[];
  onRefresh: () => void;
  onSelectPen: (id: number) => void;
}

type PenSortKey =
  | 'brand'
  | 'model'
  | 'color_variant'
  | 'tags'
  | 'rating'
  | 'nib_size'
  | 'nib_material'
  | 'filling_mechanism'
  | 'status_ink'
  | 'times_inked'
  | 'total_refills'
  | 'total_days_inked'
  | 'last_cleaned_date'
  | 'sample_count';

const PEN_SORT_OPTIONS: Array<{ key: PenSortKey; label: string; defaultDir: 'asc' | 'desc' }> = [
  { key: 'brand', label: 'Pen Company', defaultDir: 'asc' },
  { key: 'model', label: 'Pen Name / Model', defaultDir: 'asc' },
  { key: 'color_variant', label: 'Color / Finish', defaultDir: 'asc' },
  { key: 'tags', label: 'Tags', defaultDir: 'asc' },
  { key: 'rating', label: 'Rating (★)', defaultDir: 'desc' },
  { key: 'nib_size', label: 'Nib Size', defaultDir: 'asc' },
  { key: 'nib_material', label: 'Nib Material', defaultDir: 'asc' },
  { key: 'filling_mechanism', label: 'Filling System', defaultDir: 'asc' },
  { key: 'status_ink', label: 'Current Status / Ink', defaultDir: 'desc' },
  { key: 'times_inked', label: 'Ink-Ups', defaultDir: 'desc' },
  { key: 'total_refills', label: 'Refills', defaultDir: 'desc' },
  { key: 'total_days_inked', label: 'Total Days', defaultDir: 'desc' },
  { key: 'last_cleaned_date', label: 'Last Cleaned', defaultDir: 'desc' },
  { key: 'sample_count', label: 'Samples', defaultDir: 'desc' },
];

const NIB_RANK: Record<string, number> = {
  UEF: 1,
  EEF: 2,
  EF: 3,
  SEF: 4,
  SF: 5,
  F: 6,
  FM: 7,
  MF: 8,
  SM: 9,
  M: 10,
  B: 11,
  BB: 12,
  '3B': 13,
  'STUB 1.1': 14,
  STUB: 15,
  ITALIC: 16,
  ARCHITECT: 17,
  MUSIC: 18,
  ZOOM: 19,
  FLEX: 20,
};

function nibRankValue(nib: string): number {
  const norm = (nib || '').trim().toUpperCase();
  return NIB_RANK[norm] ?? 50;
}

const NIB_SIZES = ['EF', 'F', 'FM', 'MF', 'M', 'B', 'BB', 'Stub 1.1', 'SF', 'Music', 'Zoom', 'Flex'];
const NIB_MATERIALS = ['Steel', '14k Gold', '18k Gold', '21k Gold', 'Titanium', 'Palladium', 'Gold'];
const MECHANISMS = ['Converter', 'Piston', 'Vacuum', 'Cartridge', 'Eyedropper', 'Lever', 'Aerometric'];

export const PensView: React.FC<Props> = ({ pens, onRefresh, onSelectPen }) => {
  // Separate Pen Company & Pen Name filters + multi-select Tag filter + facets
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyExact, setCompanyExact] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagMatchMode, setTagMatchMode] = useState<'any' | 'all'>('any');
  const [ratingFilter, setRatingFilter] = useState<RatingFilterValue>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'inked' | 'clean'>('all');
  const [nibFilter, setNibFilter] = useState('all');
  const [mechanismFilter, setMechanismFilter] = useState('all');

  // Column sorting
  const [sortKey, setSortKey] = useState<PenSortKey>('brand');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Pen Form state
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [colorVariant, setColorVariant] = useState('');
  const [nibSize, setNibSize] = useState('M');
  const [nibMaterial, setNibMaterial] = useState('Steel');
  const [fillingMech, setFillingMech] = useState('Converter');
  const [newPenTags, setNewPenTags] = useState<string[]>([]);
  const [newPenRating, setNewPenRating] = useState<number | null>(null);
  const [customNotes, setCustomNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const companyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pens) {
      counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pens]);

  const { tagCounts, untaggedCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let untagged = 0;
    for (const p of pens) {
      const pTags = p.tags ?? [];
      if (pTags.length === 0) {
        untagged += 1;
      } else {
        for (const t of pTags) {
          counts[t] = (counts[t] ?? 0) + 1;
        }
      }
    }
    return { tagCounts: counts, untaggedCount: untagged };
  }, [pens]);

  const uniqueNibs = useMemo(
    () =>
      Array.from(new Set(pens.map((p) => p.nib_size))).sort(
        (a, b) => nibRankValue(a) - nibRankValue(b) || a.localeCompare(b),
      ),
    [pens],
  );

  const uniqueMechanisms = useMemo(
    () => Array.from(new Set(pens.map((p) => p.filling_mechanism))).filter(Boolean).sort(),
    [pens],
  );

  const handleSort = (key: string) => {
    const typedKey = key as PenSortKey;
    if (sortKey === typedKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      const meta = PEN_SORT_OPTIONS.find((o) => o.key === typedKey);
      setSortKey(typedKey);
      setSortDir(meta?.defaultDir ?? 'asc');
    }
  };

  const handleQuickTagsChange = async (penId: number, nextTags: string[]) => {
    await api.updatePen(penId, { tags: nextTags });
    onRefresh();
  };

  const handleQuickRatingChange = async (penId: number, nextRating: number | null) => {
    await api.updatePen(penId, { rating: nextRating });
    onRefresh();
  };

  const hasActiveFilters =
    Boolean(companyFilter.trim()) ||
    Boolean(nameQuery.trim()) ||
    tagFilters.length > 0 ||
    ratingFilter !== 'all' ||
    statusFilter !== 'all' ||
    nibFilter !== 'all' ||
    mechanismFilter !== 'all';

  const resetFilters = () => {
    setCompanyFilter('');
    setCompanyExact(false);
    setNameQuery('');
    setTagFilters([]);
    setRatingFilter('all');
    setStatusFilter('all');
    setNibFilter('all');
    setMechanismFilter('all');
  };

  const sortedAndFiltered = useMemo(() => {
    const compNeedle = companyFilter.trim().toLowerCase();
    const nameNeedle = nameQuery.trim().toLowerCase();

    const filtered = pens.filter((p) => {
      if (compNeedle) {
        if (companyExact) {
          if (p.brand.toLowerCase() !== compNeedle) return false;
        } else if (!p.brand.toLowerCase().includes(compNeedle)) {
          return false;
        }
      }
      if (nameNeedle) {
        const activeInkText = p.active_pairing
          ? `${p.active_pairing.ink_brand} ${p.active_pairing.ink_name}`
          : '';
        const hay = `${p.model} ${p.color_variant} ${p.nib_material} ${activeInkText}`.toLowerCase();
        if (!hay.includes(nameNeedle)) return false;
      }
      if (tagFilters.length > 0) {
        const pTags = p.tags ?? [];
        const includeUntagged = tagFilters.includes(UNTAGGED_FILTER_VALUE);
        const realTags = tagFilters.filter((t) => t !== UNTAGGED_FILTER_VALUE);

        if (includeUntagged && realTags.length === 0) {
          if (pTags.length !== 0) return false;
        } else if (includeUntagged && realTags.length > 0) {
          const matchesUntagged = pTags.length === 0;
          const matchesReal = realTags.some((t) => pTags.includes(t));
          if (!matchesUntagged && !matchesReal) return false;
        } else if (tagMatchMode === 'all') {
          if (!realTags.every((t) => pTags.includes(t))) return false;
        } else {
          if (!realTags.some((t) => pTags.includes(t))) return false;
        }
      }
      if (!matchesRatingFilter(p.rating, ratingFilter)) return false;
      if (statusFilter === 'inked' && !p.is_currently_inked) return false;
      if (statusFilter === 'clean' && p.is_currently_inked) return false;
      if (nibFilter !== 'all' && p.nib_size !== nibFilter) return false;
      if (mechanismFilter !== 'all' && p.filling_mechanism !== mechanismFilter) return false;
      return true;
    });

    const mult = sortDir === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const tieBreak = () =>
        a.brand.localeCompare(b.brand) ||
        a.model.localeCompare(b.model) ||
        a.color_variant.localeCompare(b.color_variant);

      switch (sortKey) {
        case 'brand':
          return mult * a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model);
        case 'model':
          return mult * a.model.localeCompare(b.model) || tieBreak();
        case 'color_variant': {
          const aEmpty = !a.color_variant.trim();
          const bEmpty = !b.color_variant.trim();
          if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
          return mult * a.color_variant.localeCompare(b.color_variant) || tieBreak();
        }
        case 'tags': {
          const aStr = (a.tags ?? []).join(', ');
          const bStr = (b.tags ?? []).join(', ');
          const aEmpty = !aStr;
          const bEmpty = !bStr;
          if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
          return mult * aStr.localeCompare(bStr) || tieBreak();
        }
        case 'rating': {
          const aNull = !a.rating;
          const bNull = !b.rating;
          if (aNull !== bNull) return aNull ? 1 : -1;
          return mult * ((a.rating ?? 0) - (b.rating ?? 0)) || tieBreak();
        }
        case 'nib_size': {
          const diff = nibRankValue(a.nib_size) - nibRankValue(b.nib_size);
          if (diff !== 0) return mult * diff;
          return mult * a.nib_size.localeCompare(b.nib_size) || tieBreak();
        }
        case 'nib_material':
          return mult * a.nib_material.localeCompare(b.nib_material) || tieBreak();
        case 'filling_mechanism':
          return mult * a.filling_mechanism.localeCompare(b.filling_mechanism) || tieBreak();
        case 'status_ink': {
          if (a.is_currently_inked !== b.is_currently_inked) {
            return sortDir === 'desc'
              ? a.is_currently_inked
                ? -1
                : 1
              : a.is_currently_inked
                ? 1
                : -1;
          }
          if (a.active_pairing && b.active_pairing) {
            const inkA = `${a.active_pairing.ink_brand} ${a.active_pairing.ink_name}`;
            const inkB = `${b.active_pairing.ink_brand} ${b.active_pairing.ink_name}`;
            return inkA.localeCompare(inkB) || tieBreak();
          }
          return tieBreak();
        }
        case 'times_inked':
          return mult * (a.times_inked - b.times_inked) || tieBreak();
        case 'total_refills':
          return mult * (a.total_refills - b.total_refills) || tieBreak();
        case 'total_days_inked':
          return mult * (a.total_days_inked - b.total_days_inked) || tieBreak();
        case 'sample_count':
          return mult * (a.sample_count - b.sample_count) || tieBreak();
        case 'last_cleaned_date': {
          const aNull = !a.last_cleaned_date;
          const bNull = !b.last_cleaned_date;
          if (aNull !== bNull) return aNull ? 1 : -1;
          return (
            mult * (a.last_cleaned_date || '').localeCompare(b.last_cleaned_date || '') ||
            tieBreak()
          );
        }
        default:
          return tieBreak();
      }
    });
  }, [
    pens,
    companyFilter,
    companyExact,
    nameQuery,
    tagFilters,
    tagMatchMode,
    ratingFilter,
    statusFilter,
    nibFilter,
    mechanismFilter,
    sortKey,
    sortDir,
  ]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await api.createPen({
        brand,
        model,
        color_variant: colorVariant,
        nib_size: nibSize,
        nib_material: nibMaterial,
        filling_mechanism: fillingMech,
        tags: newPenTags,
        rating: newPenRating,
        custom_notes: customNotes,
      });
      if (photoFile) {
        await api.uploadPenPhoto(created.id, photoFile, `${brand} ${model}`);
      }
      setBrand('');
      setModel('');
      setColorVariant('');
      setNewPenTags([]);
      setNewPenRating(null);
      setCustomNotes('');
      setPhotoFile(null);
      setShowAddModal(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Pen Cabinet
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {hasActiveFilters
              ? `Showing ${sortedAndFiltered.length} of ${pens.length} pens`
              : `${pens.length} pens cataloged across ${companyOptions.length} companies`}{' '}
            · {pens.filter((p) => p.is_currently_inked).length} currently inked · Click{' '}
            <strong>+ Tag</strong> on any pen to assign tags or click column headers to sort
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Fountain Pen
        </button>
      </div>

      {/* Separate Company, Name & Multi-Select Tag Filters + Sort Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Filter 1: Pen Company */}
          <CompanyFilterCombobox
            value={companyFilter}
            exact={companyExact}
            onChange={(val, isExact) => {
              setCompanyFilter(val);
              setCompanyExact(isExact);
            }}
            companies={companyOptions}
            placeholder={`Pen Company (${companyOptions.length})`}
            allLabel="All Pen Companies"
          />

          {/* Filter 2: Pen Name / Color */}
          <div className="relative min-w-[180px] flex-1 max-w-[225px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Filter pen name or color..."
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
                title="Clear pen name filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter 3: Multi-Select Tags (Everyday Use, Collectible, Vintage) */}
          <MultiTagFilterDropdown
            selected={tagFilters}
            matchMode={tagMatchMode}
            onChangeSelected={setTagFilters}
            onChangeMatchMode={setTagMatchMode}
            tagCounts={tagCounts}
            untaggedCount={untaggedCount}
          />

          {/* Filter 4: Star Rating */}
          <RatingFilterSelect value={ratingFilter} onChange={setRatingFilter} />

          <div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs">
            {(
              [
                ['all', 'All'],
                ['inked', 'Inked'],
                ['clean', 'Clean'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  statusFilter === val
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={nibFilter}
            onChange={(e) => setNibFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          >
            <option value="all">All Nibs</option>
            {uniqueNibs.map((n) => (
              <option key={n} value={n}>
                Nib: {n}
              </option>
            ))}
          </select>

          <select
            value={mechanismFilter}
            onChange={(e) => setMechanismFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          >
            <option value="all">All Filling Systems</option>
            {uniqueMechanisms.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

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
                const nextKey = e.target.value as PenSortKey;
                const meta = PEN_SORT_OPTIONS.find((o) => o.key === nextKey);
                setSortKey(nextKey);
                setSortDir(meta?.defaultDir ?? 'asc');
              }}
              aria-label="Sort pens by"
              className="px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
            >
              {PEN_SORT_OPTIONS.map((opt) => (
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
              title="Compact Table"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${
                viewMode === 'grid' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500'
              }`}
              title="Photo Cards"
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
                    label="Pen Name"
                    sortKey="model"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Color"
                    sortKey="color_variant"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Tags"
                    sortKey="tags"
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
                    label="Nib"
                    sortKey="nib_size"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Filling System"
                    sortKey="filling_mechanism"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Current Status / Ink"
                    sortKey="status_ink"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                  />
                  <SortableTh
                    label="Ink-Ups"
                    sortKey="times_inked"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Refills"
                    sortKey="total_refills"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Total Days"
                    sortKey="total_days_inked"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Last Cleaned"
                    sortKey="last_cleaned_date"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    align="right"
                    className="pr-4"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {sortedAndFiltered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPen(p.id)}
                    className="cursor-pointer hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-3 font-medium text-zinc-700 dark:text-zinc-300">
                      {p.brand}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                      {p.model}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-500">
                      {p.color_variant || <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <PenTagsInlineEditor
                        tags={p.tags ?? []}
                        onChange={(next) => handleQuickTagsChange(p.id, next)}
                      />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StarRating
                        value={p.rating}
                        onChange={(next) => handleQuickRatingChange(p.id, next)}
                      />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num font-medium">
                        {p.nib_size}
                      </span>
                      <span className="ml-1.5 text-[11px] text-zinc-400">{p.nib_material}</span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                      {p.filling_mechanism}
                    </td>
                    <td className="py-2.5 px-3">
                      {p.is_currently_inked && p.active_pairing ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 font-medium">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.active_pairing.ink_hex }}
                          />
                          <span className="truncate max-w-[170px]">
                            {p.active_pairing.ink_brand} {p.active_pairing.ink_name}
                          </span>
                          <span className="text-[10px] font-mono-num opacity-75">
                            ({p.active_pairing.days_inked}d)
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          Clean · Stored
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-medium">
                      {p.times_inked}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-zinc-500">
                      {p.total_refills}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-zinc-600 dark:text-zinc-400">
                      {p.total_days_inked}d
                    </td>
                    <td className="py-2.5 pl-3 pr-4 text-right font-mono-num text-zinc-500">
                      {p.last_cleaned_date || '—'}
                    </td>
                  </tr>
                ))}
                {sortedAndFiltered.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-zinc-400">
                      No fountain pens match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAndFiltered.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelectPen(p.id)}
              className="cursor-pointer group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-indigo-400 transition"
            >
              {p.primary_photo_url && (
                <div className="h-36 bg-zinc-100 dark:bg-zinc-950 overflow-hidden border-b border-zinc-100 dark:border-zinc-800">
                  <img
                    src={p.primary_photo_url}
                    alt={`${p.brand} ${p.model}`}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                </div>
              )}
              <div className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      {p.brand}
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {p.model}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {p.color_variant || 'Standard'} · {p.nib_material} · {p.filling_mechanism}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-mono-num font-semibold rounded bg-zinc-100 dark:bg-zinc-800">
                    {p.nib_size}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <PenTagsInlineEditor
                    tags={p.tags ?? []}
                    onChange={(next) => handleQuickTagsChange(p.id, next)}
                  />
                  <StarRating
                    value={p.rating}
                    onChange={(next) => handleQuickRatingChange(p.id, next)}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                  {p.is_currently_inked && p.active_pairing ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.active_pairing.ink_hex }}
                      />
                      {p.active_pairing.ink_brand} {p.active_pairing.ink_name} ({p.active_pairing.days_inked}d)
                    </span>
                  ) : (
                    <span className="text-zinc-400">Clean / Uninked</span>
                  )}
                  <span className="font-mono-num text-zinc-500 shrink-0">
                    {p.times_inked} fills · {p.sample_count} samples
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Pen Modal */}
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
              <h3 className="text-sm font-semibold">Add Fountain Pen to Cabinet</h3>
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
                  Brand / Company *
                </label>
                <input
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g., Pilot, Lamy, Sailor"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Model Name *
                </label>
                <input
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., Custom 823, Safari"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Color / Finish Variant (distinguishes duplicate models)
                </label>
                <input
                  value={colorVariant}
                  onChange={(e) => setColorVariant(e.target.value)}
                  placeholder="e.g., Amber, Charcoal Matte, Chartres Blue"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Pen Tags (Multi-Select)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PEN_TAG_OPTIONS.map((tag) => {
                    const selected = newPenTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setNewPenTags((prev) =>
                            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-500/30'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                            selected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-zinc-300 dark:border-zinc-700'
                          }`}
                        >
                          {selected && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <PenTagBadge tag={tag} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Nib Size / Grind
                </label>
                <select
                  value={nibSize}
                  onChange={(e) => setNibSize(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                >
                  {NIB_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Nib Material
                </label>
                <select
                  value={nibMaterial}
                  onChange={(e) => setNibMaterial(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                >
                  {NIB_MATERIALS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Filling Mechanism
                </label>
                <select
                  value={fillingMech}
                  onChange={(e) => setFillingMech(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                >
                  {MECHANISMS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  Pen Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-zinc-500 pt-1"
                />
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 px-3 py-2">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">
                  Rating (Optional)
                </span>
                <StarRating
                  value={newPenRating}
                  onChange={setNewPenRating}
                  size="md"
                  showLabel
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
                  placeholder="Nib smoothness, tuning notes, converter model..."
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
                {saving ? 'Saving...' : 'Create Pen'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
