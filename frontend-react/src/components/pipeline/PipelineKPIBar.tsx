import React, { useState, useEffect } from 'react';
import type { Lead, MonthlyValueResponse } from '../../services/salesApi';
import { getServiceUrl } from '../../utils/apiConfig';
import s from './pipeline.module.css';

const SALES_URL = getServiceUrl('sales');

function authFetch(path: string) {
  const t = localStorage.getItem('auth_token');
  return fetch(`${SALES_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  }).then(r => r.json());
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PipelineKPIBarProps {
  leads: Lead[];
  monthlyData: MonthlyValueResponse | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PipelineKPIBar: React.FC<PipelineKPIBarProps> = ({ leads, monthlyData }) => {
  const [expanded, setExpanded] = useState(false);
  const [zombieCount, setZombieCount] = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);

  // Derived KPIs from local leads
  const totalLeads = leads.length;
  const totalValue = leads.reduce((sum, l) => {
    const v = l.deal_value ?? 0;
    return sum + (v > 10000 ? v / 100 : v);
  }, 0);
  const clienti = leads.filter(l => l.stage === 'cliente').length;
  const convRate = totalLeads > 0 ? Math.round(clienti / totalLeads * 100) : 0;

  // Oggi appointments
  const today = new Date().toDateString();
  const appToday = leads.filter(l => {
    if (!l.appointment_date) return false;
    return new Date(l.appointment_date).toDateString() === today;
  }).length;

  // Urgenti: optin > 24h non contattati
  const urgenti = leads.filter(l => {
    if (l.stage !== 'optin') return false;
    if (l.first_contact_at) return false;
    const hours = (Date.now() - new Date(l.created_at).getTime()) / 3600000;
    return hours > 24;
  }).length;

  // Monthly trend
  const monthlyTrend = (() => {
    if (!monthlyData?.months?.length) return null;
    const now = new Date();
    const curMonth = monthlyData.months[now.getMonth()];
    const prevMonth = monthlyData.months[now.getMonth() > 0 ? now.getMonth() - 1 : 0];
    if (!curMonth || !prevMonth || prevMonth.total_value === 0) return null;
    const delta = ((curMonth.total_value - prevMonth.total_value) / prevMonth.total_value) * 100;
    return { delta: Math.round(delta), current: curMonth.total_value };
  })();

  // Fetch extended metrics when expanded
  useEffect(() => {
    if (!expanded) return;
    authFetch('/api/leads/zombie').then((d: any) => setZombieCount(d.total ?? 0)).catch(() => {});
    authFetch('/api/leads/priority-queue').then((d: any) => setQueueTotal(d.total ?? 0)).catch(() => {});
  }, [expanded]);

  return (
    <div className={s.kpiBar}>
      {/* Collapsed row — always visible */}
      <div className={s.kpiCollapsed}>
        <div className={s.kpiItem}>
          <span className={s.kpiLabel}>Lead</span>
          <span className={s.kpiValue}>{totalLeads}</span>
        </div>
        <div className={s.kpiItem}>
          <span className={s.kpiLabel}>Pipeline</span>
          <span className={s.kpiValue}>
            €{totalValue.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className={s.kpiItem}>
          <span className={s.kpiLabel}>Urgenti</span>
          <span className={`${s.kpiValue}${urgenti > 0 ? ' ' + s.danger : ''}`}>{urgenti}</span>
        </div>
        <div className={s.kpiItem}>
          <span className={s.kpiLabel}>Oggi</span>
          <span className={`${s.kpiValue}${appToday > 0 ? ' ' + s.success : ''}`}>
            {appToday} appt.
          </span>
        </div>
        {monthlyTrend && (
          <div className={s.kpiItem}>
            <span className={s.kpiLabel}>Trend mese</span>
            <span className={`${s.kpiDelta} ${monthlyTrend.delta >= 0 ? s.up : s.down}`} style={{ fontSize: '0.82rem' }}>
              {monthlyTrend.delta >= 0 ? '+' : ''}{monthlyTrend.delta}%
            </span>
          </div>
        )}
        <button className={s.kpiExpand} onClick={() => setExpanded(p => !p)}>
          {expanded ? '▲ Chiudi' : '▾ Dettagli'}
        </button>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className={s.kpiExpanded}>
          <div className={s.kpiCard}>
            <div className={s.kpiCardLabel}>Conversion Rate</div>
            <div className={s.kpiCardValue}>{convRate}%</div>
            <div className={s.kpiCardSub}>{clienti} clienti su {totalLeads} lead totali</div>
          </div>

          <div className={s.kpiCard}>
            <div className={s.kpiCardLabel}>Lead Zombie</div>
            <div className={`${s.kpiCardValue}`} style={{ color: zombieCount > 0 ? '#a85f00' : '#1a7f37' }}>
              {zombieCount}
            </div>
            <div className={s.kpiCardSub}>Fermi da più di 7 giorni nello stesso stage</div>
          </div>

          <div className={s.kpiCard}>
            <div className={s.kpiCardLabel}>Coda Setter</div>
            <div className={`${s.kpiCardValue}`} style={{ color: queueTotal > 10 ? '#c0392b' : '#202223' }}>
              {queueTotal}
            </div>
            <div className={s.kpiCardSub}>Lead in optin/contattato da gestire</div>
          </div>

          <div className={s.kpiCard}>
            <div className={s.kpiCardLabel}>Valore Medio Deal</div>
            <div className={s.kpiCardValue}>
              {totalLeads > 0 && totalValue > 0
                ? `€${Math.round(totalValue / totalLeads).toLocaleString('it-IT')}`
                : '—'
              }
            </div>
            <div className={s.kpiCardSub}>Calcolato su lead con deal value</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineKPIBar;
