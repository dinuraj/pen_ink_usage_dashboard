import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Plus,
  Camera,
  Trash2,
  Edit3,
  GitMerge,
  GitFork,
  RotateCcw,
  Search,
  FileScan,
  CheckCircle2,
  Check,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { InkOut, PenDetailResponse, PenOut, SessionOut, WritingSampleOut } from '../types';
import { PEN_TAG_OPTIONS, PenTagBadge, StarRating } from '../components/FilterSortControls';
import { MarkdownNotes } from '../components/MarkdownNotes';
import { LifecycleActionModal, QuickInkUpModal } from '../components/ActionModals';
import { SampleLightbox } from '../components/SampleLightbox';

interface Props {
  penId: number;
  allPens: PenOut[];
  allInks: InkOut[];
  prevPen?: PenOut;
  nextPen?: PenOut;
  currentIndex?: number;
  totalCount?: number;
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
  prevPen,
  nextPen,
  currentIndex,
  totalCount,
  onBack,
  onOpenInk,
  onOpenPen,
  onOpenScanPage,
  onGlobalRefresh,
}) => {
  const { isAdmin } = useAuth();
  const [detail, setDetail] = useState<PenDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lifecycleMode, setLifecycleMode] = useState<'refill' | 'clean' | null>(null);
  const [showInkUpModal, setShowInkUpModal] = useState(false);
  const [lightboxSample, setLightboxSample] = useState<WritingSampleOut | null>(null);
  const [editingSpecs, setEditingSpecs] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionOut | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{
    message: string;
    actionPenId?: number;
    actionLabel?: string;
  } | null>(null);

  // Merge modal state (searchable + bidirectional: absorb into this pen OR merge this pen into another)
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeDirection, setMergeDirection] = useState<'absorb_into_this' | 'move_this_into_other'>(
    'absorb_into_this',
  );
  const [mergeQuery, setMergeQuery] = useState('');
  const [absorbPenIds, setAbsorbPenIds] = useState<number[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState<number>(0);
  const [mergingBusy, setMergingBusy] = useState(false);

  // Split sessions state (select fill rows -> move to new pen or existing pen)
  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitDestMode, setSplitDestMode] = useState<'new_pen' | 'existing_pen'>('new_pen');
  const [splitTargetPenId, setSplitTargetPenId] = useState<number>(0);
  const [splitSearch, setSplitSearch] = useState('');
  const [splitNewPen, setSplitNewPen] = useState({
    brand: '',
    model: '',
    color_variant: '',
    nib_size: 'M',
    nib_material: 'Steel',
    filling_mechanism: 'Converter',
  });
  const [splittingBusy, setSplittingBusy] = useState(false);

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
      setSelectedSessionIds([]);
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
    setBannerNotice(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
    void loadDetail();
  }, [loadDetail, penId]);

  // Keyboard navigation: Left/Right arrows to step through pens
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
      if (showMergeModal || showSplitModal || showInkUpModal || lifecycleMode || editingSpecs || editingSession || lightboxSample) {
        return;
      }
      if (e.key === 'ArrowLeft' && prevPen) {
        e.preventDefault();
        onOpenPen(prevPen.id);
      } else if (e.key === 'ArrowRight' && nextPen) {
        e.preventDefault();
        onOpenPen(nextPen.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevPen, nextPen, onOpenPen, showMergeModal, showSplitModal, showInkUpModal, lifecycleMode, editingSpecs, editingSession, lightboxSample]);

  if (loading || !detail) {
    return <div className="py-16 text-center text-xs text-zinc-400">Loading pen details...</div>;
  }

  const { pen, favorite_ink, sessions, samples, merge_history = [] } = detail;

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

  const handleTogglePenTag = async (tag: string) => {
    const current = pen.tags ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    await api.updatePen(pen.id, { tags: next });
    await loadDetail();
    onGlobalRefresh();
  };

  const handleRatingChange = async (nextRating: number | null) => {
    await api.updatePen(pen.id, { rating: nextRating });
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
  const filteredMergePens = otherPens.filter((p) =>
    `${p.brand} ${p.model} ${p.color_variant} ${p.nib_size}`
      .toLowerCase()
      .includes(mergeQuery.toLowerCase()),
  );
  const filteredSplitPens = otherPens.filter((p) =>
    `${p.brand} ${p.model} ${p.color_variant} ${p.nib_size}`
      .toLowerCase()
      .includes(splitSearch.toLowerCase()),
  );

  const openMergeModal = () => {
    setMergeQuery('');
    setAbsorbPenIds([]);
    setMergeTargetId(otherPens[0]?.id ?? 0);
    setMergeDirection('absorb_into_this');
    setShowMergeModal(true);
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMergingBusy(true);
    try {
      if (mergeDirection === 'absorb_into_this') {
        if (absorbPenIds.length === 0) return;
        await api.mergePensBulk({
          target_pen_id: pen.id,
          source_pen_ids: absorbPenIds,
        });
        setShowMergeModal(false);
        setBannerNotice({
          message: `Merged ${absorbPenIds.length} duplicate pen record(s) into ${pen.brand} ${pen.model}. You can undo anytime below.`,
        });
        await loadDetail();
        onGlobalRefresh();
      } else {
        if (!mergeTargetId) return;
        const merged = await api.mergePen(pen.id, mergeTargetId);
        setShowMergeModal(false);
        onGlobalRefresh();
        onOpenPen(merged.id);
      }
    } finally {
      setMergingBusy(false);
    }
  };

  const handleUndoMerge = async (mergeId: number, label: string) => {
    if (
      !window.confirm(
        `Undo merge of "${label}" and restore it as a separate pen with its original fill sessions and samples?`,
      )
    )
      return;
    const res = await api.undoPenMerge(mergeId);
    setBannerNotice({
      message: `Split "${res.restored_pen.brand} ${res.restored_pen.model}" back into its own pen record (${res.restored_pen.times_inked} fills restored).`,
      actionPenId: res.restored_pen.id,
      actionLabel: 'Open Restored Pen',
    });
    await loadDetail();
    onGlobalRefresh();
  };

  const openSplitModal = (preselected?: number[]) => {
    const initial = preselected ?? selectedSessionIds;
    if (initial.length > 0) {
      setSelectedSessionIds(initial);
    }
    setSplitDestMode('new_pen');
    setSplitSearch('');
    setSplitTargetPenId(otherPens[0]?.id ?? 0);
    setSplitNewPen({
      brand: pen.brand,
      model: pen.model,
      color_variant: '',
      nib_size: pen.nib_size,
      nib_material: pen.nib_material,
      filling_mechanism: pen.filling_mechanism,
    });
    setShowSplitModal(true);
  };

  const toggleSessionSelection = (sessionId: number) => {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId],
    );
  };

  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSessionIds.length === 0) return;
    setSplittingBusy(true);
    try {
      const res = await api.splitPenSessions(pen.id, {
        session_ids: selectedSessionIds,
        new_pen: splitDestMode === 'new_pen' ? splitNewPen : null,
        target_pen_id: splitDestMode === 'existing_pen' ? splitTargetPenId : null,
      });
      setShowSplitModal(false);
      setSelectedSessionIds([]);
      setBannerNotice({
        message: `Moved ${selectedSessionIds.length} fill session(s) and their samples to "${res.destination_pen.brand} ${res.destination_pen.model}${
          res.destination_pen.color_variant ? ` (${res.destination_pen.color_variant})` : ''
        }".`,
        actionPenId: res.destination_pen.id,
        actionLabel: 'Open Split Pen',
      });
      await loadDetail();
      onGlobalRefresh();
    } finally {
      setSplittingBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Next/Previous Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Pen Cabinet
          </button>

          {(prevPen || nextPen || totalCount) && (
            <div className="flex items-center gap-1 pl-2.5 border-l border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => prevPen && onOpenPen(prevPen.id)}
                disabled={!prevPen}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed transition"
                title={prevPen ? `Previous: ${prevPen.brand} ${prevPen.model} (Left Arrow)` : 'No previous pen in list'}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              {currentIndex !== undefined && totalCount !== undefined && (
                <span
                  className="px-2 text-[11px] font-mono-num text-zinc-500 whitespace-nowrap"
                  title="Position in current cabinet filter"
                >
                  {currentIndex + 1} of {totalCount}
                </span>
              )}

              <button
                onClick={() => nextPen && onOpenPen(nextPen.id)}
                disabled={!nextPen}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed transition"
                title={nextPen ? `Next: ${nextPen.brand} ${nextPen.model} (Right Arrow)` : 'No next pen in list'}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditingSpecs((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Specs
            </button>
            {otherPens.length > 0 && (
              <button
                onClick={openMergeModal}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Merge duplicate pen names together"
              >
                <GitMerge className="w-3.5 h-3.5 text-indigo-500" />
                Merge Duplicate
              </button>
            )}
            {sessions.length > 0 && (
              <button
                onClick={() => openSplitModal()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Split selected ink-up sessions out into a separate pen"
              >
                <GitFork className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Split Sessions
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

      {/* Confirmation / Split / Undo Banner */}
      {bannerNotice && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{bannerNotice.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {bannerNotice.actionPenId && (
              <button
                type="button"
                onClick={() => onOpenPen(bannerNotice.actionPenId!)}
                className="px-2.5 py-1 rounded-md bg-emerald-700 text-white font-medium hover:bg-emerald-600"
              >
                {bannerNotice.actionLabel || 'Open Pen'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="p-1 text-emerald-700 dark:text-emerald-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-4 bg-zinc-100 dark:bg-zinc-950 relative min-h-[190px] flex items-center justify-center border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 p-2">
            {pen.primary_photo_url ? (
              <img
                src={pen.primary_photo_url}
                alt={`${pen.brand} ${pen.model}`}
                className="w-full h-full max-h-56 object-contain"
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

            {/* Interactive Multi-Select Pen Tags & Star Rating Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-500 font-medium">Pen Tags:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {isAdmin ? (
                    PEN_TAG_OPTIONS.map((tag) => {
                      const active = (pen.tags ?? []).includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => void handleTogglePenTag(tag)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
                            active
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-500/20'
                              : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 opacity-65 hover:opacity-100'
                          }`}
                          title={`Toggle "${tag}" tag on this pen`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                              active
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-zinc-300 dark:border-zinc-700'
                            }`}
                          >
                            {active && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <PenTagBadge tag={tag} />
                        </button>
                      );
                    })
                  ) : (
                    (pen.tags && pen.tags.length > 0) ? (
                      pen.tags.map((tag) => <PenTagBadge key={tag} tag={tag} />)
                    ) : (
                      <span className="text-zinc-400">No tags</span>
                    )
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-medium">Rating:</span>
                <StarRating
                  value={pen.rating}
                  onChange={isAdmin ? handleRatingChange : undefined}
                  size="md"
                  showLabel
                />
              </div>
            </div>

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
                      <button
                        onClick={() => onOpenInk(pen.active_pairing!.ink_id)}
                        className="font-semibold hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        Currently Inked: {pen.active_pairing.ink_brand}{' '}
                        {pen.active_pairing.ink_name}
                      </button>
                      <div className="text-zinc-400 font-mono-num">
                        Since {pen.active_pairing.date_inked} · {pen.active_pairing.days_inked}d
                        active · {pen.active_pairing.refill_count} refills
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => setLifecycleMode('refill')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
                        Refill Pen
                      </button>
                      <button
                        onClick={() => setLifecycleMode('clean')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Mark Cleaned
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs text-zinc-500">
                    Currently clean and stored in cabinet.{' '}
                    {pen.last_cleaned_date && `Last cleaned ${pen.last_cleaned_date}.`}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => setShowInkUpModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ink Up This Pen
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pen KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-zinc-200 dark:border-zinc-800 divide-x divide-y md:divide-y-0 divide-zinc-200 dark:divide-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 text-xs">
          <div className="p-3.5">
            <div className="text-zinc-400">Times Inked</div>
            <div className="text-lg font-semibold font-mono-num mt-0.5">{pen.times_inked}</div>
          </div>
          <div className="p-3.5">
            <div className="text-zinc-400">Reservoir Refills</div>
            <div className="text-lg font-semibold font-mono-num mt-0.5">{pen.total_refills}</div>
          </div>
          <div className="p-3.5">
            <div className="text-zinc-400">Total Days Inked</div>
            <div className="text-lg font-semibold font-mono-num mt-0.5">
              {pen.total_days_inked}d{' '}
              <span className="text-xs font-normal text-zinc-400">
                (avg {pen.avg_days_inked}d/fill)
              </span>
            </div>
          </div>
          <div className="p-3.5">
            <div className="text-zinc-400">Most Paired Ink</div>
            {favorite_ink ? (
              <button
                onClick={() => onOpenInk(favorite_ink.id)}
                className="mt-1 inline-flex items-center gap-1.5 font-medium hover:text-indigo-600 truncate max-w-full"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: favorite_ink.hex_color }}
                />
                <span className="truncate">{favorite_ink.name}</span>
                <span className="font-mono-num text-zinc-400">({favorite_ink.count}×)</span>
              </button>
            ) : (
              <div className="text-zinc-400 mt-1">—</div>
            )}
          </div>
        </div>
      </div>

      {/* Merged Names / Undo Merge History Card */}
      {merge_history.length > 0 && (
        <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-950 dark:text-indigo-200">
              <GitMerge className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Merged Journal Aliases ({merge_history.length})</span>
            </div>
            <span className="text-[11px] text-zinc-500">
              Future scans using these names automatically match this pen · Click Undo to split back
            </span>
          </div>
          <div className="divide-y divide-indigo-100 dark:divide-indigo-900/40">
            {merge_history.map((mr) => (
              <div
                key={mr.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0 text-xs"
              >
                <div>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {mr.source_label}
                  </span>
                  <span className="ml-2 font-mono-num text-[11px] text-zinc-500">
                    ({mr.moved_sessions_count} fills · {mr.moved_samples_count} samples merged)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUndoMerge(mr.id, mr.source_label)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-zinc-900 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo Merge (Split Back)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standalone Custom Markdown Notes */}
      <MarkdownNotes
        title="Pen Notes & Nib Setup"
        editable={isAdmin}
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

      {/* Complete Lifecycle & Cleaning Timeline (with Checkboxes to Split Sessions!) */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Complete Ink-Up, Refill &amp; Cleaning History ({sessions.length})
            </h3>
            <p className="text-[11px] text-zinc-400">
              Select checkboxes on any fill rows to split them out into a separate pen record
            </p>
          </div>
          {isAdmin && sessions.length > 0 && (
            <button
              type="button"
              onClick={() => openSplitModal()}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedSessionIds.length > 0
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              {selectedSessionIds.length > 0
                ? `Split ${selectedSessionIds.length} Selected Fill${selectedSessionIds.length > 1 ? 's' : ''}…`
                : 'Split / Move Fills…'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                {isAdmin && <th className="py-2.5 pl-4 pr-2 w-8">Split</th>}
                <th className={`py-2.5 px-3 ${!isAdmin ? 'pl-4' : ''}`}>Ink Paired</th>
                <th className="py-2.5 px-3">Date Inked</th>
                <th className="py-2.5 px-4">Lifecycle Events / Source Scan</th>
                <th className="py-2.5 px-3">Date Cleaned</th>
                <th className="py-2.5 px-3 text-right">Duration</th>
                {isAdmin && <th className="py-2.5 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {sessions.map((s) => {
                const scanSample = s.samples.find(
                  (ws) => ws.scan_batch_id && ws.scan_page_number,
                );
                const checked = selectedSessionIds.includes(s.id);
                return (
                  <tr
                    key={s.id}
                    className={
                      checked
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30'
                    }
                  >
                    {isAdmin && (
                      <td className="py-2.5 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSessionSelection(s.id)}
                          className="rounded border-zinc-300 text-emerald-600 cursor-pointer"
                          title="Select session to split into another pen"
                        />
                      </td>
                    )}
                    <td className="py-2.5 px-3">
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
                    {isAdmin && (
                      <td className="py-2.5 px-3 text-right">
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

      {/* Searchable Bidirectional Merge Duplicate Modal */}
      {showMergeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowMergeModal(false)}
        >
          <form
            onSubmit={handleMergeSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold">Merge Duplicate Pen Records</h3>
              </div>
              <button type="button" onClick={() => setShowMergeModal(false)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
              <button
                type="button"
                onClick={() => setMergeDirection('absorb_into_this')}
                className={`py-1.5 px-2 rounded-md font-medium transition ${
                  mergeDirection === 'absorb_into_this'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Keep This Pen (Absorb Duplicates)
              </button>
              <button
                type="button"
                onClick={() => setMergeDirection('move_this_into_other')}
                className={`py-1.5 px-2 rounded-md font-medium transition ${
                  mergeDirection === 'move_this_into_other'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Move This Pen Into Another
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={mergeQuery}
                onChange={(e) => setMergeQuery(e.target.value)}
                placeholder="Search pens by brand, model, color, nib..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
              />
            </div>

            {mergeDirection === 'absorb_into_this' ? (
              <>
                <p className="text-zinc-500">
                  Tick one or more differently-named entries below to merge all their usage
                  sessions, ink dates, and samples into{' '}
                  <strong>
                    {pen.brand} {pen.model} {pen.color_variant ? `(${pen.color_variant})` : ''}
                  </strong>
                  :
                </p>
                <div className="max-h-56 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {filteredMergePens.map((p) => {
                    const checked = absorbPenIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer ${
                          checked
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setAbsorbPenIds((prev) =>
                                prev.includes(p.id)
                                  ? prev.filter((x) => x !== p.id)
                                  : [...prev, p.id],
                              )
                            }
                            className="rounded border-zinc-300 text-indigo-600"
                          />
                          <div className="truncate">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {p.brand} {p.model}
                            </span>
                            {p.color_variant && (
                              <span className="text-zinc-500 ml-1">({p.color_variant})</span>
                            )}
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num text-[10px]">
                              {p.nib_size}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono-num text-[11px] text-zinc-400 shrink-0">
                          {p.times_inked} fills
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="text-zinc-500">
                  Move all <strong>{pen.times_inked}</strong> fills and{' '}
                  <strong>{pen.sample_count}</strong> samples from{' '}
                  <strong>
                    {pen.brand} {pen.model}
                  </strong>{' '}
                  into the target pen below:
                </p>
                <div className="max-h-56 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {filteredMergePens.map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 cursor-pointer ${
                        mergeTargetId === p.id
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="radio"
                          name="mergeTarget"
                          checked={mergeTargetId === p.id}
                          onChange={() => setMergeTargetId(p.id)}
                          className="text-indigo-600"
                        />
                        <div className="truncate">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {p.brand} {p.model}
                          </span>
                          {p.color_variant && (
                            <span className="text-zinc-500 ml-1">({p.color_variant})</span>
                          )}
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num text-[10px]">
                            {p.nib_size}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono-num text-[11px] text-zinc-400 shrink-0">
                        {p.times_inked} fills
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <p className="text-[11px] text-zinc-400">
              Every merge is recorded and can be reversed in 1 click via{' '}
              <strong>Undo Merge (Split Back)</strong>, or split session-by-session anytime.
            </p>

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
                disabled={
                  mergingBusy ||
                  (mergeDirection === 'absorb_into_this'
                    ? absorbPenIds.length === 0
                    : !mergeTargetId)
                }
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-45"
              >
                {mergingBusy ? 'Merging...' : 'Merge Pens'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Split Selected Fill Sessions Modal */}
      {showSplitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowSplitModal(false)}
        >
          <form
            onSubmit={handleSplitSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitFork className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold">
                  Split Fill Sessions into a Separate Pen
                </h3>
              </div>
              <button type="button" onClick={() => setShowSplitModal(false)}>
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <p className="text-zinc-500">
              Tick the ink-up sessions below that actually belong to a different pen. Their ink
              dates, cleaning dates, refills, and handwriting samples will all move together:
            </p>

            {/* Step 1: Checkable Sessions List with Sample Preview */}
            <div className="max-h-56 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
              {sessions.map((s) => {
                const checked = selectedSessionIds.includes(s.id);
                const thumb = s.samples[0]?.image_url;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer ${
                      checked
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSessionSelection(s.id)}
                        className="rounded border-zinc-300 text-emerald-600"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                          <span className="font-mono-num text-zinc-500">{s.date_inked}</span>
                          <span>·</span>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.ink.hex_color }}
                          />
                          <span className="truncate">
                            {s.ink.brand} {s.ink.name}
                          </span>
                        </div>
                        {s.session_notes && (
                          <div className="text-[11px] text-zinc-400 truncate">
                            {s.session_notes}
                          </div>
                        )}
                      </div>
                    </div>
                    {thumb && (
                      <img
                        src={thumb}
                        alt="Sample"
                        className="h-9 w-28 object-contain rounded border border-zinc-200 bg-[#fcfaf4] shrink-0"
                      />
                    )}
                  </label>
                );
              })}
            </div>

            {/* Step 2: Destination Pen (New vs Existing) */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1">
                <button
                  type="button"
                  onClick={() => setSplitDestMode('new_pen')}
                  className={`py-1.5 px-2 rounded-md font-medium transition ${
                    splitDestMode === 'new_pen'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Create New Pen for Split Fills
                </button>
                <button
                  type="button"
                  onClick={() => setSplitDestMode('existing_pen')}
                  className={`py-1.5 px-2 rounded-md font-medium transition ${
                    splitDestMode === 'existing_pen'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  Move to Existing Pen
                </button>
              </div>

              {splitDestMode === 'new_pen' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/50 p-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Brand *</label>
                    <input
                      required
                      value={splitNewPen.brand}
                      onChange={(e) => setSplitNewPen({ ...splitNewPen, brand: e.target.value })}
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Model *</label>
                    <input
                      required
                      value={splitNewPen.model}
                      onChange={(e) => setSplitNewPen({ ...splitNewPen, model: e.target.value })}
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">
                      Color / Distinguishing Variant
                    </label>
                    <input
                      value={splitNewPen.color_variant}
                      onChange={(e) =>
                        setSplitNewPen({ ...splitNewPen, color_variant: e.target.value })
                      }
                      placeholder="e.g., Matte Black, B Nib..."
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Nib Size</label>
                    <input
                      value={splitNewPen.nib_size}
                      onChange={(e) => setSplitNewPen({ ...splitNewPen, nib_size: e.target.value })}
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Nib Material</label>
                    <input
                      value={splitNewPen.nib_material}
                      onChange={(e) =>
                        setSplitNewPen({ ...splitNewPen, nib_material: e.target.value })
                      }
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Mechanism</label>
                    <input
                      value={splitNewPen.filling_mechanism}
                      onChange={(e) =>
                        setSplitNewPen({ ...splitNewPen, filling_mechanism: e.target.value })
                      }
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={splitSearch}
                      onChange={(e) => setSplitSearch(e.target.value)}
                      placeholder="Filter destination pen..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {filteredSplitPens.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                          splitTargetPenId === p.id
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="splitTargetPen"
                            checked={splitTargetPenId === p.id}
                            onChange={() => setSplitTargetPenId(p.id)}
                          />
                          <span>
                            <strong>
                              {p.brand} {p.model}
                            </strong>{' '}
                            {p.color_variant ? `(${p.color_variant})` : ''} · {p.nib_size}
                          </span>
                        </div>
                        <span className="font-mono-num text-zinc-400">{p.times_inked} fills</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-zinc-500">
                <strong>{selectedSessionIds.length}</strong> of {sessions.length} session(s)
                selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSplitModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    splittingBusy ||
                    selectedSessionIds.length === 0 ||
                    (splitDestMode === 'existing_pen' && !splitTargetPenId)
                  }
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-45"
                >
                  {splittingBusy
                    ? 'Splitting...'
                    : `Split ${selectedSessionIds.length} Session${selectedSessionIds.length === 1 ? '' : 's'}`}
                </button>
              </div>
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
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5"
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
