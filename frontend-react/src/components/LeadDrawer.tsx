import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  Text,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Spinner,
  Select,
  Divider,
} from '@shopify/polaris';
import { salesApi, type Lead, type LeadTag, type PipelineStage } from '../services/salesApi';
import { getApiGatewayUrl } from '../utils/apiConfig';
import styles from './LeadDrawer.module.css';

const GATEWAY = getApiGatewayUrl();

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  loading?: boolean;
}

export interface LeadDrawerProps {
  lead: Lead | null;
  stages: PipelineStage[];
  leadTags: LeadTag[];
  onClose: () => void;
  onLeadUpdated: (lead: Lead) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLeadDisplayName(lead: Lead): string {
  const parts = [lead.first_name, lead.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : lead.email;
}

function stageTone(stageKey: string): 'success' | 'critical' | 'warning' | 'info' | undefined {
  if (stageKey === 'cliente') return 'success';
  if (stageKey === 'trattativa_persa' || stageKey === 'scartato') return 'critical';
  if (stageKey === 'optin') return 'warning';
  return 'info';
}

function scoreColor(score: number): string {
  if (score >= 70) return '#2c6e2e';
  if (score >= 40) return '#c4730b';
  return '#c0392b';
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

// Minimal inline markdown renderer
function renderMd(raw: string): string {
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.*)/gm, '<h4 style="margin:6px 0 2px">$1</h4>')
    .replace(/^## (.*)/gm, '<h3 style="margin:8px 0 4px">$1</h3>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul style="margin:4px 0;padding-left:16px">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:4px 0">')
    .replace(/\n/g, '<br/>');
}

const HIDDEN_STAGES = ['scartato', 'archiviato'];
const QUICK_PROMPTS = [
  'Che pacchetto consigli?',
  'Analizza le obiezioni',
  'Prossima azione da fare',
];
const TRATTATIVA_REASONS = [
  { label: 'Non ha budget', value: 'non_ha_budget' },
  { label: 'Concorrenza', value: 'concorrenza' },
  { label: 'Non target', value: 'non_target' },
  { label: 'Timing', value: 'timing' },
  { label: 'Nessuna risposta', value: 'nessuna_risposta' },
  { label: 'Progetto rinviato', value: 'progetto_rinviato' },
  { label: 'Altro', value: 'altro' },
];

// ─── LeadDrawer ───────────────────────────────────────────────────────────────

const LeadDrawer: React.FC<LeadDrawerProps> = ({
  lead,
  stages,
  leadTags,
  onClose,
  onLeadUpdated,
}) => {
  // ── local lead state (mirrors prop, updated optimistically) ────────────────
  const [localLead, setLocalLead] = useState<Lead | null>(null);
  const [open, setOpen] = useState(false);

  // ── notes edit ─────────────────────────────────────────────────────────────
  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // ── perso popover ──────────────────────────────────────────────────────────
  const [showPersoPopover, setShowPersoPopover] = useState(false);
  const [persoReason, setPersoReason] = useState('non_ha_budget');

  // ── chat ───────────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const autoAnalysisDone = useRef(false);

  // ── animate open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (lead) {
      setLocalLead(lead);
      setNotesValue(lead.notes || '');
      setOpen(true);
      // Reset chat when a different lead is opened
      setChatMessages([]);
      setChatConvId(null);
      autoAnalysisDone.current = false;
    } else {
      setOpen(false);
    }
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── auto analysis on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !localLead || autoAnalysisDone.current) return;
    autoAnalysisDone.current = true;
    const name = getLeadDisplayName(localLead);
    const prompt = `Dammi un'analisi rapida di questo lead: ${name}${localLead.azienda ? ', ' + localLead.azienda : ''}, stage ${localLead.stage}${localLead.source_channel ? ', fonte ' + localLead.source_channel : ''}${localLead.deal_value ? ', valore €' + (localLead.deal_value / 100).toFixed(0) : ''}. Score: ${localLead.lead_score ?? 'N/D'}/100.`;
    sendChat(prompt, true);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── scroll chat to bottom ──────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── patch lead ─────────────────────────────────────────────────────────────
  const patchLead = useCallback(async (patch: Record<string, unknown>) => {
    if (!localLead) return;
    const optimistic = { ...localLead, ...patch } as Lead;
    setLocalLead(optimistic);
    try {
      const updated: Lead = await salesApi.updateLead(localLead.id, patch as any);
      setLocalLead(updated);
      onLeadUpdated(updated);
    } catch {
      setLocalLead(localLead);
    }
  }, [localLead, onLeadUpdated]);

