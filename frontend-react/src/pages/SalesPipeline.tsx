import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  TextField,
  Select,
  BlockStack,
  InlineStack,
  Spinner,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import {
  salesApi,
  type Lead,
  type LeadCreate,
  type PipelineStage,
  type LeadTag,
  type PipelineUser,
  type MonthlyValueResponse,
} from '../services/salesApi';
import { PipelineSettingsModal } from '../components/sales/PipelineSettingsModal';
import PipelineTimeline from '../components/pipeline/PipelineTimeline';
import PipelineKPIBar from '../components/pipeline/PipelineKPIBar';
import PipelineSearch, { type SearchState } from '../components/pipeline/PipelineSearch';
import PipelineAnalytics from '../components/pipeline/PipelineAnalytics';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import s from '../components/pipeline/pipeline.module.css';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconBoard = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
    <rect x="2" y="3" width="4" height="14" rx="1"/>
    <rect x="8" y="3" width="4" height="10" rx="1"/>
    <rect x="14" y="3" width="4" height="12" rx="1"/>
  </svg>
);

const IconList = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="4" y1="6"  x2="16" y2="6"/>
    <line x1="4" y1="10" x2="16" y2="10"/>
    <line x1="4" y1="14" x2="16" y2="14"/>
  </svg>
);

const IconChart = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,15 7,9 11,12 17,5"/>
  </svg>
);

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="10" cy="10" r="3"/>
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"/>
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
  </svg>
);

const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 2v8M5 7l3 3 3-3"/><line x1="2" y1="13" x2="14" y2="13"/>
  </svg>
);

type ViewMode = 'timeline' | 'list' | 'analytics';

// ─── List view component ──────────────────────────────────────────────────────

interface ListViewProps {
  leads: Lead[];
  stages: PipelineStage[];
}

