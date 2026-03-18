import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getApiGatewayUrl } from '../utils/apiConfig';
import './EvoAgent.css';

const BASE = getApiGatewayUrl();

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools_used?: string[];
  agent_id?: string;
  isLoading?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

interface AgentConfig {
  id: string;
  name: string;
  abbr: string;       // 2-letter abbreviation for avatar
  description: string;
  tools_count: number;
}

// ─── Minimal markdown ──────────────────────────────────────────────────────────

function md(raw: string): string {
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.*)/gm, '<h3>$1</h3>')
    .replace(/^## (.*)/gm, '<h2>$1</h2>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n?)+/gs, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem('auth_token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { headers: authHeaders(), ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Default agent list (shown before server responds) ────────────────────────

const DEFAULT_AGENTS: AgentConfig[] = [
  { id: 'orchestrator', name: 'EvoAgent',       abbr: 'EA', description: 'Accesso completo alla piattaforma', tools_count: 0 },
  { id: 'sales',        name: 'Sales',           abbr: 'SA', description: 'Pipeline, lead, opportunità',      tools_count: 0 },
  { id: 'ops',          name: 'Operations',      abbr: 'OP', description: 'Task, workflow, team',             tools_count: 0 },
  { id: 'finance',      name: 'Finance',         abbr: 'FI', description: 'Pagamenti, contratti, valore',    tools_count: 0 },
  { id: 'clients',      name: 'Clienti',         abbr: 'CL', description: 'Anagrafica, drive, documenti',    tools_count: 0 },
];

const STARTERS: Record<string, string[]> = {
  orchestrator: [
    'Mostrami lo stato generale della pipeline',
    'Ci sono task scaduti nel team?',
    'Qual è la situazione dei pagamenti?',
    'Dammi una panoramica sui clienti attivi',
  ],
  sales: [
    'Panoramica pipeline per stage',
    'Lead con deal value più alto',
    'Analisi valore mensile pipeline',
    'Crea un nuovo lead',
  ],
  ops: [
    'Task scaduti di tutto il team',
    'Mostrami i task di questa settimana',
    'Template workflow disponibili',
    'Chi ha più task in arretrato?',
  ],
  finance: [
    'Pagamenti in sospeso o scaduti',
    'Valore contratti attivi',
    'Preventivi non ancora convertiti',
    'Trend valore mensile 2026',
  ],
  clients: [
    'Lista clienti con servizi attivi',
    'Contratti in scadenza',
    'Catalogo servizi con prezzi',
    'Overview di un cliente specifico',
  ],
};

// ─── SVG Icons ─────────────────────────────────────────────────────────────────

const IconPlus = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="8" y1="2" x2="8" y2="14" /><line x1="2" y1="8" x2="14" y2="8" />
  </svg>
);

const IconClose = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" />
  </svg>
);

const IconSend = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <path d="M14 8L2 2l2 6-2 6 12-6z" />
  </svg>
);

// ─── Main ──────────────────────────────────────────────────────────────────────

const EvoAgentPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Contesto iniettato dalla pagina precedente (es. LeadDetailPage)
  const navState = (location.state || {}) as { context?: string; agentId?: string };
  const [injectedContext] = useState<string | null>(navState.context || null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [activeAgent, setActiveAgent] = useState(navState.agentId || 'orchestrator');
  const [briefing, setBriefing] = useState<{ text: string; time: string } | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [configError, setConfigError] = useState('');

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const u = user as any;
  const userName = `${u?.nome || ''} ${u?.cognome || ''}`.trim() || u?.username || 'U';
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Check config
    apiFetch('/api/mcp/evo-agent/status').then(d => {
      if (!d.configured) setConfigError(d.anthropic_key || 'Configurazione mancante');
    }).catch(() => {});
    // Load agents
    apiFetch('/api/mcp/evo-agent/agents').then(d => {
      if (d.agents?.length) {
        setAgents(d.agents.map((a: any) => ({
          ...a,
          abbr: a.name.slice(0, 2).toUpperCase(),
        })));
      }
    }).catch(() => {});
    // Load conversations
    loadConversations();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [input]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const loadConversations = async () => {
    try {
      const data = await apiFetch('/api/mcp/evo-agent/conversations');
      setConversations(Array.isArray(data) ? data : []);
    } catch {}
  };

  const startNew = useCallback(() => {
    setConvId(null);
    setMessages([]);
    setBriefing(null);
    setConfigError('');
  }, []);

  const switchAgent = useCallback((id: string) => {
    setActiveAgent(id);
    startNew();
  }, [startNew]);

  const openConversation = useCallback(async (id: string) => {
    if (convId === id) return;
    setMessages([]);
    setBriefing(null);
    setConvId(id);
    try {
      const data = await apiFetch(`/api/mcp/evo-agent/conversations/${id}`);
      const agentId = data.agent_id || data.channel || 'orchestrator';
      setActiveAgent(agentId);
      const msgs: Message[] = (data.messages || [])
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any, i: number) => ({
          id: `hist-${id}-${i}`,
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || ''),
          tools_used: m.tools_used,
          agent_id: agentId,
        }));
      setMessages(msgs);
    } catch {
      // Se il fetch fallisce, almeno la conv è selezionata — il prossimo messaggio
      // sarà agganciato a questa conversazione
    }
  }, [convId]);

  const deleteConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/mcp/evo-agent/conversations/${id}`, { method: 'DELETE' });
      setConversations(p => p.filter(c => c.id !== id));
      if (convId === id) startNew();
    } catch {}
  };

  const loadBriefing = useCallback(async () => {
    setBriefingLoading(true);
    setBriefing(null);
    setMessages([]);
    setConvId(null);
    try {
      const d = await apiFetch('/api/mcp/evo-agent/briefing');
      setBriefing({
        text: d.briefing || d.response || '',
        time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (e: any) {
      setBriefing({ text: `Errore: ${e.message}`, time: '' });
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    setBriefing(null);
    setLoading(true);

    setMessages(p => [
      ...p,
      { id: `u${Date.now()}`, role: 'user', content: msg },
      { id: `l${Date.now()}`, role: 'assistant', content: '', isLoading: true },
    ]);

    try {
      const d = await apiFetch('/api/mcp/evo-agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          conversation_id: convId,
          agent_id: activeAgent,
          // Passa il contesto solo al primo messaggio della conversazione
          context: !convId && injectedContext ? injectedContext : undefined,
        }),
      });

      setConvId(d.conversation_id);
      setMessages(p => [
        ...p.filter(m => !m.isLoading),
        {
          id: `a${Date.now()}`,
          role: 'assistant' as const,
          content: d.response || '_(nessuna risposta)_',
          tools_used: d.tools_used,
          agent_id: d.agent_id || activeAgent,
        },
      ]);
      loadConversations();
    } catch (e: any) {
      setMessages(p => [
        ...p.filter(m => !m.isLoading),
        { id: `e${Date.now()}`, role: 'assistant', content: `Errore: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [input, loading, convId, activeAgent]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const agent = agents.find(a => a.id === activeAgent) || DEFAULT_AGENTS[0];
  const starters = STARTERS[activeAgent] || STARTERS.orchestrator;
  const hasContent = messages.length > 0 || !!briefing;

  const todayKey = new Date().toDateString();
  const todayConvs = conversations.filter(c => new Date(c.updated_at).toDateString() === todayKey);
  const olderConvs = conversations.filter(c => new Date(c.updated_at).toDateString() !== todayKey);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="ea-root">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="ea-sidebar">
        <div className="ea-sidebar-top">
          <div className="ea-wordmark">
            <div className="ea-wordmark-dot" />
            EvoAgent
          </div>
          <button className="ea-icon-btn" onClick={() => navigate('/')} title="Esci">
            <IconClose />
          </button>
        </div>

        <button className="ea-new-btn" onClick={startNew}>
          <IconPlus /> Nuova conversazione
        </button>

        {/* Agents */}
        <div className="ea-sidebar-section">
          <div className="ea-section-header">Agenti</div>
          {agents.map(a => (
            <button
              key={a.id}
              className={`ea-agent-btn${activeAgent === a.id ? ' active' : ''}`}
              onClick={() => switchAgent(a.id)}
            >
              <div className="ea-agent-avatar">{a.abbr}</div>
              <div>
                <div className="ea-agent-label">{a.name}</div>
                <div className="ea-agent-sub">{a.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Conversations */}
        <div className="ea-sidebar-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="ea-section-header">Conversazioni</div>
          <div className="ea-conv-scroll">
            {todayConvs.length > 0 && (
              <>
                <div className="ea-date-label">Oggi</div>
                {todayConvs.map(c => (
                  <button
                    key={c.id}
                    className={`ea-conv-btn${convId === c.id ? ' active' : ''}`}
                    onClick={() => openConversation(c.id)}
                  >
                    <span className="ea-conv-title">{c.title || 'Conversazione'}</span>
                    <button className="ea-conv-del" onClick={e => deleteConv(c.id, e)}>×</button>
                  </button>
                ))}
              </>
            )}
            {olderConvs.length > 0 && (
              <>
                <div className="ea-date-label">Precedenti</div>
                {olderConvs.map(c => (
                  <button
                    key={c.id}
                    className={`ea-conv-btn${convId === c.id ? ' active' : ''}`}
                    onClick={() => openConversation(c.id)}
                  >
                    <span className="ea-conv-title">{c.title || 'Conversazione'}</span>
                    <button className="ea-conv-del" onClick={e => deleteConv(c.id, e)}>×</button>
                  </button>
                ))}
              </>
            )}
            {conversations.length === 0 && (
              <div className="ea-sidebar-empty">Nessuna conversazione</div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <main className="ea-main">

        {/* Header */}
        <div className="ea-header">
          <div className="ea-header-agent">
            <div className="ea-header-avatar">{agent.abbr}</div>
            <div>
              <div className="ea-header-name">{agent.name}</div>
              <div className="ea-header-desc">{agent.description}</div>
            </div>
          </div>
          <div className="ea-header-actions">
            <button
              className="ea-outline-btn"
              onClick={loadBriefing}
              disabled={briefingLoading}
            >
              {briefingLoading ? 'Generazione...' : 'Briefing operativo'}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="ea-messages">

          {/* Config error */}
          {configError && (
            <div className="ea-error-banner">
              <div className="ea-error-inner">
                Configurazione mancante: {configError}
              </div>
            </div>
          )}

          {/* Briefing */}
          {briefing && (
            <div className="ea-briefing">
              <div className="ea-briefing-inner">
                <div className="ea-briefing-bar">
                  <span className="ea-briefing-label">Briefing operativo</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="ea-briefing-time">{briefing.time}</span>
                    <button className="ea-icon-btn" onClick={() => setBriefing(null)}><IconClose /></button>
                  </div>
                </div>
                <div
                  className="ea-briefing-text ea-bubble assistant"
                  dangerouslySetInnerHTML={{ __html: `<p>${md(briefing.text)}</p>` }}
                />
              </div>
            </div>
          )}

          {/* Banner contesto iniettato da LeadDetailPage */}
          {injectedContext && !hasContent && (
            <div style={{
              margin: '0 0 12px 0',
              padding: '10px 14px',
              background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
              border: '1px solid #c7d2fe',
              borderRadius: 10,
              fontSize: '0.8rem',
              color: '#4338ca',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Contesto attivo — l'agente conosce già questo lead
              </div>
              <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '0.78rem', whiteSpace: 'pre-wrap', color: '#3730a3' }}>
                {injectedContext}
              </pre>
            </div>
          )}

          {/* Welcome */}
          {!hasContent && (
            <div className="ea-welcome">
              <div className="ea-welcome-heading">
                {injectedContext ? `Cosa vuoi fare?` : `Ciao, ${userName.split(' ')[0]}`}
              </div>
              <div className="ea-welcome-sub">
                {injectedContext
                  ? `${agent.name} ha il contesto del lead. Chiedimi di analizzarlo, sincronizzarlo su AirCall, aggiornare le note o qualsiasi altra operazione.`
                  : `${agent.name} — ${agent.description.toLowerCase()}. Puoi chiedermi qualsiasi cosa sulla piattaforma.`
                }
              </div>
              <div className="ea-starters">
                {(injectedContext ? [
                  'Analizza questo lead',
                  'Sincronizza su AirCall',
                  'Riassumi lo storico chiamate',
                  'Aggiorna le note',
                ] : starters).map(s => (
                  <button key={s} className="ea-starter" onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          <div className="ea-msg-group">
            {messages.map(msg => (
              <React.Fragment key={msg.id}>
                <div className={`ea-msg-row ${msg.role}`}>

                  {msg.role === 'assistant' && (
                    <div className="ea-avatar assistant">
                      {agents.find(a => a.id === (msg.agent_id || activeAgent))?.abbr || 'EA'}
                    </div>
                  )}

                  <div className="ea-msg-content">
                    {msg.isLoading ? (
                      <div className="ea-bubble assistant">
                        <div className="ea-loading">
                          <span /><span /><span />
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`ea-bubble ${msg.role}`}
                        dangerouslySetInnerHTML={{ __html: msg.role === 'assistant' ? `<p>${md(msg.content)}</p>` : msg.content }}
                      />
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="ea-avatar user">{userInitials}</div>
                  )}
                </div>

                {msg.tools_used && msg.tools_used.length > 0 && (
                  <div className="ea-tool-row">
                    {msg.tools_used.map(t => (
                      <span key={t} className="ea-tool-tag">{t}</span>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div ref={endRef} style={{ height: 20 }} />
        </div>

        {/* Input */}
        <div className="ea-input-wrap">
          <div className="ea-input-box">
            <div className="ea-input-field">
              <textarea
                ref={textareaRef}
                className="ea-textarea"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={`Scrivi a ${agent.name}...`}
                disabled={loading}
                rows={1}
              />
              <button
                className="ea-send"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                {loading ? (
                  <div className="ea-loading" style={{ justifyContent: 'center' }}>
                    <span /><span /><span />
                  </div>
                ) : (
                  <IconSend />
                )}
              </button>
            </div>

            {!hasContent && (
              <div className="ea-shortcuts">
                {starters.slice(0, 3).map(s => (
                  <button key={s} className="ea-shortcut" onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="ea-input-hint">Invio per inviare · Shift+Invio per andare a capo</div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default EvoAgentPage;