  // ── close ──────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(onClose, 310);
  }, [onClose]);

  // ── stage change ───────────────────────────────────────────────────────────
  const handleStageClick = (stageKey: string) => {
    if (!localLead || localLead.stage === stageKey) return;
    patchLead({ stage: stageKey });
  };

  // ── vinto / perso ──────────────────────────────────────────────────────────
  const handleVinto = async () => {
    await patchLead({ stage: 'cliente' });
    handleClose();
  };

  const handlePerso = async () => {
    await patchLead({ stage: 'trattativa_persa', trattativa_persa_reason: persoReason });
    setShowPersoPopover(false);
    handleClose();
  };

  // ── notes blur save ────────────────────────────────────────────────────────
  const handleNotesSave = async () => {
    if (!localLead || notesValue === localLead.notes) return;
    setNotesSaving(true);
    try {
      await patchLead({ notes: notesValue });
    } finally {
      setNotesSaving(false);
    }
  };

  // ── chat ───────────────────────────────────────────────────────────────────
  const sendChat = useCallback(async (text: string, silent = false) => {
    if (!text.trim() || chatLoading) return;

    if (!silent) {
      setChatMessages(p => [...p, { id: `u${Date.now()}`, role: 'user', content: text }]);
    }
    setChatMessages(p => [...p, { id: `l${Date.now()}`, role: 'agent', content: '', loading: true }]);
    setChatInput('');
    setChatLoading(true);

    // Build history for API
    const historyForApi = chatMessages
      .filter(m => !m.loading)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    try {
      const res = await fetch(`${GATEWAY}/api/mcp/evo-agent/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: text,
          agent_id: 'sales',
          conversation_id: chatConvId,
          history: historyForApi,
        }),
      });
      const data = await res.json();
      if (data.conversation_id) setChatConvId(data.conversation_id);
      setChatMessages(p => [
        ...p.filter(m => !m.loading),
        { id: `a${Date.now()}`, role: 'agent', content: data.response || '_(nessuna risposta)_' },
      ]);
    } catch (e: any) {
      setChatMessages(p => [
        ...p.filter(m => !m.loading),
        { id: `e${Date.now()}`, role: 'agent', content: `Errore: ${e.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages, chatConvId]);

  const handleChatKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(chatInput);
    }
  };

  // ── render guard ───────────────────────────────────────────────────────────
  if (!lead && !open) return null;
  const l = localLead;
  if (!l) return null;

  const displayName = getLeadDisplayName(l);
  const currentStageLabel = stages.find(s => s.key === l.stage)?.label || l.stage;
  const score = l.lead_score ?? 0;
  const visibleStages = stages.filter(s => !HIDDEN_STAGES.includes(s.key));

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Overlay */}
      <div className={styles.overlay} onClick={handleClose} />

      {/* Drawer */}
      <div className={`${styles.drawer}${open ? ' ' + styles.open : ''}`}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text variant="headingMd" as="h2" truncate>
                {displayName}
                {l.azienda ? <span style={{ fontWeight: 400, color: '#6d7175' }}> — {l.azienda}</span> : null}
              </Text>
              <Badge tone={stageTone(l.stage)}>{currentStageLabel}</Badge>
            </InlineStack>
          </div>
          <div className={styles.headerActions}>
            <Button variant="primary" size="slim" onClick={handleVinto} tone="success">
              Vinto
            </Button>

            {/* Perso: inline popover */}
            <div style={{ position: 'relative' }}>
              <Button variant="primary" size="slim" onClick={() => setShowPersoPopover(p => !p)} tone="critical">
                Perso
              </Button>
              {showPersoPopover && (
                <div className={styles.persoPopover} style={{
                  position: 'absolute', top: '38px', right: 0, zIndex: 600,
                  background: '#fff', border: '1px solid #e1e3e5', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                }}>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="p">Motivo perdita</Text>
                    <Select
                      label=""
                      labelHidden
                      options={TRATTATIVA_REASONS}
                      value={persoReason}
                      onChange={setPersoReason}
                    />
                    <InlineStack gap="200">
                      <Button size="slim" onClick={handlePerso} tone="critical" variant="primary">Conferma</Button>
                      <Button size="slim" onClick={() => setShowPersoPopover(false)}>Annulla</Button>
                    </InlineStack>
                  </BlockStack>
                </div>
              )}
            </div>

            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0 }}
              onClick={handleClose}
              title="Chiudi"
            >
              <span style={{ fontSize: 18, color: '#6d7175', lineHeight: 1 }}>✕</span>
            </button>
          </div>
        </div>

        {/* ── Stage bar ───────────────────────────────────────────────────── */}
        <div className={styles.stageBar}>
          {visibleStages.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 && <span className={styles.stageArrow}>›</span>}
              <button
                className={`${styles.stagePill}${l.stage === s.key ? ' ' + styles.active : ''}`}
                onClick={() => handleStageClick(s.key)}
              >
                {s.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className={styles.body}>

          {/* ── Left: info lead ─────────────────────────────────────────── */}
          <div className={styles.leftPanel}>
            <BlockStack gap="300">

              {/* Contatti */}
              <BlockStack gap="100">
                <p className={styles.infoLabel}>Contatti</p>
                <div className={styles.infoRow}>
                  <span>📧</span>
                  <a href={`mailto:${l.email}`} style={{ color: '#005bd3', textDecoration: 'none', fontSize: '0.82rem' }}>
                    {l.email}
                  </a>
                </div>
                {l.phone && (
                  <div className={styles.infoRow}>
                    <span>📞</span>
                    <a href={`tel:${l.phone}`} style={{ color: '#005bd3', textDecoration: 'none', fontSize: '0.82rem' }}>
                      {l.phone}
                    </a>
                  </div>
                )}
              </BlockStack>

              <Divider />

              {/* Qualificazione */}
              <BlockStack gap="150">
                <p className={styles.infoLabel}>Qualificazione</p>

                {/* Lead Score */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                    <span style={{ color: '#6d7175' }}>Lead Score</span>
                    <strong style={{ color: scoreColor(score) }}>{score}/100</strong>
                  </div>
                  <div className={styles.scoreBar}>
                    <div
                      className={styles.scoreBarFill}
                      style={{ width: `${score}%`, background: scoreColor(score) }}
                    />
                  </div>
                </div>

                {l.source_channel && (
                  <div>
                    <p className={styles.infoLabel}>Fonte</p>
                    <Text variant="bodySm" as="p">{l.source_channel}</Text>
                  </div>
                )}

                {l.consapevolezza && (
                  <div>
                    <p className={styles.infoLabel}>Consapevolezza</p>
                    <Badge>{l.consapevolezza}</Badge>
                  </div>
                )}

                {l.pacchetto_consigliato && (
                  <div>
                    <p className={styles.infoLabel}>Pacchetto</p>
                    <Badge tone="info">{l.pacchetto_consigliato}</Badge>
                  </div>
                )}

                {l.budget_indicativo && (
                  <div>
                    <p className={styles.infoLabel}>Budget indicativo</p>
                    <Text variant="bodySm" as="p">{l.budget_indicativo}</Text>
                  </div>
                )}

                {l.deal_value ? (
                  <div>
                    <p className={styles.infoLabel}>Valore deal</p>
                    <Text variant="bodySm" as="p" fontWeight="semibold">
                      €{(l.deal_value / 100).toLocaleString('it-IT', { minimumFractionDigits: 0 })}
                    </Text>
                  </div>
                ) : null}
              </BlockStack>

              <Divider />

              {/* Scheduling */}
              <BlockStack gap="150">
                <p className={styles.infoLabel}>Scheduling</p>

                <div>
                  <p className={styles.infoLabel}>Prossimo appuntamento</p>
                  {l.appointment_date
                    ? <Text variant="bodySm" as="p">{formatDate(l.appointment_date)}</Text>
                    : <Text variant="bodySm" as="p" tone="subdued">Non fissato</Text>
                  }
                </div>

                {l.follow_up_date && (
                  <div>
                    <p className={styles.infoLabel}>Follow-up previsto</p>
                    <Text variant="bodySm" as="p">{formatDate(l.follow_up_date)}</Text>
                  </div>
                )}

                {(l.no_show_count ?? 0) > 0 && (
                  <div>
                    <p className={styles.infoLabel}>No-show</p>
                    <Badge tone="critical">{String(l.no_show_count)}</Badge>
                  </div>
                )}
              </BlockStack>

              <Divider />

              {/* Assegnazione */}
              <BlockStack gap="150">
                <p className={styles.infoLabel}>Team</p>

                {l.assigned_to_user && (
                  <div>
                    <p className={styles.infoLabel}>Assegnato a</p>
                    <Text variant="bodySm" as="p">
                      {[l.assigned_to_user.nome, l.assigned_to_user.cognome].filter(Boolean).join(' ') || l.assigned_to_user.username}
                    </Text>
                  </div>
                )}
                {l.setter_id && (
                  <div>
                    <p className={styles.infoLabel}>Setter ID</p>
                    <Text variant="bodySm" as="p" tone="subdued">{l.setter_id}</Text>
                  </div>
                )}
              </BlockStack>

              <Divider />

              {/* Tag */}
              {leadTags.length > 0 && (
                <BlockStack gap="100">
                  <p className={styles.infoLabel}>Tag</p>
                  <Select
                    label=""
                    labelHidden
                    options={[
                      { label: 'Nessun tag', value: '' },
                      ...leadTags.map(t => ({ label: t.label, value: String(t.id) })),
                    ]}
                    value={l.lead_tag_id ? String(l.lead_tag_id) : ''}
                    onChange={v => patchLead({ lead_tag_id: v ? Number(v) : null })}
                  />
                </BlockStack>
              )}

              <Divider />

              {/* Note */}
              <BlockStack gap="100">
                <p className={styles.infoLabel}>
                  Note {notesSaving && <Spinner size="small" />}
                </p>
                <TextField
                  label=""
                  labelHidden
                  value={notesValue}
                  onChange={setNotesValue}
                  onBlur={handleNotesSave}
                  multiline={4}
                  autoComplete="off"
                  placeholder="Note sul lead..."
                />
              </BlockStack>

            </BlockStack>
          </div>

          {/* ── Right: chat ─────────────────────────────────────────────── */}
          <div className={styles.chatPanel}>

            <div className={styles.chatHeader}>
              <span style={{ fontSize: '1rem' }}>●</span>
              Sales Agent
            </div>

            {/* Messages */}
            <div className={styles.messages}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#8c9196', fontSize: '0.8rem', marginTop: 24 }}>
                  Analisi in corso...
                </div>
              )}
              {chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`${styles.bubble} ${msg.loading ? styles.loading : msg.role === 'user' ? styles.user : styles.agent}`}
                >
                  {msg.loading ? (
                    <><div className={styles.dot} /><div className={styles.dot} /><div className={styles.dot} /></>
                  ) : msg.role === 'agent' ? (
                    <span dangerouslySetInnerHTML={{ __html: `<p style="margin:0">${renderMd(msg.content)}</p>` }} />
                  ) : (
                    msg.content
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Quick prompts */}
            <div className={styles.quickPrompts}>
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  className={styles.quickBtn}
                  onClick={() => sendChat(p)}
                  disabled={chatLoading}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className={styles.chatInput}>
              <textarea
                ref={chatInputRef}
                className={styles.chatTextarea}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKey}
                placeholder="Chiedi qualcosa su questo lead..."
                disabled={chatLoading}
                rows={1}
              />
              <button
                className={styles.sendBtn}
                onClick={() => sendChat(chatInput)}
                disabled={!chatInput.trim() || chatLoading}
              >
                {chatLoading
                  ? <Spinner size="small" />
                  : <svg viewBox="0 0 16 16" fill="currentColor" width={14} height={14}><path d="M14 8L2 2l2 6-2 6 12-6z"/></svg>
                }
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default LeadDrawer;
