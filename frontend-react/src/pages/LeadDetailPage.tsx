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
import { getApiGatewayUrl } from '../utils/apiConfig';

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:        '#f5f6fa',
  bgCard:    '#ffffff',
  border:    '#e8eaed',
  borderCard:'#eaecf0',
  accent:    '#2563eb',
  accentH:   '#1d4ed8',
  accentL:   '#eff4ff',
  green:     '#16a34a',
  greenL:    '#dcfce7',
  red:       '#dc2626',
  redL:      '#fee2e2',
  yellow:    '#d97706',
  yellowL:   '#fef3c7',
  text:      '#111827',
  text2:     '#6b7280',
  text3:     '#9ca3af',
  font:      "'Plus Jakarta Sans', -apple-system, sans-serif",
  shadow:    '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  r:         '10px',
  rpill:     '999px',
};

// ─── Stage dot colors ─────────────────────────────────────────────────────────

const STAGE_DOTS: Record<string, string> = {
  optin:                  '#6366f1',
  contattato:             '#f59e0b',
  prima_chiamata:         '#3b82f6',
  appuntamento_vivo_1:    '#8b5cf6',
  seconda_chiamata:       '#06b6d4',
  appuntamento_vivo_2:    '#10b981',
  preventivo_consegnato:  '#f97316',
  cliente:                '#16a34a',
  trattativa_persa:       '#ef4444',
  scartato:               '#9ca3af',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 70) return T.green;
  if (s >= 40) return T.yellow;
  return T.red;
}

function fmt(iso?: string | null, type: 'date' | 'datetime' = 'date'): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (type === 'datetime')
      return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function daysAgo(iso?: string | null): string | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'oggi';
  if (d === 1) return '1 giorno fa';
  return `${d} giorni fa`;
}

// ─── Small reusable pieces ────────────────────────────────────────────────────

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
    {children}
  </div>
);

const FieldInput: React.FC<{
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  type?: string;
  isSelect?: boolean;
  children?: React.ReactNode;
}> = ({ label, value, onChange, disabled, type = 'text', isSelect, children }) => {
  const base: React.CSSProperties = {
    width: '100%', border: `1px solid ${T.border}`, borderRadius: 6,
    padding: '5px 8px', fontSize: '0.8rem', fontFamily: T.font,
    color: T.text, background: disabled ? T.bg : '#fff',
    marginTop: 2, boxSizing: 'border-box', outline: 'none',
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <Label>{label}</Label>
      {isSelect
        ? <select value={value} onChange={e => onChange?.(e.target.value)} disabled={disabled} style={base}>{children}</select>
        : <input value={value} onChange={e => onChange?.(e.target.value)} disabled={disabled} type={type} style={base} />}
    </div>
  );
};

// ─── Chat types ───────────────────────────────────────────────────────────────

interface ChatMsg { id: string; role: 'user' | 'assistant'; content: string; loading?: boolean; }

// ─── Stage bar ────────────────────────────────────────────────────────────────

