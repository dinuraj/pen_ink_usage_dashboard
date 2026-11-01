import React, { useEffect, useState } from 'react';
import {
  X,
  PenTool,
  Droplet,
  Calendar,
  ExternalLink,
  FileScan,
  Edit3,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../api';
import type { InkOut, PenOut, WritingSampleOut } from '../types';

interface Props {
  sample: WritingSampleOut | null;
  pens?: PenOut[];
  inks?: InkOut[];
  onClose: () => void;
  onNavigatePen: (penId: number) => void;
  onNavigateInk: (inkId: number) => void;
  onOpenScanPage?: (batchId: number, pageNumber: number, sampleId: number) => void;
  onSampleUpdated?: (updated: WritingSampleOut) => void;
}

export const SampleLightbox: React.FC<Props> = ({
  sample,
  pens = [],
  inks = [],
  onClose,
  onNavigatePen,
  onNavigateInk,
  onOpenScanPage,
  onSampleUpdated,
}) => {
  const [editing, setEditing] = useState(false);
  const [penId, setPenId] = useState<number>(0);
  const [inkId, setInkId] = useState<number>(0);
  const [sampleDate, setSampleDate] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [transcription, setTranscription] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (sample) {
      setPenId(sample.pen_id);
      setInkId(sample.ink_id);
      setSampleDate(sample.sample_date);
      setCaption(sample.caption);
      setTranscription(sample.transcription);
      setEditing(false);
      setSavedNotice(false);
    }
  }, [sample]);

  if (!sample) return null;

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateSample(sample.id, {
        pen_id: penId,
        ink_id: inkId,
        sample_date: sampleDate,
        caption,
        transcription,
        session_notes: transcription,
      });
      setEditing(false);
      setSavedNotice(true);
      onSampleUpdated?.(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="w-3.5 h-3.5 rounded-full ring-2 ring-black/10 dark:ring-white/20 shrink-0"
              style={{ backgroundColor: sample.ink.hex_color }}
            />
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              {sample.ink.brand} {sample.ink.name}
            </span>
            <span className="text-zinc-400">×</span>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {sample.pen.brand} {sample.pen.model}
              {sample.pen.color_variant ? ` (${sample.pen.color_variant})` : ''}
            </span>
            <span className="px-2 py-0.5 text-xs font-mono-num font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {sample.pen.nib_size}
            </span>
            {sample.scan_page_number && (
              <span className="px-2 py-0.5 text-xs font-mono-num rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                Scan Page {sample.scan_page_number}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Neutral warm paper framing so ink colors are never distorted by dark mode */}
        <div className="p-5 bg-zinc-100/80 dark:bg-zinc-950 flex items-center justify-center">
          <div className="rounded-lg overflow-hidden shadow-md border border-zinc-200 bg-[#fcfaf4] max-h-[54vh]">
            <img
              src={sample.image_url}
              alt={sample.caption || 'Handwriting sample'}
              className="max-h-[52vh] w-auto object-contain"
            />
          </div>
        </div>

        {savedNotice && (
          <div className="px-5 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>OCR / pairing correction saved and synced with usage history!</span>
          </div>
        )}

        {/* Inline Quick-Correct Form */}
        {editing && pens.length > 0 && inks.length > 0 && (
          <form
            onSubmit={handleSaveCorrection}
            className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/60 space-y-3 text-xs"
          >
            <div className="font-semibold text-zinc-800 dark:text-zinc-200">
              Correct OCR Metadata Against Handwriting Sample
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Date Inked</label>
                <input
                  type="date"
                  required
                  value={sampleDate}
                  onChange={(e) => setSampleDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Fountain Pen</label>
                <select
                  value={penId}
                  onChange={(e) => setPenId(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                >
                  {pens.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brand} {p.model} {p.color_variant ? `(${p.color_variant})` : ''} ·{' '}
                      {p.nib_size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Ink</label>
                <select
                  value={inkId}
                  onChange={(e) => setInkId(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                >
                  {inks.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.brand} {i.name} ({i.color_family})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">
                  Raw Scan Label / Caption
                </label>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                />
              </div>
              <div className="md:col-span-2 flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] text-zinc-500 mb-1">
                    Notes / Transcription
                  </label>
                  <input
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    placeholder="e.g., Refill, Wet nib, Sample..."
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                >
                  {saving ? 'Saving...' : 'Save Fix'}
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-mono-num">
              <Calendar className="w-3.5 h-3.5" />
              <span>{sample.sample_date}</span>
              {sample.caption && <span className="text-zinc-400">· {sample.caption}</span>}
            </div>
            {sample.transcription && (
              <p className="text-zinc-600 dark:text-zinc-300 italic">"{sample.transcription}"</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pens.length > 0 && inks.length > 0 && (
              <button
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100/80"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {editing ? 'Hide Editor' : 'Correct OCR Data'}
              </button>
            )}

            {sample.scan_batch_id && sample.scan_page_number && onOpenScanPage && (
              <button
                onClick={() => {
                  onClose();
                  onOpenScanPage(sample.scan_batch_id!, sample.scan_page_number!, sample.id);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/50 font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
              >
                <FileScan className="w-3.5 h-3.5" />
                Verify / Re-Crop on Scan (p.{sample.scan_page_number})
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onNavigatePen(sample.pen_id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium text-zinc-700 dark:text-zinc-200"
            >
              <PenTool className="w-3.5 h-3.5" />
              Pen Page
            </button>
            <button
              onClick={() => {
                onClose();
                onNavigateInk(sample.ink_id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium text-zinc-700 dark:text-zinc-200"
            >
              <Droplet className="w-3.5 h-3.5" />
              Ink Page
            </button>
            {sample.ink.mountain_of_ink_url && (
              <a
                href={sample.ink.mountain_of_ink_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium hover:opacity-90"
              >
                Mountain of Ink
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
