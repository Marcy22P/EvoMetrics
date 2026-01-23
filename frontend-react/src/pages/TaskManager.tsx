import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Box,
  TextField,
  Modal,
  IndexTable,
  useIndexResourceState,
  Avatar,
  Tooltip,
  List,
  Link,
  Banner,
  Spinner,
  Select,
  DatePicker,
  Popover,
  Icon,
  // Tag, // Removed unused import
  // ChoiceList // Removed unused import
} from '@shopify/polaris';
import { 
    PlusIcon, 
    CalendarIcon, 
    DeleteIcon, 
    LogoGoogleIcon, 
    ExportIcon,
    SettingsIcon,
    AlertCircleIcon,
    FilterIcon,
    TargetIcon,
    ClipboardIcon,
    CalendarTimeIcon
} from '@shopify/polaris-icons';
import { productivityApi, type Task, type Attachment, type WorkflowTemplate, type TaskStatus } from '../services/productivityApi';
import { clientiApi, type DriveFile, type Cliente } from '../services/clientiApi';
import { usersApi, type User } from '../services/usersApi';
import { salesApi, type Lead } from '../services/salesApi';
import { useAuth } from '../hooks/useAuth';
import { isPast, isToday, format } from 'date-fns';
import { it } from 'date-fns/locale';
import { inferTaskCategory, getTaskIcon, TASK_ICONS_OPTIONS } from '../utils/taskUtils';
import { useTasksConfiguration } from '../contexts/TasksConfigurationContext';
import { useSearchParams } from 'react-router-dom';

