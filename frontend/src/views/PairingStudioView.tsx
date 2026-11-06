import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Shuffle,
  Palette,
  Check,
  Search,
  ArrowRight,
  Clock,
  Star,
  Feather,
  Droplet,
  Filter,
  RotateCcw,
  CheckCircle2,
  Layers,
  Heart,
  Wand2,
  ExternalLink,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type {
  ActivePaletteItem,
  ActivePaletteResponse,
  CandidateInk,
  CandidatePen,
  PairingCandidatesResponse,
  PairingComparisonResponse,
  SommelierResponse,
  WritingSampleOut,
} from '../types';
import { StarRating } from '../components/FilterSortControls';
import { SampleLightbox } from '../components/SampleLightbox';

interface Props {
  initialPenId?: number;
  initialInkId?: number;
  onOpenInkUpModal: (penId: number, inkId: number) => void;
  onOpenPen?: (penId: number) => void;
  onOpenInk?: (inkId: number) => void;
  onNavigateToPen?: (penId: number) => void;
  onNavigateToInk?: (inkId: number) => void;
}

export const PairingStudioView: React.FC<Props> = ({
  initialPenId,
  initialInkId,
  onOpenInkUpModal,
  onOpenPen,
  onOpenInk,
  onNavigateToPen,
  onNavigateToInk,
}) => {
  const handleOpenPen = onOpenPen || onNavigateToPen;
  const handleOpenInk = onOpenInk || onNavigateToInk;
  const { isAdmin } = useAuth();

  // Selection state
  const [selectedPenId, setSelectedPenId] = useState<number | null>(initialPenId || null);
  const [selectedInkId, setSelectedInkId] = useState<number | null>(initialInkId || null);

  // Filter toggles
  const [cleanOnly, setCleanOnly] = useState<boolean>(true);
  const [excludeEmpty, setExcludeEmpty] = useState<boolean>(true);
  const [penSearch, setPenSearch] = useState<string>('');
  const [inkSearch, setInkSearch] = useState<string>('');
  const [nibFilter, setNibFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [paletteComplementsOnly, setPaletteComplementsOnly] = useState<boolean>(false);

  // Data state
  const [candidates, setCandidates] = useState<PairingCandidatesResponse | null>(null);
  const [comparison, setComparison] = useState<PairingComparisonResponse | null>(null);
  const [sommelier, setSommelier] = useState<SommelierResponse | null>(null);
  const [activeSampleTab, setActiveSampleTab] = useState<'together' | 'pen' | 'ink'>('together');

  // Loaders
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);
  const [loadingComparison, setLoadingComparison] = useState<boolean>(false);
  const [loadingSommelier, setLoadingSommelier] = useState<boolean>(false);

  // Lightbox
  const [lightboxSample, setLightboxSample] = useState<WritingSampleOut | null>(null);

  // 1. Fetch Candidates & Active Palette
  const fetchCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    try {
      const res = await api.pairing.getCandidates(cleanOnly, excludeEmpty);
      setCandidates(res);

      // Auto-select initial IDs if provided
      if (initialPenId && !selectedPenId) setSelectedPenId(initialPenId);
      if (initialInkId && !selectedInkId) setSelectedInkId(initialInkId);
    } catch (err) {
      console.error('Failed to fetch pairing candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  }, [cleanOnly, excludeEmpty, initialPenId, initialInkId, selectedPenId, selectedInkId]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  // 2. Fetch Comparison whenever selectedPenId + selectedInkId changes
  useEffect(() => {
    if (!selectedPenId || !selectedInkId) {
      setComparison(null);
      setSommelier(null);
      return;
    }

    let isSubscribed = true;
    setLoadingComparison(true);
    setSommelier(null);

    api.pairing
      .compare(selectedPenId, selectedInkId)
      .then((res) => {
        if (isSubscribed) {
          setComparison(res);
          // Set active sample tab: default to 'together', but if 0 samples, pick whichever has samples
          if (res.samples_together.length > 0) {
            setActiveSampleTab('together');
          } else if (res.samples_pen.length > 0) {
            setActiveSampleTab('pen');
          } else if (res.samples_ink.length > 0) {
            setActiveSampleTab('ink');
          } else {
            setActiveSampleTab('together');
          }
        }
      })
      .catch((err) => {
        console.error('Failed to compare pairing:', err);
      })
      .finally(() => {
        if (isSubscribed) setLoadingComparison(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [selectedPenId, selectedInkId]);

  // 3. AI Sommelier Consultation
  const handleConsultSommelier = async () => {
    if (!selectedPenId || !selectedInkId) return;
    setLoadingSommelier(true);
    try {
      const res = await api.pairing.consultSommelier(selectedPenId, selectedInkId);
      setSommelier(res);
    } catch (err) {
      console.error('Sommelier consultation failed:', err);
    } finally {
      setLoadingSommelier(false);
    }
  };

  // 4. Rate a writing sample inline
  const handleRateSample = async (sampleId: number, rating: number) => {
    try {
      const updated = await api.rateWritingSample(sampleId, rating);
      if (comparison) {
        setComparison({
          ...comparison,
          samples_together: comparison.samples_together.map((s) => (s.id === sampleId ? updated : s)),
          samples_pen: comparison.samples_pen.map((s) => (s.id === sampleId ? updated : s)),
          samples_ink: comparison.samples_ink.map((s) => (s.id === sampleId ? updated : s)),
        });
      }
    } catch (err) {
      console.error('Failed to rate sample:', err);
    }
  };

  // 5. Smart Randomizer / Surprise Me
  const handleSurpriseMe = () => {
    if (!candidates || candidates.pens.length === 0 || candidates.inks.length === 0) return;
    const randomPen = candidates.pens[Math.floor(Math.random() * candidates.pens.length)];
    const randomInk = candidates.inks[Math.floor(Math.random() * candidates.inks.length)];
    setSelectedPenId(randomPen.id);
    setSelectedInkId(randomInk.id);
  };

  // 6. Filtered Lists
  const filteredPens = useMemo(() => {
    if (!candidates?.pens) return [];
    return candidates.pens.filter((p) => {
      if (penSearch) {
        const q = penSearch.toLowerCase();
        const matchesName =
          p.display_name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q);
        if (!matchesName) return false;
      }
      if (nibFilter !== 'all') {
        if (!p.nib_size.toLowerCase().includes(nibFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [candidates?.pens, penSearch, nibFilter]);

  const filteredInks = useMemo(() => {
    if (!candidates?.inks) return [];
    const complements = new Set(candidates.active_palette?.recommended_complements || []);
    const gaps = new Set(candidates.active_palette?.missing_color_families || []);

    return candidates.inks.filter((i) => {
      if (inkSearch) {
        const q = inkSearch.toLowerCase();
        const matchesName =
          i.display_name.toLowerCase().includes(q) ||
          i.brand.toLowerCase().includes(q) ||
          i.name.toLowerCase().includes(q);
        if (!matchesName) return false;
      }
      if (colorFilter !== 'all') {
        if (i.color_family.toLowerCase() !== colorFilter.toLowerCase()) return false;
      }
      if (paletteComplementsOnly) {
        if (!complements.has(i.color_family) && !gaps.has(i.color_family)) return false;
      }
      return true;
    });
  }, [candidates?.inks, candidates?.active_palette, inkSearch, colorFilter, paletteComplementsOnly]);

  const activePalette = candidates?.active_palette;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header & Feature Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-serif tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Pairing Studio
                <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
                  Ink-Up Matchmaker
                </span>
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Select your next fountain pen &amp; ink combination with active palette harmony, learned ratings, and handwriting crops.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition"
          >
            <Shuffle className="w-3.5 h-3.5 text-amber-500" />
            <span>Surprise Me</span>
          </button>

          {candidates?.neglected_duo && (
            <button
              type="button"
              onClick={() => {
                setSelectedPenId(candidates.neglected_duo!.pen_id);
                setSelectedInkId(candidates.neglected_duo!.ink_id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition"
              title={candidates.neglected_duo.rationale}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Neglected Duo</span>
            </button>
          )}

          {candidates?.brand_new_duo && (
            <button
              type="button"
              onClick={() => {
                setSelectedPenId(candidates.brand_new_duo!.pen_id);
                setSelectedInkId(candidates.brand_new_duo!.ink_id);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
              title={candidates.brand_new_duo.rationale}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Brand-New Pair</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Active Rotation Palette Banner */}
      {activePalette && (
        <div className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Currently Inked Palette ({activePalette.active_count} pens in rotation)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteComplementsOnly(!paletteComplementsOnly)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 ${
                  paletteComplementsOnly
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <span>Show Complements &amp; Gaps Only</span>
                {paletteComplementsOnly && <Check className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {activePalette.active_items.map((item) => (
              <div
                key={item.session_id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700/60 text-xs"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs border border-white/20"
                  style={{ backgroundColor: item.hex_color || '#6366f1' }}
                />
                <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[130px]">
                  {item.pen_name}
                </span>
                <span className="text-zinc-400">&bull;</span>
                <span className="text-zinc-500 truncate max-w-[110px]">{item.ink_name}</span>
              </div>
            ))}

            {activePalette.active_count === 0 && (
              <span className="text-xs text-zinc-400 italic">No pens currently inked. All pens are clean and ready!</span>
            )}
          </div>

          {activePalette.recommended_complements.length > 0 && (
            <div className="text-[11px] text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/80 pt-2 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Recommended Next Shades:</span>
              {activePalette.recommended_complements.slice(0, 5).map((shade) => (
                <span
                  key={shade}
                  className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-mono-num text-[10px]"
                >
                  {shade}
                </span>
              ))}
              {activePalette.missing_color_families.length > 0 && (
                <span className="text-zinc-400 ml-1">
                  (Missing families: {activePalette.missing_color_families.slice(0, 4).join(', ')})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Dual Selection Columns (Left: Pens, Right: Inks) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pens Column */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3.5 flex flex-col h-[520px]">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Feather className="w-4 h-4 text-indigo-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                1. Select Pen ({filteredPens.length} candidates)
              </h2>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={cleanOnly}
                onChange={(e) => setCleanOnly(e.target.checked)}
                className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Clean / Uninked only</span>
            </label>
          </div>

          {/* Pen Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search brand, model..."
                value={penSearch}
                onChange={(e) => setPenSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={nibFilter}
              onChange={(e) => setNibFilter(e.target.value)}
              className="py-1.5 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300"
            >
              <option value="all">All Nibs</option>
              <option value="ef">EF (Extra Fine)</option>
              <option value="f">F (Fine)</option>
              <option value="m">M (Medium)</option>
              <option value="b">B (Broad)</option>
              <option value="stub">Stub / 1.1</option>
              <option value="flex">Flex / Music</option>
            </select>
          </div>

          {/* Pen Cards Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {filteredPens.map((pen) => {
              const isSelected = selectedPenId === pen.id;
              return (
                <div
                  key={pen.id}
                  onClick={() => setSelectedPenId(pen.id)}
                  className={`pt-2 first:pt-0 cursor-pointer p-2.5 rounded-xl transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-800 ring-2 ring-indigo-500/20'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {pen.primary_photo_url ? (
                      <img
                        src={pen.primary_photo_url}
                        alt={pen.display_name}
                        className="w-10 h-10 rounded-lg object-contain bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200/50 dark:border-zinc-700/50"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                        <Feather className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {pen.brand} {pen.model}
                        </span>
                        {pen.color_variant && (
                          <span className="text-[11px] text-zinc-400 truncate">({pen.color_variant})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                        <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num font-medium text-zinc-700 dark:text-zinc-300 text-[10px]">
                          {pen.nib_size}
                        </span>
                        {pen.rating && <StarRating value={pen.rating} size="sm" />}
                        <span className="text-zinc-400">&bull;</span>
                        <span className="truncate">
                          {pen.is_currently_inked ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">Inked</span>
                          ) : pen.days_neglected < 900 ? (
                            `Rested ${pen.days_neglected}d`
                          ) : (
                            'Unused'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredPens.length === 0 && (
              <div className="text-center py-12 text-zinc-400 text-xs">
                No pens match your filters. Try adjusting search or toggling "Clean only".
              </div>
            )}
          </div>
        </div>

        {/* Inks Column */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3.5 flex flex-col h-[520px]">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-emerald-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                2. Select Ink ({filteredInks.length} candidates)
              </h2>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={excludeEmpty}
                onChange={(e) => setExcludeEmpty(e.target.checked)}
                className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Exclude Empty</span>
            </label>
          </div>

          {/* Ink Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search brand, ink name..."
                value={inkSearch}
                onChange={(e) => setInkSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <select
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value)}
              className="py-1.5 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300"
            >
              <option value="all">All Colors</option>
              <option value="blue">Blue</option>
              <option value="black">Black</option>
              <option value="brown">Brown</option>
              <option value="green">Green</option>
              <option value="red">Red</option>
              <option value="burgundy">Burgundy</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="turquoise">Turquoise</option>
            </select>
          </div>

          {/* Ink Cards Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {filteredInks.map((ink) => {
              const isSelected = selectedInkId === ink.id;
              const isComplement = activePalette?.recommended_complements.includes(ink.color_family);

              return (
                <div
                  key={ink.id}
                  onClick={() => setSelectedInkId(ink.id)}
                  className={`pt-2 first:pt-0 cursor-pointer p-2.5 rounded-xl transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/20'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full shrink-0 shadow-xs border border-black/10 dark:border-white/20 flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: ink.hex_color || '#1e40af' }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {ink.brand} {ink.name}
                        </span>
                        {isComplement && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-semibold uppercase">
                            Complement
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                        <span className="capitalize">{ink.color_family}</span>
                        {ink.rating && <StarRating value={ink.rating} size="sm" />}
                        <span className="text-zinc-400">&bull;</span>
                        <span className="truncate capitalize">{ink.remaining_level.replace('_', ' ')}</span>
                        {ink.active_pens_count > 0 && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                            ({ink.active_pens_count} inked)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredInks.length === 0 && (
              <div className="text-center py-12 text-zinc-400 text-xs">
                No inks match your filters. Try clearing filters or unchecking "Complements only".
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. The Active Pairing Canvas (Renders when both are selected) */}
      {selectedPenId && selectedInkId && comparison && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-6 shadow-sm">
          {/* Hero Match Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-4">
              {/* Pen Photo & Ink Swatch Match */}
              <div className="flex items-center -space-x-3 shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 shadow-sm flex items-center justify-center overflow-hidden">
                  {comparison.pen.primary_photo_url ? (
                    <img
                      src={comparison.pen.primary_photo_url}
                      alt={comparison.pen.display_name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Feather className="w-6 h-6 text-zinc-400" />
                  )}
                </div>
                <div
                  className="w-14 h-14 rounded-2xl border-2 border-white dark:border-zinc-900 shadow-sm flex items-center justify-center text-white"
                  style={{ backgroundColor: comparison.ink.hex_color || '#1e40af' }}
                >
                  <Droplet className="w-6 h-6" />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {comparison.pen.brand} {comparison.pen.model} &amp; {comparison.ink.brand} {comparison.ink.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                    {comparison.match_analysis.score}% Match
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {comparison.match_analysis.badges.map((b) => (
                    <span
                      key={b}
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    >
                      {b}
                    </span>
                  ))}
                  {comparison.pairing_history.is_brand_new_pairing && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200/50">
                      ✨ Brand-New Pairing
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  {comparison.match_analysis.explanation}
                </p>
              </div>
            </div>

            {/* Ink This Pen Action CTA */}
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenInkUpModal(comparison.pen.id, comparison.ink.id)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
              >
                <Feather className="w-4 h-4" />
                <span>Ink This Pen Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Sommelier Commentary Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/5 via-indigo-500/5 to-purple-500/5 border border-amber-200/50 dark:border-amber-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                  Fountain Pen Sommelier Critique
                </h3>
              </div>

              {!sommelier && (
                <button
                  type="button"
                  onClick={handleConsultSommelier}
                  disabled={loadingSommelier}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-2xs transition"
                >
                  <Wand2 className={`w-3.5 h-3.5 text-indigo-500 ${loadingSommelier ? 'animate-spin' : ''}`} />
                  <span>{loadingSommelier ? 'Consulting Sommelier...' : 'Ask AI Sommelier'}</span>
                </button>
              )}
            </div>

            {sommelier ? (
              <div className="space-y-2 pt-1 text-xs">
                <h4 className="font-serif font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                  "{sommelier.headline}"
                </h4>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans">
                  {sommelier.sommelier_notes}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-white/70 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700/50">
                    <span className="font-semibold text-[11px] text-zinc-700 dark:text-zinc-300 block mb-0.5">
                      📖 Recommended Paper:
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {sommelier.recommended_paper}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/70 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700/50">
                    <span className="font-semibold text-[11px] text-zinc-700 dark:text-zinc-300 block mb-0.5">
                      ✒️ Ideal Scenario:
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {sommelier.ideal_use_case}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">
                Click "Ask AI Sommelier" for personalized paper pairing advice, ink shading analysis, and connoisseur critique.
              </p>
            )}
          </div>

          {/* Chronological Usage Comparison (Together vs. Separately) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Together */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30 space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block">
                Together in Session
              </span>
              <div className="text-lg font-bold font-mono-num text-zinc-900 dark:text-zinc-100">
                {comparison.pairing_history.times_paired}{' '}
                <span className="text-xs font-normal text-zinc-500">past fills</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-snug">
                {comparison.pairing_history.last_paired_date ? (
                  <>
                    Last paired on <strong>{comparison.pairing_history.last_paired_date}</strong> (
                    {comparison.pairing_history.days_since_paired}d ago)
                  </>
                ) : (
                  'Never inked together before'
                )}
              </p>
            </div>

            {/* Pen Alone */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30 space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block">
                {comparison.pen.brand} Status
              </span>
              <div className="text-lg font-bold font-mono-num text-zinc-900 dark:text-zinc-100">
                {comparison.pen.total_lifetime_fills}{' '}
                <span className="text-xs font-normal text-zinc-500">lifetime fills</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-snug">
                {comparison.pen.is_currently_inked ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Currently inked with {comparison.pen.active_ink_name}
                  </span>
                ) : comparison.pen.last_cleaned_date ? (
                  <>
                    Cleaned on <strong>{comparison.pen.last_cleaned_date}</strong> (
                    {comparison.pen.days_since_cleaned}d ago)
                  </>
                ) : (
                  'Clean and ready to ink'
                )}
              </p>
            </div>

            {/* Ink Alone */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30 space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block">
                {comparison.ink.brand} {comparison.ink.name}
              </span>
              <div className="text-lg font-bold font-mono-num text-zinc-900 dark:text-zinc-100 capitalize">
                {comparison.ink.remaining_level.replace('_', ' ')}{' '}
                <span className="text-xs font-normal text-zinc-500">level</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-snug">
                {comparison.ink.active_pens_count > 0 ? (
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                    Currently active in {comparison.ink.active_pens_count} pen(s)
                  </span>
                ) : comparison.ink.last_used_date ? (
                  <>
                    Last used on <strong>{comparison.ink.last_used_date}</strong> (
                    {comparison.ink.days_since_used}d ago)
                  </>
                ) : (
                  'Unused in recent sessions'
                )}
              </p>
            </div>
          </div>

          {/* Tri-Tab Writing Sample Gallery */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveSampleTab('together')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    activeSampleTab === 'together'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Together ({comparison.samples_together.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSampleTab('pen')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    activeSampleTab === 'pen'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {comparison.pen.brand} Samples ({comparison.samples_pen.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSampleTab('ink')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    activeSampleTab === 'ink'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {comparison.ink.name} Samples ({comparison.samples_ink.length})
                </button>
              </div>

              <span className="text-[11px] text-zinc-400">
                Click any crop to inspect in high-res lightbox or rate the writing experience
              </span>
            </div>

            {/* Sample Crops Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {activeSampleTab === 'together' &&
                comparison.samples_together.map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                    onOpenLightbox={() => setLightboxSample(sample)}
                    onRate={(r) => handleRateSample(sample.id, r)}
                  />
                ))}

              {activeSampleTab === 'pen' &&
                comparison.samples_pen.map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                    onOpenLightbox={() => setLightboxSample(sample)}
                    onRate={(r) => handleRateSample(sample.id, r)}
                  />
                ))}

              {activeSampleTab === 'ink' &&
                comparison.samples_ink.map((sample) => (
                  <SampleCard
                    key={sample.id}
                    sample={sample}
                    onOpenLightbox={() => setLightboxSample(sample)}
                    onRate={(r) => handleRateSample(sample.id, r)}
                  />
                ))}
            </div>

            {/* Empty states for tabs */}
            {activeSampleTab === 'together' && comparison.samples_together.length === 0 && (
              <div className="text-center py-10 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 text-xs space-y-1">
                <p className="font-medium text-zinc-600 dark:text-zinc-300">
                  No handwriting crops for this exact pairing yet!
                </p>
                <p className="text-[11px]">
                  Check the "{comparison.pen.brand} Samples" or "{comparison.ink.name} Samples" tabs to see how the nib and ink perform separately.
                </p>
              </div>
            )}

            {activeSampleTab === 'pen' && comparison.samples_pen.length === 0 && (
              <div className="text-center py-10 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 text-xs">
                No other samples recorded for this pen.
              </div>
            )}

            {activeSampleTab === 'ink' && comparison.samples_ink.length === 0 && (
              <div className="text-center py-10 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-400 text-xs">
                No other samples recorded for this ink.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxSample && (
        <SampleLightbox
          sample={lightboxSample}
          onClose={() => setLightboxSample(null)}
          onNavigatePen={(id) => handleOpenPen && handleOpenPen(id)}
          onNavigateInk={(id) => handleOpenInk && handleOpenInk(id)}
          onSampleUpdated={(updated: WritingSampleOut) => {
            if (comparison) {
              setComparison({
                ...comparison,
                samples_together: comparison.samples_together.map((s) => (s.id === updated.id ? updated : s)),
                samples_pen: comparison.samples_pen.map((s) => (s.id === updated.id ? updated : s)),
                samples_ink: comparison.samples_ink.map((s) => (s.id === updated.id ? updated : s)),
              });
            }
          }}
        />
      )}
    </div>
  );
};

// Sub-component for individual sample crop card with interactive star rating
interface SampleCardProps {
  sample: WritingSampleOut;
  onOpenLightbox: () => void;
  onRate: (rating: number) => void;
}

const SampleCard: React.FC<SampleCardProps> = ({ sample, onOpenLightbox, onRate }) => {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs hover:shadow-xs transition group flex flex-col justify-between">
      <div onClick={onOpenLightbox} className="cursor-pointer relative overflow-hidden bg-zinc-50 dark:bg-zinc-950 h-32 flex items-center justify-center p-2">
        <img
          src={sample.image_url}
          alt={sample.caption || 'Writing sample crop'}
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition duration-200"
        />
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-mono-num backdrop-blur-xs">
          {sample.sample_date}
        </div>
      </div>

      <div className="p-2.5 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[120px]">
            {sample.pen.brand} {sample.pen.nib_size}
          </span>
          <span className="text-zinc-400 truncate max-w-[90px]">{sample.ink.name}</span>
        </div>

        {sample.transcription && (
          <p className="text-[10px] text-zinc-500 italic truncate" title={sample.transcription}>
            "{sample.transcription}"
          </p>
        )}

        {/* Interactive 5-Star Rating Widget */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
          <span className="text-[10px] text-zinc-400">Experience:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onRate(star)}
                title={`Rate this pairing ${star} stars`}
                className="p-0.5 text-zinc-300 hover:text-amber-400 transition"
              >
                <Star
                  className={`w-3 h-3 ${
                    (sample.rating || 0) >= star
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-zinc-300 dark:text-zinc-600'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
