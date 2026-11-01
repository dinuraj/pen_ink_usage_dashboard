import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  GitMerge,
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
const NIB_MATERIALS = ['Steel', '14k Gold', '18k Gold', '21k Gold', 'Titanium', 'Palladium', 'Gold'];
const MECHANISMS = ['Converter', 'Piston', 'Vacuum', 'Cartridge', 'Eyedropper', 'Lever', 'Aerometric'];

export const PensView: React.FC<Props> = ({ pens, onRefresh, onSelectPen }) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'inked' | 'clean'>('all');
  const [nibFilter, setNibFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showAddModal, setShowAddModal] = useState(false);

  // Multi-select for merging differently-named pen records
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkMergeModal, setShowBulkMergeModal] = useState(false);
  const [primaryPenId, setPrimaryPenId] = useState<number>(0);
  const [canonicalSpec, setCanonicalSpec] = useState({
    brand: '',
    model: '',
    color_variant: '',
    nib_size: 'M',
  });
  const [merging, setMerging] = useState(false);

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

  // Prune stale selected IDs if pens list updates
  useEffect(() => {
    const valid = new Set(pens.map((p) => p.id));
    setSelectedIds((prev) => prev.filter((id) => valid.has(id)));
  }, [pens]);

  const uniqueNibs = Array.from(new Set(pens.map((p) => p.nib_size))).sort();

  const filtered = pens.filter((p) => {
    const hay = `${p.brand} ${p.model} ${p.color_variant} ${p.nib_size} ${p.filling_mechanism}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (statusFilter === 'inked' && !p.is_currently_inked) return false;
    if (statusFilter === 'clean' && p.is_currently_inked) return false;
    if (nibFilter !== 'all' && p.nib_size !== nibFilter) return false;
    return true;
  });

  const toggleSelect = (id: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedPens = pens.filter((p) => selectedIds.includes(p.id));

  const openBulkMerge = () => {
    if (selectedPens.length < 2) return;
    // Default primary to the pen with the most logged sessions
    const sortedByUsage = [...selectedPens].sort(
      (a, b) => b.times_inked - a.times_inked || b.total_days_inked - a.total_days_inked,
    );
    const best = sortedByUsage[0];
    setPrimaryPenId(best.id);
    setCanonicalSpec({
      brand: best.brand,
      model: best.model,
      color_variant: best.color_variant,
      nib_size: best.nib_size,
    });
    setShowBulkMergeModal(true);
  };

  const handleSelectPrimary = (pen: PenOut) => {
    setPrimaryPenId(pen.id);
    setCanonicalSpec({
      brand: pen.brand,
      model: pen.model,
      color_variant: pen.color_variant,
      nib_size: pen.nib_size,
    });
  };

  const handleBulkMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryPenId || selectedIds.length < 2) return;
    setMerging(true);
    try {
      const merged = await api.mergePensBulk({
        target_pen_id: primaryPenId,
        source_pen_ids: selectedIds.filter((id) => id !== primaryPenId),
        updated_target: canonicalSpec,
      });
      setShowBulkMergeModal(false);
      setSelectedIds([]);
      onRefresh();
      onSelectPen(merged.id);
    } finally {
      setMerging(false);
    }
  };

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

  const combinedFills = selectedPens.reduce((acc, p) => acc + p.times_inked, 0);
  const combinedSamples = selectedPens.reduce((acc, p) => acc + p.sample_count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Pen Cabinet
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {pens.length} pens cataloged · {pens.filter((p) => p.is_currently_inked).length} currently
            inked · Tick checkboxes on duplicate pen names to merge them
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

      {/* Multi-Select Merge Action Banner */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/80 dark:bg-indigo-950/40 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
            <GitMerge className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>
              <strong>{selectedIds.length}</strong> {selectedIds.length === 1 ? 'pen' : 'pens'}{' '}
              selected
              {selectedIds.length === 1 && (
                <span className="text-indigo-700/80 dark:text-indigo-300/80 ml-1.5">
                  — select at least one more differently-named entry for the same pen to merge them
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 hover:bg-white/60 dark:hover:bg-zinc-900/50"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={selectedIds.length < 2}
              onClick={openBulkMerge}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-45"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Merge {selectedIds.length} Selected Pens
            </button>
          </div>
        </div>
      )}

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
                  <th className="py-2.5 pl-4 pr-2 w-8" title="Select duplicate pens to merge">
                    Merge
                  </th>
                  <th className="py-2.5 px-3">Pen Model &amp; Color</th>
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
                {filtered.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onSelectPen(p.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                          : 'hover:bg-zinc-50/90 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <td
                        className="py-2.5 pl-4 pr-2"
                        onClick={(e) => toggleSelect(p.id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => onSelectPen(p.id)}
                className={`cursor-pointer group rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden transition ${
                  isSelected
                    ? 'border-indigo-500 ring-1 ring-indigo-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-400'
                }`}
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
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => toggleSelect(p.id, e)}
                        onChange={() => {}}
                        className="mt-1 rounded border-zinc-300 text-indigo-600 cursor-pointer"
                        title="Select to merge"
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {p.brand} {p.model}
                        </h3>
                        <p className="text-xs text-zinc-500">
                          {p.color_variant || 'Standard'} · {p.nib_material} · {p.filling_mechanism}
                        </p>
                      </div>
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
            );
          })}
        </div>
      )}

      {/* Bulk Merge Selected Pens Modal */}
      {showBulkMergeModal && selectedPens.length >= 2 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowBulkMergeModal(false)}
        >
          <form
            onSubmit={handleBulkMergeSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold">
                  Merge {selectedPens.length} Pen Records into One
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkMergeModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-zinc-500 leading-relaxed">
              Select which pen entry to keep as the <strong>Primary Record</strong>. All{' '}
              <strong>{combinedFills}</strong> ink-up sessions (including ink dates &amp; refills),{' '}
              <strong>{combinedSamples}</strong> handwriting samples, and notes will be unified.
              Every merge is reversible and can be split back anytime on the pen&apos;s detail page.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {selectedPens.map((p) => (
                <label
                  key={p.id}
                  onClick={() => handleSelectPrimary(p)}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition ${
                    primaryPenId === p.id
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="primaryPen"
                      checked={primaryPenId === p.id}
                      onChange={() => handleSelectPrimary(p)}
                      className="text-indigo-600"
                    />
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {p.brand} {p.model}{' '}
                        {p.color_variant && (
                          <span className="font-normal text-zinc-500">({p.color_variant})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Nib: {p.nib_size} · {p.filling_mechanism}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-[11px] text-zinc-500">
                    <div>{p.times_inked} fills</div>
                    <div>{p.sample_count} samples</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50 p-3 space-y-2.5">
              <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                Final Canonical Name &amp; Nib (Editable)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">Brand</label>
                  <input
                    required
                    value={canonicalSpec.brand}
                    onChange={(e) => setCanonicalSpec({ ...canonicalSpec, brand: e.target.value })}
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">Model</label>
                  <input
                    required
                    value={canonicalSpec.model}
                    onChange={(e) => setCanonicalSpec({ ...canonicalSpec, model: e.target.value })}
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">Color / Finish</label>
                  <input
                    value={canonicalSpec.color_variant}
                    onChange={(e) =>
                      setCanonicalSpec({ ...canonicalSpec, color_variant: e.target.value })
                    }
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-0.5">Nib Size</label>
                  <input
                    value={canonicalSpec.nib_size}
                    onChange={(e) =>
                      setCanonicalSpec({ ...canonicalSpec, nib_size: e.target.value })
                    }
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowBulkMergeModal(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={merging}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
              >
                {merging ? 'Merging...' : `Merge into 1 Pen (${combinedFills} fills)`}
              </button>
            </div>
          </form>
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
