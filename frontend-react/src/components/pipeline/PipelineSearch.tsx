import React, { useRef, useEffect } from 'react';
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

export interface FilterGroup {
  category: string;
  options: { key: string; label: string; value: string }[];
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
  /** If provided, renders filter dropdown anchored to this ref */
  showFilterDropdown?: boolean;
  onCloseFilterDropdown?: () => void;
}

// ─── Build filter options ─────────────────────────────────────────────────────

export function buildFilterOptions(
  stages: PipelineStage[],
  users: PipelineUser[],
  channels: string[],
): FilterGroup[] {
  return [
    {
      category: 'Stage',
      options: stages.map(st => ({ key: 'stage', label: st.label, value: st.key })),
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
  showFilterDropdown = false,
  onCloseFilterDropdown,
}) => {
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilterDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        onCloseFilterDropdown?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilterDropdown, onCloseFilterDropdown]);

  const setQuery = (q: string) => onChange({ ...value, query: q });

  const addFilter = (f: { key: string; label: string; value: string }) => {
    if (value.filters.some(x => x.key === f.key && x.value === f.value)) {
      onCloseFilterDropdown?.();
      return;
    }
    onChange({ ...value, filters: [...value.filters, f] });
    onCloseFilterDropdown?.();
  };

  const removeFilter = (idx: number) => {
    onChange({ ...value, filters: value.filters.filter((_, i) => i !== idx) });
  };

  const filterOptions = buildFilterOptions(stages, users, sourceChannels);

  return (
    <div className={s.searchWrap} ref={dropRef} style={{ position: 'relative' }}>
      {/* Search box */}
      <div className={s.searchBox}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
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

      {/* Active filter chips */}
      {value.filters.length > 0 && (
        <div className={s.chips} style={{ marginTop: 6 }}>
          {value.filters.map((f, i) => (
            <span key={i} className={s.chip}>
              {f.label}
              <button className={s.chipRemove} onClick={() => removeFilter(i)}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Filter dropdown (triggered externally by toolbar filterBtn) */}
      {showFilterDropdown && (
        <div className={s.filterDropdown} style={{ top: 'calc(100% + 8px)', left: 0 }}>
          {filterOptions.map(group => (
            <div key={group.category}>
              <div style={{ padding: '4px 10px 2px', fontSize: '0.66rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
          {value.filters.length > 0 && (
            <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 4, paddingTop: 4 }}>
              <button
                className={s.filterOption}
                style={{ color: '#dc2626' }}
                onClick={() => { onChange({ ...value, filters: [] }); onCloseFilterDropdown?.(); }}
              >
                Rimuovi tutti i filtri
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PipelineSearch;
