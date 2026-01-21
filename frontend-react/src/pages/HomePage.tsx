import React, { useEffect, useState } from 'react';
import { 
  Page, 
  Layout, 
  Card, 
  Text, 
  BlockStack, 
  Button, 
  InlineGrid, 
  Box,
  Icon,
  Badge,
  InlineStack,
  ProgressBar,
  Spinner,
  Divider
} from '@shopify/polaris';
import { 
  PlusIcon, 
  CalendarIcon, 
  ClipboardIcon,
  PersonIcon,
  CheckIcon,
  ClockIcon,
  TargetIcon,
  StarIcon,
  ChartVerticalIcon,
  WalletIcon,
  ReceiptIcon
} from '@shopify/polaris-icons';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getServiceUrl } from '../utils/apiConfig';

const API_GATEWAY_URL = getServiceUrl('api-gateway');

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string;
  project_name?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
}

interface DashboardData {
  tasks: Task[];
  events: CalendarEvent[];
  stats: {
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    clientiAssegnati: number;
  };
  // Admin stats
  adminStats?: {
  assessments: number;
  preventivi: number;
  contratti: number;
  pagamenti: number;
    totalBalance?: number;
  };
}

// Componente Card Task
const TaskCard: React.FC<{ task: Task; onClick: () => void }> = ({ task, onClick }) => {
  const getPriorityTone = (priority: string) => {
    switch (priority) {
      case 'high': return 'critical';
      case 'medium': return 'warning';
      default: return 'info';
    }
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <div 
      style={{ 
        padding: '12px', 
        background: isOverdue ? 'var(--p-color-bg-surface-critical)' : 'var(--p-color-bg-surface-secondary)',
        borderRadius: '8px',
        cursor: 'pointer'
      }}
      onClick={onClick}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="span" variant="bodyMd" fontWeight="semibold">{task.title}</Text>
          <Badge tone={getPriorityTone(task.priority)} size="small">
            {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Bassa'}
          </Badge>
        </InlineStack>
        {task.project_name && (
          <Text as="span" variant="bodySm" tone="subdued">{task.project_name}</Text>
        )}
        {task.due_date && (
          <InlineStack gap="100" blockAlign="center">
            <Icon source={ClockIcon} tone={isOverdue ? "critical" : "subdued"} />
            <Text as="span" variant="bodySm" tone={isOverdue ? "critical" : "subdued"}>
              {new Date(task.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
            </Text>
          </InlineStack>
        )}
      </BlockStack>
    </div>
  );
};

// Componente Evento Calendario
const EventCard: React.FC<{ event: CalendarEvent }> = ({ event }) => {
  const eventDate = new Date(event.start);
  const isToday = eventDate.toDateString() === new Date().toDateString();

  return (
    <Box padding="300" background={isToday ? "bg-surface-success" : "bg-surface"} borderRadius="200">
      <InlineStack gap="300" blockAlign="center">
        <Box 
          background={isToday ? "bg-fill-success" : "bg-fill-secondary"}
          padding="200" 
          borderRadius="100"
          minWidth="50px"
        >
          <BlockStack align="center">
            <Text as="span" variant="headingSm" fontWeight="bold" alignment="center">
              {eventDate.getDate()}
            </Text>
            <Text as="span" variant="bodySm" alignment="center">
              {eventDate.toLocaleDateString('it-IT', { month: 'short' })}
            </Text>
          </BlockStack>
        </Box>
        <BlockStack gap="050">
          <Text as="span" variant="bodyMd" fontWeight="medium">{event.title}</Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {eventDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </BlockStack>
      </InlineStack>
    </Box>
  );
};

// Dashboard Collaboratore
const CollaboratorDashboard: React.FC<{ data: DashboardData; user: any; navigate: any }> = ({ data, user, navigate }) => {
  const completionRate = data.stats.totalTasks > 0 
    ? Math.round((data.stats.completedTasks / data.stats.totalTasks) * 100) 
    : 0;

  const urgentTasks = data.tasks.filter(t => t.priority === 'high' && t.status !== 'done').slice(0, 3);
  const upcomingEvents = data.events.slice(0, 4);

  return (
    <Page title={`Ciao, ${user?.username || 'Collaboratore'}!`} subtitle="Ecco il tuo riepilogo di oggi">
      <Layout>
        {/* Stats Cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
            {/* Task Completate */}
            <Card>
              <BlockStack gap="200" align="center">
                <Box background="bg-fill-success-secondary" padding="300" borderRadius="full">
                  <Icon source={CheckIcon} tone="success" />
                </Box>
                <Text as="p" variant="heading2xl" alignment="center">{data.stats.completedTasks}</Text>
                <Text as="p" tone="subdued" alignment="center">Task Completate</Text>
              </BlockStack>
            </Card>

            {/* Task Pendenti */}
            <Card>
              <BlockStack gap="200" align="center">
                <Box background="bg-fill-warning-secondary" padding="300" borderRadius="full">
                  <Icon source={ClipboardIcon} tone="warning" />
                </Box>
                <Text as="p" variant="heading2xl" alignment="center">{data.stats.pendingTasks}</Text>
                <Text as="p" tone="subdued" alignment="center">Task Pendenti</Text>
              </BlockStack>
            </Card>

            {/* Clienti Assegnati */}
            <Card>
              <BlockStack gap="200" align="center">
                <Box background="bg-fill-info-secondary" padding="300" borderRadius="full">
                  <Icon source={PersonIcon} tone="info" />
                </Box>
                <Text as="p" variant="heading2xl" alignment="center">{data.stats.clientiAssegnati}</Text>
                <Text as="p" tone="subdued" alignment="center">Clienti</Text>
              </BlockStack>
            </Card>

            {/* Tasso Completamento */}
            <Card>
              <BlockStack gap="200" align="center">
                <Box background="bg-fill-secondary" padding="300" borderRadius="full">
                  <Icon source={TargetIcon} />
                </Box>
                <Text as="p" variant="heading2xl" alignment="center">{completionRate}%</Text>
                <Text as="p" tone="subdued" alignment="center">Completamento</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Progress Bar */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">Progresso Settimanale</Text>
                <Badge tone={completionRate >= 70 ? "success" : completionRate >= 40 ? "warning" : "critical"}>
                  {completionRate >= 70 ? "Ottimo!" : completionRate >= 40 ? "Buon lavoro" : "Forza!"}
                </Badge>
              </InlineStack>
              <ProgressBar progress={completionRate} tone={completionRate >= 70 ? "success" : completionRate >= 40 ? "highlight" : "critical"} size="medium" />
              <Text as="p" tone="subdued">{data.stats.completedTasks} di {data.stats.totalTasks} task completate questa settimana</Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Task Urgenti & Calendario */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={StarIcon} tone="warning" />
                  <Text as="h2" variant="headingMd">Task Prioritarie</Text>
                </InlineStack>
                <Button variant="plain" onClick={() => navigate('/task')}>Vedi tutte</Button>
              </InlineStack>
              
              {urgentTasks.length > 0 ? (
                <BlockStack gap="200">
                  {urgentTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => navigate('/task')} />
                  ))}
                </BlockStack>
              ) : (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200" align="center">
                    <Icon source={CheckIcon} tone="success" />
                    <Text as="p" tone="subdued" alignment="center">Nessuna task urgente!</Text>
                  </BlockStack>
                </Box>
              )}
              
              <Button fullWidth onClick={() => navigate('/task')} icon={PlusIcon}>Nuova Task</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={CalendarIcon} tone="info" />
                  <Text as="h2" variant="headingMd">Prossimi Eventi</Text>
                </InlineStack>
                <Button variant="plain" onClick={() => navigate('/calendario')}>Calendario</Button>
              </InlineStack>
              
              {upcomingEvents.length > 0 ? (
                <BlockStack gap="200">
                  {upcomingEvents.map(event => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </BlockStack>
              ) : (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200" align="center">
                    <Icon source={CalendarIcon} tone="subdued" />
                    <Text as="p" tone="subdued" alignment="center">Nessun evento in programma</Text>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Azioni Rapide */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Azioni Rapide</Text>
              <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                <Button fullWidth icon={ClipboardIcon} onClick={() => navigate('/task')}>Le Mie Task</Button>
                <Button fullWidth icon={PersonIcon} onClick={() => navigate('/anagrafica-clienti')}>I Miei Clienti</Button>
                <Button fullWidth icon={CalendarIcon} onClick={() => navigate('/calendario')}>Calendario</Button>
                <Button fullWidth icon={TargetIcon} onClick={() => navigate('/sales')}>Sales Pipeline</Button>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

// Dashboard Admin
const AdminDashboard: React.FC<{ data: DashboardData; user: any; navigate: any }> = ({ data, user, navigate }) => {
  const stats = data.adminStats || { assessments: 0, preventivi: 0, contratti: 0, pagamenti: 0 };

  return (
    <Page 
        title={`Bentornato, ${user?.username || 'Admin'}`}
      subtitle="Panoramica gestionale di Evoluzione Imprese"
        primaryAction={{
            content: 'Nuovo Preventivo',
            icon: PlusIcon,
            onAction: () => navigate('/preventivi')
        }}
    >
      <Layout>
        {/* KPI Principali */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                    <Card>
                        <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Box background="bg-fill-info-secondary" padding="200" borderRadius="200">
                    <Icon source={ClipboardIcon} tone="info" />
                                </Box>
                  <Text as="h3" variant="headingSm">Preventivi</Text>
                </InlineStack>
                            <Text as="p" variant="heading2xl">{stats.preventivi}</Text>
                <Button variant="plain" onClick={() => navigate('/preventivi')}>Gestisci</Button>
                        </BlockStack>
                    </Card>
                    
                    <Card>
                        <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Box background="bg-fill-success-secondary" padding="200" borderRadius="200">
                    <Icon source={ReceiptIcon} tone="success" />
                                </Box>
                  <Text as="h3" variant="headingSm">Contratti</Text>
                </InlineStack>
                            <Text as="p" variant="heading2xl">{stats.contratti}</Text>
                <Button variant="plain" onClick={() => navigate('/contratti')}>Gestisci</Button>
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Box background="bg-fill-warning-secondary" padding="200" borderRadius="200">
                    <Icon source={WalletIcon} tone="warning" />
                                </Box>
                  <Text as="h3" variant="headingSm">Pagamenti</Text>
                </InlineStack>
                <Text as="p" variant="heading2xl">{stats.pagamenti}</Text>
                <Button variant="plain" onClick={() => navigate('/conto/entrate')}>Verifica</Button>
                                </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Box background="bg-fill-critical-secondary" padding="200" borderRadius="200">
                    <Icon source={PersonIcon} tone="critical" />
                  </Box>
                  <Text as="h3" variant="headingSm">Assessment</Text>
                </InlineStack>
                            <Text as="p" variant="heading2xl">{stats.assessments}</Text>
                <Button variant="plain" onClick={() => navigate('/assessment-list')}>Vedi</Button>
                        </BlockStack>
                    </Card>
                </InlineGrid>
        </Layout.Section>

        <Layout.Section>
            <Divider />
        </Layout.Section>

        {/* Sezioni Aggiuntive */}
        <Layout.Section variant="oneHalf">
             <Card>
                <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Task Team</Text>
                <Button variant="plain" onClick={() => navigate('/task')}>Vedi tutte</Button>
              </InlineStack>
              {data.tasks.slice(0, 4).map(task => (
                <TaskCard key={task.id} task={task} onClick={() => navigate('/task')} />
              ))}
              {data.tasks.length === 0 && (
                <Text as="p" tone="subdued">Nessuna task attiva</Text>
              )}
                </BlockStack>
             </Card>
        </Layout.Section>
        
        <Layout.Section variant="oneHalf">
             <Card>
                <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Azioni Rapide</Text>
                    <BlockStack gap="200">
                <Button icon={PersonIcon} fullWidth textAlign="left" onClick={() => navigate('/anagrafica-clienti')}>Gestione Clienti</Button>
                <Button icon={ChartVerticalIcon} fullWidth textAlign="left" onClick={() => navigate('/sales')}>Sales Pipeline</Button>
                <Button icon={WalletIcon} fullWidth textAlign="left" onClick={() => navigate('/conto')}>Situazione Finanziaria</Button>
                <Button icon={CalendarIcon} fullWidth textAlign="left" onClick={() => navigate('/calendario')}>Calendario</Button>
                    </BlockStack>
                </BlockStack>
             </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

// Main Component
const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>({
    tasks: [],
    events: [],
    stats: { totalTasks: 0, completedTasks: 0, pendingTasks: 0, clientiAssegnati: 0 }
  });
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch tasks dell'utente
        const tasksRes = await fetch(`${API_GATEWAY_URL}/api/tasks?assigned_to=${user?.id}`, { headers });
        let tasks: Task[] = [];
        if (tasksRes.ok) {
          tasks = await tasksRes.json();
        }

        // Fetch eventi calendario
        const eventsRes = await fetch(`${API_GATEWAY_URL}/api/tasks?has_due_date=true`, { headers });
        let events: CalendarEvent[] = [];
        if (eventsRes.ok) {
          const tasksWithDates = await eventsRes.json();
          events = tasksWithDates
            .filter((t: any) => t.due_date)
            .map((t: any) => ({
              id: t.id,
              title: t.title,
              start: t.due_date
            }));
        }

        // Calcola stats
        const completedTasks = tasks.filter(t => t.status === 'done').length;
        const pendingTasks = tasks.filter(t => t.status !== 'done').length;

        // Se admin, fetch stats aggiuntive
        let adminStats;
        if (isAdmin) {
          try {
            const statsRes = await fetch(`${API_GATEWAY_URL}/api/dashboard/summary`, { headers });
            if (statsRes.ok) {
              adminStats = await statsRes.json();
            }
          } catch (e) {
            console.warn('Stats admin non disponibili');
          }
        }

        setData({
          tasks,
          events,
          stats: {
            totalTasks: tasks.length,
            completedTasks,
            pendingTasks,
            clientiAssegnati: 0 // TODO: fetch clienti assegnati
          },
          adminStats
        });
      } catch (error) {
        console.error('Errore caricamento dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchDashboardData();
    }
  }, [user, isAdmin]);

  if (loading) {
    return (
      <Page title="Caricamento...">
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="800">
                <BlockStack gap="400" align="center">
                  <Spinner size="large" />
                  <Text as="p" tone="subdued">Preparazione dashboard...</Text>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Mostra dashboard diversa in base al ruolo
  if (isAdmin) {
    return <AdminDashboard data={data} user={user} navigate={navigate} />;
  }

  return <CollaboratorDashboard data={data} user={user} navigate={navigate} />;
};

export default HomePage;
