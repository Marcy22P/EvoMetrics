import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  LegacyCard,
  IndexTable,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Box,
  TextField,
  Select,
  EmptyState,
  Modal,
  FormLayout
} from '@shopify/polaris';
import { DeleteIcon, PlusIcon } from '@shopify/polaris-icons';
import { clientiApi, type Cliente, type Task } from '../services/clientiApi';
import { toast } from 'react-hot-toast';

const TaskManager: React.FC = () => {
  const navigate = useNavigate();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'da_fare' | 'fatto'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal creazione task
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTaskClienteId, setNewTaskClienteId] = useState('');
  const [newTaskTitolo, setNewTaskTitolo] = useState('');
  const [newTaskDescrizione, setNewTaskDescrizione] = useState('');
  const [newTaskScadenza, setNewTaskScadenza] = useState('');

  useEffect(() => {
    loadClienti();
  }, []);

  const loadClienti = async () => {
    try {
      setLoading(true);
      const data = await clientiApi.getClienti();
      setClienti(data);
    } catch (err: any) {
      console.error('Errore caricamento clienti:', err);
    } finally {
      setLoading(false);
    }
  };

  // Estrai tutti i task da tutti i clienti
  const allTasks: Array<Task & { clienteId: string; clienteNome: string }> = [];
  clienti.forEach(cliente => {
    if (cliente.dettagli?.tasks && cliente.dettagli.tasks.length > 0) {
      cliente.dettagli.tasks.forEach(task => {
        allTasks.push({
          ...task,
          clienteId: cliente.id,
          clienteNome: cliente.nome_azienda
        });
      });
    }
  });

  // Filtra i task
  const filteredTasks = allTasks.filter(task => {
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
    const matchesSearch = searchQuery === '' || 
      task.titolo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.clienteNome.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleCreateTask = async () => {
    if (!newTaskClienteId || !newTaskTitolo.trim()) {
      toast.error('Seleziona un cliente e inserisci un titolo');
      return;
    }

    try {
      const cliente = clienti.find(c => c.id === newTaskClienteId);
      if (!cliente) {
        toast.error('Cliente non trovato');
        return;
      }

      const newTask: Task = {
        id: Date.now().toString(),
        titolo: newTaskTitolo,
        status: 'da_fare',
        descrizione: newTaskDescrizione || undefined,
        data_scadenza: newTaskScadenza || undefined
      };

      const currentTasks = cliente.dettagli?.tasks || [];
      await clientiApi.updateCliente(cliente.id, {
        ...cliente,
        dettagli: {
          ...cliente.dettagli,
          tasks: [...currentTasks, newTask]
        }
      });

      toast.success('Task creata con successo');
      
      // Reset form
      setNewTaskClienteId('');
      setNewTaskTitolo('');
      setNewTaskDescrizione('');
      setNewTaskScadenza('');
      setIsCreateModalOpen(false);
      
      await loadClienti(); // Ricarica per aggiornare UI
    } catch (err: any) {
      console.error('Errore creazione task:', err);
      toast.error('Errore durante la creazione della task');
    }
  };

  const handleToggleStatus = async (task: Task & { clienteId: string }) => {
    try {
      const cliente = clienti.find(c => c.id === task.clienteId);
      if (!cliente) return;

      const newStatus = task.status === 'da_fare' ? 'fatto' : 'da_fare';
      const updatedTasks = (cliente.dettagli?.tasks || []).map(t =>
        t.id === task.id ? { ...t, status: newStatus as 'da_fare' | 'fatto' } : t
      );

      await clientiApi.updateCliente(cliente.id, {
        ...cliente,
        dettagli: {
          ...cliente.dettagli,
          tasks: updatedTasks
        }
      });

      await loadClienti(); // Ricarica per aggiornare UI
    } catch (err: any) {
      console.error('Errore aggiornamento task:', err);
    }
  };

  const handleDeleteTask = async (task: Task & { clienteId: string }) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo task?')) return;

    try {
      const cliente = clienti.find(c => c.id === task.clienteId);
      if (!cliente) return;

      const updatedTasks = (cliente.dettagli?.tasks || []).filter(t => t.id !== task.id);

      await clientiApi.updateCliente(cliente.id, {
        ...cliente,
        dettagli: {
          ...cliente.dettagli,
          tasks: updatedTasks
        }
      });

      await loadClienti(); // Ricarica per aggiornare UI
    } catch (err: any) {
      console.error('Errore eliminazione task:', err);
    }
  };

  const resourceName = {
    singular: 'task',
    plural: 'tasks',
  };

  const rowMarkup = filteredTasks.map((task, index) => {
    const isDone = task.status === 'fatto';
    return (
      <IndexTable.Row id={task.id} key={task.id} position={index}>
        <IndexTable.Cell>
          <div 
            onClick={() => handleToggleStatus(task)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {isDone ? (
              <Badge tone="success" size="small">✓ Fatto</Badge>
            ) : (
              <Badge tone="attention" size="small">Da fare</Badge>
            )}
          </div>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" fontWeight="bold">
            {task.titolo}
          </Text>
          {task.descrizione && (
            <Text as="p" variant="bodySm" tone="subdued">{task.descrizione}</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            variant="plain"
            onClick={() => navigate(`/clienti/${task.clienteId}`)}
          >
            {task.clienteNome}
          </Button>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {task.data_scadenza ? (
            <Text as="span" variant="bodySm">
              {new Date(task.data_scadenza).toLocaleDateString('it-IT')}
            </Text>
          ) : (
            <Text as="span" variant="bodySm" tone="subdued">-</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Button
            icon={DeleteIcon}
            variant="plain"
            tone="critical"
            onClick={() => handleDeleteTask(task)}
          />
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  // Opzioni per il select cliente
  const clienteOptions = clienti.map(c => ({
    label: c.nome_azienda,
    value: c.id
  }));

  return (
    <Page
      title="Task Manager"
      primaryAction={{
        content: 'Nuova Task',
        icon: PlusIcon,
        onAction: () => setIsCreateModalOpen(true)
      }}
      secondaryActions={[
        {
          content: 'Aggiorna',
          onAction: loadClienti,
          loading: loading
        }
      ]}
    >
      <BlockStack gap="400">
        <LegacyCard sectioned>
          <InlineStack gap="400" blockAlign="center">
            <div style={{ flex: 1 }}>
              <TextField
                label="Cerca"
                labelHidden
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Cerca per task o cliente..."
                autoComplete="off"
              />
            </div>
            <Select
              label="Filtra per stato"
              labelHidden
              options={[
                { label: 'Tutti', value: 'all' },
                { label: 'Da fare', value: 'da_fare' },
                { label: 'Fatti', value: 'fatto' }
              ]}
              value={filterStatus}
              onChange={(val) => setFilterStatus(val as 'all' | 'da_fare' | 'fatto')}
            />
          </InlineStack>
        </LegacyCard>

        <LegacyCard>
          {loading ? (
            <Box padding="400">
              <Text as="p" alignment="center" tone="subdued">Caricamento...</Text>
            </Box>
          ) : filteredTasks.length > 0 ? (
            <IndexTable
              resourceName={resourceName}
              itemCount={filteredTasks.length}
              headings={[
                { title: 'Stato' },
                { title: 'Task' },
                { title: 'Cliente' },
                { title: 'Scadenza' },
                { title: 'Azioni' }
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          ) : (
            <EmptyState
              heading="Nessun task trovato"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                {allTasks.length === 0
                  ? 'Non ci sono task registrati per nessun cliente.'
                  : 'Nessun task corrisponde ai filtri selezionati.'}
              </p>
            </EmptyState>
          )}
        </LegacyCard>
      </BlockStack>

      {/* Modal Creazione Task */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNewTaskClienteId('');
          setNewTaskTitolo('');
          setNewTaskDescrizione('');
          setNewTaskScadenza('');
        }}
        title="Crea Nuova Task"
        primaryAction={{
          content: 'Crea Task',
          onAction: handleCreateTask
        }}
        secondaryActions={[
          {
            content: 'Annulla',
            onAction: () => {
              setIsCreateModalOpen(false);
              setNewTaskClienteId('');
              setNewTaskTitolo('');
              setNewTaskDescrizione('');
              setNewTaskScadenza('');
            }
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Cliente"
              options={[
                { label: 'Seleziona un cliente...', value: '' },
                ...clienteOptions
              ]}
              value={newTaskClienteId}
              onChange={setNewTaskClienteId}
              requiredIndicator
            />
            <TextField
              label="Titolo Task"
              value={newTaskTitolo}
              onChange={setNewTaskTitolo}
              placeholder="Es: Revisione sito web"
              requiredIndicator
              autoComplete="off"
            />
            <TextField
              label="Descrizione (opzionale)"
              value={newTaskDescrizione}
              onChange={setNewTaskDescrizione}
              placeholder="Dettagli aggiuntivi..."
              multiline={3}
              autoComplete="off"
            />
            <TextField
              label="Data Scadenza (opzionale)"
              type="date"
              value={newTaskScadenza}
              onChange={setNewTaskScadenza}
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
};

export default TaskManager;
