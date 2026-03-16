import React, { useState, useRef, useEffect } from 'react';
import type { PipelineStage, LeadTag, PipelineUser } from '../../services/salesApi';
import s from './pipeline.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}

export interface SearchState {
  query: string;
  filters: ActiveFilter[];
}

interface PipelineSearchProps {
  stages: PipelineStage[];
  leadTags?: LeadTag[];
  users: PipelineUser[];
  sourceChannels: string[];
  value: SearchState;
  onChange: (state: SearchState) => void;
  totalShown: number;
  totalAll: number;
}

// ─── Filter options ───────────────────────────────────────────────────────────

function buildFilterOptions(
  stages: PipelineStage[],
  users: PipelineUser[],
  channels: string[],
): { category: string; options: { key: string; label: string; value: string }[] }[] {
  return [
    {
      category: 'Stage',
      options: stages.map(s => ({ key: 'stage', label: s.label, value: s.key })),
    },
    {
      category: 'Fonte',
      options: channels.map(c => ({ key: 'source', label: c, value: c })),
    },
    {
      category: 'Assegnato a',
      options: users.map(u => ({
        key: 'assignee',
        label: [u.nome, u.cognome].filter(Boolean).join(' ') || u.username,
        value: u.id,
      })),
    },
    {
      category: 'Score',
      options: [
        { key: 'score', label: 'Score alto (≥70)', value: 'high' },
        { key: 'score', label: 'Score medio (40-69)', value: 'medium' },
        { key: 'score', label: 'Score basso (<40)', value: 'low' },
      ],
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

const PipelineSearch: React.FC<PipelineSearchProps> = ({
  stages,
  users,
  sourceChannels,
  value,
  onChange,
  totalShown,
  totalAll,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setQuery = (q: string) => onChange({ ...value, query: q });

  const addFilter = (f: { key: string; label: string; value: string }) => {
    // Avoid duplicates with same key+value
    if (value.filters.some(x => x.key === f.key && x.value === f.value)) {
      setShowDropdown(false);
      return;
    }
    onChange({ ...value, filters: [...value.filters, f] });
    setShowDropdown(false);
  };

  const removeFilter = (idx: number) => {
    onChange({ ...value, filters: value.filters.filter((_, i) => i !== idx) });
  };

  const clearAll = () => onChange({ query: '', filters: [] });

  const filterOptions = buildFilterOptions(stages, users, sourceChannels);
  const hasAny = value.query || value.filters.length > 0;

  return (
    <div className={s.searchWrap}>
      <div className={s.searchRow}>
        {/* Search box */}
        <div className={s.searchBox}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: '#8c9196', flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            className={s.searchInput}
            placeholder="Cerca lead, azienda, email..."
            value={value.query}
            onChange={e => setQuery(e.target.value)}
          />
          {value.query && (
            <button className={s.clearBtn} onClick={() => setQuery('')}>×</button>
          )}
        </div>

        {/* Filter add button */}
        <div style={{ position: 'relative' }} ref={dropRef}>
          <button
            className={s.filterMenuBtn}
            onClick={() => setShowDropdown(p => !p)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
            Filtra
            {value.filters.length > 0 && (
              <span style={{ background: '#005bd3', color: '#fff', borderRadius: '10px', padding: '0 5px', fontSize: '0.68rem', fontWeight: 700 }}>
                {value.filters.length}
              </span>
            )}
          </button>

          {showDropdown && (
            <div className={s.filterDropdown}>
              {filterOptions.map(group => (
                <div key={group.category}>
                  <div style={{ padding: '4px 10px 2px', fontSize: '0.68rem', color: '#8c9196', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {group.category}
                  </div>
                  {group.options.map(opt => (
                    <button
                      key={`${opt.key}-${opt.value}`}
                      className={s.filterOption}
                      onClick={() => addFilter(opt)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clear all */}
        {hasAny && (
          <button className={s.filterMenuBtn} onClick={clearAll} style={{ color: '#c0392b', borderColor: '#fde8e7' }}>
            Pulisci tutto
          </button>
        )}

        {/* Result count */}
        {hasAny && (
          <span style={{ fontSize: '0.75rem', color: '#8c9196', marginLeft: 4, whiteSpace: 'nowrap' }}>
            {totalShown} / {totalAll}
          </span>
        )}
      </div>

      {/* Active filter chips */}
      {value.filters.length > 0 && (
        <div className={s.chips}>
          {value.filters.map((f, i) => (
            <span key={i} className={s.chip}>
              {f.label}
              <button className={s.chipRemove} onClick={() => removeFilter(i)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default PipelineSearch;
