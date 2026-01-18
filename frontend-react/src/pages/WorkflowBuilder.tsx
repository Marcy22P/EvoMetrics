import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Button,
  TextField,
  Select,
  Modal,
  FormLayout,
  Badge,
  Divider,
  Banner,
  Spinner,
  Tooltip,
  Grid
} from '@shopify/polaris';
import {
  PlusIcon,
  EditIcon,
  DeleteIcon,
  PlayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  DuplicateIcon,
  ViewIcon,
  CameraIcon,
  EmailIcon,
  NoteIcon,
  CodeIcon,
  PaintBrushFlatIcon,
  ChatIcon,
  MegaphoneIcon,
  ClipboardIcon
} from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';
import { productivityApi, type WorkflowTemplate, type TaskDefinition, type DriveAction } from '../services/productivityApi';
import { clientiApi, type Cliente } from '../services/clientiApi';
import { salesApi, type PipelineStage } from '../services/salesApi';
import toast from 'react-hot-toast';

// Available roles for task assignment
const AVAILABLE_ROLES = [
  'Project manager',
  'Content creator',
  'Video editor',
  'Media Buyer',
  'Social media manager',
  'SEO Specialist',
  'Shopify Expert',
  'Fotografo',
  'Copywriter',
  'Developer'
];

const TASK_ICONS = [
  { value: 'call', label: 'Call/Meeting', icon: CameraIcon },
  { value: 'email', label: 'Email', icon: EmailIcon },
  { value: 'document', label: 'Documento', icon: NoteIcon },
  { value: 'development', label: 'Sviluppo', icon: CodeIcon },
  { value: 'design', label: 'Design', icon: PaintBrushFlatIcon },
  { value: 'social', label: 'Social', icon: ChatIcon },
  { value: 'marketing', label: 'Marketing', icon: MegaphoneIcon },
  { value: 'admin', label: 'Amministrazione', icon: ClipboardIcon },
];

// Task Item Component
const TaskItem: React.FC<{
  task: TaskDefinition;
  index: number;
  totalTasks: number;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ task, index, totalTasks, onEdit, onDelete, onMoveUp, onMoveDown }) => {
  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const getIcon = (iconName?: string) => {
      const found = TASK_ICONS.find(i => i.value === iconName);
      return found ? found.icon : ClipboardIcon;
  };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E1E3E5',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '8px',
      position: 'relative'
    }}>
      {/* Timeline connector */}
      {index < totalTasks - 1 && (
        <div style={{
          position: 'absolute',
          left: '28px',
          top: '60px',
          bottom: '-16px',
          width: '2px',
          background: task.dependencies_on_prev ? '#008060' : '#E1E3E5'
        }} />
      )}
      
      <InlineStack align="space-between" blockAlign="start">
        <InlineStack gap="400" blockAlign="center">
          {/* Step Number */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: '#F6F6F7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            color: '#6D7175',
            fontSize: '14px',
            border: '2px solid #E1E3E5',
            zIndex: 1
          }}>
            <div style={{width: 20}}>
                {task.icon ? <Icon source={getIcon(task.icon)} tone="subdued" /> : index + 1}
            </div>
          </div>
          
          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{task.title}</Text>
            <InlineStack gap="200">
              {task.role_required && (
                <Badge tone="info">{task.role_required}</Badge>
              )}
              {task.estimated_minutes && task.estimated_minutes > 0 && (
                <Badge>{formatMinutes(task.estimated_minutes)}</Badge>
              )}
              {task.relative_start_days !== undefined && (
                <Badge tone="attention">{`Giorno ${task.relative_start_days}`}</Badge>
              )}
              {task.dependencies_on_prev && (
                <Badge tone="success">Dipende dal precedente</Badge>
              )}
            </InlineStack>
          </BlockStack>
        </InlineStack>
        
        <InlineStack gap="100">
          <Tooltip content="Sposta su">
            <Button
              icon={ChevronUpIcon}
              variant="tertiary"
              size="slim"
              disabled={index === 0}
              onClick={onMoveUp}
            />
          </Tooltip>
          <Tooltip content="Sposta giù">
            <Button
              icon={ChevronDownIcon}
              variant="tertiary"
              size="slim"
              disabled={index === totalTasks - 1}
              onClick={onMoveDown}
            />
          </Tooltip>
          <Tooltip content="Modifica">
            <Button icon={EditIcon} variant="tertiary" size="slim" onClick={onEdit} />
          </Tooltip>
          <Tooltip content="Elimina">
            <Button icon={DeleteIcon} variant="tertiary" size="slim" tone="critical" onClick={onDelete} />
          </Tooltip>
        </InlineStack>
      </InlineStack>
    </div>
  );
};

