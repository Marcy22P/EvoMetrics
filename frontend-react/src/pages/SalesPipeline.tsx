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
  XSmallIcon,
  ArrowDownIcon
} from '@shopify/polaris-icons';
import { salesApi, type Lead, type PipelineStage, type LeadCreate, type LeadNote, type LeadTag, type PipelineUser, type MonthlyValueResponse } from '../services/salesApi';
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
  const [selectedLeadTagId, setSelectedLeadTagId] = useState<string>('');
  
  // Note strutturate
  const [structuredNotes, setStructuredNotes] = useState<LeadNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  
  // Lead Tags (nuovo sistema)
  const [leadTags, setLeadTags] = useState<LeadTag[]>([]);

  // V2 state
  const [pipelineUsers, setPipelineUsers] = useState<PipelineUser[]>([]);
  const [sourceChannels, setSourceChannels] = useState<string[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyValueResponse | null>(null);
  const [showTracker, setShowTracker] = useState(false);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);

  // Nuovi campi per creazione/editing lead
  const [newDealValue, setNewDealValue] = useState('');
  const [newSourceChannel, setNewSourceChannel] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  // Dettaglio lead editing
  const [editDealValue, setEditDealValue] = useState('');
  const [editSourceChannel, setEditSourceChannel] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');

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
  
  const fetchLeadTags = useCallback(async () => {
    try {
      const data = await salesApi.getLeadTags();
      setLeadTags(data);
    } catch(e) {
      console.error("Errore caricamento lead tags:", e);
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
    fetchLeadTags();
    salesApi.getPipelineUsers().then(setPipelineUsers).catch(() => {});
    salesApi.getSourceChannels().then(d => setSourceChannels(d.channels)).catch(() => {});
    salesApi.getMonthlyValue().then(setMonthlyData).catch(() => {});
  }, [fetchStages, fetchLeads, fetchLeadTags]);

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
    setSelectedLeadTagId(lead.lead_tag_id ? String(lead.lead_tag_id) : '');
    setStructuredNotes(lead.structured_notes || []);
    setNewNoteContent('');
    setEditingNoteId(null);
    setEditingNoteContent('');
    
    // V2 fields
    setEditDealValue(lead.deal_value?.toString() || '');
    setEditSourceChannel(lead.source_channel || '');
    setEditAssignedTo(lead.assigned_to_user_id || '');
    
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
        lead_tag_id: selectedLeadTagId ? parseInt(selectedLeadTagId) : null,
        // V2 fields
        deal_value: editDealValue ? parseFloat(editDealValue) : null,
        source_channel: editSourceChannel || null,
        assigned_to_user_id: editAssignedTo || null,
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
        notes: newLeadNotes || undefined,
        // V2 fields
        source_channel: newSourceChannel || undefined,
        deal_value: newDealValue ? parseFloat(newDealValue) : undefined,
        assigned_to_user_id: newAssignedTo || undefined,
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
    // V2 fields
    setNewDealValue('');
    setNewSourceChannel('');
    setNewAssignedTo('');
  };

  const handleSettingsUpdate = () => {
    fetchStages();
    fetchLeads();
    fetchLeadTags();
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
      
      // Filter by month (V2)
      if (monthFilter) {
        const leadDate = new Date(lead.created_at);
        if (leadDate.getMonth() + 1 !== monthFilter) return false;
      }

      return true;
    });
  }, [leads, queryValue, stageFilter, monthFilter]);

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
            {/* Riga 1: Titolo (Azienda) + Badge Tag */}
            <InlineStack align="space-between" blockAlign="start">
              <Text variant="headingSm" as="h4" truncate fontWeight={lead.azienda ? 'bold' : 'regular'}>
                {getLeadTitle(lead)}
              </Text>
              {lead.lead_tag ? (
                lead.lead_tag.hex_color ? (
                  <span style={{ 
                    backgroundColor: lead.lead_tag.hex_color, 
                    color: '#fff', 
                    padding: '2px 8px', 
                    borderRadius: '10px', 
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}>
                    {lead.lead_tag.label}
                  </span>
                ) : (
                  <Badge tone={lead.lead_tag.color as any} size="small">
                    {lead.lead_tag.label}
                  </Badge>
                )
              ) : (
                <Badge tone={lead.source === 'clickfunnels' ? 'info' : 'success'} size="small">
                  {lead.source === 'clickfunnels' ? 'CF' : 'M'}
                </Badge>
              )}
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

            {/* V2 Info: Value, Channel, Assigned */}
            <InlineStack gap="200" wrap>
              {lead.deal_value && (
                <Badge tone="success">{`€ ${lead.deal_value.toLocaleString('it-IT')}`}</Badge>
              )}
              {lead.source_channel && (
                <Badge tone="new">{lead.source_channel}</Badge>
              )}
              {lead.assigned_to_user && (
                <Tooltip content={`Assegnato a: ${lead.assigned_to_user.username}`}>
                  <div style={{width: 24, height: 24, borderRadius: '50%', background: '#e1e3e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px'}}>
                    {lead.assigned_to_user.username.substring(0, 2).toUpperCase()}
                  </div>
                </Tooltip>
              )}
            </InlineStack>
            
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
            {lead.deal_value ? `€ ${lead.deal_value.toLocaleString('it-IT')}` : '-'}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {lead.source_channel || '-'}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {lead.assigned_to_user?.username || '-'}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {stage && <Badge tone={stage.color as any}>{stage.label}</Badge>}
          </IndexTable.Cell>
          <IndexTable.Cell>
            {lead.lead_tag ? (
              lead.lead_tag.hex_color ? (
                <span style={{ 
                  backgroundColor: lead.lead_tag.hex_color, 
                  color: '#fff', 
                  padding: '2px 8px', 
                  borderRadius: '10px', 
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}>
                  {lead.lead_tag.label}
                </span>
              ) : (
                <Badge tone={lead.lead_tag.color as any} size="small">
                  {lead.lead_tag.label}
                </Badge>
              )
            ) : (
              <Text as="span" tone="subdued">-</Text>
            )}
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
              { title: 'Valore' },
              { title: 'Canale' },
              { title: 'Assegnato a' },
              { title: 'Stage' },
              { title: 'Tag' },
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

  // Monthly Value Tracker
  const renderMonthlyTracker = () => {
    if (!monthlyData) return null;

    return (
      <Box paddingBlockEnd="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingSm" as="h3">Performance {monthlyData.year}</Text>
            <Button size="slim" onClick={() => setShowTracker(!showTracker)}>
              {showTracker ? 'Nascondi Tracker' : 'Mostra Tracker'}
            </Button>
          </InlineStack>
          
          {showTracker && (
            <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
              <InlineStack gap="300" wrap={false}>
                {monthlyData.months.map(m => (
                  <div 
                    key={m.month} 
                    onClick={() => setMonthFilter(monthFilter === m.month ? null : m.month)}
                    style={{ 
                      minWidth: '140px', 
                      cursor: 'pointer',
                      opacity: monthFilter && monthFilter !== m.month ? 0.5 : 1,
                      transition: 'opacity 0.2s'
                    }}
                  >
                    <Card padding="300">
                      <BlockStack gap="100">
                        <Text variant="headingXs" as="h4">{m.label}</Text>
                        <Text variant="headingMd" as="p">€ {m.total_value.toLocaleString('it-IT')}</Text>
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyXs" tone="subdued">{`${m.leads_count} leads`}</Text>
                          {m.delta_pct !== null && (
                            <Text as="span" variant="bodyXs" tone={m.delta_pct >= 0 ? 'success' : 'critical'}>
                              {`${m.delta_pct > 0 ? '+' : ''}${m.delta_pct}%`}
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  </div>
                ))}
              </InlineStack>
            </div>
          )}
        </BlockStack>
      </Box>
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
        { content: 'Esporta CSV overview', icon: ArrowDownIcon, onAction: async () => {
          try {
            await salesApi.downloadLeadsCsv();
            toast.success('CSV scaricato');
          } catch {
            toast.error('Errore export CSV');
          }
        }},
        ...(canEdit ? [{ content: 'Configura Pipeline', icon: SettingsIcon, onAction: () => setShowSettings(true) }] : [])
      ]}
    >
      {renderMonthlyTracker()}
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
            
            {/* V2 Fields */}
            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField 
                  label="Valore Opportunità (€)" 
                  type="number" 
                  value={editDealValue} 
                  onChange={setEditDealValue} 
                  autoComplete="off" 
                  disabled={!canEdit}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Canale Fonte"
                  options={[{label: 'Seleziona...', value: ''}, ...sourceChannels.map(c => ({label: c, value: c}))]}
                  value={editSourceChannel}
                  onChange={setEditSourceChannel}
                  disabled={!canEdit}
                />
              </div>
            </InlineStack>

            <Select
              label="Assegna a"
              options={[{label: 'Nessuno', value: ''}, ...pipelineUsers.map(u => ({label: u.nome && u.cognome ? `${u.nome} ${u.cognome}` : u.username, value: u.id}))]}
              value={editAssignedTo}
              onChange={setEditAssignedTo}
              disabled={!canEdit}
            />
            
            {/* TAG LEAD */}
            <Select
              label="Tag"
              options={[
                { label: 'Nessun tag', value: '' },
                ...leadTags.map(t => ({ label: t.label, value: String(t.id) }))
              ]}
              value={selectedLeadTagId}
              onChange={setSelectedLeadTagId}
              disabled={!canEdit}
              helpText="Assegna un tag a questo lead"
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
            
            {/* V2 Fields */}
            <InlineStack gap="400">
              <div style={{ flex: 1 }}>
                <TextField 
                  label="Valore (€)" 
                  type="number" 
                  value={newDealValue} 
                  onChange={setNewDealValue} 
                  autoComplete="off" 
                  placeholder="0.00" 
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Canale Fonte"
                  options={[{label: 'Seleziona...', value: ''}, ...sourceChannels.map(c => ({label: c, value: c}))]}
                  value={newSourceChannel}
                  onChange={setNewSourceChannel}
                />
              </div>
            </InlineStack>
            
            <Select
              label="Assegna a"
              options={[{label: 'Nessuno', value: ''}, ...pipelineUsers.map(u => ({label: u.nome && u.cognome ? `${u.nome} ${u.cognome}` : u.username, value: u.id}))]}
              value={newAssignedTo}
              onChange={setNewAssignedTo}
            />

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

      {/* Settings Modal (include anche la gestione Tag) */}
      <PipelineSettingsModal open={showSettings} onClose={() => setShowSettings(false)} onUpdate={handleSettingsUpdate} />
    </Page>
  );
};

export default SalesPipeline;
