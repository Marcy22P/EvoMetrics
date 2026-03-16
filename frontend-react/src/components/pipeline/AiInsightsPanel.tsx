import React, { useState, useEffect } from 'react';
import type { Lead } from '../../services/salesApi';
import { getApiGatewayUrl } from '../../utils/apiConfig';

interface AiInsightEntry {
  lead_id: string;
  name: string;
  text: string;
  action: string;
}

interface AiInsightsPanelProps {
  leads: Lead[];
  onClose: () => void;
}

const GATEWAY = getApiGatewayUrl();

const AiInsightsPanel: React.FC<AiInsightsPanelProps> = ({ leads, onClose }) => {
  const [insights, setInsights] = useState<AiInsightEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const urgentLeads = leads
      .filter(l => !['cliente', 'trattativa_persa', 'scartato', 'archiviato'].includes(l.stage))
      .slice(0, 5);

    if (urgentLeads.length === 0) {
      setLoading(false);
      return;
    }

    const prompt = `Per questi lead dai 1 insight + 1 azione (JSON array [{lead_id,name,text,action}]):\n${urgentLeads.map(l => `${l.id.slice(0, 8)} ${l.azienda || l.email} ${l.stage} score:${l.lead_score ?? 0}`).join('\n')}`;


    fetch(`${GATEWAY}/api/mcp/evo-agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message: prompt, agent_id: 'sales', history: [] }),
    })
      .then(r => r.json())
      .then((data: { response?: string }) => {
        try {
          const text = data.response || '';
          const match = text.match(/\[[\s\S]*\]/);
          if (match) setInsights(JSON.parse(match[0]) as AiInsightEntry[]);
        } catch {
          // ignore parse errors
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leads]);

  const getLeadValue = (leadId: string): string => {
    const lead = leads.find(l => l.id.startsWith(leadId));
    if (!lead?.deal_value) return '0';
    const v = lead.deal_value > 10000 ? lead.deal_value / 100 : lead.deal_value;
    return Math.round(v).toLocaleString('it-IT');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 120,
      right: 24,
      width: 320,
      maxHeight: '70vh',
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
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e8eaed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1v14M1 8h14M4 4l8 8M12 4l-8 8"/>
          </svg>
          AI Insight
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: '1.1rem',
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.82rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'spin 1s linear infinite' }}>
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
              <circle cx="11" cy="11" r="9" fill="none" stroke="#e5e7eb" strokeWidth="2.5"/>
              <path d="M11 2 A9 9 0 0 1 20 11" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            Analisi in corso...
          </div>
        ) : insights.length === 0 ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.82rem',
          }}>
            Nessun insight disponibile
          </div>
        ) : (
          insights.map((ins, i) => (
            <div key={i} style={{
              padding: '12px 16px',
              borderBottom: i < insights.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}>
              <div style={{
                fontWeight: 600,
                fontSize: '0.82rem',
                marginBottom: 4,
                color: '#111827',
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
              }}>
                {ins.name}
                {ins.lead_id && (
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 400 }}>
                    €{getLeadValue(ins.lead_id)}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '0.78rem',
                color: '#6b7280',
                marginBottom: 8,
                lineHeight: 1.55,
              }}>
                {ins.text}
              </div>
              <button style={{
                background: 'none',
                border: '1px solid #e8eaed',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#2563eb',
                cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                transition: 'border-color 120ms, background 120ms',
              }}>
                {ins.action}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AiInsightsPanel;
