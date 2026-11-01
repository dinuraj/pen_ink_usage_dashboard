import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Plus,
  Tag,
  X,
} from 'lucide-react';

export const PEN_TAG_OPTIONS = ['Everyday Use', 'Collectible', 'Vintage'] as const;
export const UNTAGGED_FILTER_VALUE = '__untagged__';

export function getPenTagStyle(tag: string): string {
  switch (tag) {
    case 'Everyday Use':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70';
    case 'Collectible':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/70';
    case 'Vintage':
      return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/70';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  }
}

export const PenTagBadge: React.FC<{ tag: string }> = ({ tag }) => (
  <span
    className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${getPenTagStyle(
      tag,
    )}`}
  >
    {tag}
  </span>
);

interface PenTagsInlineEditorProps {
  tags: string[];
  onChange: (nextTags: string[]) => Promise<void> | void;
}

export const PenTagsInlineEditor: React.FC<PenTagsInlineEditorProps> = ({ tags, onChange }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const toggleTag = async (tag: string) => {
    const exists = tags.includes(tag);
    const next = exists ? tags.filter((t) => t !== tag) : [...tags, tag];
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer hover:opacity-85"
          title="Click to edit pen tags"
        >
          <PenTagBadge tag={t} />
        </button>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium transition ${
          tags.length === 0
            ? 'border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:text-indigo-600 hover:border-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
        title="Assign or edit tags (Everyday Use, Collectible, Vintage)"
      >
        <Plus className="w-2.5 h-2.5" />
        {tags.length === 0 && <span>Tag</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-48 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1.5 text-xs space-y-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Select Pen Tags
          </div>
          {PEN_TAG_OPTIONS.map((opt) => {
            const active = tags.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => void toggleTag(opt)}
                className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-left transition ${
                  active
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-medium text-zinc-900 dark:text-zinc-100'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300'
                }`}
              >
                <PenTagBadge tag={opt} />
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center border ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                </span>
              </button>
            );
          })}
          {tags.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onChange([]);
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:text-red-500 text-left"
            >
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface MultiTagFilterDropdownProps {
  selected: string[];
  matchMode: 'any' | 'all';
  onChangeSelected: (next: string[]) => void;
  onChangeMatchMode: (mode: 'any' | 'all') => void;
  tagCounts: Record<string, number>;
  untaggedCount: number;
}

export const MultiTagFilterDropdown: React.FC<MultiTagFilterDropdownProps> = ({
  selected,
  matchMode,
  onChangeSelected,
  onChangeMatchMode,
  tagCounts,
  untaggedCount,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const toggleValue = (val: string) => {
    if (selected.includes(val)) {
      onChangeSelected(selected.filter((x) => x !== val));
    } else {
      // If picking Untagged, keep it mutually clear or allow OR matching
      onChangeSelected([...selected, val]);
    }
  };

  const buttonLabel =
    selected.length === 0
      ? 'All Tags'
      : selected
          .map((s) => (s === UNTAGGED_FILTER_VALUE ? 'Untagged' : s))
          .join(matchMode === 'all' ? ' + ' : ', ');

  const realTagSelections = selected.filter((s) => s !== UNTAGGED_FILTER_VALUE);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition max-w-[240px] ${
          selected.length > 0
            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-medium'
            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300'
        }`}
      >
        <Tag className="w-3.5 h-3.5 shrink-0 opacity-75" />
        <span className="truncate">{buttonLabel}</span>
        {selected.length > 0 ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChangeSelected([]);
            }}
            className="p-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
            title="Clear tag filter"
          >
            <X className="w-3 h-3" />
          </span>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-60 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-2 text-xs space-y-1.5">
          <div className="flex items-center justify-between px-1.5 py-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Filter by Tags
            </span>
            {realTagSelections.length >= 2 && !selected.includes(UNTAGGED_FILTER_VALUE) && (
              <div className="inline-flex items-center rounded bg-zinc-100 dark:bg-zinc-800 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => onChangeMatchMode('any')}
                  className={`px-1.5 py-0.5 rounded ${
                    matchMode === 'any'
                      ? 'bg-white dark:bg-zinc-900 font-semibold text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-zinc-500'
                  }`}
                  title="Match pens having ANY selected tag"
                >
                  Any
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMatchMode('all')}
                  className={`px-1.5 py-0.5 rounded ${
                    matchMode === 'all'
                      ? 'bg-white dark:bg-zinc-900 font-semibold text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-zinc-500'
                  }`}
                  title="Match pens having ALL selected tags together"
                >
                  All
                </button>
              </div>
            )}
          </div>

          {PEN_TAG_OPTIONS.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleValue(opt)}
                className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/70 ${
                  checked ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      checked
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700'
                    }`}
                  >
                    {checked && <Check className="w-3 h-3" />}
                  </span>
                  <PenTagBadge tag={opt} />
                </div>
                <span className="font-mono-num text-[11px] text-zinc-400">
                  {tagCounts[opt] ?? 0}
                </span>
              </button>
            );
          })}

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1">
            <button
              type="button"
              onClick={() => toggleValue(UNTAGGED_FILTER_VALUE)}
              className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/70 ${
                selected.includes(UNTAGGED_FILTER_VALUE)
                  ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center border ${
                    selected.includes(UNTAGGED_FILTER_VALUE)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {selected.includes(UNTAGGED_FILTER_VALUE) && <Check className="w-3 h-3" />}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400">Untagged</span>
              </div>
              <span className="font-mono-num text-[11px] text-zinc-400">{untaggedCount}</span>
            </button>
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChangeSelected([])}
              className="w-full pt-1 border-t border-zinc-100 dark:border-zinc-800 px-2 py-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium text-left hover:underline"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export interface CompanyOption {
  name: string;
  count: number;
}

interface CompanyFilterProps {
  value: string;
  exact: boolean;
  onChange: (value: string, exact: boolean) => void;
  companies: CompanyOption[];
  placeholder: string;
  allLabel: string;
}

export const CompanyFilterCombobox: React.FC<CompanyFilterProps> = ({
  value,
  exact,
  onChange,
  companies,
  placeholder,
  allLabel,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const needle = value.trim().toLowerCase();
  const visibleCompanies =
    !needle || exact
      ? companies
      : companies.filter((c) => c.name.toLowerCase().includes(needle));

  const totalCount = companies.reduce((acc, c) => acc + c.count, 0);

  return (
    <div ref={containerRef} className="relative min-w-[180px] max-w-[220px] flex-1">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value, false);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          className={`w-full pl-3 pr-12 py-1.5 text-xs rounded-lg border focus:outline-none transition ${
            value
              ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/30 text-zinc-900 dark:text-zinc-100 font-medium'
              : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200'
          }`}
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('', false);
                setOpen(false);
              }}
              className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              title="Clear company filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Browse companies"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-64 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg py-1 text-xs">
          <button
            type="button"
            onClick={() => {
              onChange('', false);
              setOpen(false);
            }}
            className={`w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/70 ${
              !value ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <span>{allLabel}</span>
            <span className="font-mono-num text-[11px] text-zinc-400">{totalCount}</span>
          </button>
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          {visibleCompanies.length === 0 ? (
            <div className="px-3 py-2 text-zinc-400 italic">No matching companies</div>
          ) : (
            visibleCompanies.map((c) => {
              const isSelected = exact && value.toLowerCase() === c.name.toLowerCase();
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    onChange(c.name, true);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/70 ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-semibold text-indigo-700 dark:text-indigo-300'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  <span className="truncate pr-2">{c.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num text-[10px] text-zinc-500 shrink-0">
                    {c.count}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

interface SortableThProps {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: 'asc' | 'desc';
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

export const SortableTh: React.FC<SortableThProps> = ({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'left',
  className = '',
}) => {
  const isActive = activeKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-2.5 px-3 select-none cursor-pointer group hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
      title={`Sort by ${label}`}
    >
      <span
        className={`inline-flex items-center gap-1 ${
          align === 'right' ? 'justify-end' : 'justify-start'
        } ${isActive ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''}`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="w-3 h-3 shrink-0" />
          ) : (
            <ArrowDown className="w-3 h-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 shrink-0 opacity-35 group-hover:opacity-80 transition-opacity" />
        )}
      </span>
    </th>
  );
};
