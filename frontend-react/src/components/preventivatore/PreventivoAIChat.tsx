import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Text,
  Spinner,
  Icon,
  Avatar
} from '@shopify/polaris';
import { 
  SendIcon, 
  PlusIcon, 
  ChatIcon, 
  ClipboardIcon
} from '@shopify/polaris-icons';
import type { PreventivoData } from '../../types/preventivo';

interface PreventivoAIChatProps {
  onApplyPreventivo: (data: PreventivoData) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isPreventivo?: boolean;
  preventivoData?: any;
}

interface ChatSession {
  id: number;
  title: string;
  updated_at: string;
}

const PreventivoAIChat: React.FC<PreventivoAIChatProps> = ({ onApplyPreventivo }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Ciao! Sono il tuo assistente AI. Posso aiutarti a creare preventivi e **analizzare siti web**. Incolla un link per iniziare o descrivi il progetto.'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000' 
        : window.location.origin;
        
      const response = await fetch(`${API_BASE_URL}/api/mcp/chat/sessions`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error("Errore caricamento sessioni", error);
    }
  };

  const loadChatHistory = async (id: number) => {
    if (isLoading) return;
    setIsLoading(true);
    setSessionId(id);
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000' 
        : window.location.origin;

      const response = await fetch(`${API_BASE_URL}/api/mcp/chat/history/${id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (response.ok) {
        const history = await response.json();
        const formattedMessages = history.map((msg: any, index: number) => ({
          id: `hist_${id}_${index}`,
          role: msg.role,
          content: msg.content,
          isPreventivo: msg.is_preventivo,
          preventivoData: msg.preventivo
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error("Errore caricamento storico", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    setSessionId(null);
    setMessages([
      {
        id: 'new_welcome',
        role: 'assistant',
        content: 'Nuova chat avviata. Come posso aiutarti oggi?'
      }
    ]);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:10000' 
        : window.location.origin;

      const response = await fetch(`${API_BASE_URL}/api/mcp/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          message: userMessage.content,
          session_id: sessionId,
        })
      });

      if (!response.ok) throw new Error('Errore API');

      const data = await response.json();

      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        loadSessions();
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        isPreventivo: data.is_preventivo,
        preventivoData: data.preventivo
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Si è verificato un errore. Riprova tra poco.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '75vh', 
      minHeight: '500px', 
      border: '1px solid #e1e3e5', 
      borderRadius: '12px', 
      overflow: 'hidden',
      backgroundColor: '#fff',
      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
    }}>
      
      {/* SIDEBAR */}
      <div style={{ 
        width: '280px', 
        borderRight: '1px solid #e1e3e5', 
        backgroundColor: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e1e3e5' }}>
          <Button onClick={startNewChat} fullWidth icon={PlusIcon} variant="primary">
            Nuova Chat
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <BlockStack gap="200">
            {sessions.map(session => (
              <div
                key={session.id}
                onClick={() => loadChatHistory(session.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: sessionId === session.id ? '#fff' : 'transparent',
                  border: sessionId === session.id ? '1px solid #e1e3e5' : '1px solid transparent',
                  boxShadow: sessionId === session.id ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.2s ease',
                  overflow: 'hidden'
                }}
              >
                <InlineStack gap="300" wrap={false} align="center">
                  <div style={{ flexShrink: 0 }}>
                    <Icon source={ChatIcon} tone={sessionId === session.id ? 'base' : 'subdued'} />
                  </div>
                  <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1 }}>
                    <Text variant="bodySm" as="span" fontWeight={sessionId === session.id ? 'bold' : 'regular'}>
                      {session.title || `Chat #${session.id}`}
                    </Text>
                  </div>
                </InlineStack>
              </div>
            ))}
          </BlockStack>
        </div>
      </div>

      {/* CHAT AREA */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        backgroundColor: '#fff',
        minWidth: 0 
      }}>
        
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '24px' 
        }}>
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              style={{ 
                display: 'flex', 
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '12px',
                maxWidth: '100%'
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{ flexShrink: 0, paddingTop: '4px' }}>
                  <Avatar size="sm" source="https://ui-avatars.com/api/?name=AI&background=454f5b&color=ffffff&font-size=0.5&bold=true" />
                </div>
              )}

              <div style={{ 
                maxWidth: '85%', /* Aumentato per dare più spazio */
                minWidth: 0
              }}>
                <div style={{
                  padding: '14px 18px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  backgroundColor: msg.role === 'user' ? '#008060' : '#f4f6f8',
                  color: msg.role === 'user' ? '#ffffff' : '#202223',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap' /* Importante per andare a capo */
                }}>
                  {/* Container per Markdown con stili inline per evitare overflow liste */}
                  <div style={{ 
                    fontSize: '15px', 
                    lineHeight: '1.6',
                    overflow: 'hidden' /* Taglia contenuto in eccesso */
                  }}>
                    <ReactMarkdown
                        components={{
                            p: ({node, ...props}) => <p style={{ marginBottom: '0.5em', margin: 0 }} {...props} />,
                            ul: ({node, ...props}) => <ul style={{ paddingLeft: '20px', margin: '0.5em 0' }} {...props} />,
                            ol: ({node, ...props}) => <ol style={{ paddingLeft: '20px', margin: '0.5em 0' }} {...props} />,
                            li: ({node, ...props}) => <li style={{ marginBottom: '0.25em' }} {...props} />
                        }}
                    >
                        {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Card Preventivo - Semplificata e Robusta */}
                {msg.isPreventivo && msg.preventivoData && (
                  <div style={{ 
                    marginTop: '12px', 
                    border: '1px solid #e1e3e5', 
                    borderRadius: '12px', 
                    backgroundColor: '#fff',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                  }}>
                    <div style={{ 
                        padding: '12px 16px', 
                        background: '#f9fafb', 
                        borderBottom: '1px solid #e1e3e5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '12px'
                    }}>
                      <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon source={ClipboardIcon} tone="base" />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>Proposta Preventivo</span>
                    </div>
                    
                    <div style={{ padding: '16px' }}>
                      <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>CLIENTE</div>
                            <div style={{ fontWeight: 600 }}>{msg.preventivoData.cliente || '-'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>OGGETTO</div>
                            <div style={{ lineHeight: 1.4 }}>{msg.preventivoData.oggetto || '-'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: '#6d7175', marginBottom: '4px' }}>TOTALE STIMATO</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#008060' }}>
                                € {typeof msg.preventivoData.totale === 'number' ? msg.preventivoData.totale.toFixed(2) : msg.preventivoData.totale}
                            </div>
                        </div>
                      </div>

                      <Button 
                        variant="primary" 
                        fullWidth 
                        onClick={() => onApplyPreventivo(msg.preventivoData)}
                        icon={ClipboardIcon}
                      >
                        Applica
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div style={{ flexShrink: 0, paddingTop: '4px' }}>
                  <Avatar customer size="sm" name="User" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flexShrink: 0, width: '32px', height: '32px' }}>
                <Avatar size="sm" source="https://ui-avatars.com/api/?name=AI&background=454f5b&color=ffffff&font-size=0.5&bold=true" />
              </div>
              <div style={{ padding: '12px 16px', background: '#f4f6f8', borderRadius: '18px 18px 18px 4px' }}>
                <Spinner size="small" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid #e1e3e5', backgroundColor: '#fff' }}>
          <div style={{ position: 'relative' }} onKeyDownCapture={handleKeyDown}>
            <TextField
              label="Messaggio"
              labelHidden
              value={inputValue}
              onChange={setInputValue}
              placeholder="Scrivi un messaggio..."
              multiline={4}
              maxHeight={120}
              autoComplete="off"
              disabled={isLoading}
            />
            <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 10 }}>
              <Button 
                icon={SendIcon} 
                onClick={handleSendMessage} 
                disabled={!inputValue.trim() || isLoading}
                variant="primary"
                size="slim"
              />
            </div>
          </div>
          <div style={{ marginTop: '8px', textAlign: 'right' }}>
             <Text variant="bodyXs" tone="subdued" as="span">Premi Enter per inviare</Text>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreventivoAIChat;
