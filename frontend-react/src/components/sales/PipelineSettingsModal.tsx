import React, { useState, useEffect } from 'react';
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
  Spinner
} from '@shopify/polaris';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  DeleteIcon,
  EditIcon,
  PlusIcon
} from '@shopify/polaris-icons';
import { salesApi, type PipelineStage } from '../../services/salesApi';
import toast from 'react-hot-toast';

interface PipelineSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const PipelineSettingsModal: React.FC<PipelineSettingsModalProps> = ({ open, onClose, onUpdate }) => {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New Stage Form
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newColor, setNewColor] = useState('base');

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('');

  const colors = [
    {label: 'Grigio (Base)', value: 'base'},
    {label: 'Blu (Info)', value: 'info'},
    {label: 'Verde (Success)', value: 'success'},
    {label: 'Giallo (Warning)', value: 'warning'},
    {label: 'Rosso (Critical)', value: 'critical'},
  ];

  const fetchStages = async () => {
    setLoading(true);
    try {
      const data = await salesApi.getStages();
      setStages(data);
    } catch (e) {
      toast.error('Errore caricamento stage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchStages();
  }, [open]);

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

  return (
    <Modal open={open} onClose={onClose} title="Configura Pipeline Stages" size="large">
      <Modal.Section>
        {loading && <div style={{textAlign:'center'}}><Spinner size="small" /></div>}
        <BlockStack gap="400">
          <Banner tone="info">
            Riordina gli stage o modifica colori e nomi. Tutti gli stage sono eliminabili.
          </Banner>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
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
      </Modal.Section>
    </Modal>
  );
};
