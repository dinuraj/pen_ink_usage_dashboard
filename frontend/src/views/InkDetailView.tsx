import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  Trash2,
  Edit3,
  Link2,
  GitMerge,
  FileScan,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { InkDetailResponse, InkOut, PenOut, SessionOut, WritingSampleOut } from '../types';
import { StarRating } from '../components/FilterSortControls';
import { MarkdownNotes } from '../components/MarkdownNotes';
import { QuickInkUpModal } from '../components/ActionModals';
import { SampleLightbox } from '../components/SampleLightbox';

interface Props {
  inkId: number;
  allPens: PenOut[];
  allInks: InkOut[];
  prevInk?: InkOut;
  nextInk?: InkOut;
  currentIndex?: number;
  totalCount?: number;
  onBack: () => void;
  onOpenPen: (penId: number) => void;
  onOpenInk: (inkId: number) => void;
  onOpenScanPage: (batchId: number, pageNumber: number, sampleId: number) => void;
  onGlobalRefresh: () => void;
}

const LEVELS: Array<{ key: string; label: string }> = [
  { key: 'full', label: 'Full' },
  { key: '75_pct', label: '75%' },
  { key: 'half', label: 'Half' },
  { key: 'low', label: 'Low' },
  { key: 'empty', label: 'Empty' },
];

