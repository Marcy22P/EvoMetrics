import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  Text,
  Badge,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Icon,
  Modal,
  TextField,
  Select,
  Spinner
} from '@shopify/polaris';
import {
  PhoneIcon,
  ArrowRightIcon,
  SettingsIcon,
  PlusIcon,
  ArrowLeftIcon
} from '@shopify/polaris-icons';
import { salesApi, type Lead, type PipelineStage, type LeadCreate } from '../services/salesApi';
import { PipelineSettingsModal } from '../components/sales/PipelineSettingsModal';
import toast from 'react-hot-toast';

const SalesPipeline: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  
  // Modale Edit/Dettaglio
  const [showModal, setShowModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStage, setEditStage] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Modale Creazione Lead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadFirstName, setNewLeadFirstName] = useState('');
  const [newLeadLastName, setNewLeadLastName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadStage, setNewLeadStage] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');

  // Modale Settings
  const [showSettings, setShowSettings] = useState(false);

  // Drag & Drop State
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStageKey, setDragOverStageKey] = useState<string | null>(null);

  const fetchStages = useCallback(async () => {
    try {
      const data = await salesApi.getStages();
      setStages(data);
    } catch(e) {
      toast.error("Errore caricamento stage");
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const data = await salesApi.getLeads();
      setLeads(data);
    } catch (error) {
      console.error(error);
      toast.error('Errore caricamento pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStages().then(() => fetchLeads());
  }, [fetchStages, fetchLeads]);

  const handleMoveStage = async (lead: Lead, newStage: string) => {
    const originalStage = lead.stage;
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage } : l));

    try {
      await salesApi.updateLead(lead.id, { stage: newStage });
      toast.success('Lead spostato');
    } catch (e) {
      toast.error('Errore spostamento');
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: originalStage } : l));
    }
  };

  const handleOpenModal = (lead: Lead) => {
    setSelectedLead(lead);
    setEditNotes(lead.notes || '');
    setEditStage(lead.stage);
    setEditFirstName(lead.first_name || '');
    setEditLastName(lead.last_name || '');
    setEditPhone(lead.phone || '');
    setShowModal(true);
  };

  const handleSaveLead = async () => {
    if (!selectedLead) return;
    try {
      await salesApi.updateLead(selectedLead.id, { 
        notes: editNotes, 
        stage: editStage,
        first_name: editFirstName,
        last_name: editLastName,
        phone: editPhone
      });
      toast.success('Lead aggiornato');
      setShowModal(false);
      fetchLeads();
    } catch (e) {
      toast.error('Errore salvataggio');
    }
  };

  const handleDeleteLead = async () => {
    if (!selectedLead) return;
    if (!confirm(`Eliminare definitivamente il lead ${selectedLead.email}?`)) return;
    try {
      await salesApi.deleteLead(selectedLead.id);
      toast.success('Lead eliminato');
      setShowModal(false);
      fetchLeads();
    } catch (e) {
      toast.error('Errore eliminazione');
    }
  };

  const handleCreateLead = async () => {
    if (!newLeadEmail) {
      toast.error('Email obbligatoria');
      return;
    }
    try {
      const leadData: LeadCreate = {
        email: newLeadEmail,
        first_name: newLeadFirstName || undefined,
        last_name: newLeadLastName || undefined,
        phone: newLeadPhone || undefined,
        stage: newLeadStage || undefined,
        notes: newLeadNotes || undefined
      };
      await salesApi.createLead(leadData);
      toast.success('Lead creato!');
      setShowCreateModal(false);
      resetCreateForm();
      fetchLeads();
    } catch (e: any) {
      toast.error(e.message || 'Errore creazione lead');
    }
  };

  const resetCreateForm = () => {
    setNewLeadEmail('');
    setNewLeadFirstName('');
    setNewLeadLastName('');
    setNewLeadPhone('');
    setNewLeadStage('');
    setNewLeadNotes('');
  };

  const handleSettingsUpdate = () => {
    fetchStages();
    fetchLeads();
  };

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, leadId: string) => {
    setDraggingLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageKey(stageKey);
  };

  const handleDragLeave = () => {
    setDragOverStageKey(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetStageKey: string) => {
    e.preventDefault();
    setDragOverStageKey(null);
    const leadId = e.dataTransfer.getData('text/plain');
    const leadToMove = leads.find(l => l.id === leadId);

    if (leadToMove && leadToMove.stage !== targetStageKey) {
      handleMoveStage(leadToMove, targetStageKey);
    }
    setDraggingLeadId(null);
  };

  const handleDragEnd = () => {
    setDraggingLeadId(null);
    setDragOverStageKey(null);
  };

  const renderColumn = (stage: PipelineStage) => {
    const stageLeads = leads.filter(l => l.stage === stage.key);
    const isDragOver = dragOverStageKey === stage.key;

    return (
      <div 
        key={stage.key} 
        style={{ 
          flex: '0 0 300px', 
          minWidth: '300px',
          transition: 'background-color 0.2s',
          backgroundColor: isDragOver ? 'var(--p-color-bg-surface-info-active)' : undefined,
          borderRadius: 'var(--p-border-radius-200)'
        }}
        onDragOver={(e) => handleDragOver(e, stage.key)}
        onDrop={(e) => handleDrop(e, stage.key)}
        onDragLeave={handleDragLeave}
      >
        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text variant="headingSm" as="h3">{stage.label}</Text>
              <Badge tone={stage.color as any}>{stageLeads.length.toString()}</Badge>
            </InlineStack>
            
            <div style={{ minHeight: '400px' }}>
              <BlockStack gap="300">
                {stageLeads.map(lead => (
                  <div 
                    key={lead.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleOpenModal(lead)}
                    style={{ 
                      cursor: 'grab',
                      opacity: draggingLeadId === lead.id ? 0.5 : 1,
                      transition: 'opacity 0.2s'
                    }}
                  >
                    <Card>
                      <BlockStack gap="200">
                        {/* Header: Nome e Badge */}
                        <InlineStack align="space-between" blockAlign="center" wrap={false}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="bodyMd" fontWeight="bold" as="h4" truncate>
                              {lead.first_name || lead.email.split('@')[0]} {lead.last_name || ''}
                            </Text>
                          </div>
                          <Badge tone={lead.source === 'clickfunnels' ? 'info' : 'success'} size="small">
                            {lead.source === 'clickfunnels' ? 'CF' : 'Manual'}
                          </Badge>
                        </InlineStack>
                        
                        {/* Email */}
                        <Text variant="bodySm" tone="subdued" as="p" truncate>
                          {lead.email}
                        </Text>
                        
                        {/* Telefono */}
                        {lead.phone && (
                          <Box paddingBlockStart="050">
                            <InlineStack gap="100" align="start" blockAlign="center">
                              <Box paddingBlockStart="025">
                                <Icon source={PhoneIcon} tone="subdued" />
                              </Box>
                              <Text variant="bodySm" as="span" truncate>
                                {lead.phone}
                              </Text>
                            </InlineStack>
                          </Box>
                        )}
                        
                        {/* Pulsanti Navigazione */}
                        <InlineStack align="end" gap="200" blockAlign="center">
                          {(() => {
                            const currentStageIndex = stages.findIndex(s => s.key === stage.key);
                            const prevStage = stages[currentStageIndex - 1];
                            const nextStage = stages[currentStageIndex + 1];
                            
                            return (
                              <>
                                <div onClick={(e) => e.stopPropagation()}>
                                  {prevStage ? (
                                    <Button 
                                      icon={ArrowLeftIcon} 
                                      size="slim" 
                                      onClick={() => handleMoveStage(lead, prevStage.key)}
                                    />
                                  ) : (
                                    <div style={{ width: '28px', height: '28px' }} />
                                  )}
                                </div>
                                <div onClick={(e) => e.stopPropagation()}>
                                  {nextStage ? (
                                    <Button 
                                      icon={ArrowRightIcon} 
                                      size="slim" 
                                      onClick={() => handleMoveStage(lead, nextStage.key)}
                                    />
                                  ) : (
                                    <div style={{ width: '28px', height: '28px' }} />
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', opacity: 0.5 }}>
                    <Text variant="bodySm" as="p">Nessun lead</Text>
                  </div>
                )}
              </BlockStack>
            </div>
          </BlockStack>
        </Box>
      </div>
    );
  };

  if (loading && stages.length === 0) {
    return (
      <Page title="Sales Pipeline">
        <div style={{display:'flex', justifyContent:'center', paddingTop:'50px'}}>
          <Spinner size="large"/>
        </div>
      </Page>
    );
  }

  return (
    <Page 
      title="Sales Pipeline" 
      fullWidth
      primaryAction={{
        content: 'Nuovo Lead',
        icon: PlusIcon,
        onAction: () => setShowCreateModal(true)
      }}
      secondaryActions={[
        { content: 'Ricarica', onAction: fetchLeads },
        { content: 'Configura Pipeline', icon: SettingsIcon, onAction: () => setShowSettings(true) }
      ]}
    >
      <Card padding="0">
        <Box padding="400">
          <div style={{ overflowX: 'auto', overflowY: 'hidden', overscrollBehavior: 'contain' }}>
            <div style={{ display: 'flex', gap: '16px', paddingBottom: '16px' }}>
              {stages.map(stage => renderColumn(stage))}
            </div>
          </div>
        </Box>
      </Card>

      {/* Modal Dettaglio/Modifica Lead */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`Lead: ${selectedLead?.email}`}
        primaryAction={{ content: 'Salva Modifiche', onAction: handleSaveLead }}
        secondaryActions={[{ content: 'Elimina Lead', destructive: true, onAction: handleDeleteLead }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {/* Cambio Stage Rapido */}
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text variant="headingXs" as="h4">Sposta in Stage</Text>
                <InlineStack gap="200" wrap>
                  {stages.map((s, idx) => {
                    const currentIdx = stages.findIndex(st => st.key === editStage);
                    const isCurrentStage = s.key === editStage;
                    const isPrev = idx === currentIdx - 1;
                    const isNext = idx === currentIdx + 1;
                    
                    return (
                      <Button
                        key={s.key}
                        size="slim"
                        variant={isCurrentStage ? 'primary' : 'secondary'}
                        icon={isPrev ? ArrowLeftIcon : isNext ? ArrowRightIcon : undefined}
                        onClick={() => setEditStage(s.key)}
                        disabled={isCurrentStage}
                      >
                        {s.label}
                      </Button>
                    );
                  })}
                </InlineStack>
              </BlockStack>
            </Box>

            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField label="Nome" value={editFirstName} onChange={setEditFirstName} autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Cognome" value={editLastName} onChange={setEditLastName} autoComplete="off" />
              </div>
            </InlineStack>
            
            <TextField label="Email" value={selectedLead?.email || ''} disabled autoComplete="off" helpText="L'email non può essere modificata" />
            <TextField label="Telefono" value={editPhone} onChange={setEditPhone} autoComplete="off" />
            <TextField label="Note Interne" value={editNotes} onChange={setEditNotes} multiline={4} autoComplete="off" placeholder="Aggiungi note sul lead..." />
            
            {selectedLead?.clickfunnels_data && Object.keys(selectedLead.clickfunnels_data).length > 0 && (
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <Text variant="headingXs" as="h4">Dati ClickFunnels</Text>
                  <pre style={{fontSize: '11px', overflow: 'auto', maxHeight: '150px'}}>
                    {JSON.stringify(selectedLead.clickfunnels_data, null, 2)}
                  </pre>
                </BlockStack>
              </Box>
            )}

            <Box paddingBlockStart="200">
              <Text variant="bodySm" tone="subdued" as="p">
                Fonte: {selectedLead?.source || 'N/A'} • Creato: {selectedLead?.created_at ? new Date(selectedLead.created_at).toLocaleDateString('it-IT') : 'N/A'}
              </Text>
            </Box>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Modal Creazione Lead */}
      <Modal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetCreateForm(); }}
        title="Nuovo Lead"
        primaryAction={{ content: 'Crea Lead', onAction: handleCreateLead }}
        secondaryActions={[{ content: 'Annulla', onAction: () => { setShowCreateModal(false); resetCreateForm(); }}]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField label="Email" type="email" value={newLeadEmail} onChange={setNewLeadEmail} autoComplete="off" requiredIndicator placeholder="email@esempio.com" />
            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField label="Nome" value={newLeadFirstName} onChange={setNewLeadFirstName} autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Cognome" value={newLeadLastName} onChange={setNewLeadLastName} autoComplete="off" />
              </div>
            </InlineStack>
            <TextField label="Telefono" value={newLeadPhone} onChange={setNewLeadPhone} autoComplete="off" placeholder="+39 ..." />
            <Select
              label="Stage Iniziale"
              options={[
                { label: 'Primo stage (default)', value: '' },
                ...stages.map(s => ({ label: s.label, value: s.key }))
              ]}
              value={newLeadStage}
              onChange={setNewLeadStage}
            />
            <TextField label="Note" value={newLeadNotes} onChange={setNewLeadNotes} multiline={3} autoComplete="off" placeholder="Note iniziali sul lead..." />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Settings Modal */}
      <PipelineSettingsModal open={showSettings} onClose={() => setShowSettings(false)} onUpdate={handleSettingsUpdate} />
    </Page>
  );
};

export default SalesPipeline;
