import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Spinner,
  Tabs,
  IndexTable,
  useIndexResourceState,
  Filters,
  EmptyState,
  Tooltip
} from '@shopify/polaris';
import {
  ArrowRightIcon,
  SettingsIcon,
  PlusIcon,
  ArrowLeftIcon,
  PersonIcon,
  EmailIcon,
  PhoneIcon,
  DeleteIcon,
  EditIcon,
  NoteIcon,
  CheckIcon,
  XSmallIcon
} from '@shopify/polaris-icons';
import { salesApi, type Lead, type PipelineStage, type LeadCreate, type LeadNote, type ResponseStatusOption } from '../services/salesApi';
import { PipelineSettingsModal } from '../components/sales/PipelineSettingsModal';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

const SalesPipeline: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales:write');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  
  // Tab state: 0 = Pipeline view, 1 = List view
  const [selectedTab, setSelectedTab] = useState(0);
  
  // Modale Edit/Dettaglio
  const [showModal, setShowModal] = useState(false);
  const [editNotes, setEditNotes] = useState(''); // Legacy
  const [editStage, setEditStage] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAzienda, setEditAzienda] = useState('');
  const [editResponseStatus, setEditResponseStatus] = useState('');
  
  // Note strutturate
  const [structuredNotes, setStructuredNotes] = useState<LeadNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [responseStatuses, setResponseStatuses] = useState<ResponseStatusOption[]>([]);

  // Modale Creazione Lead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLeadEmail, setNewLeadEmail] = useState('');
  const [newLeadFirstName, setNewLeadFirstName] = useState('');
  const [newLeadLastName, setNewLeadLastName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadAzienda, setNewLeadAzienda] = useState('');
  const [newLeadStage, setNewLeadStage] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');

  // Modale Settings
  const [showSettings, setShowSettings] = useState(false);

  // Drag & Drop State
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStageKey, setDragOverStageKey] = useState<string | null>(null);
  
  // List view filters
  const [queryValue, setQueryValue] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');

  const fetchStages = useCallback(async () => {
    try {
      const data = await salesApi.getStages();
      setStages(data);
    } catch(e) {
      toast.error("Errore caricamento stage");
    }
  }, []);
  
  const fetchResponseStatuses = useCallback(async () => {
    try {
      const data = await salesApi.getResponseStatuses();
      setResponseStatuses(data);
    } catch(e) {
      console.error("Errore caricamento response statuses:", e);
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
    fetchResponseStatuses();
  }, [fetchStages, fetchLeads, fetchResponseStatuses]);

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
    setEditAzienda(lead.azienda || '');
    setEditResponseStatus(lead.response_status || 'pending');
    setStructuredNotes(lead.structured_notes || []);
    setNewNoteContent('');
    setEditingNoteId(null);
    setEditingNoteContent('');
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
        phone: editPhone,
        azienda: editAzienda,
        response_status: editResponseStatus as any
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

  // --- GESTIONE NOTE STRUTTURATE ---
  const handleAddNote = async () => {
    if (!selectedLead || !newNoteContent.trim()) return;
    try {
      const result = await salesApi.addNote(selectedLead.id, newNoteContent.trim());
      setStructuredNotes(prev => [...prev, result.note]);
      setNewNoteContent('');
      toast.success('Nota aggiunta');
    } catch (e) {
      toast.error('Errore aggiunta nota');
    }
  };

  const handleUpdateNote = async (noteId: string) => {
    if (!selectedLead || !editingNoteContent.trim()) return;
    try {
      const result = await salesApi.updateNote(selectedLead.id, noteId, editingNoteContent.trim());
      setStructuredNotes(result.notes);
      setEditingNoteId(null);
      setEditingNoteContent('');
      toast.success('Nota aggiornata');
    } catch (e) {
      toast.error('Errore aggiornamento nota');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedLead) return;
    if (!confirm('Eliminare questa nota?')) return;
    try {
      await salesApi.deleteNote(selectedLead.id, noteId);
      setStructuredNotes(prev => prev.filter(n => n.id !== noteId));
      toast.success('Nota eliminata');
    } catch (e) {
      toast.error('Errore eliminazione nota');
    }
  };

  const startEditNote = (note: LeadNote) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent('');
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
        azienda: newLeadAzienda || undefined,
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
    setNewLeadAzienda('');
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

  // Helper per ottenere i dati del lead in modo strutturato
  const getLeadTitle = (lead: Lead): string => {
    // Titolo = SOLO Azienda, mai email
    return lead.azienda || 'Azienda non specificata';
  };

  const getLeadFullName = (lead: Lead): string | null => {
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
    return fullName || null;
  };

  // Stageemap per colori
  const stageMap = useMemo(() => {
    const map = new Map<string, PipelineStage>();
    stages.forEach(s => map.set(s.key, s));
    return map;
  }, [stages]);

  // Filtered leads per list view
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Filter by query
      if (queryValue) {
        const q = queryValue.toLowerCase();
        const matchesQuery = 
          lead.email.toLowerCase().includes(q) ||
          (lead.first_name?.toLowerCase().includes(q)) ||
          (lead.last_name?.toLowerCase().includes(q)) ||
          (lead.azienda?.toLowerCase().includes(q)) ||
          (lead.phone?.includes(q));
        if (!matchesQuery) return false;
      }
      // Filter by stage
      if (stageFilter && lead.stage !== stageFilter) return false;
      return true;
    });
  }, [leads, queryValue, stageFilter]);

  // Index table selection
  const { selectedResources, allResourcesSelected, handleSelectionChange } = 
    useIndexResourceState(filteredLeads.map(l => ({ id: l.id })));

  // Componente Card Lead pulito
  const LeadCard: React.FC<{ lead: Lead; stage: PipelineStage }> = ({ lead, stage }) => {
    const currentStageIndex = stages.findIndex(s => s.key === stage.key);
    const prevStage = stages[currentStageIndex - 1];
    const nextStage = stages[currentStageIndex + 1];
    const fullName = getLeadFullName(lead);

    return (
      <div 
        draggable={canEdit}
        onDragStart={canEdit ? (e) => handleDragStart(e, lead.id) : undefined}
        onDragEnd={canEdit ? handleDragEnd : undefined}
        onClick={() => handleOpenModal(lead)}
        style={{ 
          cursor: canEdit ? 'grab' : 'pointer',
          opacity: draggingLeadId === lead.id ? 0.5 : 1,
          transition: 'opacity 0.15s ease'
        }}
      >
        <Card padding="300">
          <BlockStack gap="150">
            {/* Riga 1: Titolo (Azienda) + Badge Fonte */}
            <InlineStack align="space-between" blockAlign="start">
              <Text variant="headingSm" as="h4" truncate fontWeight={lead.azienda ? 'bold' : 'regular'}>
                {getLeadTitle(lead)}
              </Text>
              <Badge tone={lead.source === 'clickfunnels' ? 'info' : 'success'} size="small">
                {lead.source === 'clickfunnels' ? 'CF' : 'M'}
              </Badge>
            </InlineStack>
            
            {/* Riga 2: Nome e Cognome (se presente) */}
            {fullName && (
              <InlineStack gap="100" blockAlign="center">
                <Box><Icon source={PersonIcon} tone="subdued" /></Box>
                <Text variant="bodySm" as="span" tone="subdued">{fullName}</Text>
              </InlineStack>
            )}
            
            {/* Riga 3: Email */}
            <InlineStack gap="100" blockAlign="center">
              <Box><Icon source={EmailIcon} tone="subdued" /></Box>
              <Text variant="bodySm" as="span" tone="subdued" truncate>{lead.email}</Text>
            </InlineStack>
            
            {/* Riga 4: Telefono (se presente) */}
            {lead.phone && (
              <InlineStack gap="100" blockAlign="center">
                <Box><Icon source={PhoneIcon} tone="subdued" /></Box>
                <Text variant="bodySm" as="span" tone="subdued">{lead.phone}</Text>
              </InlineStack>
            )}
            
            {/* Pulsanti Navigazione Stage - solo se ha permessi */}
            {canEdit && (
              <Box paddingBlockStart="100">
                <InlineStack align="end" gap="200">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button 
                      icon={ArrowLeftIcon} 
                      size="slim"
                      variant="tertiary"
                      disabled={!prevStage}
                      onClick={() => prevStage && handleMoveStage(lead, prevStage.key)}
                    />
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button 
                      icon={ArrowRightIcon} 
                      size="slim"
                      variant="tertiary"
                      disabled={!nextStage}
                      onClick={() => nextStage && handleMoveStage(lead, nextStage.key)}
                    />
                  </div>
                </InlineStack>
              </Box>
            )}
          </BlockStack>
        </Card>
      </div>
    );
  };

  const renderColumn = (stage: PipelineStage) => {
    const stageLeads = leads.filter(l => l.stage === stage.key);
    const isDragOver = dragOverStageKey === stage.key;

    return (
      <div 
        key={stage.key} 
        style={{ 
          flex: '0 0 280px', 
          minWidth: '280px',
          maxWidth: '280px',
          display: 'flex',
          flexDirection: 'column'
        }}
        onDragOver={(e) => handleDragOver(e, stage.key)}
        onDrop={(e) => handleDrop(e, stage.key)}
        onDragLeave={handleDragLeave}
      >
        <Box 
          background={isDragOver ? "bg-surface-info-active" : "bg-surface-secondary"} 
          padding="300" 
          borderRadius="200"
        >
          <BlockStack gap="300">
            {/* Header Stage */}
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingSm" as="h3">{stage.label}</Text>
              <Badge tone={stage.color as any}>{stageLeads.length.toString()}</Badge>
            </InlineStack>
            
            {/* Container scrollabile per le card */}
            <div style={{ 
              maxHeight: 'calc(100vh - 300px)', 
              overflowY: 'auto',
              overflowX: 'hidden'
            }}>
              <BlockStack gap="200">
                {stageLeads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} stage={stage} />
                ))}
                {stageLeads.length === 0 && (
                  <Box padding="400">
                    <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                      Nessun lead
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </div>
          </BlockStack>
        </Box>
      </div>
    );
  };

  // List View
  const renderListView = () => {
    const rowMarkup = filteredLeads.map((lead, index) => {
      const stage = stageMap.get(lead.stage);
      const fullName = getLeadFullName(lead);
      
      return (
        <IndexTable.Row
          id={lead.id}
          key={lead.id}
          selected={selectedResources.includes(lead.id)}
          position={index}
          onClick={() => handleOpenModal(lead)}
        >
          <IndexTable.Cell>
            <Tooltip content={getLeadTitle(lead)} dismissOnMouseOut>
              <div style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Text variant="bodyMd" fontWeight="bold" as="span">
                  {getLeadTitle(lead)}
                </Text>
              </div>
            </Tooltip>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <div style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Text variant="bodySm" as="span">{fullName || '-'}</Text>
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <div style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Text variant="bodySm" as="span">{lead.email}</Text>
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodySm" as="span">{lead.phone || '-'}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {stage && <Badge tone={stage.color as any}>{stage.label}</Badge>}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={lead.source === 'clickfunnels' ? 'info' : 'success'} size="small">
              {lead.source === 'clickfunnels' ? 'ClickFunnel' : 'Manuale'}
            </Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text variant="bodySm" tone="subdued" as="span">
              {new Date(lead.created_at).toLocaleDateString('it-IT')}
            </Text>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    });

    return (
      <Card padding="0">
        <Box padding="400">
          <Filters
            queryValue={queryValue}
            queryPlaceholder="Cerca per azienda, nome, email..."
            onQueryChange={setQueryValue}
            onQueryClear={() => setQueryValue('')}
            filters={[
              {
                key: 'stage',
                label: 'Stage',
                filter: (
                  <Select
                    label="Stage"
                    labelHidden
                    options={[
                      { label: 'Tutti gli stage', value: '' },
                      ...stages.map(s => ({ label: s.label, value: s.key }))
                    ]}
                    value={stageFilter}
                    onChange={setStageFilter}
                  />
                ),
                shortcut: true
              }
            ]}
            onClearAll={() => {
              setQueryValue('');
              setStageFilter('');
            }}
          />
        </Box>
        
        {filteredLeads.length === 0 ? (
          <EmptyState
            heading="Nessun lead trovato"
            image=""
          >
            <p>Modifica i filtri o crea un nuovo lead.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: 'lead', plural: 'leads' }}
            itemCount={filteredLeads.length}
            selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
            onSelectionChange={handleSelectionChange}
            headings={[
              { title: 'Azienda' },
              { title: 'Nome' },
              { title: 'Email' },
              { title: 'Telefono' },
              { title: 'Stage' },
              { title: 'Fonte' },
              { title: 'Data' }
            ]}
            selectable={false}
          >
            {rowMarkup}
          </IndexTable>
        )}
      </Card>
    );
  };

  // Pipeline View
  const renderPipelineView = () => (
    <Card padding="0">
      <Box padding="400">
        <div style={{ 
          overflowX: 'auto', 
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch'
        }}>
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            paddingBottom: '8px',
            minWidth: 'max-content'
          }}>
            {stages.map(stage => renderColumn(stage))}
          </div>
        </div>
      </Box>
    </Card>
  );

  if (loading && stages.length === 0) {
    return (
      <Page title="Sales Pipeline">
        <div style={{display:'flex', justifyContent:'center', paddingTop:'50px'}}>
          <Spinner size="large"/>
        </div>
      </Page>
    );
  }

  const tabs = [
    { id: 'pipeline', content: `Pipeline (${leads.length})`, panelID: 'pipeline-panel' },
    { id: 'list', content: 'Leads List', panelID: 'list-panel' }
  ];

  return (
    <Page 
      title="Sales Pipeline" 
      fullWidth
      primaryAction={canEdit ? {
        content: 'Nuovo Lead',
        icon: PlusIcon,
        onAction: () => setShowCreateModal(true)
      } : undefined}
      secondaryActions={[
        { content: 'Ricarica', onAction: fetchLeads },
        ...(canEdit ? [{ content: 'Configura Pipeline', icon: SettingsIcon, onAction: () => setShowSettings(true) }] : [])
      ]}
    >
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 ? renderPipelineView() : renderListView()}
        </Box>
      </Tabs>

      {/* Modal Dettaglio/Modifica Lead */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`Lead: ${selectedLead?.azienda || selectedLead?.email}`}
        primaryAction={canEdit ? { content: 'Salva Modifiche', onAction: handleSaveLead } : undefined}
        secondaryActions={canEdit ? [{ content: 'Elimina Lead', destructive: true, onAction: handleDeleteLead }] : undefined}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {/* Cambio Stage Rapido - solo se può modificare */}
            {canEdit && (
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
            )}

            <TextField 
              label="Nome Azienda" 
              value={editAzienda} 
              onChange={setEditAzienda} 
              autoComplete="off" 
              placeholder="Nome dell'azienda..."
              disabled={!canEdit}
            />

            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField label="Nome" value={editFirstName} onChange={setEditFirstName} autoComplete="off" disabled={!canEdit} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Cognome" value={editLastName} onChange={setEditLastName} autoComplete="off" disabled={!canEdit} />
              </div>
            </InlineStack>
            
            <TextField label="Email" value={selectedLead?.email || ''} disabled autoComplete="off" helpText="L'email non può essere modificata" />
            <TextField label="Telefono" value={editPhone} onChange={setEditPhone} autoComplete="off" disabled={!canEdit} />
            
            {/* STATO RISPOSTA */}
            <Select
              label="Stato Risposta"
              options={[
                { label: 'Seleziona...', value: '' },
                ...responseStatuses.map(s => ({ label: s.label, value: s.value }))
              ]}
              value={editResponseStatus}
              onChange={setEditResponseStatus}
              disabled={!canEdit}
              helpText="Indica lo stato della risposta del lead"
            />

            {/* NOTE STRUTTURATE */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" align="space-between">
                  <InlineStack gap="100" blockAlign="center">
                    <div style={{ minWidth: '20px' }}><Icon source={NoteIcon} /></div>
                    <Text as="h3" variant="headingSm">Note ({structuredNotes.length})</Text>
                  </InlineStack>
                </InlineStack>

                {/* Lista note esistenti */}
                {structuredNotes.length > 0 && (
                  <BlockStack gap="200">
                    {structuredNotes.map((note) => (
                      <Box key={note.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                        {editingNoteId === note.id ? (
                          <BlockStack gap="200">
                            <TextField
                              label=""
                              labelHidden
                              value={editingNoteContent}
                              onChange={setEditingNoteContent}
                              multiline={2}
                              autoComplete="off"
                            />
                            <InlineStack gap="200">
                              <Button size="slim" icon={CheckIcon} onClick={() => handleUpdateNote(note.id)}>Salva</Button>
                              <Button size="slim" icon={XSmallIcon} onClick={cancelEditNote}>Annulla</Button>
                            </InlineStack>
                          </BlockStack>
                        ) : (
                          <InlineStack gap="200" align="space-between" blockAlign="start">
                            <div style={{ flex: 1 }}>
                              <Text as="p" variant="bodyMd">{note.content}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {new Date(note.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                {note.updated_at && ' (modificata)'}
                              </Text>
                            </div>
                            {canEdit && (
                              <InlineStack gap="100">
                                <Button size="slim" icon={EditIcon} variant="tertiary" onClick={() => startEditNote(note)} />
                                <Button size="slim" icon={DeleteIcon} variant="tertiary" tone="critical" onClick={() => handleDeleteNote(note.id)} />
                              </InlineStack>
                            )}
                          </InlineStack>
                        )}
                      </Box>
                    ))}
                  </BlockStack>
                )}

                {/* Aggiungi nuova nota */}
                {canEdit && (
                  <BlockStack gap="200">
                    <TextField
                      label="Nuova nota"
                      labelHidden
                      value={newNoteContent}
                      onChange={setNewNoteContent}
                      multiline={2}
                      autoComplete="off"
                      placeholder="Scrivi una nota..."
                    />
                    <Button size="slim" icon={PlusIcon} onClick={handleAddNote} disabled={!newNoteContent.trim()}>
                      Aggiungi Nota
                    </Button>
                  </BlockStack>
                )}

                {structuredNotes.length === 0 && !canEdit && (
                  <Text as="p" tone="subdued">Nessuna nota</Text>
                )}
              </BlockStack>
            </Card>

            {/* Note legacy (nascosto se vuoto) */}
            {editNotes && (
              <TextField label="Note Legacy" value={editNotes} onChange={setEditNotes} multiline={2} autoComplete="off" disabled={!canEdit} helpText="Campo legacy - usa le note strutturate sopra" />
            )}
            
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
            <TextField 
              label="Nome Azienda" 
              value={newLeadAzienda} 
              onChange={setNewLeadAzienda} 
              autoComplete="off" 
              placeholder="Nome dell'azienda..."
            />
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
