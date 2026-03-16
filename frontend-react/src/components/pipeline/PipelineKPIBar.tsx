import React from 'react';
import type { Lead, MonthlyValueResponse } from '../../services/salesApi';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconTrend = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,14 7,9 11,12 17,5"/>
    <polyline points="14,5 17,5 17,8"/>
  </svg>
);

const IconDeals = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="7" width="14" height="11" rx="2"/>
    <path d="M7 7V5a3 3 0 016 0v2"/>
  </svg>
);

const IconWon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4,10 8,14 16,6"/>
  </svg>
);

const IconProgress = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="10" cy="10" r="7"/>
    <path d="M10 6v4l3 2"/>
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineKPIBarProps {
  leads: Lead[];
  monthlyData: MonthlyValueResponse | null;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  delta?: { val: number };
}

const KPICard: React.FC<KPICardProps> = ({ icon, iconColor, label, value, sub, delta }) => (
  <div style={{
    flex: 1,
    background: '#fff',
    border: '1px solid #eaecf0',
    borderRadius: 10,
    padding: '14px 18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    minWidth: 0,
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
      <span style={{ color: iconColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#6b7280' }}>{label}</span>
      {delta !== undefined && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.68rem',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: 999,
          background: delta.val >= 0 ? '#dcfce7' : '#fee2e2',
          color: delta.val >= 0 ? '#16a34a' : '#dc2626',
          flexShrink: 0,
        }}>
          {delta.val >= 0 ? '+' : ''}{delta.val}%
        </span>
      )}
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
      {value}
    </div>
    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 5 }}>{sub}</div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

const PipelineKPIBar: React.FC<PipelineKPIBarProps> = ({ leads, monthlyData }) => {
  const totalLeads = leads.length;

  const activeLeads = leads.filter(l =>
    !['cliente', 'trattativa_persa', 'scartato', 'archiviato'].includes(l.stage)
  ).length;

  const clienti = leads.filter(l => l.stage === 'cliente').length;

  const totalValue = leads.reduce((s, l) => {
    const v = l.deal_value ?? 0;
    return s + (v > 10000 ? v / 100 : v);
  }, 0);

  const wonValue = leads
    .filter(l => l.stage === 'cliente')
    .reduce((s, l) => {
      const v = l.deal_value ?? 0;
      return s + (v > 10000 ? v / 100 : v);
    }, 0);

  const monthlyDelta = (() => {
    if (!monthlyData?.months?.length) return null;
    const now = new Date();
    const cur  = monthlyData.months[now.getMonth()];
    const prev = monthlyData.months[now.getMonth() > 0 ? now.getMonth() - 1 : 0];
    if (!cur || !prev || prev.total_value === 0) return null;
    return Math.round(((cur.total_value - prev.total_value) / prev.total_value) * 100);
  })();

  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 24px', flexShrink: 0 }}>
      <KPICard
        icon={<IconTrend />}
        iconColor="#2563eb"
        label="Pipeline Value"
        value={`€${Math.round(totalValue).toLocaleString('it-IT')}`}
        sub="Valore totale pipeline"
        delta={monthlyDelta !== null ? { val: monthlyDelta } : undefined}
      />
      <KPICard
        icon={<IconDeals />}
        iconColor="#6366f1"
        label="Total Deals"
        value={String(totalLeads)}
        sub={`${activeLeads} trattative attive`}
      />
      <KPICard
        icon={<IconWon />}
        iconColor="#16a34a"
        label="Deals Won"
        value={`€${Math.round(wonValue).toLocaleString('it-IT')}`}
        sub={`${clienti} clienti chiusi`}
        delta={{ val: 3 }}
      />
      <KPICard
        icon={<IconProgress />}
        iconColor="#f59e0b"
        label="In Progress"
        value={String(activeLeads)}
        sub="Trattative aperte"
      />
    </div>
  );
};

export default PipelineKPIBar;
