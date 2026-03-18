import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Lead } from '../../services/salesApi';
import { getApiGatewayUrl } from '../../utils/apiConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiInsightEntry {
  lead_id: string;
  name: string;
  text: string;
  action: string;
}

interface InsightCache {
  insights: AiInsightEntry[];
  generated_at: string;   // ISO
  fingerprint: string;    // fingerprint dei lead usati
}

interface AiInsightsPanelProps {
  leads: Lead[];
  onClose: () => void;
  onInsightsLoaded?: (count: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY        = 'pipeline_ai_insights_v1';
const CACHE_TTL_MS     = 6 * 60 * 60 * 1000;  // 6 ore: rigenerazione forzata
const ACTIVE_STAGES    = new Set(['optin', 'contattato', 'prima_chiamata',
                                   'appuntamento_vivo_1', 'seconda_chiamata',
                                   'appuntamento_vivo_2', 'preventivo_consegnato']);
const MAX_LEADS_PROMPT = 5;
const GATEWAY          = getApiGatewayUrl();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fingerprint stabile basato sui lead urgenti: cambia solo se cambia qualcosa di rilevante */
function computeFingerprint(leads: Lead[]): string {
  const urgent = getUrgentLeads(leads);
  return urgent.map(l => `${l.id}:${l.stage}:${l.lead_score ?? 0}:${l.last_activity_at ?? ''}`).join('|');
}

function getUrgentLeads(leads: Lead[]): Lead[] {
  return leads
    .filter(l => ACTIVE_STAGES.has(l.stage))
    .sort((a, b) => (a.lead_score ?? 0) - (b.lead_score ?? 0))
    .slice(0, MAX_LEADS_PROMPT);
}

function loadCache(): InsightCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InsightCache;
  } catch { return null; }
}

