import React, { useState, useEffect } from 'react';
import {
  Page, Layout, Card, ResourceList, ResourceItem, Text, Badge, Button,
  Modal, FormLayout, TextField, Select, InlineStack, BlockStack, Icon, Banner
} from '@shopify/polaris';
// BlockStack già importato
import { PlusIcon, DeleteIcon } from '@shopify/polaris-icons';
import { useTasksConfiguration } from '../contexts/TasksConfigurationContext';
import { productivityApi, type TaskCategory, type TaskCategoryCreate } from '../services/productivityApi';
import { TASK_ICONS_OPTIONS, getTaskIcon } from '../utils/taskUtils';
import toast from 'react-hot-toast';

const TONE_OPTIONS = [
  { label: 'Critico (Rosso)', value: 'critical' },
  { label: 'Attenzione (Giallo)', value: 'warning' },
  { label: 'Successo (Verde)', value: 'success' },
  { label: 'Info (Azzurro)', value: 'info' },
  { label: 'Base (Grigio)', value: 'base' },
];

interface SettingsTasksProps {
  embedded?: boolean;
}

const SettingsTasks: React.FC<SettingsTasksProps> = ({ embedded = false }) => {
  const { categories, refreshCategories } = useTasksConfiguration();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<TaskCategory | null>(null);
  
  // Form State
  const [label, setLabel] = useState('');
  const [tone, setTone] = useState('base');
  const [icon, setIcon] = useState('admin');
  const [keywords, setKeywords] = useState(''); // Comma separated

  useEffect(() => {
    if (editingCat) {
      setLabel(editingCat.label);
      setTone(editingCat.tone);
      setIcon(editingCat.icon || 'admin');
      setKeywords(editingCat.keywords.join(', '));
    } else {
      setLabel('');
      setTone('base');
      setIcon('admin');
      setKeywords('');
    }
  }, [editingCat]);

  const handleSave = async () => {
    try {
      const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k);
      const payload: TaskCategoryCreate = {
        label,
        tone,
        keywords: keywordList,
        icon
      };

      if (editingCat) {
        await productivityApi.updateTaskCategory(editingCat.id, payload);
        toast.success('Categoria aggiornata');
      } else {
        await productivityApi.createTaskCategory(payload);
        toast.success('Categoria creata');
      }
      setIsModalOpen(false);
      refreshCategories();
    } catch (e) {
      toast.error('Errore salvataggio');
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa categoria?')) return;
    try {
      await productivityApi.deleteTaskCategory(id);
      toast.success('Categoria eliminata');
      refreshCategories();
    } catch (e) {
      toast.error('Errore eliminazione');
    }
  };

  const content = (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingLg" as="h2">Categorie Task</Text>
        <Button variant="primary" icon={PlusIcon} onClick={() => { setEditingCat(null); setIsModalOpen(true); }}>
          Nuova Categoria
        </Button>
      </InlineStack>
      <Banner tone="info">
        <p>Le categorie determinano il colore e l'icona dei task. Le "Keywords" servono per assegnare automaticamente la categoria in base al titolo.</p>
      </Banner>
      <Card>
        <ResourceList
              resourceName={{ singular: 'categoria', plural: 'categorie' }}
              items={categories}
              renderItem={(item) => {
                const { id, label, tone, keywords, icon, is_system } = item;
                const iconSource = getTaskIcon(icon);

                return (
                  <ResourceItem
                    id={id}
                    onClick={() => { setEditingCat(item); setIsModalOpen(true); }}
                    accessibilityLabel={`Modifica ${label}`}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="400" blockAlign="center">
                            <div style={{ width: 24 }}><Icon source={iconSource} tone="base" /></div>
                            <BlockStack gap="100">
                                <Text as="h3" variant="headingSm" fontWeight="bold">
                                    {label} <Badge tone={tone as any}>{tone}</Badge>
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Keywords: {keywords.join(', ') || '(Nessuna)'}
                                </Text>
                            </BlockStack>
                        </InlineStack>
                        <InlineStack gap="200">
                             {is_system && <Badge tone="info">Sistema</Badge>}
                             {!is_system && (
                                 <div onClick={(e) => e.stopPropagation()}>
                                     <Button 
                                        icon={DeleteIcon} 
                                        tone="critical" 
                                        variant="plain" 
                                        onClick={() => handleDelete(id)} 
                                     />
                                 </div>
                             )}
                        </InlineStack>
                    </InlineStack>
                  </ResourceItem>
                );
              }}
            />
      </Card>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCat ? "Modifica Categoria" : "Nuova Categoria"}
        primaryAction={{
            content: 'Salva',
            onAction: handleSave
        }}
        secondaryActions={[{
            content: 'Annulla',
            onAction: () => setIsModalOpen(false)
        }]}
      >
        <Modal.Section>
            <FormLayout>
                <TextField label="Nome Categoria" value={label} onChange={setLabel} autoComplete="off" />
                <Select label="Colore / Tono" options={TONE_OPTIONS} value={tone} onChange={setTone} />
                <BlockStack gap="200">
                    <Text as="span" variant="bodySm">Icona Default</Text>
                    <InlineStack gap="300" blockAlign="center">
                        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f6f7', borderRadius: '8px' }}>
                            <Icon source={getTaskIcon(icon)} tone="base" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Select 
                                label="Icona" 
                                labelHidden 
                                options={TASK_ICONS_OPTIONS.map(opt => ({ label: opt.label, value: opt.value }))} 
                                value={icon} 
                                onChange={setIcon} 
                            />
                        </div>
                    </InlineStack>
                </BlockStack>
                <TextField 
                    label="Keywords (separare con virgola)" 
                    value={keywords} 
                    onChange={setKeywords} 
                    autoComplete="off" 
                    helpText="Se il titolo del task contiene una di queste parole, verrà assegnata questa categoria."
                    multiline={2}
                />
            </FormLayout>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );

  // Se embedded, ritorna solo il contenuto
  if (embedded) {
    return content;
  }

  // Altrimenti wrappa in Page
  return (
    <Page title="Impostazioni Categorie Task">
      <Layout>
        <Layout.Section>
          {content}
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default SettingsTasks;
