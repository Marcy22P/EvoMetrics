import React, { useMemo } from 'react';
import type { Lead, PipelineStage, MonthlyValueResponse } from '../../services/salesApi';
import s from './pipeline.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineAnalyticsProps {
  leads: Lead[];
  stages: PipelineStage[];
  monthlyData: MonthlyValueResponse | null;
}

// ─── SVG Bar chart ────────────────────────────────────────────────────────────

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
}

const BarChart: React.FC<BarChartProps> = ({ data, height = 140, formatValue }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(32, Math.floor((300 - (data.length - 1) * 6) / data.length));
  const totalW = data.length * barW + (data.length - 1) * 6;

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${height + 28}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / max) * height);
        const x = i * (barW + 6);
        const y = height - barH;
        const color = d.color || '#005bd3';
        const fmt = formatValue ? formatValue(d.value) : String(d.value);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
            {d.value > 0 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="7"
                fill="#6d7175"
              >
                {fmt}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={height + 14}
              textAnchor="middle"
              fontSize="7"
              fill="#8c9196"
            >
              {d.label.length > 4 ? d.label.slice(0, 4) : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// ─── SVG Funnel ───────────────────────────────────────────────────────────────

interface FunnelProps {
  stages: { label: string; count: number; color: string }[];
}

const Funnel: React.FC<FunnelProps> = ({ stages }) => {
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stages.map((s, i) => {
        const pct = Math.max((s.count / max) * 100, 4);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 80, fontSize: '0.72rem', color: '#6d7175', textAlign: 'right', flexShrink: 0 }}>
              {s.label}
            </div>
            <div style={{ flex: 1, background: '#f0f0f2', borderRadius: 4, height: 22, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, background: s.color, height: '100%', borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
                <span style={{ fontSize: '0.72rem', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {s.count}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  optin: '#005bd3',
  contattato: '#6e56cf',
  primo_appuntamento: '#e67e22',
  proposta: '#1a7f37',
  trattativa: '#f39c12',
  cliente: '#1a7f37',
  trattativa_persa: '#c0392b',
};

const PipelineAnalytics: React.FC<PipelineAnalyticsProps> = ({ leads, stages, monthlyData }) => {
  // By stage funnel
  const funnelData = useMemo(() =>
    stages
      .filter(s => !['trattativa_persa', 'scartato', 'archiviato'].includes(s.key))
      .map(s => ({
        label: s.label,
        count: leads.filter(l => l.stage === s.key).length,
        color: STAGE_COLORS[s.key] || '#8c9196',
      })),
    [leads, stages]
  );

  // By source channel
  const sourceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const ch = l.source_channel || 'Non specificato';
      map[ch] = (map[ch] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }, [leads]);

  // Monthly value chart
  const monthlyChartData = useMemo(() => {
    if (!monthlyData?.months) return [];
    return monthlyData.months.map(m => ({
      label: m.label,
      value: m.total_value,
      color: m.delta_pct != null && m.delta_pct < 0 ? '#c0392b' : '#005bd3',
    }));
  }, [monthlyData]);

  // Score distribution
  const scoreDist = useMemo(() => {
    const high   = leads.filter(l => (l.lead_score ?? 0) >= 70).length;
    const medium = leads.filter(l => (l.lead_score ?? 0) >= 40 && (l.lead_score ?? 0) < 70).length;
    const low    = leads.filter(l => (l.lead_score ?? 0) < 40).length;
    return [
      { label: 'Alto', value: high,   color: '#1a7f37' },
      { label: 'Medio', value: medium, color: '#a85f00' },
      { label: 'Basso', value: low,    color: '#c0392b' },
    ];
  }, [leads]);

  const totalValue = leads.reduce((sum, l) => {
    const v = l.deal_value ?? 0;
    return sum + (v > 10000 ? v / 100 : v);
  }, 0);

  const clienti = leads.filter(l => l.stage === 'cliente').length;
  const convRate = leads.length > 0 ? ((clienti / leads.length) * 100).toFixed(1) : '0';

  return (
    <div className={s.analyticsView}>
      {/* Top KPI summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Lead totali', value: leads.length, sub: 'in pipeline' },
          { label: 'Valore totale', value: `€${totalValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}`, sub: 'pipeline value' },
          { label: 'Clienti', value: clienti, sub: 'deal chiusi' },
          { label: 'Conversion Rate', value: `${convRate}%`, sub: 'optin → cliente' },
        ].map(k => (
          <div key={k.label} className={s.analyticsCard}>
            <div className={s.kpiCardLabel}>{k.label}</div>
            <div className={s.kpiCardValue}>{k.value}</div>
            <div className={s.kpiCardSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className={s.analyticsGrid}>
        {/* Monthly trend */}
        <div className={s.analyticsCard}>
          <div className={s.analyticsTitle}>Valore Pipeline — Mensile ({monthlyData?.year ?? new Date().getFullYear()})</div>
          {monthlyChartData.length > 0 ? (
            <BarChart
              data={monthlyChartData}
              height={150}
              formatValue={v => v > 0 ? `€${(v / 1000).toFixed(0)}k` : ''}
            />
          ) : (
            <div className={s.empty}>Nessun dato mensile disponibile</div>
          )}
        </div>

        {/* Source channel */}
        <div className={s.analyticsCard}>
          <div className={s.analyticsTitle}>Lead per Fonte</div>
          <BarChart data={sourceCounts} height={150} />
        </div>

        {/* Funnel */}
        <div className={s.analyticsCard} style={{ gridColumn: '1 / 2' }}>
          <div className={s.analyticsTitle}>Funnel di Conversione</div>
          <Funnel stages={funnelData} />
        </div>

        {/* Score distribution */}
        <div className={s.analyticsCard} style={{ gridColumn: '2 / 3' }}>
          <div className={s.analyticsTitle}>Distribuzione Score</div>
          <BarChart data={scoreDist} height={150} />
        </div>
      </div>
    </div>
  );
};

export default PipelineAnalytics;
