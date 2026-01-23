import React, { useState, useEffect } from 'react';
import { 
  LegacyCard, 
  BlockStack, 
  InlineStack, 
  Text, 
  Badge, 
  Button, 
  Box, 
  Spinner,
  Banner,
  Icon
} from '@shopify/polaris';
import { 
  ClockIcon, 
  AlertCircleIcon,
  CheckCircleIcon,
  PlayIcon
} from '@shopify/polaris-icons';
import { productivityApi, type Task } from '../../services/productivityApi';
import { useNavigate } from 'react-router-dom';
import { format, isPast, isToday } from 'date-fns';
import { it } from 'date-fns/locale';

interface ClienteTasksFromManagerProps {
  clienteId: string;
}

const ClienteTasksFromManager: React.FC<ClienteTasksFromManagerProps> = ({ clienteId }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
  }, [clienteId]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      // Carica tutte le task e filtra per questo cliente
      const allTasks = await productivityApi.getTasks();
      const clienteTasks = allTasks.filter(t => t.project_id === clienteId && t.status !== 'done');
      setTasks(clienteTasks);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'todo': return <Badge>Da Fare</Badge>;
      case 'in_progress': return <Badge tone="attention">In Corso</Badge>;
      case 'review': return <Badge tone="warning">In Revisione</Badge>;
      case 'done': return <Badge tone="success">Completato</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent': return <Badge tone="critical">URGENTE</Badge>;
      case 'high': return <Badge tone="warning">Alta</Badge>;
      default: return null;
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const date = new Date(dueDate);
    return isPast(date) && !isToday(date);
  };

  const openTaskInManager = (taskId: string) => {
    navigate(`/task?open=${taskId}`);
  };

  if (loading) {
    return (
      <LegacyCard title="Task Aperte" sectioned>
        <Box padding="400">
          <InlineStack align="center">
            <Spinner size="small" />
            <Text as="span" tone="subdued">Caricamento task...</Text>
          </InlineStack>
        </Box>
      </LegacyCard>
    );
  }

  return (
    <LegacyCard 
      title="Task Aperte" 
      sectioned
      actions={[
        { 
          content: 'Vai a Task Manager', 
          onAction: () => navigate('/task')
        }
      ]}
    >
      {error ? (
        <Banner tone="critical">{error}</Banner>
      ) : tasks.length === 0 ? (
        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="200" align="center">
            <Icon source={CheckCircleIcon} tone="success" />
            <Text as="p" tone="subdued" alignment="center">
              Nessuna task aperta per questo cliente.
            </Text>
            <Button size="slim" onClick={() => navigate('/task')}>
              Crea Task
            </Button>
          </BlockStack>
        </Box>
      ) : (
        <BlockStack gap="300">
          {tasks.slice(0, 5).map(task => (
            <div 
              key={task.id} 
              onClick={() => openTaskInManager(task.id)}
              style={{ cursor: 'pointer' }}
            >
            <Box 
              padding="300" 
              background={isOverdue(task.due_date) ? 'bg-surface-critical' : 'bg-surface-secondary'} 
              borderRadius="200"
            >
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="start">
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <div style={{ minWidth: '20px' }}>
                      {task.status === 'in_progress' ? (
                        <Icon source={PlayIcon} tone="info" />
                      ) : isOverdue(task.due_date) ? (
                        <Icon source={AlertCircleIcon} tone="critical" />
                      ) : (
                        <Icon source={ClockIcon} tone="base" />
                      )}
                    </div>
                    <Text as="span" fontWeight="semibold">{task.title}</Text>
                  </InlineStack>
                  <InlineStack gap="100">
                    {getPriorityBadge(task.priority)}
                    {getStatusBadge(task.status)}
                  </InlineStack>
                </InlineStack>
                
                {task.due_date && (
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodySm" tone={isOverdue(task.due_date) ? 'critical' : 'subdued'}>
                      Scadenza: {format(new Date(task.due_date), 'dd MMM yyyy', { locale: it })}
                      {isOverdue(task.due_date) && ' (SCADUTA)'}
                    </Text>
                  </InlineStack>
                )}
              </BlockStack>
            </Box>
            </div>
          ))}
          
          {tasks.length > 5 && (
            <Button fullWidth onClick={() => navigate('/task')}>
              {`Vedi tutte le ${tasks.length} task`}
            </Button>
          )}
        </BlockStack>
      )}
    </LegacyCard>
  );
};

export default ClienteTasksFromManager;