const TaskManager: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories } = useTasksConfiguration();
  const { user, hasPermission } = useAuth();
  
  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]); 
  const [clients, setClients] = useState<Cliente[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);

  // UI State
  const [selectedTab, setSelectedTab] = useState(0); // 0: Miei Task, 1: Tutti, 2: Completati
  const [queryValue, setQueryValue] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [showHighPriorityOnly, setShowHighPriorityOnly] = useState(false);
  
  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [isStatusManagerOpen, setIsStatusManagerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isBulkIconModalOpen, setIsBulkIconModalOpen] = useState(false);
  const [bulkIcon, setBulkIcon] = useState('');

  // Form States (Create/Edit)
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskEntityType, setNewTaskEntityType] = useState<'client' | 'lead'>('client');
  const [newTaskClient, setNewTaskClient] = useState('');
  const [newTaskLead, setNewTaskLead] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState<Date | undefined>(undefined);
  const [newTaskCategoryId, setNewTaskCategoryId] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState('');
  // Nuovi campi per tipo item
  const [newTaskItemType, setNewTaskItemType] = useState<'task' | 'event'>('task');
  const [newTaskEventStartTime, setNewTaskEventStartTime] = useState('');
  const [newTaskEventEndTime, setNewTaskEventEndTime] = useState('');
  const [newTaskEventParticipants, setNewTaskEventParticipants] = useState('');
  // Modal per completamento task (tempo impiegato)
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
  const [tasksToComplete, setTasksToComplete] = useState<Task[]>([]); // Per bulk completion
  const [currentBulkIndex, setCurrentBulkIndex] = useState(0);
  const [timeSpentHours, setTimeSpentHours] = useState('');
  const [timeSpentMinutes, setTimeSpentMinutes] = useState('');
  
  // Workflow Form
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [workflowStartDate, setWorkflowStartDate] = useState<Date>(new Date());

  // Date Picker Helpers
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isWorkflowDatePickerOpen, setIsWorkflowDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });

  // Status Manager Form
  const [newStatusId, setNewStatusId] = useState('');
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('new');

  // Selected Item
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Mappe per lookup veloce
  const clientMap = useMemo(() => {
      const map = new Map<string, string>();
      clients.forEach(c => map.set(c.id, c.nome_azienda));
      return map;
  }, [clients]);

  const leadMap = useMemo(() => {
      const map = new Map<string, string>();
      leads.forEach(l => {
          const name = [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email.split('@')[0];
          map.set(l.id, name);
      });
      return map;
  }, [leads]);

  const userMap = useMemo(() => {
      const map = new Map<string, User>();
      users.forEach(u => map.set(String(u.id), u));
      return map;
  }, [users]);

  const statusMap = useMemo(() => {
      const map = new Map<string, TaskStatus>();
      statuses.forEach(s => map.set(s.id, s));
      return map;
  }, [statuses]);

  // Load Data
  const loadData = useCallback(async () => {
      setLoading(true);
    try {
        const [tasksData, usersData, clientsData, leadsData, statusesData] = await Promise.all([
            productivityApi.getTasks(), // Carica tutto per gestire filtri client-side
            usersApi.getUsers(),
            clientiApi.getClienti(),
            salesApi.getLeads(),
            productivityApi.getStatuses()
        ]);
        setTasks(tasksData);
        setUsers(usersData);
        setClients(clientsData);
        setLeads(leadsData);
        setStatuses(statusesData);
    } catch (e) {
        console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedTab, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-open task from URL parameter
  useEffect(() => {
    const openTaskId = searchParams.get('open');
    if (openTaskId && !loading) {
      // Prima cerca nelle task già caricate
      const taskToOpen = tasks.find(t => t.id === openTaskId);
      if (taskToOpen) {
        setSelectedTask(taskToOpen);
        setIsDetailModalOpen(true);
        searchParams.delete('open');
        setSearchParams(searchParams, { replace: true });
      } else if (tasks.length > 0) {
        // Task non trovata nelle filtrate, fetch diretta
        productivityApi.getTask(openTaskId).then(task => {
          if (task) {
            setSelectedTask(task);
            setIsDetailModalOpen(true);
            searchParams.delete('open');
            setSearchParams(searchParams, { replace: true });
          }
        }).catch(() => {
          // Task non esistente, rimuovi parametro
          searchParams.delete('open');
          setSearchParams(searchParams, { replace: true });
        });
      }
    }
  }, [tasks, loading, searchParams, setSearchParams]);

  // Workflow Handlers
  const handleOpenWorkflowModal = async () => {
      try {
          const templates = await productivityApi.getWorkflowTemplates();
          setWorkflowTemplates(templates);
          setIsWorkflowModalOpen(true);
      } catch (e) {
          alert('Errore caricamento template');
      }
  };

  const handleInstantiateWorkflow = async () => {
      if (!selectedTemplateId || !selectedClientId) return alert("Seleziona dati");
      try {
          await productivityApi.instantiateWorkflow(selectedTemplateId, selectedClientId, workflowStartDate.toISOString());
          alert("Workflow avviato!");
          setIsWorkflowModalOpen(false);
          setTimeout(loadData, 2000);
      } catch (e: any) {
          alert(e.message);
      }
  };

  // Task Actions
  const handleCreateTask = async () => {
      try {
          // Determina project_id in base all'entity_type selezionato
          const projectId = newTaskEntityType === 'lead' ? newTaskLead : newTaskClient;
          
          // Prepara campi per eventi
          let eventStartTime: string | undefined;
          let eventEndTime: string | undefined;
          let eventParticipants: string[] | undefined;
          
          if (newTaskItemType === 'event') {
              // Combina data e ora per eventi
              if (newTaskDueDate && newTaskEventStartTime) {
                  const startDate = new Date(newTaskDueDate);
                  const [startHours, startMinutes] = newTaskEventStartTime.split(':').map(Number);
                  startDate.setHours(startHours, startMinutes, 0, 0);
                  eventStartTime = startDate.toISOString();
              }
              if (newTaskDueDate && newTaskEventEndTime) {
                  const endDate = new Date(newTaskDueDate);
                  const [endHours, endMinutes] = newTaskEventEndTime.split(':').map(Number);
                  endDate.setHours(endHours, endMinutes, 0, 0);
                  eventEndTime = endDate.toISOString();
              }
              // Parse partecipanti (separati da virgola)
              if (newTaskEventParticipants.trim()) {
                  eventParticipants = newTaskEventParticipants.split(',').map(e => e.trim()).filter(Boolean);
              }
          }
          
          await productivityApi.createTask({
              title: newTaskTitle,
              description: newTaskDesc,
              assignee_id: newTaskAssignee || undefined,
              project_id: projectId || undefined,
              entity_type: projectId ? newTaskEntityType : undefined,
              priority: newTaskPriority,
              due_date: newTaskDueDate?.toISOString(),
              category_id: newTaskCategoryId || undefined,
              icon: newTaskIcon || undefined,
              item_type: newTaskItemType,
              event_start_time: eventStartTime,
              event_end_time: eventEndTime,
              event_participants: eventParticipants
          });
          setIsCreateModalOpen(false);
          resetForm();
          loadData();
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleUpdateTask = async (taskId: string, update: any) => {
      try {
          const updated = await productivityApi.updateTask(taskId, update);
          setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
          if (selectedTask?.id === taskId) setSelectedTask(updated);
      } catch (e) {
          alert("Errore aggiornamento");
      }
      };

  const handleDeleteTask = async (taskId: string) => {
      if (!confirm("Eliminare?")) return;
      try {
          await productivityApi.deleteTask(taskId);
          setTasks(prev => prev.filter(t => t.id !== taskId));
          if (selectedTask?.id === taskId) setIsDetailModalOpen(false);
      } catch (e) {
          alert("Errore eliminazione");
      }
  };

  const resetForm = () => {
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskAssignee('');
      setNewTaskPriority('medium');
      setNewTaskEntityType('client');
      setNewTaskClient('');
      setNewTaskLead('');
      setNewTaskDueDate(undefined);
      setNewTaskCategoryId('');
      setNewTaskIcon('');
      // Reset campi eventi
      setNewTaskItemType('task');
      setNewTaskEventStartTime('');
      setNewTaskEventEndTime('');
      setNewTaskEventParticipants('');
  };

  // Gestione completamento task con tempo impiegato obbligatorio
  const handleRequestComplete = (task: Task) => {
      setTaskToComplete(task);
      setTasksToComplete([]);
      setCurrentBulkIndex(0);
      setTimeSpentHours('');
      setTimeSpentMinutes('');
      setIsCompleteModalOpen(true);
  };

  // Bulk completion - richiede tempo per ogni task
  const handleBulkRequestComplete = (taskIds: string[]) => {
      const tasksToMark = tasks.filter(t => taskIds.includes(t.id) && t.status !== 'done');
      if (tasksToMark.length === 0) return;
      
      setTasksToComplete(tasksToMark);
      setTaskToComplete(tasksToMark[0]);
      setCurrentBulkIndex(0);
      setTimeSpentHours('');
      setTimeSpentMinutes('');
      setIsCompleteModalOpen(true);
  };

  const handleConfirmComplete = async () => {
      if (!taskToComplete) return;
      
      const hours = parseInt(timeSpentHours) || 0;
      const minutes = parseInt(timeSpentMinutes) || 0;
      const totalMinutes = (hours * 60) + minutes;
      
      if (totalMinutes <= 0) {
          alert('Inserisci il tempo impiegato per completare la task');
          return;
      }
      
      try {
          await productivityApi.updateTask(taskToComplete.id, {
              status: 'done',
              actual_minutes: totalMinutes
          });
          
          // Se è bulk completion, passa alla prossima task
          if (tasksToComplete.length > 0) {
              const nextIndex = currentBulkIndex + 1;
              if (nextIndex < tasksToComplete.length) {
                  setCurrentBulkIndex(nextIndex);
                  setTaskToComplete(tasksToComplete[nextIndex]);
                  setTimeSpentHours('');
                  setTimeSpentMinutes('');
                  return; // Non chiudere il modal, mostra la prossima
              }
          }
          
          // Tutte completate o era singola
          setIsCompleteModalOpen(false);
          setTaskToComplete(null);
          setTasksToComplete([]);
          setCurrentBulkIndex(0);
          clearSelection();
          loadData();
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleSkipBulkTask = () => {
      // Salta questa task e passa alla prossima
      if (tasksToComplete.length > 0) {
          const nextIndex = currentBulkIndex + 1;
          if (nextIndex < tasksToComplete.length) {
              setCurrentBulkIndex(nextIndex);
              setTaskToComplete(tasksToComplete[nextIndex]);
              setTimeSpentHours('');
              setTimeSpentMinutes('');
              return;
          }
      }
      // Finite tutte
      setIsCompleteModalOpen(false);
      setTaskToComplete(null);
      setTasksToComplete([]);
      clearSelection();
      loadData();
  };

  // Status Manager
  const handleCreateStatus = async () => {
      try {
          await productivityApi.createStatus({ id: newStatusId, label: newStatusLabel, color: newStatusColor });
          const newStatuses = await productivityApi.getStatuses();
          setStatuses(newStatuses);
          setNewStatusId(''); setNewStatusLabel('');
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleDeleteStatus = async (id: string) => {
      if (!confirm("Eliminare stato?")) return;
      try {
          await productivityApi.deleteStatus(id);
          setStatuses(prev => prev.filter(s => s.id !== id));
      } catch (e: any) {
          alert(e.message);
    }
  };

    // Drive
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const openDrivePicker = async () => {
        if (!selectedTask?.project_id) {
            setDriveError("Associa il task a un cliente per usare Drive.");
            setIsDrivePickerOpen(true); 
            return;
        }
        setDriveError(null);
        setIsDrivePickerOpen(true);
        setLoadingDriveFiles(true);
    try {
            const res = await clientiApi.listDriveFiles(selectedTask.project_id);
            setDriveFiles(res.files);
        } catch (e: any) {
            setDriveError(e.message);
        } finally {
            setLoadingDriveFiles(false);
        }
    };

    const handleAttachFile = async (file: DriveFile) => {
        if (!selectedTask) return;
        try {
            const attachment: Attachment = {
                name: file.name,
                url: file.webViewLink,
                drive_file_id: file.id,
                mime_type: file.mimeType
            };
            await productivityApi.addAttachment(selectedTask.id, attachment);
            const updated = { ...selectedTask, attachments: [...(selectedTask.attachments || []), attachment] };
            setSelectedTask(updated);
            setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
            setIsDrivePickerOpen(false);
        } catch (e) {
            alert('Errore allegato');
        }
    };

    const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedTask?.project_id) return;
        
        setLoadingDriveFiles(true);
        try {
            const uploadedFile = await clientiApi.uploadDriveFile(selectedTask.project_id, file);
            await handleAttachFile(uploadedFile);
        } catch (e: any) {
            setDriveError("Errore upload: " + e.message);
            setLoadingDriveFiles(false);
    }
  };

  // Bulk Actions
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } = useIndexResourceState(tasks as unknown as {[key:string]: unknown}[]);
  
  const handleBulkDelete = async () => {
      if (!confirm(`Eliminare ${selectedResources.length} task?`)) return;
      await productivityApi.bulkDeleteTasks(selectedResources);
      setTasks(prev => prev.filter(t => !selectedResources.includes(t.id)));
      clearSelection();
  };

  const handleBulkStatus = async (statusId: string) => {
      // Se si sta completando, richiedi tempo per ogni task
      if (statusId === 'done') {
          handleBulkRequestComplete(selectedResources);
          return;
      }
      
      await productivityApi.bulkUpdateTasks(selectedResources, { status: statusId });
      setTasks(prev => prev.map(t => selectedResources.includes(t.id) ? { ...t, status: statusId } : t));
      clearSelection();
  };

  const handleBulkIconUpdate = async () => {
      if (!bulkIcon) return;
      await productivityApi.bulkUpdateTasks(selectedResources, { icon: bulkIcon });
      setTasks(prev => prev.map(t => selectedResources.includes(t.id) ? { ...t, icon: bulkIcon } : t));
      setIsBulkIconModalOpen(false);
      clearSelection();
  };

  // Filtering & Sorting
  const filteredTasks = useMemo(() => {
      return tasks.filter(t => {
          // Tab Logic
          const isCompleted = t.status === 'done';
          if (selectedTab === 2) {
              if (!isCompleted) return false;
          } else {
              if (isCompleted) return false;
              if (selectedTab === 0 && user?.id && String(t.assignee_id) !== String(user.id)) return false;
          }

          const entityName = t.entity_type === 'lead' 
              ? (leadMap.get(t.project_id || '') || '')
              : (clientMap.get(t.project_id || '') || '');
          const matchesQuery = t.title.toLowerCase().includes(queryValue.toLowerCase()) || 
                               entityName.toLowerCase().includes(queryValue.toLowerCase());
          if (!matchesQuery) return false;
          
          if (showOverdueOnly) {
              if (!t.due_date || t.status === 'done') return false;
              if (!isPast(new Date(t.due_date))) return false;
          }

          if (showHighPriorityOnly) {
              if (t.priority !== 'high' && t.priority !== 'urgent') return false;
          }

          return true;
      }).sort((a, b) => {
          // Sort Logic: Overdue first, then Urgent/High, then Due Date
          const aOver = a.due_date && isPast(new Date(a.due_date)) && a.status !== 'done';
          const bOver = b.due_date && isPast(new Date(b.due_date)) && b.status !== 'done';
          if (aOver && !bOver) return -1;
          if (!aOver && bOver) return 1;

          const pScore = { urgent: 3, high: 2, medium: 1, low: 0 };
          if (pScore[a.priority] > pScore[b.priority]) return -1;
          if (pScore[a.priority] < pScore[b.priority]) return 1;

          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
  }, [tasks, queryValue, showOverdueOnly, showHighPriorityOnly, clientMap]);

  // Render Helpers
  const getStatusBadge = (statusId: string) => {
      const s = statusMap.get(statusId);
      if (!s) return <Badge>{statusId}</Badge>;
      return <Badge tone={s.color as any}>{s.label}</Badge>;
  };

  const getDueDateElement = (dateStr?: string, status?: string) => {
      if (!dateStr) return <Text as="span" tone="subdued">-</Text>;
      const date = new Date(dateStr);
      const isOverdue = isPast(date) && !isToday(date) && status !== 'done';
    return (
          <InlineStack gap="100">
              <CalendarIcon width={16} className={isOverdue ? 'Polaris-Icon--toneCritical' : ''} />
              <Text as="span" tone={isOverdue ? 'critical' : undefined}>
                  {format(date, 'dd MMM', { locale: it })}
              </Text>
          </InlineStack>
      );
  };

  const getUserName = (userId: string) => {
      const u = userMap.get(userId);
      if (!u) return userId;
      if (u.nome && u.cognome) return `${u.nome} ${u.cognome}`;
      return u.username;
  };

  const rowMarkup = filteredTasks.map((task, index) => {
      let category = null;
      if (task.category_id) {
          const found = categories.find(c => c.id === task.category_id);
          if (found) category = { label: found.label, tone: found.tone, type: found.id, icon: found.icon };
      }
      if (!category) {
          category = inferTaskCategory(task, categories);
      }
      
      // Usa l'icona della categoria, poi fallback all'icona del task, poi default
      const iconSource = getTaskIcon(category?.icon || task.icon);

    return (
      <IndexTable.Row
          id={task.id}
          key={task.id}
          selected={selectedResources.includes(task.id)}
          position={index}
          onClick={() => { setSelectedTask(task); setIsDetailModalOpen(true); }}
      >
        <IndexTable.Cell>
              <BlockStack gap="100">
                  <InlineStack gap="200" align="start" blockAlign="center" wrap={false}>
                        <div style={{ minWidth: '20px' }}><Icon source={iconSource} tone="base" /></div>
                        {category && <Badge tone={category.tone as any}>{category.label}</Badge>}
                  </InlineStack>
                  <Text as="span" fontWeight="bold" variant="bodyMd" textDecorationLine={task.status === 'done' ? 'line-through' : undefined}>
                      {task.title}
          </Text>
                  <InlineStack gap="200">
                      {(() => {
                          const leadName = task.project_id ? leadMap.get(task.project_id) : null;
                          const clientName = task.project_id ? clientMap.get(task.project_id) : null;
                          return (
                              <>
                                  {task.entity_type === 'lead' && leadName && (
                                      <InlineStack gap="100" blockAlign="center">
                                          <Icon source={TargetIcon} tone="caution" />
                                          <Badge tone="attention">{leadName}</Badge>
                                      </InlineStack>
                                  )}
                                  {task.entity_type !== 'lead' && clientName && (
                                      <Badge tone="info">{clientName}</Badge>
                                  )}
                              </>
                          );
                      })()}
                      {task.priority === 'urgent' && <Badge tone="critical">URGENTE</Badge>}
                  </InlineStack>
              </BlockStack>
        </IndexTable.Cell>
          <IndexTable.Cell>{getStatusBadge(task.status)}</IndexTable.Cell>
        <IndexTable.Cell>
              <InlineStack gap="200" align="start" blockAlign="center">
                  {task.assignee_id ? (
                      <InlineStack gap="200" blockAlign="center">
                          <Tooltip content={`Assegnato a ${getUserName(task.assignee_id)}`}>
                              <Avatar size="xs" name={getUserName(task.assignee_id)} />
                          </Tooltip>
                          <Text as="span" variant="bodySm">{getUserName(task.assignee_id)}</Text>
                      </InlineStack>
          ) : (
                      <Badge tone="info">{task.role_required || 'Unassigned'}</Badge>
          )}
              </InlineStack>
        </IndexTable.Cell>
          <IndexTable.Cell>
              {task.status === 'done' && task.completed_at 
                  ? format(new Date(task.completed_at), 'dd MMM', { locale: it })
                  : getDueDateElement(task.due_date, task.status)
              }
          </IndexTable.Cell>
          {selectedTab === 2 && (
              <IndexTable.Cell>
                  {task.actual_minutes ? (
                      <Text as="span" tone="success">
                          {Math.floor(task.actual_minutes / 60)}h {task.actual_minutes % 60}m
                      </Text>
                  ) : (
                      <Text as="span" tone="subdued">-</Text>
                  )}
              </IndexTable.Cell>
          )}
      </IndexTable.Row>
    );
  });

  const isAdmin = hasPermission('admin');
  const canViewWorkflows = hasPermission('workflow:read');

  return (
    <Page
      title="Task Manager"
        primaryAction={
            <Button icon={PlusIcon} variant="primary" onClick={() => setIsCreateModalOpen(true)}>Nuovo Task</Button>
        }
      secondaryActions={[
        ...(canViewWorkflows ? [{
                content: 'Avvia Workflow',
                icon: ExportIcon,
                onAction: handleOpenWorkflowModal
            }] : []),
            ...(isAdmin ? [{
                content: 'Gestisci Stati',
                icon: SettingsIcon,
                onAction: () => setIsStatusManagerOpen(true)
            }] : [])
        ]}
        fullWidth
    >
        <Layout>
            <Layout.Section>
                <Card padding="0">
                    <Box padding="400">
      <BlockStack gap="400">
                            <InlineStack gap="400" align="space-between">
                                <InlineStack gap="200">
                                    <Button pressed={selectedTab === 0} onClick={() => setSelectedTab(0)}>I Miei Task</Button>
                                    <Button pressed={selectedTab === 1} onClick={() => setSelectedTab(1)}>Tutti i Task</Button>
                                    <Button pressed={selectedTab === 2} onClick={() => setSelectedTab(2)}>Completati</Button>
                                </InlineStack>
                                <InlineStack gap="200">
                                    <Button 
                                        icon={AlertCircleIcon} 
                                        pressed={showOverdueOnly} 
                                        onClick={() => setShowOverdueOnly(!showOverdueOnly)}
                                        tone={showOverdueOnly ? 'critical' : undefined}
                                    >Scaduti</Button>
                                    <Button 
                                        icon={FilterIcon}
                                        pressed={showHighPriorityOnly} 
                                        onClick={() => setShowHighPriorityOnly(!showHighPriorityOnly)}
                                    >Alta Priorità</Button>
              <TextField
                label="Cerca"
                labelHidden
                                        value={queryValue} 
                                        onChange={setQueryValue} 
                                        placeholder="Cerca task o cliente..." 
                autoComplete="off"
              />
                                </InlineStack>
          </InlineStack>
                        </BlockStack>
            </Box>
            <IndexTable
                        resourceName={{ singular: 'task', plural: 'tasks' }}
              itemCount={filteredTasks.length}
                        selectedItemsCount={allResourcesSelected ? 'All' : selectedResources.length}
                        onSelectionChange={handleSelectionChange}
              headings={[
                            { title: 'Task' },
                { title: 'Stato' },
                            { title: 'Assegnato a' },
                { title: selectedTab === 2 ? 'Completata' : 'Scadenza' },
                ...(selectedTab === 2 ? [{ title: 'Tempo' }] : []),
                        ]}
                        promotedBulkActions={[
                            { content: 'Elimina', onAction: handleBulkDelete },
                            { content: 'Cambia Icona', onAction: () => setIsBulkIconModalOpen(true) },
                            ...(selectedTab === 2 
                                ? [{ content: 'Ripristina', onAction: () => handleBulkStatus('todo') }] 
                                : statuses.map(s => ({ content: `Segna come ${s.label}`, onAction: () => handleBulkStatus(s.id) }))
                            )
                        ]}
                        loading={loading}
            >
              {rowMarkup}
            </IndexTable>
                </Card>
            </Layout.Section>
        </Layout>

        {/* --- MODALS --- */}

        {/* CREATE TASK */}
      <Modal
        open={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Crea Nuovo Task"
            primaryAction={{ content: 'Crea', onAction: handleCreateTask }}
        >
            <Modal.Section>
                <BlockStack gap="400">
                    {/* Tipo: Task o Evento */}
                    <BlockStack gap="200">
                        <Text as="span" variant="bodyMd" fontWeight="medium">Tipo</Text>
                        <InlineStack gap="200">
                            <Button
                                icon={ClipboardIcon}
                                pressed={newTaskItemType === 'task'}
                                onClick={() => setNewTaskItemType('task')}
                            >
                                Task
                            </Button>
                            <Button
                                icon={CalendarTimeIcon}
                                pressed={newTaskItemType === 'event'}
                                onClick={() => setNewTaskItemType('event')}
                            >
                                Evento (Call/Meeting)
                            </Button>
                        </InlineStack>
                    </BlockStack>
                    
                    <TextField label="Titolo" value={newTaskTitle} onChange={setNewTaskTitle} autoComplete="off" />
                    <TextField label="Descrizione" value={newTaskDesc} onChange={setNewTaskDesc} multiline={3} autoComplete="off" />
                    <Select 
                        label="Categoria"
                        options={[{label: 'Automatica (da titolo)', value: ''}, ...categories.map(c => ({label: c.label, value: c.id}))]}
                        value={newTaskCategoryId}
                        onChange={setNewTaskCategoryId}
                    />
                    <Select
                        label="Icona Personalizzata"
                        options={[{label: 'Usa Categoria/Default', value: ''}, ...TASK_ICONS_OPTIONS]}
                        value={newTaskIcon}
                        onChange={setNewTaskIcon}
                    />
                    <InlineStack gap="400" align="start">
                        <div style={{flex: 1}}>
                            <Select 
                                label="Collega a"
                                options={[
                                    {label: 'Cliente', value: 'client'},
                                    {label: 'Lead (Sales Pipeline)', value: 'lead'}
                                ]}
                                value={newTaskEntityType}
                                onChange={(v) => {
                                    setNewTaskEntityType(v as 'client' | 'lead');
                                    setNewTaskClient('');
                                    setNewTaskLead('');
                                }}
                            />
                        </div>
                        <div style={{flex: 2}}>
                            {newTaskEntityType === 'client' ? (
                                <Select 
                                    label="Cliente"
                                    options={[{label: 'Nessuno', value: ''}, ...clients.map(c => ({label: c.nome_azienda, value: c.id}))]}
                                    value={newTaskClient}
                                    onChange={setNewTaskClient}
                                />
                            ) : (
                                <Select 
                                    label="Lead"
                                    options={[{label: 'Nessuno', value: ''}, ...leads.map(l => ({
                                        label: l.azienda || `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email,
                                        value: l.id
                                    }))]}
                                    value={newTaskLead}
                                    onChange={setNewTaskLead}
                                />
                            )}
                        </div>
                    </InlineStack>
                    <InlineStack gap="400" align="start">
                        <div style={{flex:1}}>
                            <Select 
                                label="Assegna a"
                                options={[{label: 'Nessuno', value: ''}, ...users.map(u => ({label: u.username, value: String(u.id)}))]}
                                value={newTaskAssignee}
                                onChange={setNewTaskAssignee}
                            />
                        </div>
                        <div style={{flex:1}}>
                            <Select 
                                label="Priorità"
                                options={['low', 'medium', 'high', 'urgent'].map(p => ({label: p.toUpperCase(), value: p}))}
                                value={newTaskPriority}
                                onChange={setNewTaskPriority}
                            />
                        </div>
                    </InlineStack>
                    <Popover
                        active={isDatePickerOpen}
                        activator={
                            <TextField
                                label={newTaskItemType === 'event' ? "Data Evento" : "Scadenza"}
                                value={newTaskDueDate ? newTaskDueDate.toLocaleDateString() : ''}
                                onFocus={() => setIsDatePickerOpen(true)}
                                autoComplete="off"
                                prefix={<CalendarIcon />}
                            />
                        }
                        onClose={() => setIsDatePickerOpen(false)}
                    >
                        <Box padding="400">
                            <DatePicker
                                month={datePickerMonth.month}
                                year={datePickerMonth.year}
                                onChange={(r) => { setNewTaskDueDate(r.start); setIsDatePickerOpen(false); }}
                                onMonthChange={(m, y) => setDatePickerMonth({ month: m, year: y })}
                                selected={newTaskDueDate ? { start: newTaskDueDate, end: newTaskDueDate } : undefined}
                            />
                        </Box>
                    </Popover>
                    
                    {/* Campi specifici per Eventi */}
                    {newTaskItemType === 'event' && (
                        <>
                            <InlineStack gap="400" align="start">
                                <div style={{flex: 1}}>
                                    <TextField
                                        label="Ora Inizio"
                                        type="time"
                                        value={newTaskEventStartTime}
                                        onChange={setNewTaskEventStartTime}
                                        autoComplete="off"
                                    />
                                </div>
                                <div style={{flex: 1}}>
                                    <TextField
                                        label="Ora Fine"
                                        type="time"
                                        value={newTaskEventEndTime}
                                        onChange={setNewTaskEventEndTime}
                                        autoComplete="off"
                                    />
                                </div>
                            </InlineStack>
                            <TextField
                                label="Partecipanti (email separate da virgola)"
                                value={newTaskEventParticipants}
                                onChange={setNewTaskEventParticipants}
                                autoComplete="off"
                                placeholder="es: mario@email.com, luigi@email.com"
                                helpText="Verrà creato automaticamente un link Google Meet"
                            />
                        </>
                    )}
                </BlockStack>
            </Modal.Section>
        </Modal>

        {/* WORKFLOW */}
        <Modal
            open={isWorkflowModalOpen}
            onClose={() => setIsWorkflowModalOpen(false)}
            title="Avvia Workflow"
            primaryAction={{ content: 'Avvia', onAction: handleInstantiateWorkflow }}
      >
        <Modal.Section>
                <BlockStack gap="400">
                    <Select 
                        label="Template"
                        options={[{label: 'Seleziona...', value: ''}, ...workflowTemplates.map(t => ({label: t.name, value: t.id}))]}
                        value={selectedTemplateId}
                        onChange={setSelectedTemplateId}
                    />
            <Select
              label="Cliente"
                        options={[{label: 'Seleziona...', value: ''}, ...clients.map(c => ({label: c.nome_azienda, value: c.id}))]}
                        value={selectedClientId}
                        onChange={setSelectedClientId}
                    />
                    <Popover
                        active={isWorkflowDatePickerOpen}
                        activator={
            <TextField
                                label="Data Inizio"
                                value={workflowStartDate.toLocaleDateString()}
                                onFocus={() => setIsWorkflowDatePickerOpen(true)}
              autoComplete="off"
                                prefix={<CalendarIcon />}
                            />
                        }
                        onClose={() => setIsWorkflowDatePickerOpen(false)}
                    >
                        <Box padding="400">
                            <DatePicker
                                month={workflowStartDate.getMonth()}
                                year={workflowStartDate.getFullYear()}
                                onChange={(r) => { setWorkflowStartDate(r.start); setIsWorkflowDatePickerOpen(false); }}
                                onMonthChange={(m, y) => setWorkflowStartDate(new Date(y, m, 1))}
                                selected={{ start: workflowStartDate, end: workflowStartDate }}
                            />
                        </Box>
                    </Popover>
                </BlockStack>
            </Modal.Section>
        </Modal>

        {/* BULK ICON UPDATE */}
        <Modal
            open={isBulkIconModalOpen}
            onClose={() => setIsBulkIconModalOpen(false)}
            title="Cambia Icona in massa"
            primaryAction={{ content: 'Applica', onAction: handleBulkIconUpdate }}
        >
            <Modal.Section>
                <Select
                    label="Seleziona Icona"
                    options={[{label: 'Nessuna', value: ''}, ...TASK_ICONS_OPTIONS]}
                    value={bulkIcon}
                    onChange={setBulkIcon}
                />
            </Modal.Section>
        </Modal>

        {/* STATUS MANAGER */}
        <Modal
            open={isStatusManagerOpen}
            onClose={() => setIsStatusManagerOpen(false)}
            title="Gestione Stati"
        >
            <Modal.Section>
                <BlockStack gap="400">
                    <Card>
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">Nuovo Stato</Text>
                            <InlineStack gap="200">
                                <TextField label="ID" labelHidden placeholder="ID (es. in_review)" value={newStatusId} onChange={setNewStatusId} autoComplete="off" />
                                <TextField label="Label" labelHidden placeholder="Etichetta" value={newStatusLabel} onChange={setNewStatusLabel} autoComplete="off" />
                                <Select 
                                    label="Colore" labelHidden 
                                    options={['new', 'attention', 'warning', 'success', 'critical'].map(c => ({label: c, value: c}))}
                                    value={newStatusColor}
                                    onChange={setNewStatusColor}
                                />
                                <Button onClick={handleCreateStatus} disabled={!newStatusId || !newStatusLabel}>Aggiungi</Button>
                            </InlineStack>
                        </BlockStack>
                    </Card>
                    <List>
                        {statuses.map(s => (
                            <List.Item key={s.id}>
                                <InlineStack align="space-between">
                                    <InlineStack gap="200">
                                        <Badge tone={s.color as any}>{s.label}</Badge>
                                        <Text as="span" tone="subdued">({s.id})</Text>
                                    </InlineStack>
                                    {!s.is_default && <Button icon={DeleteIcon} tone="critical" onClick={() => handleDeleteStatus(s.id)} variant="plain" />}
                                </InlineStack>
                            </List.Item>
                        ))}
                    </List>
                </BlockStack>
            </Modal.Section>
        </Modal>

        {/* DETAIL & EDIT */}
        <Modal
            open={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
            title={selectedTask?.title}
            size="large"
        >
            <Modal.Section>
                {selectedTask && (
                    <BlockStack gap="400">
                        {/* Header Controls */}
                        <InlineStack align="space-between">
                            <InlineStack gap="200">
                                <Select
                                    label="Categoria"
                                    labelHidden
                                    options={[{label: 'Automatica', value: ''}, ...categories.map(c => ({label: c.label, value: c.id}))]}
                                    value={selectedTask.category_id || ''}
                                    onChange={(v) => handleUpdateTask(selectedTask.id, { category_id: v })}
                                />
                                <Select
                                    label="Icona"
                                    labelHidden
                                    options={[{label: 'Default', value: ''}, ...TASK_ICONS_OPTIONS]}
                                    value={selectedTask.icon || ''}
                                    onChange={(v) => handleUpdateTask(selectedTask.id, { icon: v })}
                                />
                                <Select
                                    label="Stato"
                                    labelHidden
                                    options={statuses.map(s => ({label: s.label, value: s.id}))}
                                    value={selectedTask.status}
                                    onChange={(v) => {
                                        // Se si cambia a "done", richiedi tempo impiegato
                                        if (v === 'done' && selectedTask.status !== 'done') {
                                            handleRequestComplete(selectedTask);
                                        } else {
                                            handleUpdateTask(selectedTask.id, { status: v });
                                        }
                                    }}
                                />
                                <Select
                                    label="Priorità"
                                    labelHidden
                                    options={['low', 'medium', 'high', 'urgent'].map(p => ({label: p.toUpperCase(), value: p}))}
                                    value={selectedTask.priority}
                                    onChange={(v) => handleUpdateTask(selectedTask.id, { priority: v })}
                                />
                            </InlineStack>
                            <Button icon={DeleteIcon} tone="critical" onClick={() => handleDeleteTask(selectedTask.id)}>Elimina</Button>
                        </InlineStack>

            <TextField
                            label="Descrizione"
                            value={selectedTask.description || ''}
                            onChange={(v) => handleUpdateTask(selectedTask.id, { description: v })}
                            multiline={4}
              autoComplete="off"
            />

                        <Card>
                            <BlockStack gap="400">
                                <Text as="h3" variant="headingSm">Dettagli Operativi</Text>
                                <InlineStack gap="800">
                                    <Box minWidth="200px">
                                        <Select
                                            label="Assegnatario"
                                            options={[{label: 'Nessuno', value: ''}, ...users.map(u => ({label: u.username, value: String(u.id)}))]}
                                            value={selectedTask.assignee_id || ''}
                                            onChange={(v) => handleUpdateTask(selectedTask.id, { assignee_id: v })}
                                            disabled={!isAdmin} // Solo admin cambia assegnatario
                                            helpText={selectedTask.role_required ? `Ruolo richiesto: ${selectedTask.role_required}` : undefined}
                                        />
                                    </Box>
                                    <Box minWidth="200px">
            <TextField
                                            label="Scadenza"
                                            value={selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : ''}
              autoComplete="off"
                                            disabled={!isAdmin} // Solo admin cambia scadenza
                                            readOnly
                                        />
                                        {/* TODO: Aggiungere date picker inline per edit scadenza se admin */}
                                    </Box>
                                </InlineStack>
                            </BlockStack>
                        </Card>

                        {/* Tempo Impiegato - solo per task completate */}
                        {selectedTask.status === 'done' && (
                            <Card>
                                <BlockStack gap="200">
                                    <Text as="h3" variant="headingSm">Tempo Impiegato</Text>
                                    <InlineStack gap="400" blockAlign="center">
                                        {selectedTask.actual_minutes ? (
                                            <>
                                                <Badge tone="success" size="large">
                                                    {`${Math.floor(selectedTask.actual_minutes / 60)}h ${selectedTask.actual_minutes % 60}m`}
                                                </Badge>
                                                {selectedTask.estimated_minutes && selectedTask.estimated_minutes > 0 && (
                                                    <Text as="span" tone="subdued">
                                                        (stimato: {Math.floor(selectedTask.estimated_minutes / 60)}h {selectedTask.estimated_minutes % 60}m)
                                                    </Text>
                                                )}
                                            </>
                                        ) : (
                                            <Text as="span" tone="subdued">Non registrato</Text>
                                        )}
                                    </InlineStack>
                                    {selectedTask.completed_at && (
                                        <Text as="p" tone="subdued" variant="bodySm">
                                            Completata il {format(new Date(selectedTask.completed_at), 'dd MMM yyyy, HH:mm', { locale: it })}
                                        </Text>
                                    )}
                                </BlockStack>
                            </Card>
                        )}

                        {/* Attachments */}
                        <Card>
                            <BlockStack gap="200">
                                <InlineStack align="space-between">
                                    <Text as="h3" variant="headingSm">Allegati</Text>
                                    <Button icon={LogoGoogleIcon} onClick={openDrivePicker}>Allega da Drive</Button>
                                </InlineStack>
                                {Array.isArray(selectedTask.attachments) && selectedTask.attachments.length > 0 ? (
                                    <List>
                                        {selectedTask.attachments.map((att, i) => (
                                            <List.Item key={i}>
                                                <Link url={att.url} target="_blank">{att.name}</Link>
                                            </List.Item>
                                        ))}
                                    </List>
                                ) : <Text as="p" tone="subdued">Nessun file.</Text>}
                            </BlockStack>
                        </Card>
                    </BlockStack>
                )}
            </Modal.Section>
        </Modal>

        {/* DRIVE PICKER */}
        <Modal
            open={isDrivePickerOpen}
            onClose={() => setIsDrivePickerOpen(false)}
            title="Seleziona file"
        >
            <Modal.Section>
                <BlockStack gap="400">
                    <InlineStack align="end">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{display: 'none'}} 
                            onChange={handleUploadFile} 
                        />
                        <Button icon={PlusIcon} onClick={() => fileInputRef.current?.click()} disabled={loadingDriveFiles || !!driveError}>
                            Carica da PC
                        </Button>
                    </InlineStack>

                    {driveError ? <Banner tone="warning">{driveError}</Banner> : 
                     loadingDriveFiles ? <Spinner /> : (
                        driveFiles.length > 0 ? (
                            <List>
                                {driveFiles.map(f => (
                                    <List.Item key={f.id}>
                                        <InlineStack align="space-between">
                                            <Text as="span">{f.name}</Text>
                                            <Button size="slim" onClick={() => handleAttachFile(f)}>Allega</Button>
                                        </InlineStack>
                                    </List.Item>
                                ))}
                            </List>
                        ) : <Text as="p" tone="subdued">Nessun file trovato nel Drive del cliente. Caricane uno nuovo.</Text>
                    )}
                </BlockStack>
        </Modal.Section>
      </Modal>

        {/* COMPLETE TASK - TEMPO IMPIEGATO */}
        <Modal
            open={isCompleteModalOpen}
            onClose={() => {
                setIsCompleteModalOpen(false);
                setTaskToComplete(null);
                setTasksToComplete([]);
            }}
            title={tasksToComplete.length > 0 
                ? `Completa Task (${currentBulkIndex + 1}/${tasksToComplete.length})` 
                : "Completa Task"
            }
            primaryAction={{
                content: 'Completa',
                onAction: handleConfirmComplete
            }}
            secondaryActions={tasksToComplete.length > 1 ? [
                {
                    content: 'Salta',
                    onAction: handleSkipBulkTask
                },
                {
                    content: 'Annulla tutto',
                    onAction: () => {
                        setIsCompleteModalOpen(false);
                        setTaskToComplete(null);
                        setTasksToComplete([]);
                    }
                }
            ] : [{
                content: 'Annulla',
                onAction: () => {
                    setIsCompleteModalOpen(false);
                    setTaskToComplete(null);
                }
            }]}
        >
            <Modal.Section>
                <BlockStack gap="400">
                    <Banner tone="info">
                        Per completare questa task, indica quanto tempo hai impiegato.
                    </Banner>
                    {taskToComplete && (
                        <Text as="p" fontWeight="semibold">{taskToComplete.title}</Text>
                    )}
                    <InlineStack gap="400" align="start">
                        <div style={{flex: 1}}>
                            <TextField
                                label="Ore"
                                value={timeSpentHours}
                                onChange={(val) => {
                                    // Accetta solo numeri
                                    if (val === '' || /^\d+$/.test(val)) {
                                        setTimeSpentHours(val);
                                    }
                                }}
                                autoComplete="off"
                                inputMode="numeric"
                                helpText="es. 2"
                            />
                        </div>
                        <div style={{flex: 1}}>
                            <TextField
                                label="Minuti"
                                value={timeSpentMinutes}
                                onChange={(val) => {
                                    // Accetta solo numeri 0-59
                                    if (val === '' || (/^\d+$/.test(val) && parseInt(val) <= 59)) {
                                        setTimeSpentMinutes(val);
                                    }
                                }}
                                autoComplete="off"
                                inputMode="numeric"
                                helpText="es. 30"
                            />
                        </div>
                    </InlineStack>
                    {taskToComplete?.estimated_minutes && taskToComplete.estimated_minutes > 0 && (
                        <Text as="p" tone="subdued">
                            Tempo stimato: {Math.floor(taskToComplete.estimated_minutes / 60)}h {taskToComplete.estimated_minutes % 60}m
                        </Text>
                    )}
                </BlockStack>
            </Modal.Section>
        </Modal>
    </Page>
  );
};

export default TaskManager;
