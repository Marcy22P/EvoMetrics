import React, { useMemo } from 'react';
import type { Lead, PipelineStage, MonthlyValueResponse } from '../../services/salesApi';
import s from './pipeline.module.css';

// ─── Stage colors (sync with PipelineTimeline) ────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  optin:                 '#6366f1',
  contattato:            '#f59e0b',
  prima_chiamata:        '#3b82f6',
  appuntamento_vivo_1:   '#8b5cf6',
  seconda_chiamata:      '#06b6d4',
  appuntamento_vivo_2:   '#10b981',
  preventivo_consegnato: '#f97316',
  cliente:               '#16a34a',
  trattativa_persa:      '#ef4444',
  scartato:              '#9ca3af',
  archiviato:            '#d1d5db',
};

const LOST_STAGES = new Set(['trattativa_persa', 'scartato', 'archiviato']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** deal_value è stored in centesimi nel DB */
const centsToEuro = (v: number | undefined | null): number => {
  if (!v) return 0;
  return Math.round(v) / 100;
};

const fmtEuro = (v: number) =>
  v >= 1000
    ? `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`
    : `€${Math.round(v)}`;

// ─── Mini bar chart (CSS-based, no SVG) ──────────────────────────────────────

interface HBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}

const HBar: React.FC<HBarProps> = ({ label, value, max, color, suffix }) => {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 3 : 0) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 100, fontSize: '0.75rem', color: 'var(--text-2)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 400ms ease', minWidth: value > 0 ? 4 : 0 }} />
      </div>
      <div style={{ width: 50, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
        {suffix ?? value}
      </div>
    </div>
  );
};

// ─── Monthly bar chart ────────────────────────────────────────────────────────

interface MonthBarProps {
  month: string;
  value: number;
  max: number;
  delta?: number | null;
  isCurrentMonth?: boolean;
}

const MonthBar: React.FC<MonthBarProps> = ({ month, value, max, delta, isCurrentMonth }) => {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  const color = value === 0 ? '#e5e7eb' : isCurrentMonth ? 'var(--accent)' : '#93c5fd';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: value > 0 ? 'var(--text)' : 'transparent', height: 14 }}>
        {value > 0 ? fmtEuro(value) : ''}
      </div>
      <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ width: '100%', background: color, borderRadius: '4px 4px 0 0', height: `${pct}%`, minHeight: value > 0 ? 3 : 0, transition: 'height 400ms ease', position: 'relative' }} />
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-2)', fontWeight: 500 }}>{month}</div>
      {delta != null && (
        <div style={{ fontSize: '0.62rem', color: delta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
          {delta >= 0 ? '+' : ''}{delta}%
        </div>
      )}
    </div>
  );
};

// ─── KPI Mini Card ─────────────────────────────────────────────────────────────

interface KpiProps { label: string; value: string | number; sub?: string; accent?: boolean }

