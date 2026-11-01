import React, { useState, useEffect } from 'react';
import { Edit3, Check, X, FileText } from 'lucide-react';

interface Props {
  title?: string;
  placeholder?: string;
  value: string;
  onSave: (nextValue: string) => Promise<void>;
}

function renderInlineFormatted(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, idx) => {
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono-num text-xs text-indigo-600 dark:text-indigo-400"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{tok}</span>;
  });
}

export const MarkdownNotes: React.FC<Props> = ({
  title = 'Custom Notes',
  placeholder = 'Add standalone notes (nib feel, tuning, ink properties, favorite paper pairings)...',
  value,
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          <span className="text-[11px] text-zinc-400">Standalone · Markdown supported</span>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Notes
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
      ) : value.trim() ? (
        <div className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          {value.split('\n').map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} className="h-1.5" />;
            if (trimmed.startsWith('### ')) {
              return (
                <h4
                  key={i}
                  className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 pt-1"
                >
                  {trimmed.slice(4)}
                </h4>
              );
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <div key={i} className="flex items-start gap-2 pl-1">
                  <span className="text-zinc-400 mt-1.5 text-[10px]">●</span>
                  <span>{renderInlineFormatted(trimmed.slice(2))}</span>
                </div>
              );
            }
            return <p key={i}>{renderInlineFormatted(line)}</p>;
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-400 italic">{placeholder}</p>
      )}
    </div>
  );
};
