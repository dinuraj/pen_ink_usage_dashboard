import React, { useState } from 'react';
import { X, RefreshCw, Sparkles, PlusCircle } from 'lucide-react';
import { api } from '../api';
import type { InkOut, PenOut } from '../types';

const todayIso = () => new Date().toISOString().slice(0, 10);

interface LifecycleModalProps {
  mode: 'refill' | 'clean';
  sessionId: number;
  penLabel: string;
  inkLabel: string;
  inkHex: string;
  onClose: () => void;
  onCompleted: () => void;
}

export const LifecycleActionModal: React.FC<LifecycleModalProps> = ({
  mode,
  sessionId,
  penLabel,
  inkLabel,
  inkHex,
  onClose,
  onCompleted,
}) => {
  const [eventDate, setEventDate] = useState(todayIso());
  const [endStatus, setEndStatus] = useState<'cleaned' | 'emptied'>('cleaned');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'refill') {
        await api.refillSession(sessionId, eventDate, notes);
      } else {
        await api.cleanSession(sessionId, eventDate, endStatus, notes);
      }
      onCompleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'refill' ? (
              <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {mode === 'refill' ? 'Log Reservoir Refill' : 'Mark Pen Cleaned / Emptied'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-1">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">{penLabel}</div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: inkHex }} />
            <span>{inkLabel}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              {mode === 'refill' ? 'Refill Date' : 'Cleaned / Emptied Date'}
            </label>
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm font-mono-num"
            />
          </div>

          {mode === 'clean' && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Close Reason
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['cleaned', 'emptied'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setEndStatus(opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition ${
                      endStatus === opt
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {opt === 'cleaned' ? 'Flushed & Cleaned' : 'Wrote Dry / Emptied'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Optional Note
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === 'refill'
                  ? 'e.g., Topped up converter before trip'
                  : 'e.g., Ultrasonic flush, nib stored dry'
              }
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : mode === 'refill' ? 'Save Refill' : 'Archive & Clean'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface QuickInkUpModalProps {
  pens: PenOut[];
  inks: InkOut[];
  defaultPenId?: number;
  defaultInkId?: number;
  onClose: () => void;
  onCompleted: () => void;
}

export const QuickInkUpModal: React.FC<QuickInkUpModalProps> = ({
  pens,
  inks,
  defaultPenId,
  defaultInkId,
  onClose,
  onCompleted,
}) => {
  const [penId, setPenId] = useState<number>(defaultPenId ?? pens[0]?.id ?? 0);
  const [inkId, setInkId] = useState<number>(defaultInkId ?? inks[0]?.id ?? 0);
  const [dateInked, setDateInked] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [closePrevious, setClosePrevious] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const selectedPen = pens.find((p) => p.id === penId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!penId || !inkId) return;
    setSubmitting(true);
    try {
      const sess = await api.createSession({
        pen_id: penId,
        ink_id: inkId,
        date_inked: dateInked,
        end_status: 'active',
        session_notes: notes,
        close_previous_active: closePrevious,
      });
      if (sampleFile) {
        const fd = new FormData();
        fd.append('pen_id', String(penId));
        fd.append('ink_id', String(inkId));
        fd.append('sample_date', dateInked);
        fd.append('session_id', String(sess.id));
        fd.append('caption', notes || 'Manual ink-up sample');
        fd.append('file', sampleFile);
        await api.uploadStandaloneSample(fd);
      }
      onCompleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Log Pen Ink-Up
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Fountain Pen
            </label>
            <select
              value={penId}
              onChange={(e) => setPenId(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {pens.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.model} {p.color_variant ? `(${p.color_variant})` : ''} · {p.nib_size}
                  {p.is_currently_inked ? ' [Currently Inked]' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedPen?.is_currently_inked && (
            <label className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
              <input
                type="checkbox"
                checked={closePrevious}
                onChange={(e) => setClosePrevious(e.target.checked)}
                className="rounded"
              />
              <span>
                Auto-close &amp; mark previous fill ({selectedPen.active_pairing?.ink_brand}{' '}
                {selectedPen.active_pairing?.ink_name}) as cleaned on {dateInked}
              </span>
            </label>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Ink
            </label>
            <select
              value={inkId}
              onChange={(e) => setInkId(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {inks.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.brand} {i.name} ({i.color_family} · {i.remaining_level.replace('_', '%')})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Date Inked
              </label>
              <input
                type="date"
                required
                value={dateInked}
                onChange={(e) => setDateInked(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Writing Sample Image (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSampleFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-zinc-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Pairing Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Smooth wet writer on Midori MD notebook"
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Logging...' : 'Ink Up Pen'}
          </button>
        </div>
      </form>
    </div>
  );
};