const KpiCard: React.FC<KpiProps> = ({ label, value, sub, accent }) => (
  <div className={s.analyticsKpi}>
    <div className={s.analyticsKpiLabel}>{label}</div>
    <div className={s.analyticsKpiValue} style={accent ? { color: 'var(--accent)' } : undefined}>{value}</div>
    {sub && <div className={s.analyticsKpiSub}>{sub}</div>}
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineAnalyticsProps {
  leads: Lead[];
  stages: PipelineStage[];
  monthlyData: MonthlyValueResponse | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

const PipelineAnalytics: React.FC<PipelineAnalyticsProps> = ({ leads, stages, monthlyData }) => {
  const currentMonth = new Date().getMonth() + 1;

  // ── KPI di base ──────────────────────────────────────────────────────────────
  const activeLeads   = useMemo(() => leads.filter(l => !LOST_STAGES.has(l.stage)), [leads]);
  const clienti       = useMemo(() => leads.filter(l => l.stage === 'cliente'), [leads]);
  const persi         = useMemo(() => leads.filter(l => l.stage === 'trattativa_persa'), [leads]);

  const totalValue = useMemo(() =>
    activeLeads.reduce((s, l) => s + centsToEuro(l.deal_value), 0),
    [activeLeads]
  );

  const wonValue = useMemo(() =>
    clienti.reduce((s, l) => s + centsToEuro(l.deal_value), 0),
    [clienti]
  );

  const convRate = leads.length > 0
    ? ((clienti.length / leads.length) * 100).toFixed(1)
    : '0';

  const avgDealValue = clienti.length > 0
    ? Math.round(wonValue / clienti.length)
    : 0;

  // ── Funnel di conversione ────────────────────────────────────────────────────
  const funnelData = useMemo(() => {
    const activeSortedStages = stages
      .filter(st => !LOST_STAGES.has(st.key))
      .sort((a, b) => a.index - b.index);
    const maxCount = Math.max(...activeSortedStages.map(st =>
      leads.filter(l => l.stage === st.key).length
    ), 1);
    return activeSortedStages.map(st => {
      const count = leads.filter(l => l.stage === st.key).length;
      const prevStage = activeSortedStages[activeSortedStages.indexOf(st) - 1];
      const prevCount = prevStage ? leads.filter(l => l.stage === prevStage.key).length : null;
      const convPct = prevCount != null && prevCount > 0
        ? Math.round((count / prevCount) * 100)
        : null;
      return { label: st.label, key: st.key, count, max: maxCount, convPct };
    });
  }, [leads, stages]);

  // ── Sorgenti (source_channel) ────────────────────────────────────────────────
  const sourceData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      const ch = l.source_channel?.trim() || 'Non specificato';
      map[ch] = (map[ch] || 0) + 1;
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const max = sorted[0]?.[1] ?? 1;
    return sorted.map(([label, value]) => ({ label, value, max }));
  }, [leads]);

  // ── Score distribution ────────────────────────────────────────────────────────
  const scoreData = useMemo(() => {
    const withScore = leads.filter(l => (l.lead_score ?? 0) > 0);
    if (withScore.length === 0) return null; // Non mostrare se tutti a 0
    const high   = withScore.filter(l => (l.lead_score ?? 0) >= 70).length;
    const medium = withScore.filter(l => (l.lead_score ?? 0) >= 40 && (l.lead_score ?? 0) < 70).length;
    const low    = withScore.filter(l => (l.lead_score ?? 0) < 40).length;
    const max    = Math.max(high, medium, low, 1);
    return [
      { label: 'Alto  (≥70)', value: high,   max, color: '#16a34a' },
      { label: 'Medio (40–69)', value: medium, max, color: '#d97706' },
      { label: 'Basso (<40)',  value: low,    max, color: '#dc2626' },
    ];
  }, [leads]);

  // ── Dati mensili ──────────────────────────────────────────────────────────────
  const monthlyChartData = useMemo(() => {
    if (!monthlyData?.months?.length) return [];
    return monthlyData.months;
  }, [monthlyData]);

  const monthlyMax = useMemo(() =>
    Math.max(...(monthlyChartData.map(m => m.total_value)), 1),
    [monthlyChartData]
  );

  // ── Lead per pacchetto consigliato ───────────────────────────────────────────
  const pacchettoData = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => {
      if (l.pacchetto_consigliato) {
        map[l.pacchetto_consigliato] = (map[l.pacchetto_consigliato] || 0) + 1;
      }
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = sorted[0]?.[1] ?? 1;
    return sorted.map(([label, value]) => ({ label, value, max }));
  }, [leads]);

  // ── Stage velocity (giorni medi in stage per i clienti) ──────────────────────
  const stageVelocity = useMemo(() => {
    return clienti
      .filter(l => l.stage_entered_at && l.created_at)
      .map(l => {
        const days = Math.round(
          (new Date(l.stage_entered_at!).getTime() - new Date(l.created_at).getTime())
          / (1000 * 60 * 60 * 24)
        );
        return days;
      })
      .filter(d => d >= 0);
  }, [clienti]);

  const avgClosingDays = stageVelocity.length > 0
    ? Math.round(stageVelocity.reduce((a, b) => a + b, 0) / stageVelocity.length)
    : null;

  return (
    <div className={s.analyticsView}>

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div className={s.analyticsKpiRow}>
        <KpiCard label="Lead Totali"     value={leads.length}          sub={`${activeLeads.length} attivi`} />
        <KpiCard label="Valore Pipeline" value={`€${Math.round(totalValue).toLocaleString('it-IT')}`} sub="solo lead attivi" accent />
        <KpiCard label="Clienti Chiusi"  value={clienti.length}         sub={wonValue > 0 ? `€${Math.round(wonValue).toLocaleString('it-IT')} incassati` : 'deal won'} />
        <KpiCard label="Conversion Rate" value={`${convRate}%`}          sub={`${persi.length} persi`} />
        <KpiCard label="Valore Medio Deal" value={avgDealValue > 0 ? `€${avgDealValue.toLocaleString('it-IT')}` : 'N/D'} sub="clienti chiusi" />
        {avgClosingDays != null && (
          <KpiCard label="Tempo Medio Chiusura" value={`${avgClosingDays}gg`} sub="optin → cliente" />
        )}
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────────── */}
      <div className={s.analyticsGrid2}>

        {/* Monthly trend */}
        <div className={s.analyticsCard}>
          <div className={s.analyticsTitle}>
            Andamento Mensile — {monthlyData?.year ?? new Date().getFullYear()}
            {monthlyData?.year_total != null && monthlyData.year_total > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--text)', textTransform: 'none', fontSize: '0.82rem' }}>
                Totale anno: €{Math.round(monthlyData.year_total).toLocaleString('it-IT')}
              </span>
            )}
          </div>
          {monthlyChartData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, paddingBottom: 4 }}>
              {monthlyChartData.map(m => (
                <MonthBar
                  key={m.month}
                  month={m.label}
                  value={m.total_value}
                  max={monthlyMax}
                  delta={m.delta_pct}
                  isCurrentMonth={m.month === currentMonth}
                />
              ))}
            </div>
          ) : (
            <div className={s.analyticsEmpty}>
              Nessun dato mensile — i valori verranno mostrati quando i lead avranno un deal_value assegnato.
            </div>
          )}
        </div>

        {/* Funnel di conversione */}
        <div className={s.analyticsCard}>
          <div className={s.analyticsTitle}>Funnel di Conversione</div>
          {funnelData.length > 0 ? (
            <div>
              {funnelData.map(st => (
                <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STAGE_COLORS[st.key] || '#9ca3af', flexShrink: 0 }} />
                  <div style={{ width: 110, fontSize: '0.73rem', color: 'var(--text-2)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {st.label}
                  </div>
                  <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                    <div style={{
                      width: `${st.max > 0 ? Math.max((st.count / st.max) * 100, st.count > 0 ? 3 : 0) : 0}%`,
                      background: STAGE_COLORS[st.key] || '#9ca3af',
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 400ms ease',
                    }} />
                  </div>
                  <div style={{ width: 28, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
                    {st.count}
                  </div>
                  {st.convPct != null && (
                    <div style={{ width: 36, fontSize: '0.68rem', color: 'var(--text-3)', textAlign: 'right', flexShrink: 0 }}>
                      {st.convPct}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className={s.analyticsEmpty}>Nessuno stage configurato.</div>
          )}
        </div>

        {/* Sorgenti */}
        <div className={s.analyticsCard}>
          <div className={s.analyticsTitle}>Lead per Fonte</div>
          {sourceData.length > 0 ? (
            sourceData.map((d, i) => (
              <HBar
                key={d.label}
                label={d.label}
                value={d.value}
                max={d.max}
                color={['#2563eb','#8b5cf6','#06b6d4','#f59e0b','#10b981','#f97316','#ec4899'][i % 7]}
                suffix={`${d.value} lead`}
              />
            ))
          ) : (
            <div className={s.analyticsEmpty}>Nessuna fonte registrata nei lead.</div>
          )}
        </div>

        {/* Score distribution — solo se c'è almeno 1 lead con score > 0 */}
        {scoreData ? (
          <div className={s.analyticsCard}>
            <div className={s.analyticsTitle}>Distribuzione Score Lead</div>
            {scoreData.map(d => (
              <HBar
                key={d.label}
                label={d.label}
                value={d.value}
                max={d.max}
                color={d.color}
                suffix={`${d.value} lead`}
              />
            ))}
            <div style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--text-3)' }}>
              {leads.filter(l => (l.lead_score ?? 0) === 0).length} lead senza score assegnato
            </div>
          </div>
        ) : (
          <div className={s.analyticsCard}>
            <div className={s.analyticsTitle}>Distribuzione Score Lead</div>
            <div className={s.analyticsEmpty}>
              Nessun lead ha ancora uno score assegnato.
              Lo score viene calcolato dal Sales Agent durante l'analisi.
            </div>
          </div>
        )}

        {/* Pacchetto consigliato */}
        {pacchettoData.length > 0 && (
          <div className={s.analyticsCard}>
            <div className={s.analyticsTitle}>Pacchetti Consigliati</div>
            {pacchettoData.map((d, i) => (
              <HBar
                key={d.label}
                label={d.label}
                value={d.value}
                max={d.max}
                color={['#8b5cf6','#3b82f6','#10b981','#f59e0b','#f97316','#ec4899'][i % 6]}
                suffix={`${d.value}`}
              />
            ))}
          </div>
        )}

        {/* Riepilogo stato pipeline */}
        <div className={s.analyticsCard}>
          <div className={s.analyticsTitle}>Stato Pipeline</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Lead attivi',    value: activeLeads.length,              color: 'var(--accent)',  bg: '#eff6ff' },
              { label: 'Clienti vinti',  value: clienti.length,                  color: 'var(--green)',   bg: 'var(--green-bg)' },
              { label: 'Trattative perse', value: persi.length,                  color: 'var(--red)',     bg: 'var(--red-bg)' },
              { label: 'Senza deal value', value: leads.filter(l => !l.deal_value || l.deal_value === 0).length, color: 'var(--text-3)', bg: 'var(--bg)' },
              { label: 'Con appuntamento', value: leads.filter(l => l.appointment_date).length, color: '#8b5cf6', bg: '#f5f3ff' },
              { label: 'Con follow-up',  value: leads.filter(l => l.follow_up_date).length,     color: '#06b6d4', bg: '#ecfeff' },
            ].map(item => (
              <div key={item.label} style={{ background: item.bg, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.7rem', color: item.color === 'var(--text-3)' ? 'var(--text-2)' : item.color, fontWeight: 500, marginBottom: 2 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default PipelineAnalytics;