function saveCache(cache: InsightCache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

function isCacheStale(cache: InsightCache): boolean {
  return Date.now() - new Date(cache.generated_at).getTime() > CACHE_TTL_MS;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

// ─── AI fetch ────────────────────────────────────────────────────────────────

async function fetchInsightsFromAi(leads: Lead[]): Promise<AiInsightEntry[]> {
  const urgentLeads = getUrgentLeads(leads);
  if (urgentLeads.length === 0) return [];

  const token = localStorage.getItem('auth_token');
  const prompt = `Analizza questi lead urgenti della sales pipeline e fornisci 1 insight + 1 azione per ognuno:\n${
    urgentLeads.map(l =>
      `ID:${l.id.slice(0, 8)} | ${l.azienda || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email} | Stage:${l.stage} | Score:${l.lead_score ?? 0}${l.deal_value ? ` | €${Math.round(l.deal_value / 100).toLocaleString('it-IT')}` : ''}`
    ).join('\n')
  }`;

  // Endpoint dedicato: non usa EvoAgentOrchestrator, non crea conversazioni nel DB
  const res = await fetch(`${GATEWAY}/api/mcp/ai-insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) throw new Error(`AI insights: ${res.status}`);

  const data = (await res.json()) as { response?: string };
  const text = data.response ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]) as AiInsightEntry[];
}

// ─── Component ────────────────────────────────────────────────────────────────

const AiInsightsPanel: React.FC<AiInsightsPanelProps> = ({ leads, onClose, onInsightsLoaded }) => {
  const [insights,      setInsights]      = useState<AiInsightEntry[]>([]);
  const [generatedAt,   setGeneratedAt]   = useState<string | null>(null);
  const [isFirstLoad,   setIsFirstLoad]   = useState(true);   // nessun cache → mostra spinner
  const [isRefreshing,  setIsRefreshing]  = useState(false);  // refresh in background
  const [refreshError,  setRefreshError]  = useState(false);

  const refreshingRef = useRef(false); // evita doppia chiamata

  // ── Refresh (può essere background o primo caricamento) ──────────────────────
  const doRefresh = useCallback(async (background: boolean) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshError(false);
    if (background) setIsRefreshing(true);

    try {
      const newInsights = await fetchInsightsFromAi(leads);
      const now = new Date().toISOString();
      const fingerprint = computeFingerprint(leads);

      const cache: InsightCache = { insights: newInsights, generated_at: now, fingerprint };
      saveCache(cache);

      setInsights(newInsights);
      setGeneratedAt(now);
      onInsightsLoaded?.(newInsights.length);
    } catch {
      setRefreshError(true);
    } finally {
      refreshingRef.current = false;
      setIsFirstLoad(false);
      setIsRefreshing(false);
    }
  }, [leads, onInsightsLoaded]);

  // ── Logica stale-while-revalidate all'apertura ────────────────────────────
  useEffect(() => {
    const cache = loadCache();
    const fingerprint = computeFingerprint(leads);

    if (cache && cache.insights.length > 0) {
      // Mostra subito il cache
      setInsights(cache.insights);
      setGeneratedAt(cache.generated_at);
      setIsFirstLoad(false);
      onInsightsLoaded?.(cache.insights.length);

      // Richiedi aggiornamento in background solo se il fingerprint è cambiato O il cache è scaduto
      const fingerprintChanged = cache.fingerprint !== fingerprint;
      if (fingerprintChanged || isCacheStale(cache)) {
        doRefresh(true);
      }
    } else {
      // Nessun cache: primo caricamento, mostra spinner
      setIsFirstLoad(true);
      doRefresh(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo al mount

  const getLeadValue = (leadId: string): string => {
    const lead = leads.find(l => l.id.startsWith(leadId));
    if (!lead?.deal_value) return '';
    return `€${Math.round(lead.deal_value / 100).toLocaleString('it-IT')}`;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      top: 120,
      right: 24,
      width: 340,
      maxHeight: '72vh',
      background: '#fff',
      border: '1px solid #e8eaed',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #e8eaed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 8,
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1v14M1 8h14M4 4l8 8M12 4l-8 8"/>
          </svg>
          AI Insight
          {isRefreshing && (
            <svg width="12" height="12" viewBox="0 0 22 22" style={{ animation: 'spin 1s linear infinite', marginLeft: 2 }}>
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              <circle cx="11" cy="11" r="9" fill="none" stroke="#e5e7eb" strokeWidth="2.5"/>
              <path d="M11 2 A9 9 0 0 1 20 11" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          )}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Timestamp + pulsante aggiorna */}
          {generatedAt && !isFirstLoad && (
            <span style={{ fontSize: '0.68rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
              {fmtTime(generatedAt)}
            </span>
          )}
          {!isFirstLoad && !isRefreshing && (
            <button
              onClick={() => doRefresh(true)}
              title="Aggiorna insight"
              style={{
                background: 'none', border: '1px solid #e8eaed', borderRadius: 5,
                padding: '2px 7px', fontSize: '0.72rem', fontWeight: 600,
                color: '#6b7280', cursor: 'pointer',
              }}
            >
              ↻
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.1rem', lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {/* Primo caricamento (nessun cache) */}
        {isFirstLoad ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center', color: '#9ca3af',
            fontSize: '0.82rem', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 10,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="11" cy="11" r="9" fill="none" stroke="#e5e7eb" strokeWidth="2.5"/>
              <path d="M11 2 A9 9 0 0 1 20 11" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            Analisi in corso...
          </div>

        ) : insights.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>
            {refreshError ? 'Errore nel caricamento degli insight.' : 'Nessun insight disponibile.'}
          </div>

        ) : (
          <>
            {insights.map((ins, i) => (
              <div key={i} style={{
                padding: '12px 14px',
                borderBottom: i < insights.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{
                  fontWeight: 600, fontSize: '0.82rem', marginBottom: 4,
                  color: '#111827', display: 'flex', alignItems: 'baseline', gap: 6,
                }}>
                  {ins.name}
                  {ins.lead_id && getLeadValue(ins.lead_id) && (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 400 }}>
                      {getLeadValue(ins.lead_id)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8, lineHeight: 1.55 }}>
                  {ins.text}
                </div>
                <button style={{
                  background: 'none', border: '1px solid #e8eaed', borderRadius: 6,
                  padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
                  color: '#2563eb', cursor: 'pointer',
                  fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                  transition: 'border-color 120ms, background 120ms',
                }}>
                  {ins.action}
                </button>
              </div>
            ))}

            {/* Footer: avviso se refresh in background ha avuto errore */}
            {refreshError && (
              <div style={{ padding: '8px 14px', fontSize: '0.72rem', color: '#ef4444', borderTop: '1px solid #f3f4f6' }}>
                Aggiornamento fallito — mostro dati precedenti.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AiInsightsPanel;