const FORMATS: Array<{ key: string; label: string }> = [
  { key: 'bottle', label: 'Bottle' },
  { key: 'sample_vial', label: 'Sample Vial' },
  { key: 'cartridge', label: 'Cartridge' },
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

export const InkDetailView: React.FC<Props> = ({
  inkId,
  allPens,
  allInks,
  prevInk,
  nextInk,
  currentIndex,
  totalCount,
  onBack,
  onOpenPen,
  onOpenInk,
  onOpenScanPage,
  onGlobalRefresh,
}) => {
  const { isAdmin } = useAuth();
  const [detail, setDetail] = useState<InkDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInkUpModal, setShowInkUpModal] = useState(false);
  const [lightboxSample, setLightboxSample] = useState<WritingSampleOut | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number>(0);
  const [editingSession, setEditingSession] = useState<SessionOut | null>(null);
  const [metaForm, setMetaForm] = useState({
    brand: '',
    name: '',
    color_family: '',
    hex_color: '',
    format: 'bottle',
    volume_ml: 50,
    quantity: 1,
    mountain_of_ink_url: '',
    properties_tags: '',
  });

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getInkDetail(inkId);
      setDetail(res);
      setMetaForm({
        brand: res.ink.brand,
        name: res.ink.name,
        color_family: res.ink.color_family,
        hex_color: res.ink.hex_color,
        format: res.ink.format,
        volume_ml: res.ink.volume_ml,
        quantity: res.ink.quantity || 1,
        mountain_of_ink_url: res.ink.mountain_of_ink_url,
        properties_tags: res.ink.properties_tags,
      });
    } finally {
      setLoading(false);
    }
  }, [inkId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    void loadDetail();
  }, [loadDetail, inkId]);

  // Keyboard navigation: Left/Right arrows to step through inks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (showMergeModal || showInkUpModal || editingMeta || editingSession || lightboxSample) {
        return;
      }
      if (e.key === 'ArrowLeft' && prevInk) {
        e.preventDefault();
        onOpenInk(prevInk.id);
      } else if (e.key === 'ArrowRight' && nextInk) {
        e.preventDefault();
        onOpenInk(nextInk.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevInk, nextInk, onOpenInk, showMergeModal, showInkUpModal, editingMeta, editingSession, lightboxSample]);

  if (loading || !detail) {
    return <div className="py-16 text-center text-xs text-zinc-400">Loading ink details...</div>;
  }

  const { ink, favorite_pen, sessions, samples } = detail;

  const handleLevelChange = async (lvl: string) => {
    await api.updateInk(ink.id, { remaining_level: lvl });
    await loadDetail();
    onGlobalRefresh();
  };

  const handleRatingChange = async (nextRating: number | null) => {
    await api.updateInk(ink.id, { rating: nextRating });
    await loadDetail();
    onGlobalRefresh();
  };

  const handleFormatChange = async (nextFormat: string) => {
    if (nextFormat === ink.format) return;
    const patch: Record<string, unknown> = { format: nextFormat };
    if (nextFormat === 'sample_vial' && ink.volume_ml >= 15) {
      patch.volume_ml = 4;
    } else if (nextFormat === 'cartridge' && ink.volume_ml >= 15) {
      patch.volume_ml = 1;
    } else if (nextFormat === 'bottle' && ink.volume_ml <= 10) {
      patch.volume_ml = 50;
    }
    await api.updateInk(ink.id, patch);
    await loadDetail();
    onGlobalRefresh();
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.updateInk(ink.id, metaForm);
    setEditingMeta(false);
    await loadDetail();
    onGlobalRefresh();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${ink.brand} ${ink.name} from library?`)) return;
    await api.deleteInk(ink.id);
    onGlobalRefresh();
    onBack();
  };

  const moiLookupUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `site:mountainofink.com ${ink.brand} ${ink.name}`,
  )}`;

  const otherInks = allInks.filter((i) => i.id !== ink.id);

  const handleMergeInk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeTargetId) return;
    const merged = await api.mergeInk(ink.id, mergeTargetId);
    setShowMergeModal(false);
    onGlobalRefresh();
    onOpenInk(merged.id);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar & Next/Previous Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Ink Library
          </button>

          {(prevInk || nextInk || totalCount) && (
            <div className="flex items-center gap-1 pl-2.5 border-l border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => prevInk && onOpenInk(prevInk.id)}
                disabled={!prevInk}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed transition"
                title={prevInk ? `Previous: ${prevInk.brand} ${prevInk.name} (Left Arrow)` : 'No previous ink in list'}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              {currentIndex !== undefined && totalCount !== undefined && (
                <span
                  className="px-2 text-[11px] font-mono-num text-zinc-500 whitespace-nowrap"
                  title="Position in current library filter"
                >
                  {currentIndex + 1} of {totalCount}
                </span>
              )}

              <button
                onClick={() => nextInk && onOpenInk(nextInk.id)}
                disabled={!nextInk}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed transition"
                title={nextInk ? `Next: ${nextInk.brand} ${nextInk.name} (Right Arrow)` : 'No next ink in list'}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingMeta((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Ink, Format &amp; URL
            </button>
            {otherInks.length > 0 && (
              <button
                onClick={() => {
                  setMergeTargetId(otherInks[0].id);
                  setShowMergeModal(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Merge duplicate ink entry into another ink"
              >
                <GitMerge className="w-3.5 h-3.5 text-indigo-500" />
                Merge Duplicate
              </button>
            )}
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Swatch & Inventory Hero */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="h-24 w-full relative" style={{ backgroundColor: ink.hex_color }}>
          <div className="absolute bottom-3 left-5 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-mono-num bg-black/50 text-white backdrop-blur-xs">
              {ink.hex_color.toUpperCase()} · {ink.color_family}
            </span>
            <span className="px-2.5 py-0.5 rounded text-xs font-mono-num bg-white/90 text-zinc-900 font-medium">
              {ink.quantity > 1 ? `${ink.quantity} × ` : ''}
              {ink.format === 'sample_vial'
                ? `${ink.volume_ml}ml Sample Vial`
                : ink.format === 'bottle'
                  ? `${ink.volume_ml}ml Bottle`
                  : `${ink.volume_ml}ml Cartridge`}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {editingMeta ? (
            <form onSubmit={handleSaveMeta} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Ink Company / Brand
                </label>
                <input
                  required
                  value={metaForm.brand}
                  onChange={(e) => setMetaForm({ ...metaForm, brand: e.target.value })}
                  placeholder="Brand"
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Ink Name
                </label>
                <input
                  required
                  value={metaForm.name}
                  onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })}
                  placeholder="Ink Name"
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Color Family &amp; Swatch
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={metaForm.hex_color}
                    onChange={(e) => setMetaForm({ ...metaForm, hex_color: e.target.value })}
                    className="h-8 w-9 rounded cursor-pointer border border-zinc-300 dark:border-zinc-700"
                  />
                  <select
                    value={metaForm.color_family}
                    onChange={(e) => setMetaForm({ ...metaForm, color_family: e.target.value })}
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                  >
                    {COLOR_FAMILIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Container Format
                </label>
                <select
                  value={metaForm.format}
                  onChange={(e) => {
                    const nextFmt = e.target.value;
                    let nextVol = metaForm.volume_ml;
                    if (nextFmt === 'sample_vial' && nextVol >= 15) nextVol = 4;
                    else if (nextFmt === 'cartridge' && nextVol >= 15) nextVol = 1;
                    else if (nextFmt === 'bottle' && nextVol <= 10) nextVol = 50;
                    setMetaForm({ ...metaForm, format: nextFmt, volume_ml: nextVol });
                  }}
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5"
                >
                  <option value="bottle">Bottle</option>
                  <option value="sample_vial">Sample Vial</option>
                  <option value="cartridge">Cartridge Pack</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                    Size (ml)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={metaForm.volume_ml}
                    onChange={(e) =>
                      setMetaForm({ ...metaForm, volume_ml: Number(e.target.value) })
                    }
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                    Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={metaForm.quantity}
                    onChange={(e) =>
                      setMetaForm({
                        ...metaForm,
                        quantity: Math.max(1, Number(e.target.value)),
                      })
                    }
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 font-mono-num"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Mountain of Ink URL
                </label>
                <input
                  value={metaForm.mountain_of_ink_url}
                  onChange={(e) =>
                    setMetaForm({ ...metaForm, mountain_of_ink_url: e.target.value })
                  }
                  placeholder="https://mountainofink.com/blog/..."
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                  Tags
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={metaForm.properties_tags}
                    onChange={(e) =>
                      setMetaForm({ ...metaForm, properties_tags: e.target.value })
                    }
                    placeholder="Sheen, Shading..."
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {ink.brand}
                </div>
                <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                  {ink.name}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-zinc-500 font-medium">Rating:</span>
                    <StarRating
                      value={ink.rating}
                      onChange={isAdmin ? handleRatingChange : undefined}
                      size="md"
                      showLabel
                    />
                  </div>
                  {ink.properties_tags && (
                    <div className="flex flex-wrap gap-1.5">
                      {ink.properties_tags.split(',').map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-[11px] rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        >
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Mountain of Ink Link + Quick Ink-Up */}
              <div className="flex flex-wrap items-center gap-2">
                {ink.mountain_of_ink_url ? (
                  <a
                    href={ink.mountain_of_ink_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200"
                  >
                    <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                    Mountain of Ink Review
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                  </a>
                ) : (
                  <a
                    href={moiLookupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-xs text-zinc-500 hover:text-zinc-900"
                  >
                    Find on Mountain of Ink
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {isAdmin && (
                  <button
                    onClick={() => setShowInkUpModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ink a Pen with This
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Interactive 1-Click Container Format & Remaining Level Bars */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-zinc-500 font-medium">Container Format:</span>
              <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
                {FORMATS.map((fmt) => (
                  <button
                    key={fmt.key}
                    disabled={!isAdmin}
                    onClick={() => void handleFormatChange(fmt.key)}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      ink.format === fmt.key
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-75'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-zinc-500 font-medium">Remaining Level:</span>
              <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl.key}
                    disabled={!isAdmin}
                    onClick={() => void handleLevelChange(lvl.key)}
                    className={`px-2.5 py-1 rounded-md font-mono-num font-medium transition ${
                      ink.remaining_level === lvl.key
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-75'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ink KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Times Inked</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{ink.times_inked}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Reservoir Refills</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{ink.total_refills}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Distinct Pens Paired</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{ink.distinct_pens_count}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Total Days Active</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{ink.total_days_inked}d</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 col-span-2 md:col-span-1">
          <div className="text-[11px] text-zinc-500">Most Paired Pen</div>
          {favorite_pen ? (
            <button
              onClick={() => onOpenPen(favorite_pen.id)}
              className="mt-1 text-xs font-semibold hover:text-indigo-600 truncate block max-w-full text-left"
            >
              {favorite_pen.name} [{favorite_pen.nib_size}] ({favorite_pen.count}×)
            </button>
          ) : (
            <div className="text-xs text-zinc-400 mt-1">—</div>
          )}
        </div>
      </div>

      {/* Standalone Custom Notes */}
      <MarkdownNotes
        title="Ink Notes & Behavior"
        editable={isAdmin}
        placeholder="Record standalone notes about this ink (shading, sheen, dry time, feathering, favorite nib sizes)..."
        value={ink.custom_notes}
        onSave={async (next) => {
          await api.updateInk(ink.id, { custom_notes: next });
          await loadDetail();
        }}
      />

      {/* Writing Samples Showcase for this Ink */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Handwriting Samples with {ink.brand} {ink.name} ({samples.length})
          </h3>
          <p className="text-xs text-zinc-500">
            Compare line saturation, shading, and sheen across different pens and nib sizes
          </p>
        </div>

        {samples.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {samples.map((ws) => (
              <div
                key={ws.id}
                onClick={() => setLightboxSample(ws)}
                className="cursor-pointer group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-[#fcfaf4] hover:border-indigo-400 transition"
              >
                <div className="h-44 overflow-hidden flex items-center justify-center p-2">
                  <img
                    src={ws.image_url}
                    alt={ws.caption}
                    className="max-h-full w-auto object-contain group-hover:scale-[1.02] transition-transform"
                  />
                </div>
                <div className="px-3.5 py-2 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {ws.pen.brand} {ws.pen.model}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num text-[11px]">
                      {ws.pen.nib_size}
                    </span>
                  </div>
                  <span className="font-mono-num text-zinc-400 shrink-0 ml-2">
                    {ws.sample_date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 italic">
            No writing samples uploaded for this ink yet.
          </p>
        )}
      </div>

      {/* Pairing History Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pen Pairing &amp; Lifecycle History ({sessions.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 px-4">Fountain Pen</th>
                <th className="py-2.5 px-3">Nib</th>
                <th className="py-2.5 px-3">Date Inked</th>
                <th className="py-2.5 px-3">Scan</th>
                <th className="py-2.5 px-3">Date Cleaned</th>
                <th className="py-2.5 px-3 text-right">Duration</th>
                {isAdmin && <th className="py-2.5 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {sessions.map((s) => {
                const scanSample = s.samples.find(
                  (ws) => ws.scan_batch_id && ws.scan_page_number,
                );
                return (
                  <tr key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => onOpenPen(s.pen_id)}
                        className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600"
                      >
                        {s.pen.brand} {s.pen.model}
                        {s.pen.color_variant ? ` (${s.pen.color_variant})` : ''}
                      </button>
                      {s.session_notes && (
                        <div className="text-[11px] text-zinc-400 mt-0.5">{s.session_notes}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono-num">{s.pen.nib_size}</td>
                    <td className="py-2.5 px-3 font-mono-num text-zinc-600 dark:text-zinc-400">
                      {s.date_inked}
                    </td>
                    <td className="py-2.5 px-3">
                      {scanSample ? (
                        <button
                          onClick={() =>
                            onOpenScanPage(
                              scanSample.scan_batch_id!,
                              scanSample.scan_page_number!,
                              scanSample.id,
                            )
                          }
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-num border border-zinc-200 dark:border-zinc-700 hover:border-indigo-400 text-zinc-600 dark:text-zinc-300"
                        >
                          <FileScan className="w-2.5 h-2.5 text-indigo-500" />
                          Spread {scanSample.scan_page_number}
                        </button>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono-num">
                      {s.end_status === 'active' ? (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-sans font-medium">
                          Currently Inked
                        </span>
                      ) : (
                        <span className="text-zinc-500">{s.date_cleaned}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-medium">
                      {s.days_active}d
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => setEditingSession(s)}
                          className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showInkUpModal && (
        <QuickInkUpModal
          pens={allPens}
          inks={allInks}
          defaultInkId={ink.id}
          onClose={() => setShowInkUpModal(false)}
          onCompleted={() => {
            void loadDetail();
            onGlobalRefresh();
          }}
        />
      )}

      {showMergeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowMergeModal(false)}
        >
          <form
            onSubmit={handleMergeInk}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Merge Duplicate Ink</h3>
              <button type="button" onClick={() => setShowMergeModal(false)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <p className="text-zinc-500 leading-relaxed">
              Move all <strong>{ink.times_inked}</strong> ink-up sessions and{' '}
              <strong>{ink.sample_count}</strong> handwriting samples from{' '}
              <strong>
                {ink.brand} {ink.name}
              </strong>{' '}
              into the target ink below, then remove this duplicate record:
            </p>
            <select
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {otherInks.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.brand} {i.name} ({i.color_family})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
              >
                Merge Inks
              </button>
            </div>
          </form>
        </div>
      )}

      {editingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setEditingSession(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await api.updateSession(editingSession.id, {
                pen_id: editingSession.pen_id,
                ink_id: editingSession.ink_id,
                date_inked: editingSession.date_inked,
                date_cleaned:
                  editingSession.end_status === 'active' ? null : editingSession.date_cleaned,
                end_status: editingSession.end_status as 'active' | 'cleaned' | 'emptied',
                session_notes: editingSession.session_notes,
              });
              setEditingSession(null);
              await loadDetail();
              onGlobalRefresh();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-3.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Edit Fill Session</h3>
              <button type="button" onClick={() => setEditingSession(null)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Paired Pen</label>
                <select
                  value={editingSession.pen_id}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, pen_id: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                >
                  {allPens.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brand} {p.model} {p.color_variant ? `(${p.color_variant})` : ''} ·{' '}
                      {p.nib_size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Reassign Ink</label>
                <select
                  value={editingSession.ink_id}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, ink_id: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                >
                  {allInks.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.brand} {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Date Inked</label>
                  <input
                    type="date"
                    value={editingSession.date_inked}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, date_inked: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Status</label>
                  <select
                    value={editingSession.end_status}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, end_status: e.target.value })
                    }
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5"
                  >
                    <option value="cleaned">Cleaned</option>
                    <option value="active">Active</option>
                    <option value="emptied">Emptied</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Date Cleaned</label>
                  <input
                    type="date"
                    disabled={editingSession.end_status === 'active'}
                    value={editingSession.date_cleaned || ''}
                    onChange={(e) =>
                      setEditingSession({
                        ...editingSession,
                        date_cleaned: e.target.value || null,
                      })
                    }
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5 font-mono-num disabled:opacity-40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Notes</label>
                <input
                  value={editingSession.session_notes}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, session_notes: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Delete this fill session?')) return;
                  await api.deleteSession(editingSession.id);
                  setEditingSession(null);
                  await loadDetail();
                  onGlobalRefresh();
                }}
                className="text-red-600 hover:underline"
              >
                Delete Session
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
                >
                  Save Session
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <SampleLightbox
        sample={lightboxSample}
        pens={allPens}
        inks={allInks}
        onClose={() => setLightboxSample(null)}
        onNavigatePen={onOpenPen}
        onNavigateInk={onOpenInk}
        onOpenScanPage={onOpenScanPage}
        onSampleUpdated={(updated) => {
          setLightboxSample(updated);
          void loadDetail();
          onGlobalRefresh();
        }}
      />
    </div>
  );
};
