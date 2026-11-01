import React, { useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { PenOut } from '../types';

interface Props {
  pens: PenOut[];
  onRefresh: () => void;
  onSelectPen: (id: number) => void;
}

const NIB_SIZES = ['EF', 'F', 'FM', 'MF', 'M', 'B', 'BB', 'Stub 1.1', 'SF', 'Music', 'Zoom', 'Flex'];
const NIB_MATERIALS = ['Steel', '14k Gold', '18k Gold', '21k Gold', 'Titanium', 'Palladium'];
const MECHANISMS = ['Converter', 'Piston', 'Vacuum', 'Cartridge', 'Eyedropper', 'Lever'];

export const PensView: React.FC<Props> = ({ pens, onRefresh, onSelectPen }) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'inked' | 'clean'>('all');
  const [nibFilter, setNibFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Pen Form state
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [colorVariant, setColorVariant] = useState('');
  const [nibSize, setNibSize] = useState('M');
  const [nibMaterial, setNibMaterial] = useState('Steel');
  const [fillingMech, setFillingMech] = useState('Converter');
  const [customNotes, setCustomNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const uniqueNibs = Array.from(new Set(pens.map((p) => p.nib_size))).sort();

  const filtered = pens.filter((p) => {
    const hay = `${p.brand} ${p.model} ${p.color_variant} ${p.nib_size} ${p.filling_mechanism}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (statusFilter === 'inked' && !p.is_currently_inked) return false;
    if (statusFilter === 'clean' && p.is_currently_inked) return false;
    if (nibFilter !== 'all' && p.nib_size !== nibFilter) return false;
    return true;
  });

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
        custom_notes: customNotes,
      });
      if (photoFile) {
        await api.uploadPenPhoto(created.id, photoFile, `${brand} ${model}`);
      }
      setBrand('');
      setModel('');
      setColorVariant('');
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
            {pens.length} pens cataloged · {pens.filter((p) => p.is_currently_inked).length} currently inked
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

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter brand, model, color..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
            />
          </div>

          <div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs">
            {(
              [
                ['all', 'All'],
                ['inked', 'Currently Inked'],
                ['clean', 'Uninked / Clean'],
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
            <option value="all">All Nib Sizes</option>
            {uniqueNibs.map((n) => (
              <option key={n} value={n}>
                Nib: {n}
              </option>
            ))}
          </select>
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

      {viewMode === 'table' ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-4">Pen Model &amp; Color</th>
                  <th className="py-2.5 px-3">Nib</th>
                  <th className="py-2.5 px-3">Filling System</th>
                  <th className="py-2.5 px-4">Current Status / Ink</th>
                  <th className="py-2.5 px-3 text-right">Ink-Ups</th>
                  <th className="py-2.5 px-3 text-right">Refills</th>
                  <th className="py-2.5 px-3 text-right">Total Days</th>
                  <th className="py-2.5 px-4 text-right">Last Cleaned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPen(p.id)}
                    className="cursor-pointer hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {p.brand} {p.model}
                      </div>
                      {p.color_variant && (
                        <div className="text-[11px] text-zinc-500">{p.color_variant}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num font-medium">
                        {p.nib_size}
                      </span>
                      <span className="ml-1.5 text-[11px] text-zinc-400">{p.nib_material}</span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                      {p.filling_mechanism}
                    </td>
                    <td className="py-2.5 px-4">
                      {p.is_currently_inked && p.active_pairing ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 font-medium">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: p.active_pairing.ink_hex }}
                          />
                          <span>
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
                    <td className="py-2.5 px-4 text-right font-mono-num text-zinc-500">
                      {p.last_cleaned_date || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
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
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {p.brand} {p.model}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {p.color_variant || 'Standard'} · {p.nib_material} · {p.filling_mechanism}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-mono-num font-semibold rounded bg-zinc-100 dark:bg-zinc-800">
                    {p.nib_size}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                  {p.is_currently_inked && p.active_pairing ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.active_pairing.ink_hex }}
                      />
                      {p.active_pairing.ink_name} ({p.active_pairing.days_inked}d)
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
