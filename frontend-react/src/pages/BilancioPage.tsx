import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfToday } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar, TrendingUp, TrendingDown, DollarSign, FileText } from 'lucide-react';
import { SpotlightCard } from '../components/UI/SpotlightCard';
import './BilancioPage.css';

const API_GATEWAY_URL = window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin;

type DateRange = 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'year';

const BilancioPage: React.FC = () => {
  const [range, setRange] = useState<DateRange>('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Calcolo date in base al range
  const getDates = (r: DateRange) => {
    const today = startOfToday();
    switch (r) {
      case 'today': return { start: today, end: today };
      case 'yesterday': {
        const y = subDays(today, 1);
        return { start: y, end: y };
      }
      case 'last7': return { start: subDays(today, 6), end: today };
      case 'last30': return { start: subDays(today, 29), end: today };
      case 'month': return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'year': return { start: startOfYear(today), end: endOfYear(today) };
      default: return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDates(range);
      const token = localStorage.getItem('auth_token');
      
      // Format dates as ISO string but simple YYYY-MM-DD for API simplicity if supported, 
      // otherwise full ISO. Backend expects ISO.
      const startIso = format(start, "yyyy-MM-dd'T'00:00:00");
      const endIso = format(end, "yyyy-MM-dd'T'23:59:59");

      const res = await fetch(
        `${API_GATEWAY_URL}/api/bilancio/analytics?start_date=${startIso}&end_date=${endIso}`, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching bilancio data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [range]);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'd MMM', { locale: it });
  };

  return (
    <div className="bilancio-container">
      {/* Header & Filtri */}
      <div className="bilancio-header">
        <div>
          <h1 className="page-title">Bilancio</h1>
          <p className="page-subtitle">Analisi flussi finanziari</p>
        </div>
        
        <div className="range-selector glass-panel">
          <button 
            className={`range-btn ${range === 'today' ? 'active' : ''}`} 
            onClick={() => setRange('today')}
          >Oggi</button>
          <button 
            className={`range-btn ${range === 'last7' ? 'active' : ''}`} 
            onClick={() => setRange('last7')}
          >7gg</button>
          <button 
            className={`range-btn ${range === 'month' ? 'active' : ''}`} 
            onClick={() => setRange('month')}
          >Mese</button>
          <button 
            className={`range-btn ${range === 'year' ? 'active' : ''}`} 
            onClick={() => setRange('year')}
          >Anno</button>
          <div className="calendar-icon"><Calendar size={18} /></div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <SpotlightCard className="kpi-card" spotlightColor="rgba(16, 185, 129, 0.2)">
          <div className="kpi-icon success"><TrendingUp size={24} /></div>
          <div className="kpi-content">
            <div className="kpi-label">Entrate</div>
            <div className="kpi-value success">
              {loading ? '...' : formatCurrency(data?.entrate_totali || 0)}
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="kpi-card" spotlightColor="rgba(239, 68, 68, 0.2)">
          <div className="kpi-icon danger"><TrendingDown size={24} /></div>
          <div className="kpi-content">
            <div className="kpi-label">Uscite</div>
            <div className="kpi-value danger">
              {loading ? '...' : formatCurrency(data?.uscite_totali || 0)}
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="kpi-card" spotlightColor="rgba(59, 130, 246, 0.2)">
          <div className="kpi-icon primary"><DollarSign size={24} /></div>
          <div className="kpi-content">
            <div className="kpi-label">Utile Netto</div>
            <div className={`kpi-value ${(data?.utile_netto || 0) >= 0 ? 'primary' : 'danger'}`}>
              {loading ? '...' : formatCurrency(data?.utile_netto || 0)}
            </div>
          </div>
        </SpotlightCard>

        <SpotlightCard className="kpi-card" spotlightColor="rgba(245, 158, 11, 0.2)">
          <div className="kpi-icon warning"><FileText size={24} /></div>
          <div className="kpi-content">
            <div className="kpi-label">Tasse Stimate (22%)</div>
            <div className="kpi-value warning">
              {loading ? '...' : formatCurrency(data?.tasse_stimate || 0)}
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* Main Chart */}
      <SpotlightCard className="chart-section" spotlightColor="rgba(255, 255, 255, 0.05)">
        <div className="chart-header">
          <h3>Andamento Flusso di Cassa</h3>
          <div className="chart-legend">
            <span className="legend-item entrate">Entrate</span>
            <span className="legend-item uscite">Uscite</span>
          </div>
        </div>
        <div className="chart-container">
          {loading ? (
            <div className="loading-chart">Caricamento dati...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trend_daily || []}>
                <defs>
                  <linearGradient id="colorEntrate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUscite" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate} 
                  stroke="rgba(255,255,255,0.3)" 
                  tick={{fontSize: 12}}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.3)" 
                  tickFormatter={(val) => `€${val}`}
                  tick={{fontSize: 12}}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Area 
                  type="monotone" 
                  dataKey="entrate" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorEntrate)" 
                />
                <Area 
                  type="monotone" 
                  dataKey="uscite" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorUscite)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </SpotlightCard>
    </div>
  );
};

export default BilancioPage;