// Workflow Card Component
const WorkflowCard: React.FC<{
  template: WorkflowTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRun: () => void;
  onView: () => void;
}> = ({ template, onEdit, onDelete, onDuplicate, onRun, onView }) => {
  // Assicura che tasks_definition sia sempre un array
  const tasksDef = Array.isArray(template.tasks_definition) ? template.tasks_definition : [];
  const triggers = Array.isArray(template.trigger_services) ? template.trigger_services : [];
  
  const totalMinutes = tasksDef.reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);
  const totalDays = tasksDef.length > 0 ? Math.max(...tasksDef.map(t => t.relative_start_days || 0), 0) : 0;
  
  const formatTotalTime = (mins: number) => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    return `${h}h totali`;
  };

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">{template.name}</Text>
            {template.description && (
              <Text as="p" variant="bodySm" tone="subdued">{template.description}</Text>
            )}
          </BlockStack>
          <InlineStack gap="100">
            <Tooltip content="Visualizza">
              <Button icon={ViewIcon} variant="tertiary" size="slim" onClick={onView} />
            </Tooltip>
            <Tooltip content="Modifica">
              <Button icon={EditIcon} variant="tertiary" size="slim" onClick={onEdit} />
            </Tooltip>
            <Tooltip content="Duplica">
              <Button icon={DuplicateIcon} variant="tertiary" size="slim" onClick={onDuplicate} />
            </Tooltip>
            <Tooltip content="Elimina">
              <Button icon={DeleteIcon} variant="tertiary" size="slim" tone="critical" onClick={onDelete} />
            </Tooltip>
          </InlineStack>
        </InlineStack>
        
        <Divider />
        
        <InlineStack gap="400" align="space-between">
          <InlineStack gap="300">
            <Badge>{`${tasksDef.length} task`}</Badge>
            <Badge tone="info">{formatTotalTime(totalMinutes)}</Badge>
            <Badge tone="attention">{`${totalDays} giorni`}</Badge>
          </InlineStack>
          <Button icon={PlayIcon} onClick={onRun} size="slim">Avvia</Button>
        </InlineStack>
        
        {triggers.length > 0 && (
          <InlineStack gap="100" wrap>
            <Text as="span" variant="bodyXs" tone="subdued">Trigger:</Text>
            {triggers.map((s, i) => (
              <Badge key={i} tone="new">{s}</Badge>
            ))}
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
};

// Main Component
const WorkflowBuilder: React.FC = () => {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorTriggers, setEditorTriggers] = useState('');
  const [editorEntityType, setEditorEntityType] = useState<'client' | 'lead'>('client');
  const [editorTriggerType, setEditorTriggerType] = useState<'manual' | 'event' | 'pipeline_stage'>('manual');
  const [editorTriggerPipelineStage, setEditorTriggerPipelineStage] = useState('');
  const [editorTasks, setEditorTasks] = useState<TaskDefinition[]>([]);
  
  // Task editor state
  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRole, setTaskRole] = useState('');
  const [taskMinutes, setTaskMinutes] = useState('');
  const [taskDays, setTaskDays] = useState('');
  const [taskDependsOnPrev, setTaskDependsOnPrev] = useState(false);
  const [taskDriveActions, setTaskDriveActions] = useState<DriveAction[]>([]);
  const [editingDriveActionIndex, setEditingDriveActionIndex] = useState<number | null>(null);
  const [driveActionType, setDriveActionType] = useState<'create_folder' | 'upload_file' | 'share_folder'>('create_folder');
  const [driveActionFolderName, setDriveActionFolderName] = useState('');
  const [driveActionParentFolder, setDriveActionParentFolder] = useState('');
  
  // Run workflow state
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [selectedTemplateForRun, setSelectedTemplateForRun] = useState<WorkflowTemplate | null>(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  
  // View workflow state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState<WorkflowTemplate | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesData, clientsData, stagesData] = await Promise.all([
        productivityApi.getWorkflowTemplates(),
        clientiApi.getClienti(),
        salesApi.getStages().catch(() => []) // Fallback se sales-service non disponibile
      ]);
      setTemplates(templatesData);
      setClients(clientsData);
      setPipelineStages(stagesData);
    } catch (e: any) {
      setError(e.message);
      toast.error('Errore caricamento dati');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Editor handlers
  const openNewWorkflow = () => {
    setEditingTemplate(null);
    setEditorName('');
    setEditorDescription('');
    setEditorTriggers('');
    setEditorEntityType('client');
    setEditorTriggerType('manual');
    setEditorTriggerPipelineStage('');
    setEditorTasks([]);
    setIsEditorOpen(true);
  };

  const openEditWorkflow = (template: WorkflowTemplate) => {
    setEditingTemplate(template);
    setEditorName(template.name);
    setEditorDescription(template.description || '');
    setEditorEntityType((template.entity_type as 'client' | 'lead') || 'client');
    setEditorTriggerType((template.trigger_type as 'manual' | 'event' | 'pipeline_stage') || 'manual');
    setEditorTriggerPipelineStage(template.trigger_pipeline_stage || '');
    const triggers = Array.isArray(template.trigger_services) ? template.trigger_services : [];
    setEditorTriggers(triggers.join(', '));
    const tasks = Array.isArray(template.tasks_definition) ? template.tasks_definition : [];
    setEditorTasks([...tasks]);
    setIsEditorOpen(true);
  };

  const handleSaveWorkflow = async () => {
    if (!editorName.trim()) {
      toast.error('Il nome è obbligatorio');
      return;
    }
    if (editorTasks.length === 0) {
      toast.error('Aggiungi almeno un task');
      return;
    }

    const triggers = editorTriggers.split(',').map(s => s.trim()).filter(Boolean);
    
    try {
      const workflowData = {
        name: editorName,
        description: editorDescription,
        entity_type: editorEntityType,
        trigger_type: editorTriggerType,
        trigger_pipeline_stage: editorTriggerType === 'pipeline_stage' ? editorTriggerPipelineStage : undefined,
        trigger_services: editorEntityType === 'client' ? triggers : [],
        tasks_definition: editorTasks
      };
      
      if (editingTemplate) {
        await productivityApi.updateWorkflowTemplate(editingTemplate.id, workflowData);
        toast.success('Workflow aggiornato');
      } else {
        await productivityApi.createWorkflowTemplate(workflowData);
        toast.success('Workflow creato');
      }
      setIsEditorOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteWorkflow = async (template: WorkflowTemplate) => {
    if (!confirm(`Sei sicuro di voler eliminare "${template.name}"?`)) return;
    try {
      await productivityApi.deleteWorkflowTemplate(template.id);
      toast.success('Workflow eliminato');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDuplicateWorkflow = async (template: WorkflowTemplate) => {
    try {
      const triggers = Array.isArray(template.trigger_services) ? template.trigger_services : [];
      const tasks = Array.isArray(template.tasks_definition) ? template.tasks_definition : [];
      await productivityApi.createWorkflowTemplate({
        name: `${template.name} (Copia)`,
        description: template.description,
        trigger_services: triggers,
        tasks_definition: tasks
      });
      toast.success('Workflow duplicato');
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Task editor handlers
  const openNewTask = () => {
    setEditingTaskIndex(null);
    setTaskTitle('');
    setTaskRole('');
    setTaskMinutes('');
    setTaskDays(String(editorTasks.length > 0 ? (editorTasks[editorTasks.length - 1].relative_start_days || 0) + 1 : 0));
    setTaskDependsOnPrev(false);
    setTaskDriveActions([]);
    setIsTaskEditorOpen(true);
  };

  const openEditTask = (index: number) => {
    const task = editorTasks[index];
    setEditingTaskIndex(index);
    setTaskTitle(task.title);
    setTaskRole(task.role_required || '');
    setTaskMinutes(String(task.estimated_minutes || ''));
    setTaskDays(String(task.relative_start_days || 0));
    setTaskDependsOnPrev(task.dependencies_on_prev || false);
    setTaskDriveActions(task.drive_actions || []);
    setIsTaskEditorOpen(true);
  };

  const handleSaveTask = () => {
    if (!taskTitle.trim()) {
      toast.error('Il titolo è obbligatorio');
      return;
    }

    const newTask: TaskDefinition = {
      title: taskTitle.trim(),
      role_required: taskRole || undefined,
      estimated_minutes: parseInt(taskMinutes) || 0,
      relative_start_days: parseInt(taskDays) || 0,
      dependencies_on_prev: taskDependsOnPrev,
      drive_actions: taskDriveActions.length > 0 ? taskDriveActions : undefined
    };

    if (editingTaskIndex !== null) {
      const updated = [...editorTasks];
      updated[editingTaskIndex] = newTask;
      setEditorTasks(updated);
    } else {
      setEditorTasks([...editorTasks, newTask]);
    }
    setIsTaskEditorOpen(false);
  };

  const handleDeleteTask = (index: number) => {
    setEditorTasks(editorTasks.filter((_, i) => i !== index));
  };

  const handleMoveTask = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editorTasks.length) return;
    
    const updated = [...editorTasks];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setEditorTasks(updated);
  };

  // Run workflow handlers
  const openRunModal = (template: WorkflowTemplate) => {
    setSelectedTemplateForRun(template);
    setSelectedClientId('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setIsRunModalOpen(true);
  };

  const handleRunWorkflow = async () => {
    if (!selectedClientId || !selectedTemplateForRun) {
      toast.error('Seleziona un cliente');
      return;
    }
    try {
      await productivityApi.instantiateWorkflow(
        selectedTemplateForRun.id,
        selectedClientId,
        startDate
      );
      toast.success('Workflow avviato! I task sono in creazione.');
      setIsRunModalOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return (
      <Page fullWidth>
        <Box padding="800">
          <InlineStack align="center">
            <Spinner size="large" />
          </InlineStack>
        </Box>
      </Page>
    );
  }

  return (
    <Page
      title="Workflow Builder"
      subtitle="Crea e gestisci workflow automatizzati per i tuoi progetti"
      fullWidth
      primaryAction={
        <Button icon={PlusIcon} variant="primary" onClick={openNewWorkflow}>
          Nuovo Workflow
        </Button>
      }
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {templates.length === 0 ? (
          <Card>
            <Box padding="800">
              <BlockStack gap="400" inlineAlign="center">
                <Text as="p" tone="subdued">Nessun workflow creato.</Text>
                <Button onClick={openNewWorkflow}>Crea il tuo primo workflow</Button>
              </BlockStack>
            </Box>
          </Card>
        ) : (
          <Grid>
            {templates.map(template => (
              <Grid.Cell key={template.id} columnSpan={{ xs: 6, sm: 6, md: 6, lg: 4, xl: 4 }}>
                <WorkflowCard
                  template={template}
                  onEdit={() => openEditWorkflow(template)}
                  onDelete={() => handleDeleteWorkflow(template)}
                  onDuplicate={() => handleDuplicateWorkflow(template)}
                  onRun={() => openRunModal(template)}
                  onView={() => { setViewingTemplate(template); setIsViewModalOpen(true); }}
                />
              </Grid.Cell>
            ))}
          </Grid>
        )}
      </BlockStack>

      {/* Workflow Editor Modal */}
      <Modal
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={editingTemplate ? `Modifica: ${editingTemplate.name}` : 'Nuovo Workflow'}
        primaryAction={{ content: 'Salva', onAction: handleSaveWorkflow }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setIsEditorOpen(false) }]}
        size="large"
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Nome Workflow"
              value={editorName}
              onChange={setEditorName}
              autoComplete="off"
              placeholder="es. Onboarding Cliente"
            />
            <TextField
              label="Descrizione"
              value={editorDescription}
              onChange={setEditorDescription}
              autoComplete="off"
              multiline={2}
              placeholder="Descrizione opzionale del workflow"
            />
            <Select
              label="Tipo Entità"
              options={[
                { label: 'Cliente', value: 'client' },
                { label: 'Lead', value: 'lead' }
              ]}
              value={editorEntityType}
              onChange={(value) => {
                setEditorEntityType(value as 'client' | 'lead');
                if (value === 'client') {
                  setEditorTriggerType('manual');
                  setEditorTriggerPipelineStage('');
                }
              }}
              helpText="Seleziona se il workflow è per clienti o lead"
            />
            <Select
              label="Tipo Trigger"
              options={[
                { label: 'Manuale', value: 'manual' },
                { label: 'Evento', value: 'event' },
                ...(editorEntityType === 'lead' ? [{ label: 'Stage Pipeline', value: 'pipeline_stage' }] : [])
              ]}
              value={editorTriggerType}
              onChange={(value) => {
                setEditorTriggerType(value as 'manual' | 'event' | 'pipeline_stage');
                if (value !== 'pipeline_stage') {
                  setEditorTriggerPipelineStage('');
                }
              }}
              helpText="Come viene attivato questo workflow"
            />
            {editorTriggerType === 'pipeline_stage' && editorEntityType === 'lead' && (
              <Select
                label="Stage Pipeline"
                options={[
                  { label: 'Seleziona stage...', value: '' },
                  ...pipelineStages.map(s => ({ label: s.label, value: s.key }))
                ]}
                value={editorTriggerPipelineStage}
                onChange={setEditorTriggerPipelineStage}
                helpText="Lo stage della pipeline che attiva questo workflow"
              />
            )}
            {editorEntityType === 'client' && (
              <TextField
                label="Trigger Services (separati da virgola)"
                value={editorTriggers}
                onChange={setEditorTriggers}
                autoComplete="off"
                placeholder="es. Sito Web, E-commerce, Social Media"
                helpText="Servizi che attivano automaticamente questo workflow"
              />
            )}
          </FormLayout>
        </Modal.Section>

        <Modal.Section>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Task del Workflow ({editorTasks.length})</Text>
              <Button icon={PlusIcon} onClick={openNewTask} size="slim">
                Aggiungi Task
              </Button>
            </InlineStack>
            
            {editorTasks.length === 0 ? (
              <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" tone="subdued" alignment="center">
                  Nessun task. Clicca "Aggiungi Task" per iniziare.
                </Text>
              </Box>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {editorTasks.map((task, index) => (
                  <TaskItem
                    key={index}
                    task={task}
                    index={index}
                    totalTasks={editorTasks.length}
                    onEdit={() => openEditTask(index)}
                    onDelete={() => handleDeleteTask(index)}
                    onMoveUp={() => handleMoveTask(index, 'up')}
                    onMoveDown={() => handleMoveTask(index, 'down')}
                  />
                ))}
              </div>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Task Editor Modal */}
      <Modal
        open={isTaskEditorOpen}
        onClose={() => setIsTaskEditorOpen(false)}
        title={editingTaskIndex !== null ? 'Modifica Task' : 'Nuovo Task'}
        primaryAction={{ content: 'Salva', onAction: handleSaveTask }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setIsTaskEditorOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Titolo Task"
              value={taskTitle}
              onChange={setTaskTitle}
              autoComplete="off"
              placeholder="es. Organizzare incontro con il cliente"
            />
            <Select
              label="Ruolo Richiesto"
              options={[
                { label: 'Nessuno specifico', value: '' },
                ...AVAILABLE_ROLES.map(r => ({ label: r, value: r }))
              ]}
              value={taskRole}
              onChange={setTaskRole}
            />
            <FormLayout.Group>
              <TextField
                label="Tempo Stimato (minuti)"
                type="number"
                value={taskMinutes}
                onChange={setTaskMinutes}
                autoComplete="off"
                placeholder="es. 60"
              />
              <TextField
                label="Giorno di Inizio (dal contratto)"
                type="number"
                value={taskDays}
                onChange={setTaskDays}
                autoComplete="off"
                placeholder="es. 0"
                helpText="0 = giorno del contratto"
              />
            </FormLayout.Group>
            <InlineStack gap="200" blockAlign="center">
              <input
                type="checkbox"
                id="depends-prev"
                checked={taskDependsOnPrev}
                onChange={(e) => setTaskDependsOnPrev(e.target.checked)}
              />
              <label htmlFor="depends-prev">
                <Text as="span" variant="bodySm">Dipende dal completamento del task precedente</Text>
              </label>
            </InlineStack>
          </FormLayout>
          
          <Divider />
          
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Azioni Google Drive (Opzionale)</Text>
              <Button 
                size="slim" 
                icon={PlusIcon}
                onClick={() => {
                  setDriveActionType('create_folder');
                  setDriveActionFolderName('');
                  setDriveActionParentFolder('');
                  setEditingDriveActionIndex(null);
                }}
              >
                Aggiungi Azione
              </Button>
            </InlineStack>
            
            {taskDriveActions.length === 0 ? (
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" tone="subdued" variant="bodySm" alignment="center">
                  Nessuna azione Drive. Le azioni verranno eseguite automaticamente quando il task viene creato.
                </Text>
              </Box>
            ) : (
              <BlockStack gap="200">
                {taskDriveActions.map((action, idx) => (
                  <Card key={idx}>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Badge>{action.type === 'create_folder' ? 'Crea Cartella' : action.type === 'upload_file' ? 'Carica File' : 'Condividi'}</Badge>
                        <Button 
                          size="slim" 
                          icon={DeleteIcon}
                          onClick={() => setTaskDriveActions(taskDriveActions.filter((_, i) => i !== idx))}
                        />
                      </InlineStack>
                      {action.type === 'create_folder' && (
                        <Text variant="bodySm" as="p">Nome: {action.config.folder_name || 'N/A'}</Text>
                      )}
                      {action.type === 'share_folder' && (
                        <Text variant="bodySm" as="p">Email: {action.config.email || 'N/A'}</Text>
                      )}
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}
            
            {editingDriveActionIndex === null && (
              <Box padding="300" background="bg-surface" borderColor="border" borderWidth="025" borderRadius="200">
                <BlockStack gap="300">
                  <Select
                    label="Tipo Azione"
                    options={[
                      { label: 'Crea Cartella', value: 'create_folder' },
                      { label: 'Carica File', value: 'upload_file' },
                      { label: 'Condividi Cartella', value: 'share_folder' }
                    ]}
                    value={driveActionType}
                    onChange={(value) => setDriveActionType(value as 'create_folder' | 'upload_file' | 'share_folder')}
                  />
                  {driveActionType === 'create_folder' && (
                    <>
                      <TextField
                        label="Nome Cartella"
                        value={driveActionFolderName}
                        onChange={setDriveActionFolderName}
                        autoComplete="off"
                        placeholder="es. Documenti Cliente"
                      />
                      <TextField
                        label="Cartella Parent (opzionale, ID)"
                        value={driveActionParentFolder}
                        onChange={setDriveActionParentFolder}
                        autoComplete="off"
                        placeholder="Lascia vuoto per root"
                      />
                      <Button
                        variant="primary"
                        onClick={() => {
                          if (driveActionFolderName.trim()) {
                            setTaskDriveActions([...taskDriveActions, {
                              type: 'create_folder',
                              config: {
                                folder_name: driveActionFolderName.trim(),
                                parent_folder_id: driveActionParentFolder.trim() || undefined
                              }
                            }]);
                            setDriveActionFolderName('');
                            setDriveActionParentFolder('');
                          }
                        }}
                      >
                        Aggiungi
                      </Button>
                    </>
                  )}
                  {driveActionType === 'share_folder' && (
                    <>
                      <TextField
                        label="ID Cartella"
                        value={driveActionParentFolder}
                        onChange={setDriveActionParentFolder}
                        autoComplete="off"
                        placeholder="ID della cartella da condividere"
                      />
                      <TextField
                        label="Email"
                        value={driveActionFolderName}
                        onChange={setDriveActionFolderName}
                        autoComplete="off"
                        placeholder="email@esempio.com"
                      />
                      <Button
                        variant="primary"
                        onClick={() => {
                          if (driveActionParentFolder.trim() && driveActionFolderName.trim()) {
                            setTaskDriveActions([...taskDriveActions, {
                              type: 'share_folder',
                              config: {
                                folder_id: driveActionParentFolder.trim(),
                                email: driveActionFolderName.trim()
                              }
                            }]);
                            setDriveActionFolderName('');
                            setDriveActionParentFolder('');
                          }
                        }}
                      >
                        Aggiungi
                      </Button>
                    </>
                  )}
                  {driveActionType === 'upload_file' && (
                    <Banner tone="info">
                      L'upload di file richiede il contenuto del file. Questa funzionalità sarà disponibile in futuro.
                    </Banner>
                  )}
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Run Workflow Modal */}
      <Modal
        open={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        title={`Avvia Workflow: ${selectedTemplateForRun?.name}`}
        primaryAction={{ content: 'Avvia Workflow', onAction: handleRunWorkflow }}
        secondaryActions={[{ content: 'Annulla', onAction: () => setIsRunModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Seleziona Cliente/Progetto"
              options={[
                { label: 'Seleziona un cliente...', value: '' },
                ...clients.map(c => ({ label: c.nome_azienda, value: c.id }))
              ]}
              value={selectedClientId}
              onChange={setSelectedClientId}
            />
            <TextField
              label="Data di Inizio"
              type="date"
              value={startDate}
              onChange={setStartDate}
              autoComplete="off"
              helpText="Le scadenze dei task saranno calcolate a partire da questa data"
            />
          </FormLayout>
        </Modal.Section>
        {selectedTemplateForRun && (() => {
          const tasksDef = Array.isArray(selectedTemplateForRun.tasks_definition) ? selectedTemplateForRun.tasks_definition : [];
          const maxDays = tasksDef.length > 0 ? Math.max(...tasksDef.map(t => t.relative_start_days || 0)) : 0;
          return (
            <Modal.Section>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Riepilogo</Text>
                <InlineStack gap="200">
                  <Badge>{`${tasksDef.length} task`}</Badge>
                  <Badge tone="attention">{`${maxDays} giorni`}</Badge>
                </InlineStack>
              </BlockStack>
            </Modal.Section>
          );
        })()}
      </Modal>

      {/* View Workflow Modal */}
      <Modal
        open={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title={viewingTemplate?.name || 'Dettaglio Workflow'}
        size="large"
      >
        <Modal.Section>
          {viewingTemplate && (() => {
            const tasksDef = Array.isArray(viewingTemplate.tasks_definition) ? viewingTemplate.tasks_definition : [];
            const totalMins = tasksDef.reduce((acc, t) => acc + (t.estimated_minutes || 0), 0);
            const maxDays = tasksDef.length > 0 ? Math.max(...tasksDef.map(t => t.relative_start_days || 0)) : 0;
            return (
              <BlockStack gap="400">
                {viewingTemplate.description && (
                  <Text as="p" tone="subdued">{viewingTemplate.description}</Text>
                )}
                <InlineStack gap="200">
                  <Badge>{`${tasksDef.length} task`}</Badge>
                  <Badge tone="info">{`${totalMins} min totali`}</Badge>
                  <Badge tone="attention">{`${maxDays} giorni`}</Badge>
                </InlineStack>
                <Divider />
                <Text as="h3" variant="headingSm">Timeline Task</Text>
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {tasksDef.map((task, index) => (
                    <TaskItem
                      key={index}
                      task={task}
                      index={index}
                      totalTasks={tasksDef.length}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onMoveUp={() => {}}
                      onMoveDown={() => {}}
                    />
                  ))}
                </div>
              </BlockStack>
            );
          })()}
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default WorkflowBuilder;
