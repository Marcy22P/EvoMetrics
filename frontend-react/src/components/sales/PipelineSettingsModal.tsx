import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Text,
  Button,
  BlockStack,
  Box,
  InlineStack,
  TextField,
  Select,
  Banner,
  Spinner,
  Tabs,
  Badge
} from '@shopify/polaris';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  DeleteIcon,
  EditIcon,
  PlusIcon,
  CheckIcon,
  XSmallIcon
} from '@shopify/polaris-icons';
import { salesApi, type PipelineStage, type LeadTag } from '../../services/salesApi';
import toast from 'react-hot-toast';

interface PipelineSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const PipelineSettingsModal: React.FC<PipelineSettingsModalProps> = ({ open, onClose, onUpdate }) => {
  // Tab state
  const [selectedTab, setSelectedTab] = useState(0);
  
  // Stages state
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New Stage Form
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newColor, setNewColor] = useState('base');

  // Edit State (Stages)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('');

  // Tags state
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('base');
  const [newTagHexColor, setNewTagHexColor] = useState('');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTagLabel, setEditTagLabel] = useState('');
  const [editTagColor, setEditTagColor] = useState('base');
  const [editTagHexColor, setEditTagHexColor] = useState('');

  const colors = [
    {label: 'Grigio (Base)', value: 'base'},
    {label: 'Blu (Info)', value: 'info'},
    {label: 'Verde (Success)', value: 'success'},
    {label: 'Giallo (Warning)', value: 'warning'},
    {label: 'Rosso (Critical)', value: 'critical'},
    {label: 'Arancione (Attention)', value: 'attention'},
  ];

  const tabs = [
    { id: 'stages', content: 'Stage Pipeline', accessibilityLabel: 'Stage Pipeline' },
    { id: 'tags', content: 'Tag Lead', accessibilityLabel: 'Tag Lead' },
  ];

  const fetchStages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await salesApi.getStages();
      setStages(data);
    } catch (e) {
      toast.error('Errore caricamento stage');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const data = await salesApi.getLeadTags();
      setTags(data);
    } catch (e) {
      toast.error('Errore caricamento tag');
    } finally {
      setLoadingTags(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStages();
      fetchTags();
    }
  }, [open, fetchStages, fetchTags]);

  const handleAdd = async () => {
    if (!newLabel || !newKey) {
      toast.error('Compila tutti i campi');
      return;
    }
    try {
      await salesApi.createStage({
        key: newKey.toLowerCase().replace(/\s+/g, '_'),
        label: newLabel,
        color: newColor,
        index: stages.length,
        is_system: false
      });
      toast.success('Stage aggiunto');
      setNewLabel('');
      setNewKey('');
      setIsAdding(false);
      fetchStages();
      onUpdate();
    } catch (e) {
      toast.error('Errore creazione stage (chiave duplicata?)');
    }
  };

  const handleDelete = async (id: number) => {
    if (stages.length <= 1) {
      toast.error('Non puoi eliminare l\'ultimo stage.');
      return;
    }
    if (!confirm('Sei sicuro? I lead verranno spostati al primo stage disponibile.')) return;
    try {
      const fallback = stages.find(s => s.id !== id);
      await salesApi.deleteStage(id, fallback?.key);
      toast.success('Stage eliminato');
      fetchStages();
      onUpdate();
    } catch (e) {
      toast.error('Errore eliminazione');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newStages = [...stages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newStages.length) return;
    
    [newStages[index], newStages[targetIndex]] = [newStages[targetIndex], newStages[index]];
    setStages(newStages);
    
    try {
      await salesApi.reorderStages(newStages.map(s => s.id));
      onUpdate();
    } catch(e) {
      toast.error("Errore riordinamento");
      fetchStages();
    }
  };

  const handleStartEdit = (stage: PipelineStage) => {
    setEditingId(stage.id);
    setEditLabel(stage.label);
    setEditColor(stage.color);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await salesApi.updateStage(editingId, {
        label: editLabel,
        color: editColor
      });
      setEditingId(null);
      fetchStages();
      onUpdate();
      toast.success("Modificato");
    } catch(e) {
      toast.error("Errore modifica");
    }
  };

  // --- TAG HANDLERS ---
  const handleCreateTag = async () => {
    if (!newTagLabel.trim()) {
      toast.error('Inserisci un nome per il tag');
      return;
    }
    try {
      await salesApi.createLeadTag({
        label: newTagLabel.trim(),
        color: newTagColor,
        hex_color: newTagHexColor || undefined
      });
      toast.success('Tag creato');
      setNewTagLabel('');
      setNewTagColor('base');
      setNewTagHexColor('');
      fetchTags();
      onUpdate();
    } catch (e) {
      toast.error('Errore creazione tag');
    }
  };

  const handleStartEditTag = (tag: LeadTag) => {
    setEditingTagId(tag.id);
    setEditTagLabel(tag.label);
    setEditTagColor(tag.color);
    setEditTagHexColor(tag.hex_color || '');
  };

  const handleSaveEditTag = async () => {
    if (!editingTagId || !editTagLabel.trim()) return;
    try {
      await salesApi.updateLeadTag(editingTagId, {
        label: editTagLabel.trim(),
        color: editTagColor,
        hex_color: editTagHexColor || undefined
      });
      toast.success('Tag aggiornato');
      setEditingTagId(null);
      setEditTagLabel('');
      setEditTagColor('base');
      setEditTagHexColor('');
      fetchTags();
      onUpdate();
    } catch (e) {
      toast.error('Errore aggiornamento tag');
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm('Eliminare questo tag? Verrà rimosso da tutti i lead associati.')) return;
    try {
      await salesApi.deleteLeadTag(tagId);
      toast.success('Tag eliminato');
      fetchTags();
      onUpdate();
    } catch (e) {
      toast.error('Errore eliminazione tag');
    }
  };

  const cancelEditTag = () => {
    setEditingTagId(null);
    setEditTagLabel('');
    setEditTagColor('base');
    setEditTagHexColor('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Impostazioni Pipeline" size="large">
      <Modal.Section>
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          {/* Tab: Stage Pipeline */}
          {selectedTab === 0 && (
            <Box paddingBlockStart="400">
              {loading && <div style={{textAlign:'center'}}><Spinner size="small" /></div>}
              <BlockStack gap="400">
                <Banner tone="info">
                  Riordina gli stage o modifica colori e nomi. Tutti gli stage sono eliminabili.
                </Banner>
                
                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <BlockStack gap="200">
                    {stages.map((stage, i) => (
                      <Box key={stage.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="300" blockAlign="center">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <Button 
                                icon={ArrowUpIcon} 
                                size="slim" 
                                disabled={i === 0} 
                                onClick={() => handleMove(i, 'up')}
                                variant="plain"
                              />
                              <Button 
                                icon={ArrowDownIcon} 
                                size="slim" 
                                disabled={i === stages.length - 1} 
                                onClick={() => handleMove(i, 'down')}
                                variant="plain"
                              />
                            </div>
                            
                            {editingId === stage.id ? (
                              <InlineStack gap="200">
                                <TextField 
                                  label="Nome" 
                                  labelHidden 
                                  value={editLabel} 
                                  onChange={setEditLabel} 
                                  autoComplete="off"
                                />
                                <Select
                                  label="Colore"
                                  labelHidden
                                  options={colors}
                                  value={editColor}
                                  onChange={setEditColor}
                                />
                                <Button variant="primary" onClick={handleSaveEdit}>Salva</Button>
                                <Button onClick={() => setEditingId(null)}>Annulla</Button>
                              </InlineStack>
                            ) : (
                              <BlockStack gap="050">
                                <Text variant="bodyMd" fontWeight="bold" as="span">{stage.label}</Text>
                                <Text variant="bodyXs" tone="subdued" as="span">Key: {stage.key}</Text>
                              </BlockStack>
                            )}
                          </InlineStack>
                          
                          <InlineStack gap="200">
                            {!editingId && (
                              <>
                                <Button icon={EditIcon} onClick={() => handleStartEdit(stage)} />
                                <Button icon={DeleteIcon} tone="critical" onClick={() => handleDelete(stage.id)} />
                              </>
                            )}
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                </div>

                {isAdding ? (
                  <Box background="bg-surface" padding="400" borderColor="border" borderWidth="025" borderRadius="200">
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">Nuovo Stage</Text>
                      <InlineStack gap="300">
                        <TextField 
                          label="Nome Stage" 
                          value={newLabel} 
                          onChange={(v) => { setNewLabel(v); if(!newKey) setNewKey(v.toLowerCase().replace(/\s+/g, '_')); }} 
                          autoComplete="off" 
                        />
                        <TextField 
                          label="Key (Slug)" 
                          value={newKey} 
                          onChange={setNewKey} 
                          autoComplete="off" 
                          helpText="Univoco, usato via API"
                        />
                        <Select label="Colore" options={colors} value={newColor} onChange={setNewColor} />
                      </InlineStack>
                      <InlineStack gap="200">
                        <Button variant="primary" onClick={handleAdd}>Crea Stage</Button>
                        <Button onClick={() => setIsAdding(false)}>Annulla</Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ) : (
                  <Button icon={PlusIcon} fullWidth onClick={() => setIsAdding(true)}>Aggiungi Stage</Button>
                )}
              </BlockStack>
            </Box>
          )}

          {/* Tab: Tag Lead */}
          {selectedTab === 1 && (
            <Box paddingBlockStart="400">
              {loadingTags && <div style={{textAlign:'center'}}><Spinner size="small" /></div>}
              <BlockStack gap="400">
                <Banner tone="info">
                  I tag permettono di categorizzare i lead. Puoi crearli, modificarli o eliminarli.
                </Banner>

                {/* Form per nuovo tag */}
                <Box background="bg-surface" padding="400" borderColor="border" borderWidth="025" borderRadius="200">
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h4">Nuovo Tag</Text>
                    <InlineStack gap="300" blockAlign="end">
                      <div style={{ flex: 2 }}>
                        <TextField 
                          label="Nome Tag" 
                          value={newTagLabel} 
                          onChange={setNewTagLabel} 
                          autoComplete="off"
                          placeholder="Es: Fissato calendly"
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '120px' }}>
                        <Select label="Colore" options={colors} value={newTagColor} onChange={setNewTagColor} />
                      </div>
                      
                      {/* Hex Color Picker */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <Text variant="bodySm" as="span">Custom</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px' }}>
                          <input 
                            type="color" 
                            value={newTagHexColor || '#000000'} 
                            onChange={(e) => setNewTagHexColor(e.target.value)}
                            style={{ width: '36px', height: '36px', padding: 0, border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                            title="Scegli colore custom"
                          />
                          <div style={{ width: '80px' }}>
                            <TextField 
                              label="Hex" 
                              labelHidden 
                              value={newTagHexColor} 
                              onChange={setNewTagHexColor} 
                              placeholder="#..." 
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      </div>

                      <Button variant="primary" onClick={handleCreateTag} disabled={!newTagLabel.trim()}>
                        Crea Tag
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>

                {/* Lista tag esistenti */}
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">Tag Esistenti ({tags.length})</Text>
                  
                  {tags.length === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">
                        Nessun tag creato. Crea il primo tag usando il form sopra.
                      </Text>
                    </Box>
                  ) : (
                    <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                      <BlockStack gap="200">
                        {tags.map((tag) => (
                          <Box key={tag.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                            {editingTagId === tag.id ? (
                              <InlineStack gap="200" blockAlign="center">
                                <div style={{ flex: 2 }}>
                                  <TextField 
                                    label="" 
                                    labelHidden 
                                    value={editTagLabel} 
                                    onChange={setEditTagLabel} 
                                    autoComplete="off"
                                  />
                                </div>
                                <div style={{ flex: 1, minWidth: '120px' }}>
                                  <Select
                                    label=""
                                    labelHidden
                                    options={colors}
                                    value={editTagColor}
                                    onChange={setEditTagColor}
                                  />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input 
                                    type="color" 
                                    value={editTagHexColor || '#000000'} 
                                    onChange={(e) => setEditTagHexColor(e.target.value)}
                                    style={{ width: '32px', height: '32px', padding: 0, border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                                    title="Scegli colore custom"
                                  />
                                  <div style={{ width: '70px' }}>
                                    <TextField 
                                      label="Hex" 
                                      labelHidden 
                                      value={editTagHexColor} 
                                      onChange={setEditTagHexColor} 
                                      placeholder="#" 
                                      autoComplete="off"
                                    />
                                  </div>
                                </div>
                                <Button icon={CheckIcon} variant="primary" onClick={handleSaveEditTag}>Salva</Button>
                                <Button icon={XSmallIcon} onClick={cancelEditTag}>Annulla</Button>
                              </InlineStack>
                            ) : (
                              <InlineStack align="space-between" blockAlign="center">
                                <InlineStack gap="200" blockAlign="center">
                                   {tag.hex_color ? (
                                     <div style={{ 
                                       display: 'flex', 
                                       alignItems: 'center', 
                                       gap: '8px', 
                                       padding: '4px 8px', 
                                       background: '#fff', 
                                       border: '1px solid #e1e3e5', 
                                       borderRadius: '4px' 
                                     }}>
                                       <div style={{ 
                                         width: '12px', 
                                         height: '12px', 
                                         borderRadius: '50%', 
                                         backgroundColor: tag.hex_color 
                                       }} />
                                       <Text variant="bodyMd" as="span">{tag.label}</Text>
                                     </div>
                                   ) : (
                                     <Badge tone={tag.color as any}>{tag.label}</Badge>
                                   )}
                                </InlineStack>
                                <InlineStack gap="100">
                                  <Button icon={EditIcon} variant="tertiary" onClick={() => handleStartEditTag(tag)} />
                                  <Button icon={DeleteIcon} variant="tertiary" tone="critical" onClick={() => handleDeleteTag(tag.id)} />
                                </InlineStack>
                              </InlineStack>
                            )}
                          </Box>
                        ))}
                      </BlockStack>
                    </div>
                  )}
                </BlockStack>
              </BlockStack>
            </Box>
          )}
        </Tabs>
      </Modal.Section>
    </Modal>
  );
};
