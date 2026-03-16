import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  salesApi,
  type Lead,
  type PipelineStage,
  type LeadNote,
  type LeadTag,
  type PipelineUser,
  type LeadUpdatePayload,
} from '../services/salesApi';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

// ─── Design tokens (inline — standalone page, no layout wrapper) ──────────────

const T = {
  bg:        '#f5f5f7',
  bgCard:    '#ffffff',
  accent:    '#005bd3',
  accentL:   '#e8f0fb',
  border:    '#e1e3e5',
  green:     '#1a7f37',
  greenL:    '#dff3e2',
  red:       '#c0392b',
  redL:      '#fde8e7',
  yellow:    '#a85f00',
  yellowL:   '#fff3cd',
  text:      '#202223',
  textS:     '#6d7175',
  textM:     '#8c9196',
  font:      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  shadow:    '0 1px 3px rgba(0,0,0,0.09)',
  shadowE:   '0 4px 16px rgba(0,0,0,0.11)',
  r:         '10px',
  rpill:     '20px',
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s >= 70 ? T.green : s >= 40 ? T.yellow : T.red;
}

function fmt(iso?: string | null, type: 'date' | 'datetime' = 'date') {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (type === 'datetime') return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function daysAgo(iso?: string | null) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'oggi';
  if (d === 1) return '1 giorno fa';
  return `${d} giorni fa`;
}

// ─── Inline components ────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: T.bgCard, borderRadius: T.r, boxShadow: T.shadow, padding: 16, ...style }}>
    {children}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: T.textM, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
      {label}
    </div>
    <div style={{ fontSize: '0.84rem', color: T.text }}>
      {value ?? '—'}
    </div>
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; color?: string; bg?: string }> = ({ children, color = T.textS, bg = T.bg }) => (
  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: T.rpill, fontSize: '0.72rem', fontWeight: 600, background: bg, color, border: `1px solid ${T.border}` }}>
    {children}
  </span>
);

// ─── Stage bar ────────────────────────────────────────────────────────────────

interface StageBarProps {
  stages: PipelineStage[];
  current: string;
  canEdit: boolean;
  onChange: (key: string) => void;
}

const StageBar: React.FC<StageBarProps> = ({ stages, current, canEdit, onChange }) => {
  const activeStages = stages.filter(s => !['trattativa_persa', 'scartato', 'archiviato'].includes(s.key));
  const curIdx = activeStages.findIndex(s => s.key === current);

  return (
    <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 2 }}>
      {activeStages.map((st, i) => {
        const isPast    = i < curIdx;
        const isCurrent = i === curIdx;
        return (
          <button
            key={st.key}
            onClick={() => canEdit && onChange(st.key)}
            style={{
              flex: 1, minWidth: 60, padding: '5px 6px',
              border: isCurrent ? `2px solid ${T.accent}` : `2px solid transparent`,
              borderRadius: 6,
              background: isCurrent ? T.accentL : isPast ? T.greenL : T.bg,
              cursor: canEdit ? 'pointer' : 'default',
              fontFamily: T.font, fontSize: '0.72rem', fontWeight: 600,
              color: isCurrent ? T.accent : isPast ? T.green : T.textS,
              transition: 'all 150ms',
              textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {isPast ? '✓ ' : ''}{st.label}
          </button>
        );
      })}
    </div>
  );
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Dettaglio', 'Note', 'Agent Sales'] as const;
type Tab = typeof TABS[number];

// ─── Chat types ──────────────────────────────────────────────────────────────

interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; loading?: boolean; }

// ─── Main ─────────────────────────────────────────────────────────────────────

