import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, X } from 'lucide-react';

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
    <div ref={containerRef} className="relative min-w-[185px] max-w-[230px] flex-1">
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
