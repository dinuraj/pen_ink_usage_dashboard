import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Sparkles,
  CheckCircle2,
  Plus,
  Pipette,
  AlertCircle,
  Trash2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  ExternalLink,
  Check,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type {
  CropBox,
  ExtractedEntryCandidate,
  ImportedPageEntryOut,
  InkOut,
  PenOut,
  ScanBatchOut,
} from '../types';

interface Props {
  pens: PenOut[];
  inks: InkOut[];
  geminiConfigured: boolean;
  initialBatchId?: number;
  initialPageNumber?: number;
  initialSampleId?: number;
  onCommitted: () => void;
  onOpenSettings: () => void;
  onOpenPen: (penId: number) => void;
  onOpenInk: (inkId: number) => void;
}

interface EditableCandidate extends ExtractedEntryCandidate {
  createNewPen: boolean;
  createNewInk: boolean;
  newInkMoiUrl: string;
}

interface EditableImported extends ImportedPageEntryOut {
  dirty: boolean;
  boxDirty: boolean;
  createNewPen: boolean;
  newPenBrand: string;
  newPenModel: string;
  newPenColor: string;
  newPenNib: string;
  createNewInk: boolean;
  newInkBrand: string;
  newInkName: string;
  newInkFamily: string;
  newInkHex: string;
  sampledHex: string | null;
  sampledFamily: string | null;
}

function toEditableCandidate(c: ExtractedEntryCandidate): EditableCandidate {
  return {
    ...c,
    createNewPen: c.matched_pen_id === null,
    createNewInk: c.matched_ink_id === null,
    newInkMoiUrl: '',
  };
}

function toEditableImported(item: ImportedPageEntryOut): EditableImported {
  return {
    ...item,
    dirty: false,
    boxDirty: false,
    createNewPen: false,
    newPenBrand: item.pen.brand,
    newPenModel: item.pen.model,
    newPenColor: item.pen.color_variant,
    newPenNib: item.pen.nib_size || 'M',
    createNewInk: false,
    newInkBrand: item.ink.brand,
    newInkName: item.ink.name,
    newInkFamily: item.ink.color_family || 'Blue',
    newInkHex: item.ink.hex_color || '#1d4ed8',
    sampledHex: null,
    sampledFamily: null,
  };
}

