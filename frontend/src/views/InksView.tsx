import React, { useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ExternalLink,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { InkOut } from '../types';

interface Props {
  inks: InkOut[];
  onRefresh: () => void;
  onSelectInk: (id: number) => void;
}

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

export const InksView: React.FC<Props> = ({ inks, onRefresh, onSelectInk }) => {
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'swatches'>('table');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Ink form state
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [colorFamily, setColorFamily] = useState('Blue');
  const [hexColor, setHexColor] = useState('#1d4ed8');
  const [format, setFormat] = useState('bottle');
  const [volumeMl, setVolumeMl] = useState(50);
  const [remainingLevel, setRemainingLevel] = useState('full');
  const [moiUrl, setMoiUrl] = useState('');
  const [tags, setTags] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = inks.filter((i) => {
    const hay = `${i.brand} ${i.name} ${i.color_family} ${i.properties_tags}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (colorFilter !== 'all' && i.color_family !== colorFilter) return false;
    if (formatFilter !== 'all' && i.format !== formatFilter) return false;
    return true;
  });

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
        remaining_level: remainingLevel,
        mountain_of_ink_url: moiUrl,
        properties_tags: tags,
        custom_notes: customNotes,
      });
      setBrand('');
      setName('');
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Ink Library &amp; Inventory
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {inks.length} inks · {inks.filter((i) => i.format === 'bottle').length} bottles ·{' '}
            {inks.filter((i) => i.format === 'sample_vial').length} sample vials
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

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter ink brand, name, sheen, waterproof..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
            />
          </div>

          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          >
            <option value="all">All Color Families</option>
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

      {viewMode === 'table' ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-4">Ink Brand &amp; Name</th>
                  <th className="py-2.5 px-3">Color</th>
                  <th className="py-2.5 px-3">Format</th>
                  <th className="py-2.5 px-3">Remaining Level</th>
                  <th className="py-2.5 px-3 text-right">Fills</th>
                  <th className="py-2.5 px-3 text-right">Samples</th>
                  <th className="py-2.5 px-4 text-right">Review Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filtered.map((ink) => {
                  const pct = LEVEL_PCT[ink.remaining_level] ?? 50;
                  return (
                    <tr
                      key={ink.id}
                      onClick={() => onSelectInk(ink.id)}
                      className="cursor-pointer hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-4 h-4 rounded-md shrink-0 ring-1 ring-black/15 dark:ring-white/20"
                            style={{ backgroundColor: ink.hex_color }}
                          />
                          <div>
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                              {ink.brand} {ink.name}
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
                      <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                        {ink.color_family}
                      </td>
                      <td className="py-2.5 px-3 font-mono-num text-zinc-600 dark:text-zinc-400">
                        {ink.format === 'sample_vial' ? 'Sample' : ink.format === 'bottle' ? 'Bottle' : 'Cartridge'}{' '}
                        · {ink.volume_ml}ml
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
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
                      <td className="py-2.5 px-3 text-right font-mono-num text-zinc-500">
                        {ink.sample_count}
                      </td>
                      <td
                        className="py-2.5 px-4 text-right"
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
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((ink) => (
            <div
              key={ink.id}
              onClick={() => onSelectInk(ink.id)}
              className="cursor-pointer group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-indigo-400 transition"
            >
              <div
                className="h-24 p-3 flex items-end justify-between"
                style={{ backgroundColor: ink.hex_color }}
              >
                <span className="px-2 py-0.5 rounded text-[10px] font-mono-num bg-black/45 text-white backdrop-blur-xs">
                  {ink.format === 'sample_vial' ? `${ink.volume_ml}ml Sample` : `${ink.volume_ml}ml Bottle`}
                </span>
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
                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 font-mono-num">
                  <span>{ink.times_inked} ink-ups</span>
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
                    else if (e.target.value === 'bottle') setVolumeMl(50);
                  }}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                >
                  <option value="bottle">Bottle</option>
                  <option value="sample_vial">Sample Vial</option>
                  <option value="cartridge">Cartridge Pack</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Size (ml)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={volumeMl}
                    onChange={(e) => setVolumeMl(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    Level
                  </label>
                  <select
                    value={remainingLevel}
                    onChange={(e) => setRemainingLevel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
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
