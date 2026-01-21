import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Box,
  Badge,
  ProgressBar,
  Icon,
  Spinner,
  Divider,
  Button
} from '@shopify/polaris';
import {
  CheckIcon,
  ClockIcon,
  CalendarIcon,
  TargetIcon,
  ChartVerticalIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { productivityApi, type Task } from '../services/productivityApi';

interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
}

// Card Task Recente
const RecentTaskCard: React.FC<{ task: Task; onClick: () => void }> = ({ task, onClick }) => {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const isDone = task.status === 'done';

  const bgColor = isDone ? 'var(--p-color-bg-fill-success-secondary)' 
    : isOverdue ? 'var(--p-color-bg-surface-critical)' 
    : task.status === 'in_progress' ? 'var(--p-color-bg-fill-info-secondary)' 
    : 'var(--p-color-bg-surface-secondary)';

  return (
    <div 
      style={{ 
        padding: '12px', 
        background: bgColor,
        borderRadius: '8px',
        cursor: 'pointer'
      }}
      onClick={onClick}
    >
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {isDone && '✓ '}{task.title}
          </Text>
          {task.due_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '16px', height: '16px', display: 'inline-flex', flexShrink: 0 }}>
                <Icon source={ClockIcon} tone={isOverdue ? "critical" : "subdued"} />
              </span>
              <Text as="span" variant="bodySm" tone={isOverdue ? "critical" : "subdued"}>
                {new Date(task.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
              </Text>
            </div>
          )}
        </BlockStack>
        <Badge 
          tone={isDone ? 'success' : isOverdue ? 'critical' : task.status === 'in_progress' ? 'info' : undefined}
          size="small"
        >
          {isDone ? 'Fatto' : isOverdue ? 'Scaduto' : task.status === 'in_progress' ? 'In corso' : 'Da fare'}
        </Badge>
      </InlineStack>
    </div>
  );
};

const TeamOverview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tasksData = await productivityApi.getTasks();
      // Filtra solo le task dell'utente corrente
      const myTasks = tasksData.filter(t => t.assignee_id === String(user?.id));
      setTasks(myTasks);
    } catch (e) {
      console.error('Errore caricamento task:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [fetchData, user]);

  // Calcola statistiche
  const stats: TaskStats = React.useMemo(() => {
    const now = new Date();
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'done').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      pending: tasks.filter(t => t.status === 'todo' || t.status === 'pending').length,
      overdue: tasks.filter(t => 
        t.due_date && 
        new Date(t.due_date) < now && 
        t.status !== 'done'
      ).length
    };
  }, [tasks]);

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  // Task recenti (ultime 5 non completate)
  const recentTasks = React.useMemo(() => {
    return tasks
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .slice(0, 5);
  }, [tasks]);

  // Task completate recentemente
  const recentlyCompleted = React.useMemo(() => {
    return tasks
      .filter(t => t.status === 'done')
      .slice(0, 3);
  }, [tasks]);

  if (loading) {
    return (
      <Page title="Il Mio Team">
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="800">
                <BlockStack gap="400" align="center">
                  <Spinner size="large" />
                  <Text as="p" tone="subdued">Caricamento overview...</Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page 
      title="La Mia Produttività"
      subtitle={`Ciao ${user?.username}, ecco il tuo riepilogo`}
      primaryAction={{
        content: 'Tutte le Task',
        onAction: () => navigate('/task')
      }}
    >
      <Layout>
        {/* Stats Cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 5 }} gap="400">
            <Card>
              <BlockStack gap="200" align="center">
                <div style={{ background: 'var(--p-color-bg-fill-secondary)', padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon source={ChartVerticalIcon} />
                </div>
                <Text as="p" variant="headingXl" alignment="center">{stats.total}</Text>
                <Text as="p" tone="subdued" alignment="center">Totale Task</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200" align="center">
                <div style={{ background: 'var(--p-color-bg-fill-success-secondary)', padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon source={CheckIcon} tone="success" />
                </div>
                <Text as="p" variant="headingXl" alignment="center">{stats.completed}</Text>
                <Text as="p" tone="subdued" alignment="center">Completate</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200" align="center">
                <div style={{ background: 'var(--p-color-bg-fill-info-secondary)', padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon source={ClockIcon} tone="info" />
                </div>
                <Text as="p" variant="headingXl" alignment="center">{stats.inProgress}</Text>
                <Text as="p" tone="subdued" alignment="center">In Corso</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200" align="center">
                <div style={{ background: 'var(--p-color-bg-fill-warning-secondary)', padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon source={CalendarIcon} tone="warning" />
                </div>
                <Text as="p" variant="headingXl" alignment="center">{stats.pending}</Text>
                <Text as="p" tone="subdued" alignment="center">Da Fare</Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200" align="center">
                <div style={{ background: 'var(--p-color-bg-fill-critical-secondary)', padding: '8px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon source={TargetIcon} tone="critical" />
                </div>
                <Text as="p" variant="headingXl" alignment="center">{stats.overdue}</Text>
                <Text as="p" tone="subdued" alignment="center">Scadute</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Progress */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">Il Mio Progresso</Text>
                <Badge tone={completionRate >= 70 ? "success" : completionRate >= 40 ? "warning" : "attention"}>
                  {`${completionRate}% completato`}
                </Badge>
              </InlineStack>
              <ProgressBar 
                progress={completionRate} 
                tone={completionRate >= 70 ? "success" : completionRate >= 40 ? "highlight" : "critical"} 
              />
              <Text as="p" tone="subdued">
                {stats.completed} task completate su {stats.total} totali
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Task in scadenza e Completate */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Prossime Scadenze</Text>
                <Button variant="plain" onClick={() => navigate('/task')}>Vedi tutte</Button>
              </InlineStack>
              
              {recentTasks.length > 0 ? (
                <BlockStack gap="200">
                  {recentTasks.map(task => (
                    <RecentTaskCard 
                      key={task.id} 
                      task={task} 
                      onClick={() => navigate(`/task?open=${task.id}`)} 
                    />
                  ))}
                </BlockStack>
              ) : (
                <Box padding="400" background="bg-surface-success" borderRadius="200">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '20px', height: '20px', display: 'inline-flex' }}>
                      <Icon source={CheckIcon} tone="success" />
                    </span>
                    <Text as="p" tone="success" alignment="center">Fantastico! Nessuna task in sospeso!</Text>
                  </div>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Completate di Recente</Text>
              
              {recentlyCompleted.length > 0 ? (
                <BlockStack gap="200">
                  {recentlyCompleted.map(task => (
                    <RecentTaskCard 
                      key={task.id} 
                      task={task} 
                      onClick={() => navigate(`/task?open=${task.id}`)} 
                    />
                  ))}
                </BlockStack>
              ) : (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" tone="subdued" alignment="center">Nessuna task completata ancora</Text>
                </Box>
              )}

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Link Rapidi</Text>
                <InlineGrid columns={2} gap="200">
                  <Button fullWidth onClick={() => navigate('/calendario')}>Calendario</Button>
                  <Button fullWidth onClick={() => navigate('/team/collaboratori')}>Team</Button>
                </InlineGrid>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default TeamOverview;