const LeadDetailPage: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales:write');

  const [lead, setLead] = useState<Lead | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [users, setUsers] = useState<PipelineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('Dettaglio');

  // Editable fields
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName,  setEditLastName]  = useState('');
  const [editPhone,     setEditPhone]     = useState('');
  const [editAzienda,   setEditAzienda]   = useState('');
  const [editNotes,     setEditNotes]     = useState('');
  const [editDealValue, setEditDealValue] = useState('');
  const [editSource,    setEditSource]    = useState('');
  const [editAssigned,  setEditAssigned]  = useState('');
  const [editTag,       setEditTag]       = useState('');
  const [editConsap,    setEditConsap]    = useState('');
  const [editPacchetto, setEditPacchetto] = useState('');
  const [editBudget,    setEditBudget]    = useState('');
  const [editFollowUp,  setEditFollowUp]  = useState('');
  const [editAppDate,   setEditAppDate]   = useState('');

  // Notes
  const [structuredNotes, setStructuredNotes] = useState<LeadNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId]     = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');

  // Chat
  const [chatMsgs, setChatMsgs]     = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatConvId, setChatConvId]  = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const GATEWAY = (window as any).__GATEWAY_URL__ || import.meta.env.VITE_GATEWAY_URL || 'http://localhost:10000';

  function authHeaders(): Record<string, string> {
    const t = localStorage.getItem('auth_token');
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!leadId) return;
    Promise.all([
      salesApi.getLeads().then(all => all.find(l => l.id === leadId) || null),
      salesApi.getStages(),
      salesApi.getLeadTags(),
      salesApi.getPipelineUsers(),
    ]).then(([l, s, tg, u]) => {
      if (l) {
        setLead(l);
        setEditFirstName(l.first_name || '');
        setEditLastName(l.last_name  || '');
        setEditPhone(l.phone         || '');
        setEditAzienda(l.azienda     || '');
        setEditNotes(l.notes         || '');
        setEditDealValue(l.deal_value ? String(l.deal_value > 10000 ? l.deal_value / 100 : l.deal_value) : '');
        setEditSource(l.source_channel     || '');
        setEditAssigned(l.assigned_to_user_id || '');
        setEditTag(l.lead_tag_id ? String(l.lead_tag_id) : '');
        setEditConsap(l.consapevolezza     || '');
        setEditPacchetto(l.pacchetto_consigliato || '');
        setEditBudget(l.budget_indicativo  || '');
        setEditFollowUp(l.follow_up_date   ? l.follow_up_date.slice(0, 10) : '');
        setEditAppDate(l.appointment_date  ? l.appointment_date.slice(0, 10) : '');
        setStructuredNotes(l.structured_notes || []);
      }
      setStages(s);
      setTags(tg);
      setUsers(u);
    }).catch(() => toast.error('Errore caricamento lead'))
      .finally(() => setLoading(false));
  }, [leadId]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (patch: LeadUpdatePayload) => {
    if (!lead) return;
    setSaving(true);
    try {
      await salesApi.updateLead(lead.id, patch);
      setLead(p => p ? ({ ...p, ...patch, lead_tag_id: patch.lead_tag_id ?? p.lead_tag_id } as Lead) : p);
    } catch {
      toast.error('Errore salvataggio');
    } finally {
      setSaving(false);
    }
  }, [lead]);

  const handleSaveAll = async () => {
    await save({
      first_name: editFirstName,
      last_name:  editLastName,
      phone:      editPhone,
      azienda:    editAzienda,
      notes:      editNotes,
      deal_value: editDealValue ? parseFloat(editDealValue) : null,
      source_channel: editSource   || null,
      assigned_to_user_id: editAssigned || null,
      lead_tag_id: editTag ? parseInt(editTag) : null,
      consapevolezza:  editConsap   || null,
      pacchetto_consigliato: editPacchetto || null,
      budget_indicativo: editBudget  || null,
      follow_up_date: editFollowUp || null,
      appointment_date: editAppDate || null,
    });
    toast.success('Lead aggiornato');
  };

  const handleStageChange = (newStage: string) => {
    save({ stage: newStage });
    setLead(p => p ? { ...p, stage: newStage } : p);
  };

  const handleMarkVinto = () => handleStageChange('cliente');
  const handleMarkPerso = () => handleStageChange('trattativa_persa');

  // ── Notes ─────────────────────────────────────────────────────────────────

  const handleAddNote = async () => {
    if (!lead || !newNote.trim()) return;
    try {
      const r = await salesApi.addNote(lead.id, newNote.trim());
      setStructuredNotes(p => [...p, r.note]);
      setNewNote('');
    } catch { toast.error('Errore aggiunta nota'); }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!lead || !editingNoteContent.trim()) return;
    try {
      const r = await salesApi.updateNote(lead.id, noteId, editingNoteContent.trim());
      setStructuredNotes(r.notes);
      setEditingNoteId(null);
    } catch { toast.error('Errore aggiornamento nota'); }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!lead || !confirm('Eliminare questa nota?')) return;
    try {
      await salesApi.deleteNote(lead.id, noteId);
      setStructuredNotes(p => p.filter(n => n.id !== noteId));
    } catch { toast.error('Errore eliminazione nota'); }
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: 'user', content: text };
    const placeholder: ChatMsg = { id: 'loading', role: 'assistant', content: '...', loading: true };
    setChatMsgs(p => [...p, userMsg, placeholder]);
    setChatInput('');
    setChatLoading(true);

    const history = chatMsgs.filter(m => !m.loading).map(m => ({ role: m.role, content: m.content }));
    try {
      const res = await fetch(`${GATEWAY}/api/mcp/evo-agent/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: text,
          agent_id: 'sales',
          conversation_id: chatConvId,
          history,
        }),
      });
      const data = await res.json();
      if (data.conversation_id && !chatConvId) setChatConvId(data.conversation_id);
      const agentMsg: ChatMsg = { id: Date.now().toString() + 'a', role: 'assistant', content: data.response || '(nessuna risposta)' };
      setChatMsgs(p => p.filter(m => !m.loading).concat(agentMsg));
    } catch {
      setChatMsgs(p => p.filter(m => !m.loading).concat({ id: 'err', role: 'assistant', content: 'Errore comunicazione con l\'agent.' }));
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMsgs, chatConvId, GATEWAY]);

  // Trigger automatic brief on tab open
  const chatTriggered = useRef(false);
  useEffect(() => {
    if (tab === 'Agent Sales' && lead && !chatTriggered.current) {
      chatTriggered.current = true;
      const prompt = `Analizza questo lead e dammi un briefing operativo completo:\n- Azienda: ${lead.azienda || 'N/D'}\n- Nome: ${[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}\n- Stage: ${lead.stage}\n- Fonte: ${lead.source_channel || 'N/D'}\n- Score: ${lead.lead_score ?? 0}\n- Note: ${lead.notes || 'Nessuna nota'}`;
      sendChat(prompt);
    }
  }, [tab, lead, sendChat]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const score = lead?.lead_score ?? 0;
  const stageLabel = useMemo(() => stages.find(s => s.key === lead?.stage)?.label, [stages, lead]);
  const daysInStage = lead?.stage_entered_at ? daysAgo(lead.stage_entered_at) : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: T.font, color: T.textM }}>
        Caricamento...
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: T.font, color: T.textM, gap: 12 }}>
        <span>Lead non trovato.</span>
        <button onClick={() => navigate('/sales')} style={{ cursor: 'pointer', color: T.accent, background: 'none', border: 'none', fontSize: '0.9rem', fontFamily: T.font }}>← Torna alla pipeline</button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, fontFamily: T.font, color: T.text, overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '12px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button
            onClick={() => navigate('/sales')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textS, fontSize: '0.82rem', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Pipeline
          </button>
          <span style={{ color: T.border }}>|</span>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.2 }}>
              {lead.azienda || 'Azienda non specificata'}
            </div>
            <div style={{ fontSize: '0.8rem', color: T.textS }}>
              {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}
            </div>
          </div>
          <div style={{ marginLeft: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Pill bg={T.accentL} color={T.accent}>{stageLabel || lead.stage}</Pill>
            {daysInStage && <span style={{ fontSize: '0.72rem', color: T.textM }}>{daysInStage}</span>}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={handleMarkPerso}
              style={{ background: T.redL, border: `1px solid ${T.red}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: T.red, fontFamily: T.font }}
            >
              Perso
            </button>
            <button
              onClick={handleMarkVinto}
              style={{ background: T.greenL, border: `1px solid ${T.green}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: T.green, fontFamily: T.font }}
            >
              Vinto
            </button>
            {canEdit && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                style={{ background: T.accent, border: 'none', borderRadius: 6, padding: '5px 16px', cursor: saving ? 'wait' : 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#fff', fontFamily: T.font }}
              >
                {saving ? 'Salvo...' : 'Salva'}
              </button>
            )}
          </div>
        </div>

        {/* Stage bar */}
        <StageBar stages={stages} current={lead.stage} canEdit={canEdit} onChange={handleStageChange} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: '#fff', borderBottom: `1px solid ${T.border}`, paddingLeft: 20, flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 16px',
              fontSize: '0.82rem', fontWeight: tab === t ? 700 : 500,
              color: tab === t ? T.accent : T.textS,
              borderBottom: tab === t ? `2px solid ${T.accent}` : '2px solid transparent',
              fontFamily: T.font,
              transition: 'all 120ms',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

        {/* ── TAB: Dettaglio ── */}
        {tab === 'Dettaglio' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 920, margin: '0 auto' }}>

            {/* Anagrafica */}
            <Card>
              <SectionTitle>Anagrafica</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Nome</label>
                  <input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cognome</label>
                  <input value={editLastName} onChange={e => setEditLastName(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Azienda</label>
                  <input value={editAzienda} onChange={e => setEditAzienda(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email</label>
                  <input value={lead.email} disabled
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.textS, background: T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Telefono</label>
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
              </div>
            </Card>

            {/* Qualificazione commerciale */}
            <Card>
              <SectionTitle>Qualificazione</SectionTitle>

              {/* Score bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lead Score</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: scoreColor(score) }}>{score}</span>
                </div>
                <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${score}%`, height: '100%', background: scoreColor(score), borderRadius: 3, transition: 'width 400ms ease' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fonte</label>
                  <input value={editSource} onChange={e => setEditSource(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Budget indicativo</label>
                  <input value={editBudget} onChange={e => setEditBudget(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Consapevolezza</label>
                  <select value={editConsap} onChange={e => setEditConsap(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }}>
                    <option value="">—</option>
                    <option value="inconsapevole">Inconsapevole</option>
                    <option value="negativa">Negativa</option>
                    <option value="stallo">Stallo</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pacchetto consigliato</label>
                  <select value={editPacchetto} onChange={e => setEditPacchetto(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }}>
                    <option value="">—</option>
                    <option value="base">Base</option>
                    <option value="startup">Startup</option>
                    <option value="performance">Performance</option>
                    <option value="all_inc">All Inclusive</option>
                    <option value="analisi">Analisi</option>
                    <option value="lancio_brand">Lancio Brand</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valore deal (€)</label>
                  <input value={editDealValue} onChange={e => setEditDealValue(e.target.value)} type="number" disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
              </div>
            </Card>

            {/* Scheduling */}
            <Card>
              <SectionTitle>Scheduling</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Data appuntamento</label>
                  <input type="date" value={editAppDate} onChange={e => setEditAppDate(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Follow-up previsto</label>
                  <input type="date" value={editFollowUp} onChange={e => setEditFollowUp(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }} />
                </div>
                <Field label="No-show" value={lead.no_show_count ?? 0} />
                <Field label="Follow-up count" value={lead.follow_up_count ?? 0} />
                <Field label="Primo contatto" value={fmt(lead.first_contact_at)} />
                <Field label="Primo appuntamento" value={fmt(lead.first_appointment_at)} />
              </div>
            </Card>

            {/* Team */}
            <Card>
              <SectionTitle>Team & Tag</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assegnato a</label>
                  <select value={editAssigned} onChange={e => setEditAssigned(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }}>
                    <option value="">Nessuno</option>
                    {users.map(u => <option key={u.id} value={u.id}>{[u.nome, u.cognome].filter(Boolean).join(' ') || u.username}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.68rem', color: T.textM, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Etichetta</label>
                  <select value={editTag} onChange={e => setEditTag(e.target.value)} disabled={!canEdit}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, color: T.text, background: canEdit ? '#fff' : T.bg, marginTop: 2, boxSizing: 'border-box' }}>
                    <option value="">Nessuna</option>
                    {tags.map(t => <option key={t.id} value={String(t.id)}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <SectionTitle>Timestamp</SectionTitle>
                <Field label="Creato il"       value={fmt(lead.created_at, 'datetime')} />
                <Field label="Ultima modifica" value={fmt(lead.updated_at, 'datetime')} />
                <Field label="Stage da"        value={fmt(lead.stage_entered_at, 'datetime')} />
              </div>
            </Card>
          </div>
        )}

        {/* ── TAB: Note ── */}
        {tab === 'Note' && (
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <Card style={{ marginBottom: 14 }}>
              <SectionTitle>Note strutturate</SectionTitle>
              {structuredNotes.length === 0 ? (
                <div style={{ color: T.textM, fontSize: '0.82rem', padding: '12px 0' }}>Nessuna nota</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {structuredNotes.map(note => (
                    <div key={note.id} style={{ background: T.bg, borderRadius: 8, padding: 12, position: 'relative' }}>
                      {editingNoteId === note.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea
                            value={editingNoteContent}
                            onChange={e => setEditingNoteContent(e.target.value)}
                            rows={3}
                            style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 8px', fontSize: '0.84rem', fontFamily: T.font, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleUpdateNote(note.id)} style={{ background: T.accent, border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.font }}>Salva</button>
                            <button onClick={() => setEditingNoteId(null)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', cursor: 'pointer', fontFamily: T.font }}>Annulla</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap', marginBottom: 4 }}>{note.content}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', color: T.textM }}>{fmt(note.created_at, 'datetime')}</span>
                            {canEdit && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => { setEditingNoteId(note.id); setEditingNoteContent(note.content); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: T.textS, fontFamily: T.font }}>Modifica</button>
                                <button onClick={() => handleDeleteNote(note.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: T.red, fontFamily: T.font }}>Elimina</button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Aggiungi una nota..."
                    rows={3}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px', fontSize: '0.84rem', fontFamily: T.font, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    style={{ alignSelf: 'flex-end', background: T.accent, border: 'none', borderRadius: 6, padding: '5px 14px', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: newNote.trim() ? 'pointer' : 'not-allowed', fontFamily: T.font, opacity: newNote.trim() ? 1 : 0.5 }}
                  >
                    Aggiungi nota
                  </button>
                </div>
              )}
            </Card>

            {/* Notes legacy */}
            {lead.notes && (
              <Card>
                <SectionTitle>Note libere</SectionTitle>
                {canEdit ? (
                  <textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    rows={6}
                    style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px', fontSize: '0.84rem', fontFamily: T.font, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                  />
                ) : (
                  <div style={{ fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}>{lead.notes}</div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ── TAB: Agent Sales ── */}
        {tab === 'Agent Sales' && (
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 210px)' }}>
            <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <SectionTitle>Sales Agent — {lead.azienda || lead.email}</SectionTitle>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 12px', scrollbarWidth: 'thin' }}>
                {chatMsgs.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '78%',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? T.accent : T.bg,
                      color: msg.role === 'user' ? '#fff' : T.text,
                      fontSize: '0.83rem',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.loading ? <span style={{ opacity: 0.6 }}>Analisi in corso...</span> : msg.content}
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>

              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
                {[
                  'Suggerisci next action',
                  'Analizza no-show',
                  'Crea follow-up task',
                  'Valuta pacchetto giusto',
                ].map(p => (
                  <button
                    key={p}
                    onClick={() => sendChat(p)}
                    style={{ background: T.accentL, border: `1px solid ${T.accent}`, borderRadius: 16, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, color: T.accent, cursor: 'pointer', fontFamily: T.font }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)}
                  placeholder="Chiedi all'agente sales..."
                  style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.84rem', fontFamily: T.font, outline: 'none' }}
                />
                <button
                  onClick={() => sendChat(chatInput)}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{ background: T.accent, border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.font, opacity: chatInput.trim() ? 1 : 0.5 }}
                >
                  Invia
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadDetailPage;