const StageBar: React.FC<{
  stages: PipelineStage[];
  current: string;
  canEdit: boolean;
  onChange: (key: string) => void;
}> = ({ stages, current, canEdit, onChange }) => {
  const active = stages.filter(s => !['trattativa_persa', 'scartato', 'archiviato'].includes(s.key));
  const curIdx = active.findIndex(s => s.key === current);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '0 24px 12px', scrollbarWidth: 'none' }}>
      {active.map((st, i) => {
        const isPast = i < curIdx;
        const isCur  = i === curIdx;
        const dot    = STAGE_DOTS[st.key] ?? '#9ca3af';
        return (
          <React.Fragment key={st.key}>
            <button
              onClick={() => canEdit && onChange(st.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: T.rpill,
                border: isCur ? `1.5px solid ${dot}` : '1.5px solid transparent',
                background: isCur ? `${dot}14` : 'none',
                cursor: canEdit ? 'pointer' : 'default',
                fontSize: '0.72rem', fontWeight: 600,
                color: isCur ? dot : isPast ? T.green : T.text3,
                whiteSpace: 'nowrap',
                fontFamily: T.font,
                transition: 'all 120ms',
                flexShrink: 0,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isCur ? dot : isPast ? T.green : T.text3, flexShrink: 0 }} />
              {isPast ? '✓ ' : ''}{st.label}
            </button>
            {i < active.length - 1 && (
              <span style={{ color: T.border, fontSize: '0.7rem', flexShrink: 0 }}>›</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const LeadDetailPage: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate   = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales:write');

  const [lead, setLead]     = useState<Lead | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tags, setTags]     = useState<LeadTag[]>([]);
  const [users, setUsers]   = useState<PipelineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Editable fields
  const [editFirstName,  setEditFirstName]  = useState('');
  const [editLastName,   setEditLastName]   = useState('');
  const [editPhone,      setEditPhone]      = useState('');
  const [editAzienda,    setEditAzienda]    = useState('');
  const [editNotes,      setEditNotes]      = useState('');
  const [editDealValue,  setEditDealValue]  = useState('');
  const [editSource,     setEditSource]     = useState('');
  const [editAssigned,   setEditAssigned]   = useState('');
  const [editTag,        setEditTag]        = useState('');
  const [editConsap,     setEditConsap]     = useState('');
  const [editPacchetto,  setEditPacchetto]  = useState('');
  const [editBudget,     setEditBudget]     = useState('');
  const [editFollowUp,     setEditFollowUp]     = useState('');
  const [editAppDate,      setEditAppDate]      = useState('');
  const [editSecondAppt,   setEditSecondAppt]   = useState('');
  const [editContractDate, setEditContractDate] = useState('');

  // AirCall sync + dial state
  const [aircallSyncing, setAircallSyncing] = useState(false);
  const [aircallDialing,  setAircallDialing]  = useState(false);

  // Blocca blur-save quando l'utente sta cliccando VINTO/PERSO
  const pendingActionRef = useRef(false);

  // Notes
  const [structuredNotes, setStructuredNotes] = useState<LeadNote[]>([]);
  const [newNote,           setNewNote]        = useState('');
  const [editingNoteId,     setEditingNoteId]  = useState<string | null>(null);
  const [editingNoteText,   setEditingNoteText]= useState('');

  // Chat
  const [chatMsgs,    setChatMsgs]    = useState<ChatMsg[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatConvId,  setChatConvId]  = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatTriggered = useRef(false);

  const GATEWAY = getApiGatewayUrl();

  function authHeaders(): Record<string, string> {
    const t = localStorage.getItem('auth_token');
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  }

  // Scroll to top quando si apre un lead
  // Disabilita scroll restoration del browser e forza top con setTimeout per
  // garantire l'esecuzione dopo tutti i cicli di render e la navigazione
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    const id = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }, 0);
    return () => clearTimeout(id);
  }, [leadId]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!leadId) return;
    Promise.all([
      salesApi.getLead(leadId),
      salesApi.getStages(),
      salesApi.getLeadTags(),
      salesApi.getPipelineUsers(),
    ]).then(([l, s, tg, u]) => {
      setLead(l);
      setEditFirstName(l.first_name || '');
      setEditLastName(l.last_name   || '');
      setEditPhone(l.phone          || '');
      setEditAzienda(l.azienda      || '');
      setEditNotes(l.notes          || '');
      setEditDealValue(l.deal_value ? String(Math.round(l.deal_value / 100)) : '');
      setEditSource(l.source_channel        || '');
      setEditAssigned(l.assigned_to_user_id || '');
      setEditTag(l.lead_tag_id ? String(l.lead_tag_id) : '');
      setEditConsap(l.consapevolezza          || '');
      setEditPacchetto(l.pacchetto_consigliato|| '');
      setEditBudget(l.budget_indicativo       || '');
      setEditFollowUp(l.follow_up_date         ? l.follow_up_date.slice(0, 10)         : '');
      setEditAppDate(l.appointment_date        ? l.appointment_date.slice(0, 10)       : '');
      setEditSecondAppt((l as any).second_appointment_date ? (l as any).second_appointment_date.slice(0, 10) : '');
      setEditContractDate(l.contract_date ? l.contract_date.slice(0, 10) : '');
      setStructuredNotes(l.structured_notes || []);
      setStages(s);
      setTags(tg);
      setUsers(u);
    })
    .catch(() => toast.error('Errore caricamento lead'))
    .finally(() => setLoading(false));
  }, [leadId]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (patch: LeadUpdatePayload): Promise<boolean> => {
    if (!lead) return false;
    setSaving(true);
    try {
      const updated = await salesApi.updateLead(lead.id, patch);
      // Aggiorna solo il lead state (per header, stage, score) senza toccare i campi del form
      setLead(updated);
      return true;
    } catch {
      toast.error('Errore salvataggio');
      return false;
    } finally {
      setSaving(false);
    }
  }, [lead]);

  const handleSaveAll = async () => {
    const ok = await save({
      first_name:  editFirstName,
      last_name:   editLastName,
      phone:       editPhone,
      azienda:     editAzienda,
      notes:       editNotes,
      deal_value:  editDealValue ? Math.round(parseFloat(editDealValue) * 100) : null,
      source_channel:        editSource    || null,
      assigned_to_user_id:   editAssigned  || null,
      lead_tag_id:           editTag ? parseInt(editTag) : null,
      consapevolezza:        editConsap    || null,
      pacchetto_consigliato: editPacchetto || null,
      budget_indicativo:     editBudget    || null,
      follow_up_date:             editFollowUp   || null,
      appointment_date:           editAppDate    || null,
      second_appointment_date:    editSecondAppt || null,
      contract_date:              editContractDate || null,
    });
    if (ok) toast.success('Lead aggiornato');
  };

  const handleStageChange = (newStage: string) => {
    pendingActionRef.current = false;
    save({ stage: newStage });
    setLead(p => p ? { ...p, stage: newStage } : p);
  };

  const handleAircallSync = async () => {
    if (!lead || aircallSyncing) return;
    setAircallSyncing(true);
    try {
      const res = await salesApi.pushLeadToAircall(lead.id);
      setLead(prev => prev ? { ...prev, aircall_contact_id: res.aircall_contact_id } : prev);
      const actionLabel = res.action === 'created' ? 'creato' : res.action === 'linked' ? 'collegato' : 'aggiornato';
      toast.success(`Contatto AirCall ${actionLabel}: ${res.name}`);
    } catch {
      toast.error('Errore sincronizzazione AirCall');
    } finally {
      setAircallSyncing(false);
    }
  };

  const handleAircallDial = async () => {
    if (!lead || aircallDialing) return;
    if (!lead.phone) {
      toast.error('Nessun numero di telefono sul lead');
      return;
    }
    setAircallDialing(true);
    try {
      const res = await salesApi.dialLead(lead.id);
      toast.success(`Chiamata avviata su AirCall → ${res.phone}`);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Errore avvio chiamata';
      toast.error(msg);
    } finally {
      setAircallDialing(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!lead) return;
    const nome = lead.azienda || lead.email;
    if (!window.confirm(`Eliminare definitivamente il lead "${nome}"?\n\nQuesta operazione non può essere annullata.`)) return;
    try {
      await salesApi.deleteLead(lead.id);
      toast.success(`Lead "${nome}" eliminato`);
      navigate('/sales');
    } catch {
      toast.error('Errore eliminazione lead');
    }
  };

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
    if (!lead || !editingNoteText.trim()) return;
    try {
      const r = await salesApi.updateNote(lead.id, noteId, editingNoteText.trim());
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
    const userMsg: ChatMsg     = { id: Date.now().toString(), role: 'user', content: text };
    const placeholder: ChatMsg = { id: 'loading', role: 'assistant', content: '...', loading: true };
    setChatMsgs(p => [...p, userMsg, placeholder]);
    setChatInput('');
    setChatLoading(true);

    const history = chatMsgs.filter(m => !m.loading).map(m => ({ role: m.role, content: m.content }));
    try {
      const res  = await fetch(`${GATEWAY}/api/mcp/evo-agent/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ message: text, agent_id: 'sales', conversation_id: chatConvId, history }),
      });
      const data = await res.json() as { conversation_id?: string; response?: string };
      if (data.conversation_id && !chatConvId) setChatConvId(data.conversation_id);
      const agentMsg: ChatMsg = { id: Date.now().toString() + 'a', role: 'assistant', content: data.response || '(nessuna risposta)' };
      setChatMsgs(p => p.filter(m => !m.loading).concat(agentMsg));
    } catch {
      setChatMsgs(p => p.filter(m => !m.loading).concat({ id: 'err', role: 'assistant', content: "Errore comunicazione con l'agent." }));
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMsgs, chatConvId, GATEWAY]);

  // Auto brief on mount
  useEffect(() => {
    if (!lead || chatTriggered.current) return;
    chatTriggered.current = true;
    const prompt = `Brief sales per: ${lead.azienda || lead.email} | Stage: ${lead.stage} | Score: ${lead.lead_score ?? 0} | Fonte: ${lead.source_channel || 'N/D'}${lead.notes ? ` | Note: ${lead.notes.slice(0, 120)}` : ''}. Dammi 3 punti operativi chiave.`;
    sendChat(prompt);
  }, [lead, sendChat]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const score      = lead?.lead_score ?? 0;
  const stageLabel = useMemo(() => stages.find(s => s.key === lead?.stage)?.label, [stages, lead]);
  const dotColor   = lead ? (STAGE_DOTS[lead.stage] ?? '#9ca3af') : '#9ca3af';
  const daysInStage = lead?.stage_entered_at ? daysAgo(lead.stage_entered_at) : null;
  const nome = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email : '';
  const dealVal = lead?.deal_value
    ? `€${Math.round(lead.deal_value / 100).toLocaleString('it-IT')}`
    : null;

  // ── Loading/error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: T.font, color: T.text3 }}>
        Caricamento...
      </div>
    );
  }

  if (!lead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: T.font, color: T.text2, gap: 12 }}>
        <span>Lead non trovato.</span>
        <button onClick={() => navigate('/sales')} style={{ cursor: 'pointer', color: T.accent, background: 'none', border: 'none', fontSize: '0.9rem', fontFamily: T.font }}>
          Torna alla pipeline
        </button>
      </div>
    );
  }

  // ─── Page layout styles ───────────────────────────────────────────────────

  const PAGE:   React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, fontFamily: T.font, color: T.text };
  const HEADER: React.CSSProperties = { background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '12px 24px 0', flexShrink: 0 };
  const COLS:   React.CSSProperties = { flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 320px', overflow: 'hidden' };
  const COL:    React.CSSProperties = { overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 };

  const inputStyle: React.CSSProperties = {
    width: '100%', border: `1px solid ${T.border}`, borderRadius: 6,
    padding: '5px 8px', fontSize: '0.8rem', fontFamily: T.font,
    color: T.text, background: '#fff', boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={PAGE}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10 }}>

          {/* Breadcrumb */}
          <button
            onClick={() => navigate('/sales')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, fontSize: '0.8rem', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            ← Sales Pipeline
          </button>
          <span style={{ color: T.border }}>|</span>

          {/* Name + stage */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.azienda || nome}
              </span>
              {dealVal && (
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: T.accent, flexShrink: 0 }}>{dealVal}</span>
              )}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: T.rpill,
                background: `${dotColor}16`, color: dotColor,
                fontSize: '0.72rem', fontWeight: 600, flexShrink: 0,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor }} />
                {stageLabel || lead.stage}
              </span>
              {daysInStage && <span style={{ fontSize: '0.7rem', color: T.text3, flexShrink: 0 }}>{daysInStage}</span>}
            </div>
            <div style={{ fontSize: '0.78rem', color: T.text2, marginTop: 2 }}>{nome}</div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {/* Chiama via AirCall — visibile solo se il lead ha un telefono */}
            {lead.phone && (
              <button
                onClick={handleAircallDial}
                disabled={aircallDialing}
                title={`Chiama ${lead.phone} via AirCall`}
                style={{
                  background: aircallDialing ? '#f0f9ff' : '#eff6ff',
                  border: `1px solid ${T.accent}`,
                  borderRadius: 6, padding: '5px 10px',
                  cursor: aircallDialing ? 'wait' : 'pointer',
                  fontSize: '0.78rem', fontWeight: 600,
                  color: T.accent,
                  fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {aircallDialing ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M2.7 1h4.2l1.3 4-2.1 1.2a11.5 11.5 0 005.7 5.7L13 9.8l4 1.3v4.2c0 1-1 1.7-2 1.5C5.4 15.5.5 10.6.2 3 0 2 .7 1 1.7 1z"/>
                    </svg>
                    Chiamata…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.7 1h4.2l1.3 4-2.1 1.2a11.5 11.5 0 005.7 5.7L13 9.8l4 1.3v4.2c0 1-1 1.7-2 1.5C5.4 15.5.5 10.6.2 3 0 2 .7 1 1.7 1z"/>
                    </svg>
                    Chiama
                  </>
                )}
              </button>
            )}

            {/* AirCall sync */}
            <button
              onClick={handleAircallSync}
              disabled={aircallSyncing}
              title={lead.aircall_contact_id ? `Collegato a AirCall (ID: ${lead.aircall_contact_id})` : 'Sincronizza su AirCall'}
              style={{
                background: lead.aircall_contact_id ? '#f0fdf4' : '#fff',
                border: `1px solid ${lead.aircall_contact_id ? T.green : T.border}`,
                borderRadius: 6, padding: '5px 10px',
                cursor: aircallSyncing ? 'wait' : 'pointer',
                fontSize: '0.78rem', fontWeight: 600,
                color: lead.aircall_contact_id ? T.green : T.text2,
                fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.7 1h4.2l1.3 4-2.1 1.2a11.5 11.5 0 005.7 5.7L13 9.8l4 1.3v4.2c0 1-1 1.7-2 1.5C5.4 15.5.5 10.6.2 3 0 2 .7 1 1.7 1z"/>
              </svg>
              {aircallSyncing ? '...' : lead.aircall_contact_id ? 'AirCall ✓' : 'AirCall'}
            </button>
            {/* Analizza con EvoAgent — passa il lead come contesto */}
            <button
              onClick={() => {
                if (!lead) return;
                const ctx = [
                  `Lead: ${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
                  lead.azienda ? `Azienda: ${lead.azienda}` : '',
                  `ID: ${lead.id}`,
                  `Stage: ${lead.stage}`,
                  lead.phone ? `Tel: ${lead.phone}` : '',
                  lead.email ? `Email: ${lead.email}` : '',
                  lead.deal_value ? `Valore deal: €${(lead.deal_value / 100).toLocaleString('it-IT')}` : '',
                  lead.source_channel ? `Fonte: ${lead.source_channel}` : '',
                  lead.notes ? `Note: ${lead.notes}` : '',
                  lead.aircall_contact_id ? `AirCall ID: ${lead.aircall_contact_id}` : 'Non ancora su AirCall',
                ].filter(Boolean).join('\n');
                navigate('/evo-agent', { state: { context: ctx, agentId: 'sales' } });
              }}
              title="Apri in EvoAgent con i dati di questo lead pre-caricati"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none', borderRadius: 6, padding: '5px 10px',
                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                color: '#fff', fontFamily: T.font,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2a10 10 0 1 0 10 10"/>
                <path d="M22 2 12 12"/>
                <path d="m16 2 6 6V2z"/>
              </svg>
              AI
            </button>
            <button
              onMouseDown={() => { pendingActionRef.current = true; }}
              onClick={() => handleStageChange('trattativa_persa')}
              style={{ background: T.redL, border: `1px solid ${T.red}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: T.red, fontFamily: T.font }}
            >
              Perso
            </button>
            <button
              onMouseDown={() => { pendingActionRef.current = true; }}
              onClick={() => handleStageChange('cliente')}
              style={{ background: T.greenL, border: `1px solid ${T.green}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: T.green, fontFamily: T.font }}
            >
              Vinto
            </button>
            {canEdit && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                style={{ background: T.accent, border: 'none', borderRadius: 6, padding: '5px 14px', cursor: saving ? 'wait' : 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#fff', fontFamily: T.font }}
              >
                {saving ? 'Salvo...' : 'Salva'}
              </button>
            )}
            {canEdit && (
              <button
                onClick={handleDeleteLead}
                style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, color: T.red, fontFamily: T.font }}
              >
                Elimina
              </button>
            )}
          </div>
        </div>

        {/* Stage bar */}
        <StageBar stages={stages} current={lead.stage} canEdit={canEdit} onChange={handleStageChange} />
      </div>

      {/* ── Three columns ──────────────────────────────────────────────────── */}
      <div style={COLS}>

        {/* ── LEFT: Info lead (200px) ─────────────────────────────────────── */}
        <div style={{ ...COL, borderRight: `1px solid ${T.border}`, background: '#fff' }}>

          {/* Score */}
          <div>
            <Label>Lead Score</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${score}%`, height: '100%', background: scoreColor(score), borderRadius: 3, transition: 'width 400ms' }} />
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: scoreColor(score), flexShrink: 0 }}>{score}</span>
            </div>
          </div>

          {/* Contact links */}
          <div>
            <Label>Email</Label>
            <a href={`mailto:${lead.email}`} style={{ fontSize: '0.78rem', color: T.accent, textDecoration: 'none', wordBreak: 'break-all' }}>{lead.email}</a>
          </div>
          {lead.phone && (
            <div>
              <Label>Telefono</Label>
              <a href={`tel:${lead.phone}`} style={{ fontSize: '0.78rem', color: T.accent, textDecoration: 'none' }}>{lead.phone}</a>
            </div>
          )}

          {/* Quick editable fields */}
          <FieldInput label="Azienda" value={editAzienda} onChange={setEditAzienda} disabled={!canEdit} />
          <FieldInput label="Nome" value={editFirstName} onChange={setEditFirstName} disabled={!canEdit} />
          <FieldInput label="Cognome" value={editLastName} onChange={setEditLastName} disabled={!canEdit} />
          <FieldInput label="Telefono" value={editPhone} onChange={setEditPhone} disabled={!canEdit} />
          <FieldInput label="Valore deal (€)" value={editDealValue} onChange={setEditDealValue} disabled={!canEdit} type="number" />
          <FieldInput label="Fonte" value={editSource} onChange={setEditSource} disabled={!canEdit} />
          <FieldInput label="Budget indicativo" value={editBudget} onChange={setEditBudget} disabled={!canEdit} />
          <FieldInput label="Consapevolezza" value={editConsap} onChange={setEditConsap} disabled={!canEdit} isSelect>
            <option value="">—</option>
            <option value="inconsapevole">Inconsapevole</option>
            <option value="negativa">Negativa</option>
            <option value="stallo">Stallo</option>
          </FieldInput>
          <FieldInput label="Pacchetto consigliato" value={editPacchetto} onChange={setEditPacchetto} disabled={!canEdit} isSelect>
            <option value="">—</option>
            <option value="base">Base</option>
            <option value="startup">Startup</option>
            <option value="performance">Performance</option>
            <option value="all_inc">All Inclusive</option>
            <option value="analisi">Analisi</option>
            <option value="lancio_brand">Lancio Brand</option>
          </FieldInput>
          <FieldInput label="Assegnato a" value={editAssigned} onChange={setEditAssigned} disabled={!canEdit} isSelect>
            <option value="">Nessuno</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{[u.nome, u.cognome].filter(Boolean).join(' ') || u.username}</option>
            ))}
          </FieldInput>
          <FieldInput label="Etichetta" value={editTag} onChange={setEditTag} disabled={!canEdit} isSelect>
            <option value="">Nessuna</option>
            {tags.map(t => <option key={t.id} value={String(t.id)}>{t.label}</option>)}
          </FieldInput>
          <FieldInput label="Follow-up" value={editFollowUp} onChange={setEditFollowUp} disabled={!canEdit} type="date" />
          <FieldInput label="Appuntamento" value={editAppDate} onChange={setEditAppDate} disabled={!canEdit} type="date" />
          <FieldInput label="Secondo Appuntamento" value={editSecondAppt} onChange={setEditSecondAppt} disabled={!canEdit} type="date" />
          <FieldInput label="Data Firma Contratto" value={editContractDate} onChange={setEditContractDate} disabled={!canEdit} type="date" />

          {/* Timestamps */}
          <div style={{ paddingTop: 6, borderTop: `1px solid ${T.border}` }}>
            <div style={{ marginBottom: 6 }}><Label>Creato</Label><span style={{ fontSize: '0.75rem', color: T.text2 }}>{fmt(lead.created_at, 'datetime')}</span></div>
            <div style={{ marginBottom: 6 }}><Label>Ultima modifica</Label><span style={{ fontSize: '0.75rem', color: T.text2 }}>{fmt(lead.updated_at, 'datetime')}</span></div>
            <div><Label>Stage dal</Label><span style={{ fontSize: '0.75rem', color: T.text2 }}>{fmt(lead.stage_entered_at, 'datetime')}</span></div>
          </div>
        </div>

        {/* ── CENTER: Activity / Notes ────────────────────────────────────── */}
        <div style={{ ...COL, background: T.bg }}>

          {/* Add note box */}
          {canEdit && (
            <div style={{ background: '#fff', border: `1px solid ${T.borderCard}`, borderRadius: T.r, padding: 14, boxShadow: T.shadow }}>
              <Label>Aggiungi nota</Label>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Scrivi una nota..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  style={{ background: T.accent, border: 'none', borderRadius: 6, padding: '5px 14px', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: newNote.trim() ? 'pointer' : 'not-allowed', fontFamily: T.font, opacity: newNote.trim() ? 1 : 0.5 }}
                >
                  Aggiungi
                </button>
              </div>
            </div>
          )}

          {/* Notes list — reverse chronological */}
          {[...structuredNotes].reverse().map(note => (
            <div key={note.id} style={{ background: '#fff', border: `1px solid ${T.borderCard}`, borderRadius: T.r, padding: 12, boxShadow: T.shadow }}>
              {editingNoteId === note.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={editingNoteText}
                    onChange={e => setEditingNoteText(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleUpdateNote(note.id)} style={{ background: T.accent, border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.font }}>Salva</button>
                    <button onClick={() => setEditingNoteId(null)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: T.font }}>Annulla</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: 1.55, color: T.text, marginBottom: 8 }}>
                    {note.content}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: T.text3 }}>{fmt(note.created_at, 'datetime')}</span>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.content); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: T.text2, fontFamily: T.font }}>Modifica</button>
                        <button onClick={() => handleDeleteNote(note.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: T.red, fontFamily: T.font }}>Elimina</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {structuredNotes.length === 0 && (
            <div style={{ textAlign: 'center', color: T.text3, fontSize: '0.82rem', padding: '32px 0' }}>
              Nessuna nota ancora
            </div>
          )}

          {/* Legacy notes field */}
          {lead.notes && (
            <div style={{ background: '#fff', border: `1px solid ${T.borderCard}`, borderRadius: T.r, padding: 12, boxShadow: T.shadow }}>
              <Label>Note libere</Label>
              {canEdit ? (
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', marginTop: 4 }}
                />
              ) : (
                <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: T.text, marginTop: 4 }}>{lead.notes}</div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Sales Agent (320px) ──────────────────────────────────── */}
        <div style={{ borderLeft: `1px solid ${T.border}`, background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Agent header */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: T.text }}>Sales Agent</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: T.text3, marginTop: 2 }}>{lead.azienda || nome}</div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', scrollbarWidth: 'thin' }}>
            {chatMsgs.map(msg => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '7px 10px',
                  borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                  background: msg.role === 'user' ? T.accent : T.bg,
                  color: msg.role === 'user' ? '#fff' : T.text,
                  fontSize: '0.78rem',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.loading ? <span style={{ opacity: 0.5 }}>Analisi...</span> : msg.content}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick prompts */}
          <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0 }}>
            {['Che pacchetto consigli?', 'Analizza obiezioni', 'Prossima azione'].map(p => (
              <button
                key={p}
                onClick={() => sendChat(p)}
                style={{
                  background: T.accentL, border: `1px solid ${T.accent}`, borderRadius: T.rpill,
                  padding: '3px 9px', fontSize: '0.68rem', fontWeight: 600, color: T.accent,
                  cursor: 'pointer', fontFamily: T.font,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 6, flexShrink: 0 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)}
              placeholder="Chiedi all'agente..."
              style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.78rem', fontFamily: T.font, outline: 'none', color: T.text }}
            />
            <button
              onClick={() => sendChat(chatInput)}
              disabled={chatLoading || !chatInput.trim()}
              style={{ background: T.accent, border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', fontFamily: T.font, opacity: chatInput.trim() ? 1 : 0.5 }}
            >
              Invia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailPage;
