import React, { useState } from 'react';
import { 
  LegacyCard, 
  Button, 
  BlockStack, 
  InlineStack, 
  Box, 
  Text, 
  Modal, 
  FormLayout, 
  TextField, 
  Select,
  Collapsible,
  Icon,
  Badge,
  Tooltip
} from '@shopify/polaris';
import { 
  DeleteIcon, 
  KeyIcon,
  LocationIcon,
  NoteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardIcon,
  ViewIcon,
  HideIcon
} from '@shopify/polaris-icons';
import type { Canale } from '../../services/clientiApi';
import { toast } from 'react-hot-toast';

interface ClienteCanaliProps {
  canali: Canale[];
  onAdd: (canale: Canale) => void;
  onRemove: (id: string) => void;
}

const TIPO_OPTIONS = [
  { label: 'Credenziali Accesso', value: 'accesso' },
  { label: 'Indirizzo/Sede', value: 'indirizzo' },
  { label: 'Altro', value: 'altro' }
];

const ClienteCanali: React.FC<ClienteCanaliProps> = ({ canali, onAdd, onRemove }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Set<string>>(new Set());
  
  // Form state per nuovo canale
  const [newCanale, setNewCanale] = useState<Partial<Canale>>({
    tipo: 'accesso',
    nome: '',
    url_sito: '',
    nome_utente: '',
    password: '',
    indirizzo: '',
    note: ''
  });

  const handleCreate = () => {
    if (!newCanale.nome?.trim()) {
      toast.error('Il nome è obbligatorio');
      return;
    }
    
    const canale: Canale = {
      id: Date.now().toString(),
      tipo: newCanale.tipo as 'accesso' | 'indirizzo' | 'altro',
      nome: newCanale.nome,
      url_sito: newCanale.url_sito,
      nome_utente: newCanale.nome_utente,
      password: newCanale.password,
      indirizzo: newCanale.indirizzo,
      note: newCanale.note
    };
    
    onAdd(canale);
    setIsModalOpen(false);
    setNewCanale({ tipo: 'accesso', nome: '', url_sito: '', nome_utente: '', password: '', indirizzo: '', note: '' });
    toast.success('Credenziale aggiunta');
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleShowPassword = (id: string) => {
    setShowPasswords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiato!`);
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'accesso': return KeyIcon;
      case 'indirizzo': return LocationIcon;
      default: return NoteIcon;
    }
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'accesso': return <Badge tone="info">Accesso</Badge>;
      case 'indirizzo': return <Badge tone="attention">Indirizzo</Badge>;
      default: return <Badge>Altro</Badge>;
    }
  };

  return (
    <>
      <LegacyCard 
        title="Credenziali & Sedi" 
        sectioned 
        actions={[{ content: 'Aggiungi', onAction: () => setIsModalOpen(true) }]}
      >
        {canali.length === 0 ? (
          <Box padding="400" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="200" align="center">
              <Icon source={KeyIcon} tone="subdued" />
              <Text as="p" tone="subdued" alignment="center">
                Nessuna credenziale o sede salvata.
              </Text>
              <Button onClick={() => setIsModalOpen(true)} size="slim">Aggiungi</Button>
            </BlockStack>
          </Box>
        ) : (
          <BlockStack gap="200">
            {canali.map((canale) => (
              <Box 
                key={canale.id} 
                padding="300" 
                background="bg-surface-secondary" 
                borderRadius="200"
              >
                {/* Header - sempre visibile */}
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                    <div style={{ minWidth: '20px' }}>
                      <Icon source={getTipoIcon(canale.tipo)} tone="base" />
                    </div>
                    <Text as="span" fontWeight="semibold">{canale.nome}</Text>
                    {getTipoBadge(canale.tipo)}
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button 
                      icon={expandedId === canale.id ? ChevronUpIcon : ChevronDownIcon}
                      variant="plain"
                      onClick={() => toggleExpand(canale.id)}
                    />
                    <Button 
                      icon={DeleteIcon} 
                      tone="critical" 
                      variant="plain" 
                      onClick={() => onRemove(canale.id)}
                    />
                  </InlineStack>
                </InlineStack>

                {/* Dettagli - espandibili */}
                <Collapsible
                  open={expandedId === canale.id}
                  id={`canale-${canale.id}`}
                  transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
                >
                  <Box paddingBlockStart="300">
                    <BlockStack gap="200">
                      {canale.tipo === 'accesso' && (
                        <>
                          {canale.url_sito && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" tone="subdued" variant="bodySm">URL:</Text>
                              <a href={canale.url_sito} target="_blank" rel="noopener noreferrer" style={{color: '#2c6ecb'}}>
                                {canale.url_sito}
                              </a>
                            </InlineStack>
                          )}
                          {canale.nome_utente && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" tone="subdued" variant="bodySm">Utente:</Text>
                              <Text as="span">{canale.nome_utente}</Text>
                              <Tooltip content="Copia">
                                <Button 
                                  icon={ClipboardIcon} 
                                  variant="plain" 
                                  size="slim"
                                  onClick={() => copyToClipboard(canale.nome_utente!, 'Utente')} 
                                />
                              </Tooltip>
                            </InlineStack>
                          )}
                          {canale.password && (
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" tone="subdued" variant="bodySm">Password:</Text>
                              <Text as="span">
                                {showPasswords.has(canale.id) ? canale.password : '••••••••'}
                              </Text>
                              <Tooltip content={showPasswords.has(canale.id) ? 'Nascondi' : 'Mostra'}>
                                <Button 
                                  icon={showPasswords.has(canale.id) ? HideIcon : ViewIcon} 
                                  variant="plain" 
                                  size="slim"
                                  onClick={() => toggleShowPassword(canale.id)} 
                                />
                              </Tooltip>
                              <Tooltip content="Copia">
                                <Button 
                                  icon={ClipboardIcon} 
                                  variant="plain" 
                                  size="slim"
                                  onClick={() => copyToClipboard(canale.password!, 'Password')} 
                                />
                              </Tooltip>
                            </InlineStack>
                          )}
                        </>
                      )}
                      
                      {canale.tipo === 'indirizzo' && canale.indirizzo && (
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" tone="subdued" variant="bodySm">Indirizzo:</Text>
                          <Text as="span">{canale.indirizzo}</Text>
                          <Tooltip content="Apri in Maps">
                            <Button 
                              icon={LocationIcon} 
                              variant="plain" 
                              size="slim"
                              onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(canale.indirizzo!)}`, '_blank')} 
                            />
                          </Tooltip>
                        </InlineStack>
                      )}
                      
                      {canale.note && (
                        <InlineStack gap="200" blockAlign="start">
                          <Text as="span" tone="subdued" variant="bodySm">Note:</Text>
                          <Text as="span">{canale.note}</Text>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>
                </Collapsible>
              </Box>
            ))}
          </BlockStack>
        )}
      </LegacyCard>

      {/* Modal Creazione */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Aggiungi Credenziale o Sede"
        primaryAction={{ content: 'Salva', onAction: handleCreate }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setIsModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Tipo"
              options={TIPO_OPTIONS}
              value={newCanale.tipo}
              onChange={(v) => setNewCanale({ ...newCanale, tipo: v as any })}
            />
            <TextField
              label="Nome (es. 'Amazon Business', 'Sede Milano')"
              value={newCanale.nome}
              onChange={(v) => setNewCanale({ ...newCanale, nome: v })}
              autoComplete="off"
              requiredIndicator
            />
            
            {newCanale.tipo === 'accesso' && (
              <>
                <TextField
                  label="URL"
                  value={newCanale.url_sito}
                  onChange={(v) => setNewCanale({ ...newCanale, url_sito: v })}
                  autoComplete="off"
                  placeholder="https://..."
                />
                <TextField
                  label="Nome Utente / Email"
                  value={newCanale.nome_utente}
                  onChange={(v) => setNewCanale({ ...newCanale, nome_utente: v })}
                  autoComplete="off"
                />
                <TextField
                  label="Password"
                  value={newCanale.password}
                  onChange={(v) => setNewCanale({ ...newCanale, password: v })}
                  autoComplete="off"
                  type="password"
                />
              </>
            )}
            
            {newCanale.tipo === 'indirizzo' && (
              <TextField
                label="Indirizzo completo"
                value={newCanale.indirizzo}
                onChange={(v) => setNewCanale({ ...newCanale, indirizzo: v })}
                autoComplete="off"
                multiline={2}
                placeholder="Via Roma 123, 20100 Milano (MI)"
              />
            )}
            
            <TextField
              label="Note"
              value={newCanale.note}
              onChange={(v) => setNewCanale({ ...newCanale, note: v })}
              autoComplete="off"
              multiline={2}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </>
  );
};

export default ClienteCanali;
