import React, { useEffect, useState } from 'react';
import { Search, Upload, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { InkOut, PenOut, WritingSampleOut } from '../types';
import { SampleLightbox } from '../components/SampleLightbox';

interface Props {
  pens: PenOut[];
  inks: InkOut[];
  onOpenPen: (id: number) => void;
  onOpenInk: (id: number) => void;
  onOpenScanPage: (batchId: number, pageNumber: number, sampleId: number) => void;
  onGlobalRefresh: () => void;
}

export const SamplesView: React.FC<Props> = ({
  pens,
  inks,
  onOpenPen,
  onOpenInk,
  onOpenScanPage,
  onGlobalRefresh,
}) => {
  const { isAdmin } = useAuth();
  const [samples, setSamples] = useState<WritingSampleOut[]>([]);
  const [inkCompanyFilter, setInkCompanyFilter] = useState<string>('all');
  const [penCompanyFilter, setPenCompanyFilter] = useState<string>('all');
  const [penFilter, setPenFilter] = useState<string>('all');
  const [inkFilter, setInkFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [nibFilter, setNibFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedSample, setSelectedSample] = useState<WritingSampleOut | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload standalone sample modal state
  const [upPenId, setUpPenId] = useState<number>(pens[0]?.id ?? 0);
  const [upInkId, setUpInkId] = useState<number>(inks[0]?.id ?? 0);
  const [upDate, setUpDate] = useState(new Date().toISOString().slice(0, 10));
  const [upCaption, setUpCaption] = useState('');
  const [upFile, setUpFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchSamples = async () => {
    const list = await api.listSamples({
      pen_id: penFilter !== 'all' ? Number(penFilter) : undefined,
      ink_id: inkFilter !== 'all' ? Number(inkFilter) : undefined,
      color_family: colorFilter !== 'all' ? colorFilter : undefined,
      nib_size: nibFilter !== 'all' ? nibFilter : undefined,
    });
    setSamples(list);
  };

  useEffect(() => {
    void fetchSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penFilter, inkFilter, colorFilter, nibFilter]);

  const inkCompanies = Array.from(new Set(inks.map((i) => i.brand))).sort();
  const penCompanies = Array.from(new Set(pens.map((p) => p.brand))).sort();
  const selectableInks =
    inkCompanyFilter === 'all' ? inks : inks.filter((i) => i.brand === inkCompanyFilter);
  const selectablePens =
    penCompanyFilter === 'all' ? pens : pens.filter((p) => p.brand === penCompanyFilter);
  const colorFamilies = Array.from(new Set(inks.map((i) => i.color_family))).sort();
  const nibSizes = Array.from(new Set(pens.map((p) => p.nib_size))).sort();

  const visibleSamples = samples.filter((s) => {
    if (inkCompanyFilter !== 'all' && s.ink.brand !== inkCompanyFilter) return false;
    if (penCompanyFilter !== 'all' && s.pen.brand !== penCompanyFilter) return false;
    if (!query) return true;
    const hay = `${s.pen.brand} ${s.pen.model} ${s.ink.brand} ${s.ink.name} ${s.transcription} ${s.caption}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upFile || !upPenId || !upInkId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('pen_id', String(upPenId));
      fd.append('ink_id', String(upInkId));
      fd.append('sample_date', upDate);
      fd.append('caption', upCaption);
      fd.append('file', upFile);
      await api.uploadStandaloneSample(fd);
      setShowUploadModal(false);
      setUpFile(null);
      setUpCaption('');
      await fetchSamples();
      onGlobalRefresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Writing Samples Explorer
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Compare cropped notebook handwriting samples side-by-side across inks, color families,
            pens, and nib sizes.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Sample Image
          </button>
        )}
      </div>

      {/* Multi-Facet Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes / text..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
          />
        </div>

        <select
          value={inkCompanyFilter}
          onChange={(e) => {
            setInkCompanyFilter(e.target.value);
            setInkFilter('all');
          }}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
        >
          <option value="all">All Ink Companies</option>
          {inkCompanies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={inkFilter}
          onChange={(e) => setInkFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
        >
          <option value="all">All Ink Names</option>
          {selectableInks.map((i) => (
            <option key={i.id} value={i.id}>
              {inkCompanyFilter === 'all' ? `${i.brand} ${i.name}` : i.name}
            </option>
          ))}
        </select>

        <select
          value={colorFilter}
          onChange={(e) => setColorFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
        >
          <option value="all">All Colors</option>
          {colorFamilies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={penCompanyFilter}
          onChange={(e) => {
            setPenCompanyFilter(e.target.value);
            setPenFilter('all');
          }}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
        >
          <option value="all">All Pen Companies</option>
          {penCompanies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={penFilter}
          onChange={(e) => setPenFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
        >
          <option value="all">All Pen Names</option>
          {selectablePens.map((p) => (
            <option key={p.id} value={p.id}>
              {penCompanyFilter === 'all' ? `${p.brand} ${p.model}` : p.model}{' '}
              {p.color_variant ? `(${p.color_variant})` : ''}
            </option>
          ))}
        </select>

        <select
          value={nibFilter}
          onChange={(e) => setNibFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5"
        >
          <option value="all">All Nibs</option>
          {nibSizes.map((n) => (
            <option key={n} value={n}>
              Nib: {n}
            </option>
          ))}
        </select>
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleSamples.map((ws) => (
          <div
            key={ws.id}
            onClick={() => setSelectedSample(ws)}
            className="cursor-pointer group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-indigo-400 transition shadow-2xs"
          >
            <div className="h-48 bg-[#fcfaf4] flex items-center justify-center p-2.5 overflow-hidden">
              <img
                src={ws.image_url}
                alt={ws.caption}
                className="max-h-full w-auto object-contain group-hover:scale-[1.02] transition-transform"
              />
            </div>
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ws.ink.hex_color }}
                  />
                  <span className="truncate">
                    {ws.ink.brand} {ws.ink.name}
                  </span>
                </div>
                <div className="text-zinc-500 truncate mt-0.5">
                  {ws.pen.brand} {ws.pen.model}
                  {ws.pen.color_variant ? ` (${ws.pen.color_variant})` : ''} ·{' '}
                  <span className="font-mono-num font-medium">{ws.pen.nib_size}</span>
                </div>
              </div>
              <span className="font-mono-num text-zinc-400 shrink-0">{ws.sample_date}</span>
            </div>
          </div>
        ))}
      </div>

      {visibleSamples.length === 0 && (
        <div className="py-16 text-center text-xs text-zinc-400">
          No writing samples match the selected filters.
        </div>
      )}

      {/* Standalone Sample Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowUploadModal(false)}
        >
          <form
            onSubmit={handleUpload}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Upload Writing Sample Image</h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-medium text-zinc-500 mb-1">Fountain Pen</label>
                <select
                  value={upPenId}
                  onChange={(e) => setUpPenId(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
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
                <label className="block font-medium text-zinc-500 mb-1">Ink</label>
                <select
                  value={upInkId}
                  onChange={(e) => setUpInkId(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                >
                  {inks.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.brand} {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-zinc-500 mb-1">Sample Date</label>
                <input
                  type="date"
                  required
                  value={upDate}
                  onChange={(e) => setUpDate(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-500 mb-1">Sample Image *</label>
                <input
                  type="file"
                  required
                  accept="image/*"
                  onChange={(e) => setUpFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-500 mb-1">Caption / Paper Note</label>
                <input
                  value={upCaption}
                  onChange={(e) => setUpCaption(e.target.value)}
                  placeholder="e.g., Midori MD Cream · 5mm dot grid"
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
              >
                {uploading ? 'Uploading...' : 'Save Sample'}
              </button>
            </div>
          </form>
        </div>
      )}

      <SampleLightbox
        sample={selectedSample}
        pens={pens}
        inks={inks}
        onClose={() => setSelectedSample(null)}
        onNavigatePen={onOpenPen}
        onNavigateInk={onOpenInk}
        onOpenScanPage={onOpenScanPage}
        onSampleUpdated={(updated) => {
          setSelectedSample(updated);
          void fetchSamples();
          onGlobalRefresh();
        }}
      />
    </div>
  );
};
