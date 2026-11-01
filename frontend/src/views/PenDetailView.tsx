import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Sparkles,
  Plus,
  Camera,
  Trash2,
  Edit3,
  GitMerge,
  FileScan,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { InkOut, PenDetailResponse, PenOut, SessionOut, WritingSampleOut } from '../types';
import { MarkdownNotes } from '../components/MarkdownNotes';
import { LifecycleActionModal, QuickInkUpModal } from '../components/ActionModals';
import { SampleLightbox } from '../components/SampleLightbox';

interface Props {
  penId: number;
  allPens: PenOut[];
  allInks: InkOut[];
  onBack: () => void;
  onOpenInk: (inkId: number) => void;
  onOpenPen: (penId: number) => void;
  onOpenScanPage: (batchId: number, pageNumber: number, sampleId: number) => void;
  onGlobalRefresh: () => void;
}

export const PenDetailView: React.FC<Props> = ({
  penId,
  allPens,
  allInks,
  onBack,
  onOpenInk,
  onOpenPen,
  onOpenScanPage,
  onGlobalRefresh,
}) => {
  const [detail, setDetail] = useState<PenDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lifecycleMode, setLifecycleMode] = useState<'refill' | 'clean' | null>(null);
  const [showInkUpModal, setShowInkUpModal] = useState(false);
  const [lightboxSample, setLightboxSample] = useState<WritingSampleOut | null>(null);
  const [editingSpecs, setEditingSpecs] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number>(0);
  const [editingSession, setEditingSession] = useState<SessionOut | null>(null);
  const [specForm, setSpecForm] = useState({
    brand: '',
    model: '',
    color_variant: '',
    nib_size: '',
    nib_material: '',
    filling_mechanism: '',
  });

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPenDetail(penId);
      setDetail(res);
      setSpecForm({
        brand: res.pen.brand,
        model: res.pen.model,
        color_variant: res.pen.color_variant,
        nib_size: res.pen.nib_size,
        nib_material: res.pen.nib_material,
        filling_mechanism: res.pen.filling_mechanism,
      });
    } finally {
      setLoading(false);
    }
  }, [penId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (loading || !detail) {
    return <div className="py-16 text-center text-xs text-zinc-400">Loading pen details...</div>;
  }

  const { pen, favorite_ink, sessions, samples } = detail;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await api.uploadPenPhoto(pen.id, file, `${pen.brand} ${pen.model}`);
    await loadDetail();
    onGlobalRefresh();
  };

  const handleSaveSpecs = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.updatePen(pen.id, specForm);
    setEditingSpecs(false);
    await loadDetail();
    onGlobalRefresh();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${pen.brand} ${pen.model} and its history?`)) return;
    await api.deletePen(pen.id);
    onGlobalRefresh();
    onBack();
  };

  const otherPens = allPens.filter((p) => p.id !== pen.id);

  const handleMergePen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeTargetId) return;
    const merged = await api.mergePen(pen.id, mergeTargetId);
    setShowMergeModal(false);
    onGlobalRefresh();
    onOpenPen(merged.id);
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Pen Cabinet
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingSpecs((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Specs
          </button>
          {otherPens.length > 0 && (
            <button
              onClick={() => {
                setMergeTargetId(otherPens[0].id);
                setShowMergeModal(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Merge duplicate pen entry into another pen"
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
      </div>

      {/* Hero Card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-4 bg-zinc-100 dark:bg-zinc-950 relative min-h-[190px] flex items-center justify-center border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
            {pen.primary_photo_url ? (
              <img
                src={pen.primary_photo_url}
                alt={`${pen.brand} ${pen.model}`}
                className="w-full h-full max-h-56 object-cover"
              />
            ) : (
              <span className="text-xs text-zinc-400">No pen photo yet</span>
            )}
            <label className="absolute bottom-3 right-3 cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/70 text-white text-[11px] font-medium hover:bg-black/85">
              <Camera className="w-3 h-3" />
              Upload Photo
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>

          <div className="md:col-span-8 p-5 flex flex-col justify-between gap-4">
            {editingSpecs ? (
              <form onSubmit={handleSaveSpecs} className="grid grid-cols-3 gap-2.5 text-xs">
                <input
                  value={specForm.brand}
                  onChange={(e) => setSpecForm({ ...specForm, brand: e.target.value })}
                  placeholder="Brand"
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                />
                <input
                  value={specForm.model}
                  onChange={(e) => setSpecForm({ ...specForm, model: e.target.value })}
                  placeholder="Model"
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                />
                <input
                  value={specForm.color_variant}
                  onChange={(e) => setSpecForm({ ...specForm, color_variant: e.target.value })}
                  placeholder="Color / Variant"
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                />
                <input
                  value={specForm.nib_size}
                  onChange={(e) => setSpecForm({ ...specForm, nib_size: e.target.value })}
                  placeholder="Nib Size"
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                />
                <input
                  value={specForm.nib_material}
                  onChange={(e) => setSpecForm({ ...specForm, nib_material: e.target.value })}
                  placeholder="Nib Material"
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                />
                <div className="flex gap-2">
                  <input
                    value={specForm.filling_mechanism}
                    onChange={(e) =>
                      setSpecForm({ ...specForm, filling_mechanism: e.target.value })
                    }
                    placeholder="Mechanism"
                    className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {pen.brand}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono-num font-semibold bg-zinc-100 dark:bg-zinc-800">
                    {pen.nib_size} · {pen.nib_material}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {pen.filling_mechanism}
                  </span>
                </div>
                <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  {pen.model}
                  {pen.color_variant && (
                    <span className="text-zinc-400 font-normal ml-2">— {pen.color_variant}</span>
                  )}
                </h1>
              </div>
            )}

            {/* Active Status & Lifecycle Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              {pen.is_currently_inked && pen.active_pairing ? (
                <>
                  <div className="flex items-center gap-2.5 text-xs">
                    <span
                      className="w-3.5 h-3.5 rounded-full ring-2 ring-black/10"
                      style={{ backgroundColor: pen.active_pairing.ink_hex }}
                    />
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Currently Inked:{' '}
                        <button
                          onClick={() => onOpenInk(pen.active_pairing!.ink_id)}
                          className="hover:underline text-indigo-600 dark:text-indigo-400"
                        >
                          {pen.active_pairing.ink_brand} {pen.active_pairing.ink_name}
                        </button>
                      </div>
                      <div className="text-zinc-500 font-mono-num">
                        Inked {pen.active_pairing.date_inked} · {pen.active_pairing.days_inked} days
                        active · {pen.active_pairing.refill_count} refills
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => setLifecycleMode('refill')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                      Log Refill
                    </button>
                    <button
                      onClick={() => setLifecycleMode('clean')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium hover:opacity-90"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Mark Cleaned / Empty
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-zinc-500">
                    Status:{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Clean &amp; Uninked
                    </span>{' '}
                    {pen.last_cleaned_date && `(last flushed ${pen.last_cleaned_date})`}
                  </div>
                  <button
                    onClick={() => setShowInkUpModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ink Up This Pen
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pen KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Times Inked</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{pen.times_inked}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Reservoir Refills</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{pen.total_refills}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Total Days Inked</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{pen.total_days_inked}d</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
          <div className="text-[11px] text-zinc-500">Avg Fill Duration</div>
          <div className="text-xl font-semibold font-mono-num mt-1">{pen.avg_days_inked}d</div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 col-span-2 md:col-span-1">
          <div className="text-[11px] text-zinc-500">Most Paired Ink</div>
          {favorite_ink ? (
            <button
              onClick={() => onOpenInk(favorite_ink.id)}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold hover:text-indigo-600 truncate max-w-full"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: favorite_ink.hex_color }}
              />
              <span className="truncate">{favorite_ink.name}</span>
              <span className="text-zinc-400 font-mono-num">({favorite_ink.count}×)</span>
            </button>
          ) : (
            <div className="text-xs text-zinc-400 mt-1">—</div>
          )}
        </div>
      </div>

      {/* Standalone Custom Notes */}
      <MarkdownNotes
        title="Pen Notes & Nib Setup"
        placeholder="Record standalone notes about this pen (nib feel, tuning history, converter type, favorite papers)..."
        value={pen.custom_notes}
        onSave={async (next) => {
          await api.updatePen(pen.id, { custom_notes: next });
          await loadDetail();
        }}
      />

      {/* Writing Samples Gallery for this Pen */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Handwriting Samples with This Pen ({samples.length})
            </h3>
            <p className="text-xs text-zinc-500">
              Compare how this {pen.nib_size} nib writes across different inks
            </p>
          </div>
        </div>
        {samples.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {samples.map((ws) => (
              <div
                key={ws.id}
                onClick={() => setLightboxSample(ws)}
                className="cursor-pointer group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-[#fcfaf4] hover:border-indigo-400 transition"
              >
                <div className="h-40 overflow-hidden flex items-center justify-center p-2">
                  <img
                    src={ws.image_url}
                    alt={ws.caption}
                    className="max-h-full w-auto object-contain group-hover:scale-[1.02] transition-transform"
                  />
                </div>
                <div className="px-3.5 py-2 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: ws.ink.hex_color }}
                    />
                    <span className="truncate">
                      {ws.ink.brand} {ws.ink.name}
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
            No writing samples attached to this pen yet.
          </p>
        )}
      </div>

      {/* Complete Lifecycle & Cleaning Timeline */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Complete Ink-Up, Refill &amp; Cleaning History ({sessions.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 px-4">Ink Paired</th>
                <th className="py-2.5 px-3">Date Inked</th>
                <th className="py-2.5 px-4">Lifecycle Events / Source Scan</th>
                <th className="py-2.5 px-3">Date Cleaned</th>
                <th className="py-2.5 px-3 text-right">Duration</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
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
                        onClick={() => onOpenInk(s.ink_id)}
                        className="inline-flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600"
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: s.ink.hex_color }}
                        />
                        {s.ink.brand} {s.ink.name}
                      </button>
                      {s.session_notes && (
                        <div className="text-[11px] text-zinc-400 mt-0.5">{s.session_notes}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono-num text-zinc-600 dark:text-zinc-400">
                      {s.date_inked}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.events.map((ev) => (
                          <span
                            key={ev.id}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono-num ${
                              ev.event_type === 'inked'
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                                : ev.event_type === 'refilled'
                                  ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {ev.event_type} · {ev.event_date}
                          </span>
                        ))}
                        {scanSample && (
                          <button
                            onClick={() =>
                              onOpenScanPage(
                                scanSample.scan_batch_id!,
                                scanSample.scan_page_number!,
                                scanSample.id,
                              )
                            }
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-num border border-zinc-200 dark:border-zinc-700 hover:border-indigo-400 text-zinc-600 dark:text-zinc-300"
                            title="Verify or re-crop against original notebook scan"
                          >
                            <FileScan className="w-2.5 h-2.5 text-indigo-500" />
                            Spread {scanSample.scan_page_number}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono-num">
                      {s.end_status === 'active' ? (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-sans font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="text-zinc-500">{s.date_cleaned}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-medium">
                      {s.days_active}d
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setEditingSession(s)}
                        className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {lifecycleMode && pen.active_pairing && (
        <LifecycleActionModal
          mode={lifecycleMode}
          sessionId={pen.active_pairing.session_id}
          penLabel={`${pen.brand} ${pen.model} (${pen.nib_size})`}
          inkLabel={`${pen.active_pairing.ink_brand} ${pen.active_pairing.ink_name}`}
          inkHex={pen.active_pairing.ink_hex}
          onClose={() => setLifecycleMode(null)}
          onCompleted={() => {
            void loadDetail();
            onGlobalRefresh();
          }}
        />
      )}

      {showInkUpModal && (
        <QuickInkUpModal
          pens={allPens}
          inks={allInks}
          defaultPenId={pen.id}
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
            onSubmit={handleMergePen}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Merge Duplicate Pen</h3>
              <button type="button" onClick={() => setShowMergeModal(false)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <p className="text-zinc-500 leading-relaxed">
              Move all <strong>{pen.times_inked}</strong> ink-up sessions and{' '}
              <strong>{pen.sample_count}</strong> handwriting samples from{' '}
              <strong>
                {pen.brand} {pen.model} {pen.color_variant ? `(${pen.color_variant})` : ''}
              </strong>{' '}
              into the target pen below, then remove this duplicate record:
            </p>
            <select
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {otherPens.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.model} {p.color_variant ? `(${p.color_variant})` : ''} · {p.nib_size}
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
                Merge Pens
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
                <label className="block text-[11px] text-zinc-500 mb-1">Reassign Pen</label>
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
                <label className="block text-[11px] text-zinc-500 mb-1">Paired Ink</label>
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