const ListView: React.FC<ListViewProps> = ({ leads, stages }) => {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const stageMap = useMemo(() => new Map(stages.map(s => [s.key, s])), [stages]);

  const sorted = useMemo(() => {
    return [...leads].sort((a, b) => {
      let va: any = (a as any)[sortKey] ?? '';
      let vb: any = (b as any)[sortKey] ?? '';
      if (sortKey === 'deal_value') { va = va || 0; vb = vb || 0; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [leads, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(p => p === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const th = (key: string, label: string) => (
    <th className={s.listTh} onClick={() => handleSort(key)}>
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div className={s.listView}>
      <table className={s.listTable}>
        <thead>
          <tr>
            {th('azienda', 'Azienda')}
            {th('first_name', 'Nome')}
            {th('email', 'Email')}
            {th('stage', 'Stage')}
            {th('source_channel', 'Fonte')}
            {th('lead_score', 'Score')}
            {th('deal_value', 'Valore')}
            {th('created_at', 'Data')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(lead => {
            const stage = stageMap.get(lead.stage);
            const score = lead.lead_score ?? 0;
            const scoreColor = score >= 70 ? '#1a7f37' : score >= 40 ? '#a85f00' : '#c0392b';
            return (
              <tr
                key={lead.id}
                className={s.listTr}
                onClick={() => navigate(`/pipeline/lead/${lead.id}`)}
              >
                <td className={s.listTd}>
                  <strong style={{ fontSize: '0.83rem' }}>
                    {lead.azienda || 'N/D'}
                  </strong>
                </td>
                <td className={s.listTd} style={{ color: '#6d7175', fontSize: '0.8rem' }}>
                  {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}
                </td>
                <td className={s.listTd} style={{ fontSize: '0.78rem', color: '#6d7175' }}>
                  {lead.email}
                </td>
                <td className={s.listTd}>
                  <span className={s.stagePillSmall}>{stage?.label || lead.stage}</span>
                </td>
                <td className={s.listTd} style={{ fontSize: '0.78rem', color: '#6d7175' }}>
                  {lead.source_channel || '—'}
                </td>
                <td className={s.listTd}>
                  <span style={{ fontWeight: 700, color: scoreColor, fontSize: '0.82rem' }}>{score}</span>
                </td>
                <td className={s.listTd} style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                  {lead.deal_value
                    ? `€${Math.round(lead.deal_value > 10000 ? lead.deal_value / 100 : lead.deal_value).toLocaleString('it-IT')}`
                    : '—'}
                </td>
                <td className={s.listTd} style={{ fontSize: '0.78rem', color: '#8c9196' }}>
                  {new Date(lead.created_at).toLocaleDateString('it-IT')}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#8c9196', fontSize: '0.85rem' }}>
                Nessun lead trovato
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const SalesPipeline: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales:write');

  // Data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [leadTags, setLeadTags] = useState<LeadTag[]>([]);
  const [pipelineUsers, setPipelineUsers] = useState<PipelineUser[]>([]);
  const [sourceChannels, setSourceChannels] = useState<string[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyValueResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // UI
  const [view, setView] = useState<ViewMode>('timeline');
  const [search, setSearch] = useState<SearchState>({ query: '', filters: [] });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Drag & Drop
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStageKey, setDragOverStageKey] = useState<string | null>(null);

  // Create form
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadFirstName, setNewLeadFirstName] = useState('');
  const [newLeadLastName, setNewLeadLastName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadAzienda, setNewLeadAzienda] = useState('');
  const [newLeadStage, setNewLeadStage] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');
  const [newDealValue, setNewDealValue] = useState('');
  const [newSourceChannel, setNewSourceChannel] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const data = await salesApi.getLeads();
      setLeads(data);
    } catch {
      toast.error('Errore caricamento pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    salesApi.getStages().then(setStages).catch(() => {});
    salesApi.getLeadTags().then(setLeadTags).catch(() => {});
    salesApi.getPipelineUsers().then(setPipelineUsers).catch(() => {});
    salesApi.getSourceChannels().then(d => setSourceChannels(d.channels)).catch(() => {});
    salesApi.getMonthlyValue().then(setMonthlyData).catch(() => {});
    fetchLeads();
  }, [fetchLeads]);

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const q = search.query.toLowerCase();
      if (q) {
        const match =
          lead.email.toLowerCase().includes(q) ||
          (lead.azienda?.toLowerCase().includes(q)) ||
          (lead.first_name?.toLowerCase().includes(q)) ||
          (lead.last_name?.toLowerCase().includes(q)) ||
          (lead.phone?.includes(q));
        if (!match) return false;
      }
      for (const f of search.filters) {
        if (f.key === 'stage'    && lead.stage !== f.value) return false;
        if (f.key === 'source'   && lead.source_channel !== f.value) return false;
        if (f.key === 'assignee' && lead.assigned_to_user_id !== f.value) return false;
        if (f.key === 'score') {
          const sc = lead.lead_score ?? 0;
          if (f.value === 'high'   && sc < 70)  return false;
          if (f.value === 'medium' && (sc < 40 || sc >= 70)) return false;
          if (f.value === 'low'    && sc >= 40)  return false;
        }
      }
      return true;
    });
  }, [leads, search]);

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggingLeadId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageKey(key);
  };

  const handleDragLeave = () => setDragOverStageKey(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetKey: string) => {
    e.preventDefault();
    setDragOverStageKey(null);
    const leadId = e.dataTransfer.getData('text/plain');
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.stage !== targetKey) handleMoveStage(lead, targetKey);
    setDraggingLeadId(null);
  };

  const handleDragEnd = () => { setDraggingLeadId(null); setDragOverStageKey(null); };

  // ── Move stage ──────────────────────────────────────────────────────────────

  const handleMoveStage = useCallback(async (lead: Lead, newStage: string) => {
    const prev = lead.stage;
    setLeads(p => p.map(l => l.id === lead.id ? { ...l, stage: newStage } : l));
    try {
      await salesApi.updateLead(lead.id, { stage: newStage });
    } catch {
      toast.error('Errore spostamento lead');
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, stage: prev } : l));
    }
  }, []);

  const handleLeadsUpdated = useCallback((updated: Lead[]) => {
    setLeads(updated);
  }, []);

  // ── Create lead ─────────────────────────────────────────────────────────────

  const resetCreateForm = () => {
    setNewLeadEmail(''); setNewLeadFirstName(''); setNewLeadLastName('');
    setNewLeadPhone(''); setNewLeadAzienda(''); setNewLeadStage('');
    setNewLeadNotes(''); setNewDealValue(''); setNewSourceChannel(''); setNewAssignedTo('');
  };

  const handleCreateLead = async () => {
    if (!newLeadEmail) { toast.error('Email obbligatoria'); return; }
    try {
      const data: LeadCreate = {
        email: newLeadEmail,
        first_name: newLeadFirstName || undefined,
        last_name: newLeadLastName || undefined,
        phone: newLeadPhone || undefined,
        azienda: newLeadAzienda || undefined,
        stage: newLeadStage || undefined,
        notes: newLeadNotes || undefined,
        source_channel: newSourceChannel || undefined,
        deal_value: newDealValue ? parseFloat(newDealValue) : undefined,
        assigned_to_user_id: newAssignedTo || undefined,
      };
      await salesApi.createLead(data);
      toast.success('Lead creato');
      setShowCreateModal(false);
      resetCreateForm();
      fetchLeads();
    } catch (e: any) {
      toast.error(e.message || 'Errore creazione lead');
    }
  };

  // ── Sidebar tooltip ─────────────────────────────────────────────────────────

  const SidebarButton: React.FC<{
    viewMode: ViewMode;
    icon: React.ReactNode;
    label: string;
  }> = ({ viewMode, icon, label }) => (
    <button
      className={`${s.sidebarBtn}${view === viewMode ? ' ' + s.active : ''}`}
      onClick={() => setView(viewMode)}
      title={label}
    >
      {icon}
    </button>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`${s.root} ${s.shell}`}>

      {/* Mini Sidebar */}
      <nav className={s.miniSidebar}>
        <SidebarButton viewMode="timeline" icon={<IconBoard />} label="Timeline (kanban)" />
        <SidebarButton viewMode="list"     icon={<IconList />}  label="Lista lead" />
        <SidebarButton viewMode="analytics" icon={<IconChart />} label="Analytics" />
        <div className={s.sidebarSep} />
        <button
          className={s.sidebarBtn}
          onClick={() => setShowSettings(true)}
          title="Impostazioni pipeline"
        >
          <IconSettings />
        </button>
      </nav>

      {/* Content */}
      <div className={s.content}>

        {/* Top bar */}
        <div className={s.topBar}>
          <span className={s.topBarTitle}>Pipeline Sales</span>
          <span className={s.topBarCount}>{filteredLeads.length}</span>
          <div className={s.topBarSpacer} />
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #e1e3e5', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem', color: '#6d7175', fontFamily: 'inherit' }}
            onClick={() => salesApi.downloadLeadsCsv()}
            title="Esporta CSV"
          >
            <IconDownload /> CSV
          </button>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#005bd3', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: '0.82rem', color: '#fff', fontWeight: 600, fontFamily: 'inherit' }}
            onClick={() => setShowCreateModal(true)}
          >
            <IconPlus /> Nuovo lead
          </button>
        </div>

        {/* KPI Bar */}
        <PipelineKPIBar leads={leads} monthlyData={monthlyData} />

        {/* Search */}
        <PipelineSearch
          stages={stages}
          leadTags={leadTags}
          users={pipelineUsers}
          sourceChannels={sourceChannels}
          value={search}
          onChange={setSearch}
          totalShown={filteredLeads.length}
          totalAll={leads.length}
        />

        {/* Views */}
        {loading ? (
          <div className={s.empty} style={{ flex: 1 }}>
            <Spinner size="large" />
            <span>Caricamento pipeline...</span>
          </div>
        ) : view === 'timeline' ? (
          <PipelineTimeline
            leads={filteredLeads}
            stages={stages}
            draggingId={draggingLeadId}
            canEdit={canEdit}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onMoveStage={handleMoveStage}
            onLeadsUpdated={handleLeadsUpdated}
            dragOverStage={dragOverStageKey}
          />
        ) : view === 'list' ? (
          <ListView leads={filteredLeads} stages={stages} />
        ) : (
          <PipelineAnalytics leads={leads} stages={stages} monthlyData={monthlyData} />
        )}
      </div>

      {/* Create Lead Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetCreateForm(); }}
        title="Nuovo Lead"
        primaryAction={{ content: 'Crea lead', onAction: handleCreateLead }}
        secondaryActions={[{ content: 'Annulla', onAction: () => { setShowCreateModal(false); resetCreateForm(); } }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="200">
              <div style={{ flex: 1 }}>
                <TextField label="Nome" value={newLeadFirstName} onChange={setNewLeadFirstName} autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Cognome" value={newLeadLastName} onChange={setNewLeadLastName} autoComplete="off" />
              </div>
            </InlineStack>
            <TextField label="Email *" value={newLeadEmail} onChange={setNewLeadEmail} autoComplete="email" type="email" />
            <InlineStack gap="200">
              <div style={{ flex: 1 }}>
                <TextField label="Telefono" value={newLeadPhone} onChange={setNewLeadPhone} autoComplete="tel" type="tel" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Azienda" value={newLeadAzienda} onChange={setNewLeadAzienda} autoComplete="organization" />
              </div>
            </InlineStack>
            <InlineStack gap="200">
              <div style={{ flex: 1 }}>
                <Select
                  label="Fonte"
                  options={[{ label: 'Seleziona...', value: '' }, ...sourceChannels.map(c => ({ label: c, value: c }))]}
                  value={newSourceChannel}
                  onChange={setNewSourceChannel}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Valore deal (€)" value={newDealValue} onChange={setNewDealValue} autoComplete="off" type="number" />
              </div>
            </InlineStack>
            <Select
              label="Assegna a"
              options={[{ label: 'Nessuno', value: '' }, ...pipelineUsers.map(u => ({ label: [u.nome, u.cognome].filter(Boolean).join(' ') || u.username, value: u.id }))]}
              value={newAssignedTo}
              onChange={setNewAssignedTo}
            />
            <Select
              label="Stage iniziale"
              options={[{ label: 'Primo stage (default)', value: '' }, ...stages.map(s => ({ label: s.label, value: s.key }))]}
              value={newLeadStage}
              onChange={setNewLeadStage}
            />
            <TextField label="Note" value={newLeadNotes} onChange={setNewLeadNotes} multiline={3} autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Settings */}
      <PipelineSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onUpdate={() => { salesApi.getStages().then(setStages).catch(() => {}); fetchLeads(); salesApi.getLeadTags().then(setLeadTags).catch(() => {}); }}
      />
    </div>
  );
};

export default SalesPipeline;