export const ScanStudioView: React.FC<Props> = ({
  pens,
  inks,
  geminiConfigured,
  initialBatchId,
  initialPageNumber,
  initialSampleId,
  onCommitted,
  onOpenSettings,
  onOpenPen,
  onOpenInk,
}) => {
  const { isAdmin } = useAuth();
  const [batches, setBatches] = useState<ScanBatchOut[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [activePageNum, setActivePageNum] = useState<number>(1);
  const [studioMode, setStudioMode] = useState<'verify' | 'stage'>('verify');
  const [zoomed, setZoomed] = useState<boolean>(false);

  // Staging mode state (for newly uploaded / re-analyzed scans)
  const [candidatesByPage, setCandidatesByPage] = useState<Record<number, EditableCandidate[]>>({});
  const [selectedCandUid, setSelectedCandUid] = useState<string | null>(null);

  // Verify & Correct mode state (for imported / committed entries)
  const [importedByPage, setImportedByPage] = useState<Record<number, EditableImported[]>>({});
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);
  const [savingSampleId, setSavingSampleId] = useState<number | null>(null);

  // Inline "Add Missed Entry on Committed Page" state
  const [addingMissed, setAddingMissed] = useState<{
    date_inked: string;
    end_status: 'active' | 'cleaned' | 'emptied';
    pen_id: number | null;
    createNewPen: boolean;
    pen_brand: string;
    pen_model: string;
    pen_color: string;
    nib_size: string;
    ink_id: number | null;
    createNewInk: boolean;
    ink_brand: string;
    ink_name: string;
    ink_family: string;
    ink_hex: string;
    transcription: string;
    caption: string;
    crop_box: CropBox;
    saving: boolean;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [dragState, setDragState] = useState<{
    targetType: 'candidate' | 'imported' | 'missed';
    id: string | number;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origBox: CropBox;
  } | null>(null);

  const hydrateBatchState = (
    batch: ScanBatchOut,
    targetPage?: number,
    targetSample?: number,
    forceMode?: 'verify' | 'stage',
  ) => {
    setSelectedBatchId(batch.id);
    const candMap: Record<number, EditableCandidate[]> = {};
    const impMap: Record<number, EditableImported[]> = {};
    let totalImported = 0;
    for (const p of batch.pages) {
      candMap[p.page_number] = (p.candidates || []).map(toEditableCandidate);
      impMap[p.page_number] = (p.imported_entries || []).map(toEditableImported);
      totalImported += impMap[p.page_number].length;
    }
    setCandidatesByPage(candMap);
    setImportedByPage(impMap);

    const nextMode = forceMode ?? (totalImported > 0 || batch.status === 'committed' ? 'verify' : 'stage');
    setStudioMode(nextMode);

    // Pick initial page: explicit targetPage, or first page that has entries, or Page 1
    let pageToOpen = targetPage;
    if (!pageToOpen) {
      if (nextMode === 'verify') {
        const firstWithImp = batch.pages.find((p) => (p.imported_entries || []).length > 0);
        pageToOpen = firstWithImp?.page_number ?? 1;
      } else {
        const firstWithCand = batch.pages.find((p) => (p.candidates || []).length > 0);
        pageToOpen = firstWithCand?.page_number ?? 1;
      }
    }
    setActivePageNum(pageToOpen);
    setAddingMissed(null);

    if (targetSample) {
      setSelectedSampleId(targetSample);
    } else {
      setSelectedSampleId(impMap[pageToOpen]?.[0]?.sample_id ?? null);
    }
    setSelectedCandUid(candMap[pageToOpen]?.[0]?.entry_uid ?? null);
  };

  const loadBatches = async (
    preferBatchId?: number,
    preferPage?: number,
    preferSample?: number,
    forceMode?: 'verify' | 'stage',
  ) => {
    const list = await api.listScans();
    setBatches(list);
    const chosen =
      (preferBatchId ? list.find((b) => b.id === preferBatchId) : null) || list[0] || null;
    if (chosen) {
      hydrateBatchState(chosen, preferPage, preferSample, forceMode);
    }
  };

  useEffect(() => {
    void loadBatches(initialBatchId, initialPageNumber, initialSampleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBatchId, initialPageNumber, initialSampleId]);

  const currentBatch = batches.find((b) => b.id === selectedBatchId) ?? null;
  const currentPage =
    currentBatch?.pages.find((p) => p.page_number === activePageNum) ??
    currentBatch?.pages[0] ??
    null;

  const pageCandidates = currentPage ? candidatesByPage[currentPage.page_number] || [] : [];
  const pageImported = currentPage ? importedByPage[currentPage.page_number] || [] : [];

  const updateCandidate = (uid: string, patch: Partial<EditableCandidate>) => {
    if (!currentPage) return;
    setCandidatesByPage((prev) => ({
      ...prev,
      [currentPage.page_number]: (prev[currentPage.page_number] || []).map((c) =>
        c.entry_uid === uid ? { ...c, ...patch } : c,
      ),
    }));
  };

  const updateImportedLocal = (
    sampleId: number,
    patch: Partial<EditableImported>,
    isBoxChange = false,
  ) => {
    if (!currentPage) return;
    setImportedByPage((prev) => ({
      ...prev,
      [currentPage.page_number]: (prev[currentPage.page_number] || []).map((item) =>
        item.sample_id === sampleId
          ? {
              ...item,
              ...patch,
              dirty: true,
              boxDirty: item.boxDirty || isBoxChange,
            }
          : item,
      ),
    }));
  };

  // Drag / resize pointer effect for both modes + missed entry box
  useEffect(() => {
    if (!dragState || !containerRef.current || !currentPage) return;

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (e.clientX - dragState.startX) / rect.width;
      const dy = (e.clientY - dragState.startY) / rect.height;

      const b = dragState.origBox;
      let nextBox: CropBox;
      if (dragState.mode === 'move') {
        const nx = Math.max(0, Math.min(1 - b.w, b.x + dx));
        const ny = Math.max(0, Math.min(1 - b.h, b.y + dy));
        nextBox = { ...b, x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) };
      } else {
        const nw = Math.max(0.08, Math.min(1 - b.x, b.w + dx));
        const nh = Math.max(0.05, Math.min(1 - b.y, b.h + dy));
        nextBox = { ...b, w: Number(nw.toFixed(3)), h: Number(nh.toFixed(3)) };
      }

      if (dragState.targetType === 'candidate') {
        updateCandidate(String(dragState.id), { crop_box: nextBox });
      } else if (dragState.targetType === 'imported') {
        updateImportedLocal(Number(dragState.id), { crop_box: nextBox }, true);
      } else if (dragState.targetType === 'missed') {
        setAddingMissed((prev) => (prev ? { ...prev, crop_box: nextBox } : null));
      }
    };

    const handleUp = () => setDragState(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState]);

  const handleSelectPage = (pageNum: number) => {
    setActivePageNum(pageNum);
    setAddingMissed(null);
    if (studioMode === 'verify') {
      setSelectedSampleId(importedByPage[pageNum]?.[0]?.sample_id ?? null);
    } else {
      setSelectedCandUid(candidatesByPage[pageNum]?.[0]?.entry_uid ?? null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setBannerMsg(null);
    try {
      const uploaded = await api.uploadScan(file);
      const analyzed = await api.analyzeScan(uploaded.id);
      await loadBatches(analyzed.batch.id, 1, undefined, 'stage');
      setBannerMsg(
        `Uploaded "${uploaded.original_filename}" (${uploaded.page_count} page${
          uploaded.page_count > 1 ? 's' : ''
        }) and extracted candidate entries via ${
          analyzed.mode_used === 'gemini_vision' ? 'Gemini Vision AI' : '2-Column Spread Analyzer'
        }. Review & tweak crop boxes before committing.`,
      );
    } finally {
      setUploading(false);
    }
  };

  // ---------- Verify & Correct Mode Actions ----------

  const handleSaveImportedCorrection = async (item: EditableImported) => {
    setSavingSampleId(item.sample_id);
    setBannerMsg(null);
    try {
      await api.updateSample(item.sample_id, {
        pen_id: item.createNewPen ? null : item.pen_id,
        new_pen: item.createNewPen
          ? {
              brand: item.newPenBrand || 'Unknown',
              model: item.newPenModel || 'Pen',
              color_variant: item.newPenColor,
              nib_size: item.newPenNib || 'M',
              nib_material: 'Steel',
              filling_mechanism: 'Converter',
            }
          : null,
        ink_id: item.createNewInk ? null : item.ink_id,
        new_ink: item.createNewInk
          ? {
              brand: item.newInkBrand || 'Unknown',
              name: item.newInkName || 'Ink',
              color_family: item.newInkFamily || 'Blue',
              hex_color: item.newInkHex || '#1d4ed8',
              format: 'bottle',
              volume_ml: 50,
              remaining_level: 'full',
            }
          : null,
        sample_date: item.sample_date,
        date_cleaned: item.end_status === 'active' ? null : item.date_cleaned,
        clear_date_cleaned: item.end_status === 'active',
        end_status: item.end_status as 'active' | 'cleaned' | 'emptied',
        caption: item.caption,
        transcription: item.transcription,
        session_notes: item.transcription,
        crop_box: item.boxDirty ? item.crop_box : undefined,
      });

      const refreshed = await api.getScan(currentBatch!.id);
      setBatches((prev) => prev.map((b) => (b.id === refreshed.id ? refreshed : b)));
      hydrateBatchState(refreshed, currentPage?.page_number, item.sample_id, 'verify');
      onCommitted();
      setBannerMsg(
        item.boxDirty
          ? 'Saved OCR corrections & re-cropped high-DPI writing sample from scan page!'
          : 'Saved OCR corrections & updated usage history!',
      );
    } finally {
      setSavingSampleId(null);
    }
  };

  const handleResetImportedCard = (sampleId: number) => {
    if (!currentPage) return;
    const orig = currentPage.imported_entries.find((e) => e.sample_id === sampleId);
    if (!orig) return;
    setImportedByPage((prev) => ({
      ...prev,
      [currentPage.page_number]: (prev[currentPage.page_number] || []).map((item) =>
        item.sample_id === sampleId ? toEditableImported(orig) : item,
      ),
    }));
  };

  const handleDeleteImportedEntry = async (item: EditableImported) => {
    if (
      !window.confirm(
        `Delete this entry (${item.pen.brand} ${item.pen.model} × ${item.ink.brand} ${item.ink.name} on ${item.sample_date}) and remove its fill session?`,
      )
    )
      return;
    await api.deleteSample(item.sample_id, true);
    const refreshed = await api.getScan(currentBatch!.id);
    setBatches((prev) => prev.map((b) => (b.id === refreshed.id ? refreshed : b)));
    hydrateBatchState(refreshed, currentPage?.page_number, undefined, 'verify');
    onCommitted();
    setBannerMsg('Deleted entry and its linked usage session.');
  };

  const handleSampleImportedSwatch = async (item: EditableImported) => {
    if (!currentPage) return;
    const res = await api.samplePageInkColor(currentPage.id, item.crop_box);
    setImportedByPage((prev) => ({
      ...prev,
      [currentPage.page_number]: (prev[currentPage.page_number] || []).map((entry) =>
        entry.sample_id === item.sample_id
          ? {
              ...entry,
              sampledHex: res.hex_color,
              sampledFamily: res.color_family,
              newInkHex: res.hex_color,
              newInkFamily: res.color_family,
            }
          : entry,
      ),
    }));
  };

  const handleApplySwatchToInk = async (inkId: number, hexColor: string, colorFamily: string) => {
    await api.updateInk(inkId, { hex_color: hexColor, color_family: colorFamily });
    if (currentBatch) {
      const refreshed = await api.getScan(currentBatch.id);
      setBatches((prev) => prev.map((b) => (b.id === refreshed.id ? refreshed : b)));
      hydrateBatchState(refreshed, currentPage?.page_number, selectedSampleId ?? undefined, 'verify');
    }
    onCommitted();
    setBannerMsg(`Updated ink swatch color to ${hexColor.toUpperCase()} (${colorFamily}).`);
  };

  const handleStartAddMissed = () => {
    if (!currentPage) return;
    const defaultDate =
      pageImported[pageImported.length - 1]?.sample_date || new Date().toISOString().slice(0, 10);
    setAddingMissed({
      date_inked: defaultDate,
      end_status: currentPage.page_number === currentBatch?.page_count ? 'active' : 'cleaned',
      pen_id: pens[0]?.id ?? null,
      createNewPen: pens.length === 0,
      pen_brand: '',
      pen_model: '',
      pen_color: '',
      nib_size: 'M',
      ink_id: inks[0]?.id ?? null,
      createNewInk: inks.length === 0,
      ink_brand: '',
      ink_name: '',
      ink_family: 'Blue',
      ink_hex: '#1d4ed8',
      transcription: '',
      caption: '',
      crop_box: { x: 0.51, y: 0.15, w: 0.46, h: 0.22 },
      saving: false,
    });
  };

  const handleSaveMissedEntry = async () => {
    if (!currentPage || !addingMissed) return;
    setAddingMissed((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const updatedBatch = await api.addEntryOnScanPage(currentPage.id, {
        date_inked: addingMissed.date_inked,
        end_status: addingMissed.end_status,
        pen_id: addingMissed.createNewPen ? null : addingMissed.pen_id,
        new_pen: addingMissed.createNewPen
          ? {
              brand: addingMissed.pen_brand || 'Unknown',
              model: addingMissed.pen_model || 'Pen',
              color_variant: addingMissed.pen_color,
              nib_size: addingMissed.nib_size || 'M',
              nib_material: 'Steel',
              filling_mechanism: 'Converter',
            }
          : null,
        ink_id: addingMissed.createNewInk ? null : addingMissed.ink_id,
        new_ink: addingMissed.createNewInk
          ? {
              brand: addingMissed.ink_brand || 'Unknown',
              name: addingMissed.ink_name || 'Ink',
              color_family: addingMissed.ink_family || 'Blue',
              hex_color: addingMissed.ink_hex || '#1d4ed8',
              format: 'bottle',
              volume_ml: 50,
              remaining_level: 'full',
            }
          : null,
        crop_box: addingMissed.crop_box,
        transcription: addingMissed.transcription,
        caption: addingMissed.caption || `Page ${currentPage.page_number} · Added entry`,
        session_notes: addingMissed.transcription,
      });
      setBatches((prev) => prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b)));
      hydrateBatchState(updatedBatch, currentPage.page_number, undefined, 'verify');
      setAddingMissed(null);
      onCommitted();
      setBannerMsg(`Added new entry & cropped sample on Page ${currentPage.page_number}!`);
    } catch {
      setAddingMissed((prev) => (prev ? { ...prev, saving: false } : null));
    }
  };

  // ---------- Stage Mode Actions ----------

  const handleRunAnalyze = async (onlyCurrentPage: boolean) => {
    if (!currentBatch) return;
    setAnalyzing(true);
    setBannerMsg(null);
    try {
      const res = await api.analyzeScan(
        currentBatch.id,
        onlyCurrentPage && currentPage ? [currentPage.page_number] : undefined,
      );
      setBatches((prev) => prev.map((b) => (b.id === res.batch.id ? res.batch : b)));
      hydrateBatchState(res.batch, currentPage?.page_number, undefined, 'stage');
      setBannerMsg(
        `Vision extraction finished (${
          res.mode_used === 'gemini_vision'
            ? 'Gemini Vision OCR + Bounding Boxes'
            : '2-Column Offline Layout Detection'
        }). Review staged boxes below before committing.`,
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddStagingBox = () => {
    if (!currentPage) return;
    const uid = `manual_${Date.now()}`;
    const newEntry: EditableCandidate = {
      entry_uid: uid,
      page_id: currentPage.id,
      page_number: currentPage.page_number,
      date_inked: new Date().toISOString().slice(0, 10),
      raw_pen_text: '',
      pen_brand: '',
      pen_model: '',
      pen_color: '',
      nib_size: 'M',
      matched_pen_id: pens[0]?.id ?? null,
      pen_match_confidence: 1,
      raw_ink_text: '',
      ink_brand: '',
      ink_name: '',
      suggested_hex: '#1d4ed8',
      suggested_color_family: 'Blue',
      matched_ink_id: inks[0]?.id ?? null,
      ink_match_confidence: 1,
      transcription: '',
      crop_box: { x: 0.04, y: 0.12, w: 0.44, h: 0.22 },
      is_duplicate: false,
      skip: false,
      createNewPen: pens.length === 0,
      createNewInk: inks.length === 0,
      newInkMoiUrl: '',
    };
    setCandidatesByPage((prev) => ({
      ...prev,
      [currentPage.page_number]: [...(prev[currentPage.page_number] || []), newEntry],
    }));
    setSelectedCandUid(uid);
  };

  const allActiveCandidates = Object.values(candidatesByPage)
    .flat()
    .filter((c) => !c.skip);

  const handleCommitStagedBatch = async () => {
    if (!currentBatch || allActiveCandidates.length === 0) return;
    setCommitting(true);
    try {
      const payload = allActiveCandidates.map((c) => ({
        page_id: c.page_id,
        date_inked: c.date_inked,
        pen_id: c.createNewPen ? null : c.matched_pen_id,
        new_pen: c.createNewPen
          ? {
              brand: c.pen_brand || 'Unknown Brand',
              model: c.pen_model || 'Unknown Model',
              color_variant: c.pen_color,
              nib_size: c.nib_size || 'M',
              nib_material: 'Steel',
              filling_mechanism: 'Converter',
            }
          : null,
        ink_id: c.createNewInk ? null : c.matched_ink_id,
        new_ink: c.createNewInk
          ? {
              brand: c.ink_brand || 'Unknown Brand',
              name: c.ink_name || 'Unknown Ink',
              color_family: c.suggested_color_family || 'Blue',
              hex_color: c.suggested_hex || '#1d4ed8',
              format: 'bottle',
              volume_ml: 50,
              remaining_level: 'full',
              mountain_of_ink_url: c.newInkMoiUrl || '',
            }
          : null,
        crop_box: c.crop_box,
        transcription: c.transcription,
        caption: `${c.raw_pen_text || c.pen_model} · ${c.raw_ink_text || c.ink_name}`.trim(),
        session_notes: c.transcription,
        close_previous_active: true,
      }));

      const res = await api.commitScan(currentBatch.id, payload);
      setBannerMsg(
        `Committed ${res.created_sessions} ink-up sessions & cropped samples! (${res.created_pens} new pens, ${res.created_inks} new inks)`,
      );
      await loadBatches(currentBatch.id, currentPage?.page_number, undefined, 'verify');
      onCommitted();
    } finally {
      setCommitting(false);
    }
  };

  const totalBatchImported = currentBatch
    ? currentBatch.pages.reduce((acc, p) => acc + (p.imported_entries?.length || 0), 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Notebook Scan Studio &amp; OCR Verification
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Inspect original notebook spreads side-by-side against imported OCR entries — fix dates,
            reassign pens/inks, drag crop boxes to re-crop samples, or upload future scans.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <>
              {!geminiConfigured && (
                <button
                  onClick={onOpenSettings}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Configure Gemini Key
                </button>
              )}
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? 'Rendering PDF Pages...' : 'Upload New Scan PDF'}
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-500">
              Read-Only Viewer
            </span>
          )}
        </div>
      </div>

      {bannerMsg && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{bannerMsg}</span>
          </div>
          <button
            onClick={() => setBannerMsg(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Batch + 32-Page Spread Navigator + Mode Switcher */}
      {batches.length > 0 && currentBatch && currentPage && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Batch Selector + Prev/Dropdown/Next Page Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={currentBatch.id}
                onChange={(e) => {
                  const found = batches.find((b) => b.id === Number(e.target.value));
                  if (found) hydrateBatchState(found);
                }}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 font-medium max-w-[280px] truncate"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.original_filename} ({b.page_count} spreads)
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-0.5">
                <button
                  disabled={activePageNum <= 1}
                  onClick={() => handleSelectPage(Math.max(1, activePageNum - 1))}
                  className="p-1 rounded hover:bg-zinc-200/70 dark:hover:bg-zinc-800 disabled:opacity-35"
                  title="Previous Spread"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={activePageNum}
                  onChange={(e) => handleSelectPage(Number(e.target.value))}
                  className="bg-transparent px-2 py-1 font-mono-num font-semibold focus:outline-none"
                >
                  {currentBatch.pages.map((p) => {
                    const count =
                      studioMode === 'verify'
                        ? p.imported_entries?.length || 0
                        : p.candidates?.length || 0;
                    return (
                      <option key={p.id} value={p.page_number} className="bg-white dark:bg-zinc-900">
                        Spread {p.page_number} / {currentBatch.page_count} ({count} entr
                        {count === 1 ? 'y' : 'ies'})
                      </option>
                    );
                  })}
                </select>
                <button
                  disabled={activePageNum >= currentBatch.page_count}
                  onClick={() =>
                    handleSelectPage(Math.min(currentBatch.page_count, activePageNum + 1))
                  }
                  className="p-1 rounded hover:bg-zinc-200/70 dark:hover:bg-zinc-800 disabled:opacity-35"
                  title="Next Spread"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right: Mode Toggle + Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                <button
                  onClick={() => setStudioMode('verify')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    studioMode === 'verify'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500'
                  }`}
                >
                  Verify Imported ({totalBatchImported})
                </button>
                <button
                  onClick={() => setStudioMode('stage')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    studioMode === 'stage'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500'
                  }`}
                >
                  Stage New OCR
                </button>
              </div>

              {studioMode === 'verify' ? (
                <button
                  onClick={handleStartAddMissed}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Missed Entry on Spread {currentPage.page_number}
                </button>
              ) : (
                <>
                  <button
                    disabled={analyzing}
                    onClick={() => handleRunAnalyze(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    {analyzing ? 'Analyzing...' : `Analyze Spread ${currentPage.page_number}`}
                  </button>
                  <button
                    onClick={handleAddStagingBox}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Box
                  </button>
                  <button
                    disabled={committing || allActiveCandidates.length === 0}
                    onClick={handleCommitStagedBatch}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {committing
                      ? 'Saving...'
                      : `Commit ${allActiveCandidates.length} Staged`}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Compact Scrollable Page Strip so all 32 spreads are 1-click accessible */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
            {currentBatch.pages.map((p) => {
              const cnt =
                studioMode === 'verify'
                  ? p.imported_entries?.length || 0
                  : p.candidates?.length || 0;
              const isCurr = p.page_number === activePageNum;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPage(p.page_number)}
                  className={`shrink-0 px-2 py-0.5 rounded font-mono-num text-[11px] transition border ${
                    isCurr
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 font-semibold'
                      : cnt > 0
                        ? 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-indigo-400'
                        : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                  title={`Spread ${p.page_number} (${cnt} entries)`}
                >
                  p.{p.page_number}
                  {cnt > 0 && (
                    <span className="ml-1 opacity-70 text-[10px]">({cnt})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Split-Screen Verification & Crop Studio */}
      {currentPage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT: Sticky Interactive Notebook Spread Canvas */}
          <div className="lg:col-span-6 lg:sticky lg:top-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
              <span>
                <strong>Spread {currentPage.page_number}</strong> — click or drag any box to adjust
                crop region
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={currentPage.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                  title="Open raw scan image in new tab"
                >
                  Raw Image
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => setZoomed((z) => !z)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-200"
                >
                  {zoomed ? (
                    <>
                      <ZoomOut className="w-3.5 h-3.5" /> Fit Spread
                    </>
                  ) : (
                    <>
                      <ZoomIn className="w-3.5 h-3.5" /> 185% Zoom
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className={zoomed ? 'overflow-auto max-h-[76vh] rounded-lg border border-zinc-300 dark:border-zinc-700' : ''}>
              <div
                ref={containerRef}
                style={zoomed ? { width: '185%' } : undefined}
                className={`relative select-none overflow-hidden bg-[#fcfaf4] ${
                  zoomed ? '' : 'rounded-lg border border-zinc-300 dark:border-zinc-700'
                }`}
              >
                <img
                  src={currentPage.image_url}
                  alt={`Notebook spread ${currentPage.page_number}`}
                  draggable={false}
                  className="w-full h-auto block"
                />

                {/* VERIFY MODE OVERLAY BOXES */}
                {studioMode === 'verify' &&
                  pageImported.map((item, idx) => {
                    const isSelected = item.sample_id === selectedSampleId;
                    const b = item.crop_box;
                    return (
                      <div
                        key={item.sample_id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedSampleId(item.sample_id);
                          cardRefs.current[`imp_${item.sample_id}`]?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          });
                          setDragState({
                            targetType: 'imported',
                            id: item.sample_id,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            origBox: b,
                          });
                        }}
                        style={{
                          left: `${b.x * 100}%`,
                          top: `${b.y * 100}%`,
                          width: `${b.w * 100}%`,
                          height: `${b.h * 100}%`,
                        }}
                        className={`absolute cursor-move transition-shadow ${
                          item.dirty
                            ? 'border-2 border-amber-500 bg-amber-500/15 ring-2 ring-amber-400/40 z-20'
                            : isSelected
                              ? 'border-2 border-indigo-600 bg-indigo-500/10 shadow-lg ring-2 ring-indigo-500/30 z-10'
                              : 'border border-emerald-600/80 bg-emerald-500/5 hover:bg-emerald-500/10'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono-num font-semibold text-white shadow-xs ${
                            item.dirty
                              ? 'bg-amber-600'
                              : isSelected
                                ? 'bg-indigo-600'
                                : 'bg-emerald-700/90'
                          }`}
                        >
                          #{idx + 1} · {item.sample_date}
                        </span>

                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedSampleId(item.sample_id);
                            setDragState({
                              targetType: 'imported',
                              id: item.sample_id,
                              mode: 'resize',
                              startX: e.clientX,
                              startY: e.clientY,
                              origBox: b,
                            });
                          }}
                          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-xs bg-indigo-600 border border-white cursor-nwse-resize"
                        />
                      </div>
                    );
                  })}

                {/* ADDING MISSED ENTRY OVERLAY BOX */}
                {studioMode === 'verify' && addingMissed && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        targetType: 'missed',
                        id: 'missed',
                        mode: 'move',
                        startX: e.clientX,
                        startY: e.clientY,
                        origBox: addingMissed.crop_box,
                      });
                    }}
                    style={{
                      left: `${addingMissed.crop_box.x * 100}%`,
                      top: `${addingMissed.crop_box.y * 100}%`,
                      width: `${addingMissed.crop_box.w * 100}%`,
                      height: `${addingMissed.crop_box.h * 100}%`,
                    }}
                    className="absolute cursor-move border-2 border-fuchsia-600 bg-fuchsia-500/15 ring-2 ring-fuchsia-400/40 z-30"
                  >
                    <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-mono-num font-semibold bg-fuchsia-600 text-white">
                      #NEW ENTRY — Drag &amp; Resize Over Handwriting
                    </span>
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          targetType: 'missed',
                          id: 'missed',
                          mode: 'resize',
                          startX: e.clientX,
                          startY: e.clientY,
                          origBox: addingMissed.crop_box,
                        });
                      }}
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-xs bg-fuchsia-600 border border-white cursor-nwse-resize"
                    />
                  </div>
                )}

                {/* STAGE MODE OVERLAY BOXES */}
                {studioMode === 'stage' &&
                  pageCandidates.map((cand, idx) => {
                    const isSelected = cand.entry_uid === selectedCandUid;
                    const b = cand.crop_box;
                    return (
                      <div
                        key={cand.entry_uid}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedCandUid(cand.entry_uid);
                          setDragState({
                            targetType: 'candidate',
                            id: cand.entry_uid,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            origBox: b,
                          });
                        }}
                        style={{
                          left: `${b.x * 100}%`,
                          top: `${b.y * 100}%`,
                          width: `${b.w * 100}%`,
                          height: `${b.h * 100}%`,
                        }}
                        className={`absolute cursor-move transition-shadow ${
                          cand.skip
                            ? 'border-2 border-dashed border-zinc-400 bg-zinc-500/10'
                            : isSelected
                              ? 'border-2 border-indigo-600 bg-indigo-500/10 shadow-lg ring-2 ring-indigo-500/30 z-10'
                              : 'border-2 border-emerald-600/80 bg-emerald-500/5'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono-num font-semibold text-white ${
                            cand.skip
                              ? 'bg-zinc-500'
                              : isSelected
                                ? 'bg-indigo-600'
                                : 'bg-emerald-600'
                          }`}
                        >
                          #{idx + 1} · {cand.date_inked} {cand.skip ? '(Skip)' : ''}
                        </span>
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedCandUid(cand.entry_uid);
                            setDragState({
                              targetType: 'candidate',
                              id: cand.entry_uid,
                              mode: 'resize',
                              startX: e.clientX,
                              startY: e.clientY,
                              origBox: b,
                            });
                          }}
                          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-xs bg-indigo-600 border border-white cursor-nwse-resize"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* RIGHT: Entry Verification / Staging Cards */}
          <div className="lg:col-span-6 space-y-3.5 max-h-[84vh] lg:overflow-y-auto pr-0.5">
            {studioMode === 'verify' ? (
              <>
                {/* Inline Add Missed Entry Card */}
                {addingMissed && (
                  <div className="rounded-xl border-2 border-fuchsia-500 bg-white dark:bg-zinc-900 p-4 space-y-3 text-xs shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200 font-semibold">
                        New Entry on Spread {currentPage.page_number} (Drag purple box on left scan)
                      </span>
                      <button
                        onClick={() => setAddingMissed(null)}
                        className="text-zinc-400 hover:text-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">Date Inked</label>
                        <input
                          type="date"
                          value={addingMissed.date_inked}
                          onChange={(e) =>
                            setAddingMissed({ ...addingMissed, date_inked: e.target.value })
                          }
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 font-mono-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
                          Session Status
                        </label>
                        <select
                          value={addingMissed.end_status}
                          onChange={(e) =>
                            setAddingMissed({
                              ...addingMissed,
                              end_status: e.target.value as 'active' | 'cleaned' | 'emptied',
                            })
                          }
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                        >
                          <option value="cleaned">Cleaned (Historical)</option>
                          <option value="active">Currently Inked (Active)</option>
                          <option value="emptied">Emptied</option>
                        </select>
                      </div>
                    </div>

                    {/* Pen selector / creator */}
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Fountain Pen</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAddingMissed({
                              ...addingMissed,
                              createNewPen: !addingMissed.createNewPen,
                            })
                          }
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {addingMissed.createNewPen ? 'Select Existing Pen' : '+ Create New Pen'}
                        </button>
                      </div>
                      {!addingMissed.createNewPen ? (
                        <select
                          value={addingMissed.pen_id ?? ''}
                          onChange={(e) =>
                            setAddingMissed({ ...addingMissed, pen_id: Number(e.target.value) })
                          }
                          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                        >
                          {pens.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.brand} {p.model}{' '}
                              {p.color_variant ? `(${p.color_variant})` : ''} · {p.nib_size}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          <input
                            placeholder="Brand"
                            value={addingMissed.pen_brand}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, pen_brand: e.target.value })
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          />
                          <input
                            placeholder="Model"
                            value={addingMissed.pen_model}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, pen_model: e.target.value })
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          />
                          <input
                            placeholder="Color"
                            value={addingMissed.pen_color}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, pen_color: e.target.value })
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          />
                          <input
                            placeholder="Nib"
                            value={addingMissed.nib_size}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, nib_size: e.target.value })
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          />
                        </div>
                      )}
                    </div>

                    {/* Ink selector / creator */}
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Ink</span>
                        <button
                          type="button"
                          onClick={() =>
                            setAddingMissed({
                              ...addingMissed,
                              createNewInk: !addingMissed.createNewInk,
                            })
                          }
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {addingMissed.createNewInk ? 'Select Existing Ink' : '+ Create New Ink'}
                        </button>
                      </div>
                      {!addingMissed.createNewInk ? (
                        <select
                          value={addingMissed.ink_id ?? ''}
                          onChange={(e) =>
                            setAddingMissed({ ...addingMissed, ink_id: Number(e.target.value) })
                          }
                          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                        >
                          {inks.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.brand} {i.name} ({i.color_family})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            placeholder="Brand"
                            value={addingMissed.ink_brand}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, ink_brand: e.target.value })
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          />
                          <input
                            placeholder="Ink Name"
                            value={addingMissed.ink_name}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, ink_name: e.target.value })
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          />
                          <input
                            type="color"
                            value={addingMissed.ink_hex}
                            onChange={(e) =>
                              setAddingMissed({ ...addingMissed, ink_hex: e.target.value })
                            }
                            className="h-7 w-full rounded"
                          />
                        </div>
                      )}
                    </div>

                    <input
                      value={addingMissed.transcription}
                      onChange={(e) =>
                        setAddingMissed({ ...addingMissed, transcription: e.target.value })
                      }
                      placeholder="Notes / scribble transcription (optional)..."
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAddingMissed(null)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={addingMissed.saving}
                        onClick={handleSaveMissedEntry}
                        className="px-4 py-1.5 rounded-lg bg-fuchsia-600 text-white font-medium hover:bg-fuchsia-500"
                      >
                        {addingMissed.saving ? 'Cropping & Saving...' : 'Save Entry & Crop'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Imported Entry Cards */}
                {pageImported.map((item, idx) => {
                  const isSelected = item.sample_id === selectedSampleId;
                  const isSaving = savingSampleId === item.sample_id;
                  const sideLabel = item.crop_box.x < 0.48 ? 'Left Page' : 'Right Page';

                  return (
                    <div
                      key={item.sample_id}
                      ref={(el) => {
                        cardRefs.current[`imp_${item.sample_id}`] = el;
                      }}
                      onClick={() => setSelectedSampleId(item.sample_id)}
                      className={`rounded-xl border p-3.5 transition space-y-3 text-xs ${
                        item.dirty
                          ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/15 shadow-sm'
                          : isSelected
                            ? 'border-indigo-500 bg-white dark:bg-zinc-900 shadow-sm'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                      }`}
                    >
                      {/* Top Header + Cropped Sample Preview */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded font-mono-num font-semibold text-white ${
                                item.dirty
                                  ? 'bg-amber-600'
                                  : isSelected
                                    ? 'bg-indigo-600'
                                    : 'bg-emerald-700'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono-num text-[11px]">
                              {sideLabel}
                            </span>
                            {item.end_status === 'active' ? (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-medium">
                                Currently Inked
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                                Cleaned {item.date_cleaned ? `· ${item.date_cleaned}` : ''}
                              </span>
                            )}
                          </div>
                          {item.caption && (
                            <div className="text-[11px] text-zinc-500 truncate" title={item.caption}>
                              OCR Raw: <span className="italic">{item.caption}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPen(item.pen_id);
                            }}
                            className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                            title="Open Pen Detail Page"
                          >
                            Pen →
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenInk(item.ink_id);
                            }}
                            className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                            title="Open Ink Detail Page"
                          >
                            Ink →
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteImportedEntry(item);
                            }}
                            className="p-1 text-zinc-400 hover:text-red-500"
                            title="Delete erroneous entry & session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Cropped Writing Sample Cutout Preview */}
                      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#fcfaf4] p-1.5 flex items-center justify-center max-h-28 overflow-hidden">
                        <img
                          src={item.image_url}
                          alt={item.caption}
                          className="max-h-24 w-auto object-contain"
                        />
                      </div>

                      {/* Editable Date + Status + Date Cleaned */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-0.5">
                            Date Inked
                          </label>
                          <input
                            type="date"
                            value={item.sample_date}
                            onChange={(e) =>
                              updateImportedLocal(item.sample_id, { sample_date: e.target.value })
                            }
                            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-0.5">Status</label>
                          <select
                            value={item.end_status}
                            onChange={(e) =>
                              updateImportedLocal(item.sample_id, { end_status: e.target.value })
                            }
                            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1"
                          >
                            <option value="cleaned">Cleaned (Historical)</option>
                            <option value="active">Currently Inked</option>
                            <option value="emptied">Emptied</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-0.5">
                            Date Cleaned
                          </label>
                          <input
                            type="date"
                            disabled={item.end_status === 'active'}
                            value={item.date_cleaned || ''}
                            onChange={(e) =>
                              updateImportedLocal(item.sample_id, {
                                date_cleaned: e.target.value || null,
                              })
                            }
                            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 font-mono-num disabled:opacity-40"
                          />
                        </div>
                      </div>

                      {/* Editable Pen Assignment / Split into New Pen */}
                      <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            Assigned Pen
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateImportedLocal(item.sample_id, {
                                createNewPen: !item.createNewPen,
                              })
                            }
                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {item.createNewPen ? 'Pick Existing Pen' : '+ Split / Create New Pen'}
                          </button>
                        </div>

                        {!item.createNewPen ? (
                          <select
                            value={item.pen_id}
                            onChange={(e) =>
                              updateImportedLocal(item.sample_id, {
                                pen_id: Number(e.target.value),
                              })
                            }
                            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          >
                            {pens.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.brand} {p.model}{' '}
                                {p.color_variant ? `(${p.color_variant})` : ''} · {p.nib_size}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5">
                            <input
                              placeholder="Brand"
                              value={item.newPenBrand}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, {
                                  newPenBrand: e.target.value,
                                })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Model"
                              value={item.newPenModel}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, {
                                  newPenModel: e.target.value,
                                })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Color / Finish"
                              value={item.newPenColor}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, {
                                  newPenColor: e.target.value,
                                })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Nib"
                              value={item.newPenNib}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, { newPenNib: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 font-mono-num"
                            />
                          </div>
                        )}
                      </div>

                      {/* Editable Ink Assignment + Stroke Swatch Eyedropper */}
                      <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-3 h-3 rounded-full ring-1 ring-black/15"
                              style={{ backgroundColor: item.sampledHex || item.ink.hex_color }}
                            />
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">
                              Assigned Ink
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSampleImportedSwatch(item)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px]"
                              title="Sample actual ink color from handwriting strokes in this box"
                            >
                              <Pipette className="w-3 h-3 text-indigo-500" />
                              Eyedropper
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateImportedLocal(item.sample_id, {
                                  createNewInk: !item.createNewInk,
                                })
                              }
                              className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              {item.createNewInk ? 'Pick Existing Ink' : '+ Create New Ink'}
                            </button>
                          </div>
                        </div>

                        {item.sampledHex && item.sampledFamily && !item.createNewInk && (
                          <div className="flex items-center justify-between rounded bg-indigo-50/70 dark:bg-indigo-950/40 px-2 py-1 text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: item.sampledHex }}
                              />
                              Sampled stroke: <code>{item.sampledHex}</code> ({item.sampledFamily})
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleApplySwatchToInk(
                                  item.ink_id,
                                  item.sampledHex!,
                                  item.sampledFamily!,
                                )
                              }
                              className="inline-flex items-center gap-1 font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
                            >
                              <Check className="w-3 h-3" /> Apply to Ink Swatch
                            </button>
                          </div>
                        )}

                        {!item.createNewInk ? (
                          <select
                            value={item.ink_id}
                            onChange={(e) =>
                              updateImportedLocal(item.sample_id, {
                                ink_id: Number(e.target.value),
                              })
                            }
                            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                          >
                            {inks.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.brand} {i.name} ({i.color_family})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="grid grid-cols-3 gap-1.5">
                            <input
                              placeholder="Brand"
                              value={item.newInkBrand}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, {
                                  newInkBrand: e.target.value,
                                })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Ink Name"
                              value={item.newInkName}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, { newInkName: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              type="color"
                              value={item.newInkHex}
                              onChange={(e) =>
                                updateImportedLocal(item.sample_id, { newInkHex: e.target.value })
                              }
                              className="h-7 w-full rounded"
                            />
                          </div>
                        )}
                      </div>

                      {/* Notes / Transcription + Raw Label */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          value={item.caption}
                          onChange={(e) =>
                            updateImportedLocal(item.sample_id, { caption: e.target.value })
                          }
                          placeholder="Raw scan label (pen · ink as written)..."
                          className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1"
                        />
                        <input
                          value={item.transcription}
                          onChange={(e) =>
                            updateImportedLocal(item.sample_id, { transcription: e.target.value })
                          }
                          placeholder="Notes (e.g. Refill, Sample, nib swap)..."
                          className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1"
                        />
                      </div>

                      {/* Save / Revert Action Bar when modified */}
                      {item.dirty && (
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200 dark:border-amber-900/50">
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {item.boxDirty
                              ? 'Crop box & metadata modified — saving will re-crop from scan'
                              : 'Unsaved OCR corrections'}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleResetImportedCard(item.sample_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Revert
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void handleSaveImportedCorrection(item)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                            >
                              <Save className="w-3 h-3" />
                              {isSaving
                                ? 'Saving...'
                                : item.boxDirty
                                  ? 'Save & Re-Crop'
                                  : 'Save Fix'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {pageImported.length === 0 && !addingMissed && (
                  <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-xs text-zinc-400 space-y-2">
                    <div>
                      No ink-up entries imported on Spread {currentPage.page_number} (e.g., cover /
                      title spread).
                    </div>
                    <button
                      onClick={handleStartAddMissed}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Entry on Spread {currentPage.page_number}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* STAGE MODE CARDS */
              <>
                {!geminiConfigured && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                      <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        Offline 2-column layout segmentation active. Configure a{' '}
                        <code>GEMINI_API_KEY</code> in Settings for automatic handwriting OCR on
                        future uploads.
                      </span>
                    </div>
                  </div>
                )}

                {pageCandidates.map((cand, idx) => {
                  const isSelected = cand.entry_uid === selectedCandUid;
                  return (
                    <div
                      key={cand.entry_uid}
                      onClick={() => setSelectedCandUid(cand.entry_uid)}
                      className={`rounded-xl border p-4 transition space-y-3 text-xs ${
                        cand.skip
                          ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 opacity-70'
                          : isSelected
                            ? 'border-indigo-500 bg-white dark:bg-zinc-900 shadow-sm'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded font-mono-num font-semibold bg-zinc-100 dark:bg-zinc-800">
                            Staged #{idx + 1}
                          </span>
                          {cand.is_duplicate && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 font-medium">
                              Duplicate Detected
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-zinc-600 dark:text-zinc-400">
                            <input
                              type="checkbox"
                              checked={cand.skip}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { skip: e.target.checked })
                              }
                            />
                            <span>Skip</span>
                          </label>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCandidatesByPage((prev) => ({
                                ...prev,
                                [currentPage.page_number]: (
                                  prev[currentPage.page_number] || []
                                ).filter((item) => item.entry_uid !== cand.entry_uid),
                              }));
                            }}
                            className="p-1 text-zinc-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">Date Inked</label>
                          <input
                            type="date"
                            value={cand.date_inked}
                            onChange={(e) =>
                              updateCandidate(cand.entry_uid, { date_inked: e.target.value })
                            }
                            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 font-mono-num"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            Detected Swatch
                          </label>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-6 h-6 rounded-md ring-1 ring-black/15 shrink-0"
                              style={{ backgroundColor: cand.suggested_hex }}
                            />
                            <span className="font-mono-num">{cand.suggested_hex}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await api.samplePageInkColor(
                                  currentPage.id,
                                  cand.crop_box,
                                );
                                updateCandidate(cand.entry_uid, {
                                  suggested_hex: res.hex_color,
                                  suggested_color_family: res.color_family,
                                });
                              }}
                              className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700"
                            >
                              <Pipette className="w-3 h-3 text-indigo-500" />
                              Sample
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Pen */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            Fountain Pen {cand.raw_pen_text && `("${cand.raw_pen_text}")`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateCandidate(cand.entry_uid, {
                                createNewPen: !cand.createNewPen,
                              })
                            }
                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {cand.createNewPen ? 'Match Existing' : '+ Create New Pen'}
                          </button>
                        </div>
                        {!cand.createNewPen ? (
                          <select
                            value={cand.matched_pen_id ?? ''}
                            onChange={(e) =>
                              updateCandidate(cand.entry_uid, {
                                matched_pen_id: Number(e.target.value),
                              })
                            }
                            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                          >
                            <option value="">— Select Pen —</option>
                            {pens.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.brand} {p.model}{' '}
                                {p.color_variant ? `(${p.color_variant})` : ''} · {p.nib_size}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            <input
                              placeholder="Brand"
                              value={cand.pen_brand}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { pen_brand: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Model"
                              value={cand.pen_model}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { pen_model: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Color"
                              value={cand.pen_color}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { pen_color: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Nib"
                              value={cand.nib_size}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { nib_size: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                          </div>
                        )}
                      </div>

                      {/* Ink */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            Ink {cand.raw_ink_text && `("${cand.raw_ink_text}")`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateCandidate(cand.entry_uid, {
                                createNewInk: !cand.createNewInk,
                              })
                            }
                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            {cand.createNewInk ? 'Match Existing' : '+ Create New Ink'}
                          </button>
                        </div>
                        {!cand.createNewInk ? (
                          <select
                            value={cand.matched_ink_id ?? ''}
                            onChange={(e) =>
                              updateCandidate(cand.entry_uid, {
                                matched_ink_id: Number(e.target.value),
                              })
                            }
                            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                          >
                            <option value="">— Select Ink —</option>
                            {inks.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.brand} {i.name} ({i.color_family})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              placeholder="Ink Brand"
                              value={cand.ink_brand}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { ink_brand: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                            <input
                              placeholder="Ink Name"
                              value={cand.ink_name}
                              onChange={(e) =>
                                updateCandidate(cand.entry_uid, { ink_name: e.target.value })
                              }
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1"
                            />
                          </div>
                        )}
                      </div>

                      <input
                        type="text"
                        value={cand.transcription}
                        onChange={(e) =>
                          updateCandidate(cand.entry_uid, { transcription: e.target.value })
                        }
                        placeholder="Scribble transcription / pairing note..."
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
                      />
                    </div>
                  );
                })}

                {pageCandidates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-xs text-zinc-400">
                    No staged candidate boxes on Spread {currentPage.page_number}. Click "Analyze
                    Spread {currentPage.page_number}" or "Add Box" above, or switch to{' '}
                    <strong>Verify Imported</strong> to inspect already-imported entries.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
